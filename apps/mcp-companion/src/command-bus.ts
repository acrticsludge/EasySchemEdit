// apps/mcp-companion/src/command-bus.ts
// Shared command bus: the single authority for document mutations.
// Wires the MCP companion to EditorSession (packages/operations/src/session.ts).
// Supports local companion authority or relay to paired browser session (AD-1, AD-5).

import type { PreviewResult, ExecutionResult } from './destructive-protocol.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import type {
  Command,
  HistoryQueryResult,
} from '../../../packages/operations/src/session-types.ts';
import type {
  Bounds3i,
  Vec3i,
  Vec3Half,
  BlockStateId,
} from '../../../packages/domain/types.ts';
import {
  blockStateId,
  CANONICAL_AIR,
} from '../../../packages/domain/block-state.ts';
import type { Project, Placement } from '../../../packages/domain/placement.ts';
import { placementWorldBounds } from '../../../packages/domain/coordinates.ts';
import type { BlockStateMatcher } from '../../../packages/operations/src/region-ops.ts';
import {
  generateShape,
  generateStructure,
  executeBlueprint,
  setVoxelBlockAt,
  setVoxelBlocksBatch,
  getVoxelBlockAt,
  inspectRegionVoxels,
  type ShapeGenerationSpec,
  type StructureGenerationSpec,
  type BlueprintSpec,
} from '../../../packages/operations/src/build-generator.ts';
import {
  analyzeSchematicStructures,
  renderSchematicPng,
  selectStructureByQuery,
  type DetectedStructure,
} from '../../../packages/operations/src/structure-analyzer.ts';

// ============================================================================
// Types
// ============================================================================

export type CommandOperation = string;

export type CommandArgs = Record<string, unknown>;

export type CommandBusState = {
  projectId: string;
  revision: number;
  documentLoaded: boolean;
};

export type SavedRegion = {
  id: string;
  name: string;
  bounds: number[];
};

export type CommandBus = {
  state(): CommandBusState;
  setProjectId(id: string): void;
  setDocumentLoaded(loaded: boolean): void;
  /** Dry-run: estimate impact without mutating. */
  preview(operation: CommandOperation, args: CommandArgs): PreviewResult;
  /** Execute: mutate the document and bump revision. Returns the result. */
  execute(operation: CommandOperation, args: CommandArgs): ExecutionResult;
  /** Query document state without mutating. */
  query(toolName: string, args?: CommandArgs): unknown;
  /** Get backing EditorSession. */
  getSession(): EditorSession;
  /** Idempotency: replay a previous result by requestId. */
  getCachedResult(requestId: string): ExecutionResult | null;
  /** Cache a result for idempotency replay. */
  cacheResult(requestId: string, result: ExecutionResult): void;
  /** Reset the bus (e.g. on document unload). */
  reset(): void;
};

export type CommandBusOptions = {
  projectId?: string;
  session?: EditorSession;
  authority?: 'browser' | 'companion';
  relayToBrowser?: (operation: CommandOperation, args: CommandArgs) => ExecutionResult;
  previewEstimator?: (operation: CommandOperation, args: CommandArgs) => PreviewResult;
  executor?: (operation: CommandOperation, args: CommandArgs, currentRevision: number) => ExecutionResult;
};

// ============================================================================
// Limits (from f-11 / SPEC-F §4.3)
// ============================================================================

export const COMMAND_LIMITS = {
  maxCandidateCells: 1_000_000,
  maxChangedCells: 250_000,
  configurableChangedLimit: 1_000_000,
  absoluteSafetyLimit: 5_000_000,
  maxRuntimeMs: 5_000,
  maxMemoryBytes: 256 * 1024 * 1024,
} as const;

// ============================================================================
// Geometry and Parsing Helpers
// ============================================================================

export function tupleToBounds(coords: number[]): Bounds3i {
  return {
    min: [
      Math.min(coords[0], coords[3]),
      Math.min(coords[1], coords[4]),
      Math.min(coords[2], coords[5]),
    ] as Vec3i,
    maxExclusive: [
      Math.max(coords[0], coords[3]),
      Math.max(coords[1], coords[4]),
      Math.max(coords[2], coords[5]),
    ] as Vec3i,
  };
}

export function parseBlockState(input?: string): BlockStateId {
  if (!input) return CANONICAL_AIR;
  let id = input.trim().toLowerCase();
  const props: Record<string, string> = {};
  const bracketIndex = id.indexOf('[');
  if (bracketIndex !== -1 && id.endsWith(']')) {
    const propStr = id.slice(bracketIndex + 1, -1);
    id = id.slice(0, bracketIndex);
    const pairs = propStr.split(',');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k && v) {
        props[k.trim()] = v.trim();
      }
    }
  }
  if (!id.includes(':')) {
    id = `minecraft:${id}`;
  }
  return blockStateId(id, props);
}

export function parseMatcher(input?: unknown): BlockStateMatcher {
  if (!input) return { mode: 'block-id-only', blockId: 'minecraft:air' };
  if (typeof input === 'object' && input !== null && 'mode' in input) {
    return input as BlockStateMatcher;
  }
  if (typeof input === 'string') {
    const parsed = parseBlockState(input);
    if (Object.keys(parsed.props).length > 0) {
      return {
        mode: 'exact',
        blockId: parsed.id,
        properties: parsed.props as Record<string, string>,
      };
    }
    return { mode: 'block-id-only', blockId: parsed.id };
  }
  return { mode: 'block-id-only', blockId: 'minecraft:air' };
}

function boundsIntersect(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] &&
    a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] &&
    a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] &&
    a.maxExclusive[2] > b.min[2]
  );
}

function countTotalNonAir(project: Project): number {
  let count = 0;
  for (const p of project.placements) {
    count += p.volume.nonAirCount;
  }
  return count;
}

function ensureDefaultPlacementIfNeeded(session: EditorSession, bounds?: Bounds3i): void {
  if (session.snapshot().placements.length > 0) return;
  const b = bounds ?? { min: [0, 0, 0] as Vec3i, maxExclusive: [16, 16, 16] as Vec3i };
  const minChunk: Vec3i = [
    Math.floor(b.min[0] / 16) * 16,
    Math.floor(b.min[1] / 16) * 16,
    Math.floor(b.min[2] / 16) * 16,
  ];
  const maxChunk: Vec3i = [
    Math.max(minChunk[0] + 16, Math.ceil(b.maxExclusive[0] / 16) * 16),
    Math.max(minChunk[1] + 16, Math.ceil(b.maxExclusive[1] / 16) * 16),
    Math.max(minChunk[2] + 16, Math.ceil(b.maxExclusive[2] / 16) * 16),
  ];
  const p: Placement = {
    id: 'placement-1',
    name: 'Default Placement',
    volume: {
      bounds: { min: minChunk, maxExclusive: maxChunk },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: new Set(),
  };
  session.execute({ type: 'placement:add', placement: p });
}

export function mapToolToCommands(
  operation: CommandOperation,
  args: CommandArgs,
  session?: EditorSession,
): Command[] {
  switch (operation) {
    case 'fill_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const bounds = tupleToBounds(rawBounds);
      const block = parseBlockState((args.blockType ?? args.state ?? args.block) as string | undefined);
      return [{
        type: 'region:fill',
        bounds,
        block,
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'replace_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const bounds = tupleToBounds(rawBounds);
      const matcher = parseMatcher(args.blockType ?? args.matcher);
      const replacement = parseBlockState((args.replacementBlock ?? args.replacement) as string | undefined);
      return [{
        type: 'region:replace',
        bounds,
        matcher,
        replacement,
        preserveProperties: Boolean(args.preserveProperties),
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'delete_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:delete',
        bounds: tupleToBounds(rawBounds),
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'cut_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'clipboard:cut',
        selection: { kind: 'cuboid', bounds: tupleToBounds(rawBounds) },
      }];
    }
    case 'hollow_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:hollow',
        bounds: tupleToBounds(rawBounds),
        shellThickness: typeof args.shellThickness === 'number' ? args.shellThickness : 1,
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'walls_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:walls',
        bounds: tupleToBounds(rawBounds),
        wallBlock: parseBlockState((args.blockType ?? args.wallBlock) as string | undefined),
        fillInterior: args.replacementBlock
          ? parseBlockState(args.replacementBlock as string)
          : args.fillInterior
            ? parseBlockState(args.fillInterior as string)
            : null,
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'move_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const offset = (args.offset ?? args.translation ?? [0, 0, 0]) as Vec3i;
      return [{
        type: 'region:move',
        sourceBounds: tupleToBounds(rawBounds),
        offset,
        affectedPlacements: args.placementId ? [args.placementId as string] : (args.affectedPlacements as string[] | undefined),
      }];
    }
    case 'delete_placement': {
      return [{
        type: 'placement:delete',
        placementId: args.placementId as string,
      }];
    }
    case 'duplicate_placement': {
      return [{
        type: 'placement:duplicate',
        placementId: args.placementId as string,
        offset: args.offset as Vec3i | undefined,
      }];
    }
    case 'rename_placement': {
      return [{
        type: 'placement:rename',
        placementId: args.placementId as string,
        name: args.name as string,
      }];
    }
    case 'set_placement_visibility': {
      return [{
        type: 'placement:setVisibility',
        placementId: args.placementId as string,
        visible: Boolean(args.visible),
      }];
    }
    case 'set_placement_lock': {
      return [{
        type: 'placement:setLocked',
        placementId: args.placementId as string,
        locked: Boolean(args.locked),
      }];
    }
    case 'set_origin': {
      return [{
        type: 'placement:setOrigin',
        placementId: args.placementId as string,
        origin: args.origin as Vec3Half,
      }];
    }
    case 'transform_placement': {
      const cmds: Command[] = [];
      const pid = args.placementId as string;
      if (Array.isArray(args.translation)) {
        cmds.push({
          type: 'placement:move',
          placementId: pid,
          translation: args.translation as unknown as Vec3i,
        });
      } else if (Array.isArray(args.offset) && session) {
        const p = session.snapshot().placements.find((pl) => pl.id === pid);
        const currentTr = p ? p.transform.translation : [0, 0, 0];
        const newTr: Vec3i = [
          currentTr[0] + (args.offset[0] as number),
          currentTr[1] + (args.offset[1] as number),
          currentTr[2] + (args.offset[2] as number),
        ];
        cmds.push({
          type: 'placement:move',
          placementId: pid,
          translation: newTr,
        });
      }
      if (typeof args.rotation === 'string' || typeof args.rotation === 'number') {
        cmds.push({
          type: 'placement:rotate',
          placementId: pid,
          rotationY: Number(args.rotation) as 0 | 90 | 180 | 270,
        });
      }
      if (typeof args.mirror === 'string') {
        cmds.push({
          type: 'placement:mirror',
          placementId: pid,
          mirror: args.mirror as 'none' | 'x' | 'z',
        });
      }
      return cmds;
    }
    case 'transform_placements': {
      return [{
        type: 'group:transform',
        placementIds: (args.placementIds as string[]) || [],
        translation: args.translation as unknown as Vec3i | undefined,
        rotationY: args.rotation ? (Number(args.rotation) as 0 | 90 | 180 | 270) : undefined,
        mirror: args.mirror as 'none' | 'x' | 'z' | undefined,
      }];
    }
    case 'bake_placements': {
      return [{
        type: 'bake',
        placementIds: args.placementIds as string[] | undefined,
      }];
    }
    case 'create_selection': {
      let b = (args.bounds ?? args.worldBounds) as number[] | undefined;
      if (!b && Array.isArray(args.pos1) && Array.isArray(args.pos2) && args.pos1.length === 3 && args.pos2.length === 3) {
        const p1 = args.pos1 as number[];
        const p2 = args.pos2 as number[];
        const minX = Math.min(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const minZ = Math.min(p1[2], p2[2]);
        const maxX = Math.max(p1[0], p2[0]) + 1;
        const maxY = Math.max(p1[1], p2[1]) + 1;
        const maxZ = Math.max(p1[2], p2[2]) + 1;
        b = [minX, minY, minZ, maxX, maxY, maxZ];
      }
      if (!b || b.length !== 6) return [];
      return [{
        type: 'selection:edit',
        bounds: { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] },
      }];
    }
    case 'clear_selection': {
      return [{ type: 'selection:clear' }];
    }
    case 'select_placements': {
      return [{
        type: 'selection:edit',
        placementIds: args.placementIds as string[],
      }];
    }
    case 'copy_selection': {
      return [{ type: 'clipboard:copy' }];
    }
    case 'paste_clipboard': {
      return [{
        type: 'clipboard:paste',
        targetPosition: (args.targetOrigin ?? [0, 0, 0]) as Vec3i,
      }];
    }
    default:
      return [];
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCommandBus(options?: CommandBusOptions): CommandBus {
  let projectId = options?.projectId ?? 'default';
  let documentLoaded = false;
  const cache = new Map<string, ExecutionResult>();
  const session = options?.session ?? new EditorSession();

  // Multi-region selection state
  const savedRegions: SavedRegion[] = [];
  let activeRegionId: string | null = null;
  let regionSeq = 0;

  function state(): CommandBusState {
    return {
      projectId,
      revision: session.revision,
      documentLoaded,
    };
  }

  function setProjectId(id: string): void {
    projectId = id;
    const snap = session.snapshot();
    if (snap.id !== id) {
      (session as any).project.id = id;
    }
  }

  function setDocumentLoaded(loaded: boolean): void {
    documentLoaded = loaded;
  }

  function preview(operation: CommandOperation, args: CommandArgs): PreviewResult {
    if (options?.previewEstimator) {
      return options.previewEstimator(operation, args);
    }

    // Procedural build preview
    if (
      operation === 'set_block' ||
      operation === 'set_blocks' ||
      operation === 'generate_shape' ||
      operation === 'generate_structure' ||
      operation === 'generate_build' ||
      operation === 'build_blueprint' ||
      operation === 'stack_region' ||
      operation === 'copy_paste_region'
    ) {
      const cloned = new EditorSession(session.snapshot());
      let changedCells = 0;
      let placementId = '';
      let bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [0, 0, 0] };

      if (operation === 'set_block') {
        const res = setVoxelBlockAt(cloned, args.pos as Vec3i, args.block as string, {
          placementId: args.placementId as string,
          placementName: args.placementName as string,
          createNewPlacement: args.createNewPlacement as boolean,
        });
        changedCells = res.changedCells;
        placementId = res.placementId;
        bounds = res.bounds;
      } else if (operation === 'set_blocks') {
        const res = setVoxelBlocksBatch(
          cloned,
          args.voxels as Array<{ pos: Vec3i; block: string }>,
          {
            placementId: args.placementId as string,
            placementName: args.placementName as string,
            createNewPlacement: args.createNewPlacement as boolean,
          },
        );
        changedCells = res.changedCells;
        placementId = res.placementId;
        bounds = res.bounds;
      } else if (operation === 'generate_shape') {
        const res = generateShape(cloned, args as unknown as ShapeGenerationSpec);
        changedCells = res.changedCells;
        placementId = res.placementId;
        bounds = res.bounds;
      } else if (operation === 'generate_structure' || operation === 'generate_build') {
        const res = generateStructure(cloned, args as unknown as StructureGenerationSpec);
        changedCells = res.changedCells;
        placementId = res.placementId;
        bounds = res.bounds;
      } else if (operation === 'build_blueprint') {
        const res = executeBlueprint(cloned, args as unknown as BlueprintSpec);
        changedCells = res.changedCells;
        placementId = res.placementId;
        bounds = res.bounds;
      }

      return {
        operation,
        affectedPlacementIds: placementId ? [placementId] : [],
        affectedBounds: [bounds],
        candidateCells: changedCells,
        changedCells,
        resultingNonAirCount: countTotalNonAir(cloned.snapshot()),
        conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
        estimatedUndoBytes: changedCells * 32,
        warnings: [],
      };
    }

    let candidateCells = 0;
    const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
    if (Array.isArray(rawBounds) && rawBounds.length === 6) {
      const b = tupleToBounds(rawBounds);
      const dx = Math.max(0, b.maxExclusive[0] - b.min[0]);
      const dy = Math.max(0, b.maxExclusive[1] - b.min[1]);
      const dz = Math.max(0, b.maxExclusive[2] - b.min[2]);
      candidateCells = dx * dy * dz;
    } else if (typeof args.placementId === 'string') {
      const p = session.snapshot().placements.find((pl) => pl.id === args.placementId);
      if (p) {
        const vb = p.volume.bounds;
        const dx = Math.max(0, vb.maxExclusive[0] - vb.min[0]);
        const dy = Math.max(0, vb.maxExclusive[1] - vb.min[1]);
        const dz = Math.max(0, vb.maxExclusive[2] - vb.min[2]);
        candidateCells = dx * dy * dz;
      }
    } else if (Array.isArray(args.placementIds)) {
      for (const id of args.placementIds) {
        const p = session.snapshot().placements.find((pl) => pl.id === id);
        if (p) {
          const vb = p.volume.bounds;
          const dx = Math.max(0, vb.maxExclusive[0] - vb.min[0]);
          const dy = Math.max(0, vb.maxExclusive[1] - vb.min[1]);
          const dz = Math.max(0, vb.maxExclusive[2] - vb.min[2]);
          candidateCells += dx * dy * dz;
        }
      }
    }

    // Check candidate limits early
    if (candidateCells > COMMAND_LIMITS.maxCandidateCells) {
      return {
        operation,
        affectedPlacementIds: [],
        affectedBounds: rawBounds ? [tupleToBounds(rawBounds)] : [],
        candidateCells,
        changedCells: 0,
        resultingNonAirCount: countTotalNonAir(session.snapshot()),
        conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
        estimatedUndoBytes: 0,
        warnings: [
          {
            code: 'OVER_LIMIT',
            severity: 'error',
            message: `candidate cells ${candidateCells} exceed limit ${COMMAND_LIMITS.maxCandidateCells}`,
          },
        ],
      };
    }

    // Check locked placement
    if (
      typeof args.placementId === 'string' &&
      operation !== 'set_placement_lock' &&
      operation !== 'set_placement_visibility'
    ) {
      const p = session.snapshot().placements.find((pl) => pl.id === args.placementId);
      if (p && p.locked) {
        return {
          operation,
          affectedPlacementIds: [p.id],
          affectedBounds: [placementWorldBounds(p)],
          candidateCells,
          changedCells: 0,
          resultingNonAirCount: countTotalNonAir(session.snapshot()),
          conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
          estimatedUndoBytes: 0,
          warnings: [
            {
              code: 'LOCKED_PLACEMENT',
              severity: 'error',
              message: `Placement ${p.id} is locked`,
            },
          ],
        };
      }
    }

    if (rawBounds && operation !== 'set_placement_lock' && operation !== 'set_placement_visibility') {
      const b = tupleToBounds(rawBounds);
      for (const p of session.snapshot().placements) {
        if (p.locked && boundsIntersect(b, placementWorldBounds(p))) {
          return {
            operation,
            affectedPlacementIds: [p.id],
            affectedBounds: [b],
            candidateCells,
            changedCells: 0,
            resultingNonAirCount: countTotalNonAir(session.snapshot()),
            conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
            estimatedUndoBytes: 0,
            warnings: [
              {
                code: 'LOCKED_PLACEMENT',
                severity: 'error',
                message: `Placement ${p.id} is locked`,
              },
            ],
          };
        }
      }
    }

    // Run preview against a cloned session
    const cloned = new EditorSession(session.snapshot());
    if (rawBounds && (operation.startsWith('fill') || operation === 'fill_selection')) {
      ensureDefaultPlacementIfNeeded(cloned, tupleToBounds(rawBounds));
    }

    let totalChangedCells = 0;
    const affectedPlacements = new Set<string>();
    const affectedBounds: Bounds3i[] = [];
    const warnings: PreviewResult['warnings'] = [];

    if (operation === 'undo') {
      const res = cloned.undo();
      if (res && res.ok) {
        totalChangedCells = res.changed.cells;
        res.changed.placementIds.forEach((id) => affectedPlacements.add(id));
      }
    } else if (operation === 'redo') {
      const res = cloned.redo();
      if (res && res.ok) {
        totalChangedCells = res.changed.cells;
        res.changed.placementIds.forEach((id) => affectedPlacements.add(id));
      }
    } else {
      const cmds = mapToolToCommands(operation, args, cloned);
      for (const cmd of cmds) {
        const res = cloned.execute(cmd);
        if (!res.ok) {
          warnings.push({
            code: res.error.code,
            severity: 'warning',
            message: res.error.message,
          });
          break;
        }
        totalChangedCells += res.changed.cells;
        res.changed.placementIds.forEach((id) => affectedPlacements.add(id));
        if (res.changed.bounds) {
          affectedBounds.push(res.changed.bounds);
        }
      }
    }

    if (rawBounds && affectedBounds.length === 0) {
      affectedBounds.push(tupleToBounds(rawBounds));
    }

    return {
      operation,
      affectedPlacementIds: Array.from(affectedPlacements),
      affectedBounds,
      candidateCells,
      changedCells: totalChangedCells,
      resultingNonAirCount: countTotalNonAir(cloned.snapshot()),
      conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
      estimatedUndoBytes: totalChangedCells * 32,
      warnings,
    };
  }

  function execute(operation: CommandOperation, args: CommandArgs): ExecutionResult {
    if (options?.executor) {
      const result = options.executor(operation, args, session.revision);
      return result;
    }

    if (options?.authority === 'browser' && options.relayToBrowser) {
      const relayed = options.relayToBrowser(operation, args);
      return relayed;
    }

    // 1. Procedural build operations
    if (operation === 'set_block') {
      const res = setVoxelBlockAt(session, args.pos as Vec3i, args.block as string, {
        placementId: args.placementId as string,
        placementName: args.placementName as string,
        createNewPlacement: args.createNewPlacement as boolean,
      });
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
        errorCode: res.ok ? undefined : 'SET_BLOCK_FAILED',
        errorMessage: res.error,
      };
    }

    if (operation === 'set_blocks') {
      const res = setVoxelBlocksBatch(
        session,
        args.voxels as Array<{ pos: Vec3i; block: string }>,
        {
          placementId: args.placementId as string,
          placementName: args.placementName as string,
          createNewPlacement: args.createNewPlacement as boolean,
        },
      );
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
        errorCode: res.ok ? undefined : 'SET_BLOCKS_FAILED',
        errorMessage: res.error,
      };
    }

    if (operation === 'generate_shape') {
      const res = generateShape(session, args as unknown as ShapeGenerationSpec);
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
        errorCode: res.ok ? undefined : 'GENERATE_SHAPE_FAILED',
        errorMessage: res.error,
      };
    }

    if (operation === 'generate_structure' || operation === 'generate_build') {
      const res = generateStructure(session, args as unknown as StructureGenerationSpec);
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
        errorCode: res.ok ? undefined : 'GENERATE_STRUCTURE_FAILED',
        errorMessage: res.error,
      };
    }

    if (operation === 'build_blueprint') {
      const res = executeBlueprint(session, args as unknown as BlueprintSpec);
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
        errorCode: res.ok ? undefined : 'BLUEPRINT_FAILED',
        errorMessage: res.error,
      };
    }

    if (operation === 'create_placement') {
      const id =
        (args.placementId as string) ||
        `placement-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const name = (args.name as string) || 'New Placement';
      const translation = (args.translation as Vec3i) || [0, 0, 0];
      const origin = (args.origin as Vec3Half) || [0, 0, 0];
      const p: Placement = {
        id,
        name,
        volume: {
          bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
          chunkSize: 16,
          chunks: new Map(),
          nonAirCount: 0,
          paletteCardinality: 1,
        },
        transform: { translation, rotationY: 0, mirror: 'none' },
        origin,
        ancillary: {
          blockEntities: new Map(),
          entities: [],
          pendingBlockTicks: [],
          pendingFluidTicks: [],
          unknownTags: new Map(),
        },
        visible: true,
        locked: false,
        createdAt: new Date().toISOString(),
        source: { format: 'generated', diagnostics: [] },
        eraseTombstones: new Set(),
      };
      const res = session.execute({ type: 'placement:add', placement: p });
      return {
        success: res.ok,
        revision: res.ok ? res.revision : session.revision,
        changedCells: 0,
        changedPlacements: res.ok ? [id] : [],
        warnings: [],
      };
    }

    if (operation === 'stack_region') {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      let bounds: Bounds3i;
      if (rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6) {
        bounds = tupleToBounds(rawBounds);
      } else if (activeRegionId) {
        const reg = savedRegions.find((r) => r.id === activeRegionId);
        bounds = reg ? tupleToBounds(reg.bounds) : { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
      } else {
        bounds = { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
      }
      const count = typeof args.count === 'number' && args.count > 0 ? args.count : 1;
      const offset = (args.offset as Vec3i) || [0, 0, 0];

      const inspection = inspectRegionVoxels(session, bounds, { maxBlocks: 250000 });
      const shiftedVoxels: Array<{ pos: Vec3i; block: string }> = [];

      for (let step = 1; step <= count; step++) {
        const dx = offset[0] * step;
        const dy = offset[1] * step;
        const dz = offset[2] * step;
        for (const b of inspection.blocks) {
          shiftedVoxels.push({
            pos: [b.pos[0] + dx, b.pos[1] + dy, b.pos[2] + dz],
            block: b.block,
          });
        }
      }

      const res = setVoxelBlocksBatch(session, shiftedVoxels, {
        placementId: args.placementId as string | undefined,
      });
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
      };
    }

    if (operation === 'copy_paste_region') {
      const rawBounds = (args.sourceBounds ?? args.worldBounds ?? args.bounds) as number[] | undefined;
      let bounds: Bounds3i;
      if (rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6) {
        bounds = tupleToBounds(rawBounds);
      } else if (activeRegionId) {
        const reg = savedRegions.find((r) => r.id === activeRegionId);
        bounds = reg ? tupleToBounds(reg.bounds) : { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
      } else {
        bounds = { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
      }
      const targetOrigin = (args.targetOrigin as Vec3i) || [0, 0, 0];
      const inspection = inspectRegionVoxels(session, bounds, { maxBlocks: 250000 });
      const dx = targetOrigin[0] - bounds.min[0];
      const dy = targetOrigin[1] - bounds.min[1];
      const dz = targetOrigin[2] - bounds.min[2];

      const shiftedVoxels: Array<{ pos: Vec3i; block: string }> = inspection.blocks.map((b) => ({
        pos: [b.pos[0] + dx, b.pos[1] + dy, b.pos[2] + dz],
        block: b.block,
      }));

      const res = setVoxelBlocksBatch(session, shiftedVoxels, {
        placementId: args.placementId as string | undefined,
      });
      return {
        success: res.ok,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: [res.placementId],
        warnings: [],
      };
    }

    // 2. Multi-region selection operations
    if (operation === 'create_selection') {
      let rawBounds = (args.bounds ?? args.worldBounds) as number[] | undefined;
      if (!rawBounds && Array.isArray(args.pos1) && Array.isArray(args.pos2) && args.pos1.length === 3 && args.pos2.length === 3) {
        const p1 = args.pos1 as number[];
        const p2 = args.pos2 as number[];
        const minX = Math.min(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const minZ = Math.min(p1[2], p2[2]);
        const maxX = Math.max(p1[0], p2[0]) + 1;
        const maxY = Math.max(p1[1], p2[1]) + 1;
        const maxZ = Math.max(p1[2], p2[2]) + 1;
        rawBounds = [minX, minY, minZ, maxX, maxY, maxZ];
      }
      if (rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6) {
        const id = (args.id as string) || (args.name as string) || `R${++regionSeq}`;
        const name = (args.name as string) || id;
        const replace = args.replaceExisting === true;
        if (replace) {
          savedRegions.length = 0;
          savedRegions.push({ id, name, bounds: rawBounds });
        } else {
          const existingIndex = savedRegions.findIndex((r) => r.id === id || r.name === name);
          if (existingIndex !== -1) {
            savedRegions[existingIndex] = { id: savedRegions[existingIndex].id, name, bounds: rawBounds };
          } else {
            savedRegions.push({ id, name, bounds: rawBounds });
          }
        }
        activeRegionId = id;
      }
    } else if (operation === 'select_region') {
      let target: SavedRegion | undefined;
      if (typeof args.id === 'string') {
        target = savedRegions.find((r) => r.id === args.id);
      } else if (typeof args.index === 'number' && args.index >= 0 && args.index < savedRegions.length) {
        target = savedRegions[args.index];
      }
      if (target) {
        activeRegionId = target.id;
        const b = target.bounds;
        session.execute({
          type: 'selection:edit',
          bounds: { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] },
        });
        return {
          success: true,
          revision: session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
        };
      }
      return {
        success: false,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
        errorCode: 'REGION_NOT_FOUND',
        errorMessage: 'Specified region was not found',
      };
    } else if (operation === 'remove_region') {
      let idx = -1;
      if (typeof args.id === 'string') {
        idx = savedRegions.findIndex((r) => r.id === args.id);
      } else if (typeof args.index === 'number') {
        idx = args.index;
      }
      if (idx >= 0 && idx < savedRegions.length) {
        const removed = savedRegions.splice(idx, 1)[0];
        if (activeRegionId === removed.id) {
          if (savedRegions.length > 0) {
            activeRegionId = savedRegions[0].id;
            const b = savedRegions[0].bounds;
            session.execute({
              type: 'selection:edit',
              bounds: { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] },
            });
          } else {
            activeRegionId = null;
            session.execute({ type: 'selection:clear' });
          }
        }
        return {
          success: true,
          revision: session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
        };
      }
      return {
        success: false,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
        errorCode: 'REGION_NOT_FOUND',
        errorMessage: 'Specified region was not found',
      };
    } else if (operation === 'clear_selection') {
      activeRegionId = null;
      session.execute({ type: 'selection:clear' });
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    // 3. Project & Workspace management operations
    if (operation === 'create_project') {
      const pid = `proj-${Date.now()}`;
      setProjectId(pid);
      if (args.name && typeof args.name === 'string') {
        (session as any).project.name = args.name;
      }
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    if (operation === 'rename_project') {
      if (args.name && typeof args.name === 'string') {
        (session as any).project.name = args.name;
      }
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    if (operation === 'delete_project') {
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    if (operation === 'create_schematic') {
      return execute('create_placement', { name: args.name });
    }

    if (operation === 'rename_schematic') {
      return execute('rename_placement', { placementId: args.id, name: args.name });
    }

    if (operation === 'delete_schematic') {
      return execute('delete_placement', { placementId: args.id });
    }

    if (operation === 'duplicate_schematic') {
      return execute('duplicate_placement', { placementId: args.id });
    }

    if (operation === 'set_active_schematic') {
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    // 4. Standard operations
    const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
    if (rawBounds && (operation.startsWith('fill') || operation === 'fill_selection')) {
      ensureDefaultPlacementIfNeeded(session, tupleToBounds(rawBounds));
    }

    if (operation === 'undo') {
      const res = session.undo();
      if (!res || !res.ok) {
        return {
          success: false,
          revision: session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          errorCode: 'CANNOT_UNDO',
          errorMessage: 'Nothing to undo',
        };
      }
      return {
        success: true,
        revision: res.revision,
        changedCells: res.changed.cells,
        changedPlacements: res.changed.placementIds,
        warnings: [],
      };
    }

    if (operation === 'redo') {
      const res = session.redo();
      if (!res || !res.ok) {
        return {
          success: false,
          revision: session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          errorCode: 'CANNOT_REDO',
          errorMessage: 'Nothing to redo',
        };
      }
      return {
        success: true,
        revision: res.revision,
        changedCells: res.changed.cells,
        changedPlacements: res.changed.placementIds,
        warnings: [],
      };
    }

    const cmds = mapToolToCommands(operation, args, session);
    if (cmds.length === 0) {
      return {
        success: true,
        revision: session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    let lastRevision = session.revision;
    let totalChangedCells = 0;
    const changedPlacements = new Set<string>();

    for (const cmd of cmds) {
      const res = session.execute(cmd, {
        requestId: args.requestId as string | undefined,
        expectedRevision: typeof args.expectedRevision === 'number' ? args.expectedRevision : undefined,
      });
      if (!res.ok) {
        return {
          success: false,
          revision: session.revision,
          changedCells: totalChangedCells,
          changedPlacements: Array.from(changedPlacements),
          warnings: [],
          errorCode: res.error.code,
          errorMessage: res.error.message,
        };
      }
      lastRevision = res.revision;
      totalChangedCells += res.changed.cells;
      res.changed.placementIds.forEach((id) => changedPlacements.add(id));
    }

    return {
      success: true,
      revision: lastRevision,
      changedCells: totalChangedCells,
      changedPlacements: Array.from(changedPlacements),
      warnings: [],
    };
  }

  function query(toolName: string, args: CommandArgs = {}): unknown {
    switch (toolName) {
      case 'open_project': {
        const pid = (args.projectId as string) || 'default';
        setProjectId(pid);
        return { projectId: pid, revision: session.revision };
      }
      case 'get_project_info': {
        const snap = session.snapshot();
        return {
          id: snap.id,
          projectId: snap.id,
          name: snap.name,
          revision: snap.revision,
          placementCount: snap.placements.length,
          overlapPolicy: snap.overlapPolicy,
          conflictOverlay: snap.conflictOverlay,
          metadata: snap.metadata,
        };
      }
      case 'list_placements': {
        const placements = session.query<Placement[]>({
          type: 'listPlacements',
          filter: args.filter as string | undefined,
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
        });
        return {
          placements: (placements || []).map((p) => ({
            id: p.id,
            name: p.name,
            transform: p.transform,
            origin: p.origin,
            visible: p.visible,
            locked: p.locked,
            nonAirCount: p.volume.nonAirCount,
            bounds: p.volume.bounds,
          })),
          total: placements?.length ?? 0,
        };
      }
      case 'get_placement': {
        const p = session.query<Placement | null>({
          type: 'getPlacement',
          placementId: args.placementId as string,
        });
        if (!p) {
          return {
            placement: null,
            error: { code: 'NOT_FOUND', message: `Placement ${args.placementId} not found` },
          };
        }
        return {
          placement: {
            id: p.id,
            name: p.name,
            transform: p.transform,
            origin: p.origin,
            visible: p.visible,
            locked: p.locked,
            nonAirCount: p.volume.nonAirCount,
            bounds: p.volume.bounds,
            ancillary: {
              blockEntitiesCount: p.ancillary.blockEntities.size,
              entitiesCount: p.ancillary.entities.length,
            },
          },
        };
      }
      case 'get_origin': {
        const snap = session.snapshot();
        const p = snap.placements.find((pl) => pl.id === args.placementId);
        if (!p) {
          return {
            placementId: args.placementId,
            error: { code: 'NOT_FOUND', message: `Placement ${args.placementId} not found` },
          };
        }
        return {
          placementId: p.id,
          origin: p.origin,
        };
      }
      case 'detect_conflicts':
      case 'get_conflict_map': {
        const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
        const bounds = rawBounds ? tupleToBounds(rawBounds) : undefined;
        return session.query({ type: 'detectConflicts', bounds });
      }
      case 'get_material_list': {
        return session.query({
          type: 'materialList',
          mode: args.perPlacement ? 'perPlacement' : 'effective',
          placementId: args.placementId as string | undefined,
        });
      }
      case 'get_selection': {
        return session.query({ type: 'getSelection' });
      }
      case 'list_selections': {
        return {
          regions: savedRegions.map((r, i) => ({
            id: r.id,
            name: r.name,
            bounds: r.bounds,
            isActive: r.id === activeRegionId,
            index: i,
          })),
          activeRegionId,
          total: savedRegions.length,
        };
      }
      case 'get_block': {
        const pos = args.pos as Vec3i;
        const pid = args.placementId as string | undefined;
        return getVoxelBlockAt(session, pos, pid);
      }
      case 'inspect_region': {
        const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
        let bounds: Bounds3i;
        if (rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6) {
          bounds = tupleToBounds(rawBounds);
        } else {
          const snap = session.snapshot();
          if (snap.placements.length > 0) {
            bounds = snap.placements[0].volume.bounds;
          } else {
            bounds = { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
          }
        }
        return inspectRegionVoxels(session, bounds, {
          maxBlocks: typeof args.maxBlocks === 'number' ? args.maxBlocks : 512,
          includeAir: Boolean(args.includeAir),
          placementId: args.placementId as string | undefined,
        });
      }
      case 'analyze_structures': {
        const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
        const bounds = rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6 ? tupleToBounds(rawBounds) : undefined;
        const maxStructures = typeof args.maxStructures === 'number' ? args.maxStructures : 36;
        const analysis = analyzeSchematicStructures(session, { bounds, maxStructures });
        let renderView: { width: number; height: number; view: string } | undefined;
        let _mcpImages: Array<{ data: string; mimeType: string }> | undefined;
        if (args.includeRender !== false) {
          const png = renderSchematicPng(session, {
            bounds,
            view: (args.view as any) || 'composite',
            analysis,
          });
          renderView = { width: png.width, height: png.height, view: png.view };
          _mcpImages = [{ data: png.base64, mimeType: 'image/png' }];
        }
        return {
          ok: true,
          bounds: analysis.bounds,
          groundLevelY: analysis.groundLevelY,
          totalVoxels: analysis.totalVoxels,
          structureCount: analysis.structures.length,
          structures: analysis.structures,
          environment: analysis.environment,
          spatialMap: analysis.spatialMap,
          renderView,
          _mcpImages,
        };
      }
      case 'render_schematic_view': {
        const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
        let bounds = rawBounds && Array.isArray(rawBounds) && rawBounds.length === 6 ? tupleToBounds(rawBounds) : undefined;
        const analysis = analyzeSchematicStructures(session, { bounds });
        let matched: DetectedStructure | null = null;
        if (args.structureId) {
          matched = selectStructureByQuery(analysis, String(args.structureId));
          if (matched) {
            bounds = {
              min: [matched.bounds.min[0] - 4, matched.bounds.min[1] - 2, matched.bounds.min[2] - 4],
              maxExclusive: [matched.bounds.maxExclusive[0] + 4, matched.bounds.maxExclusive[1] + 2, matched.bounds.maxExclusive[2] + 4],
            };
          }
        }
        const view = (args.view as any) || 'composite';
        const width = typeof args.width === 'number' ? args.width : 680;
        const height = typeof args.height === 'number' ? args.height : 360;
        const png = renderSchematicPng(session, {
          bounds,
          view,
          width,
          height,
          annotateStructures: args.annotateStructures !== false,
          analysis,
        });
        return {
          ok: true,
          view: png.view,
          width: png.width,
          height: png.height,
          bounds,
          structure: matched,
          structures: analysis.structures,
          _mcpImages: [{ data: png.base64, mimeType: 'image/png' }],
        };
      }
      case 'select_structure': {
        const query = String(args.query || '').trim();
        const analysis = analyzeSchematicStructures(session);
        const matched = selectStructureByQuery(analysis, query);
        if (!matched) {
          return { ok: false, error: `Structure matching "${query}" not found` };
        }
        session.execute({
          type: 'selection:edit',
          bounds: {
            minX: matched.bounds.min[0],
            minY: matched.bounds.min[1],
            minZ: matched.bounds.min[2],
            maxX: matched.bounds.maxExclusive[0],
            maxY: matched.bounds.maxExclusive[1],
            maxZ: matched.bounds.maxExclusive[2],
          },
        });
        const matchedBounds = [
          matched.bounds.min[0],
          matched.bounds.min[1],
          matched.bounds.min[2],
          matched.bounds.maxExclusive[0],
          matched.bounds.maxExclusive[1],
          matched.bounds.maxExclusive[2],
        ];
        const newRegion: SavedRegion = {
          id: matched.id,
          name: `${matched.id}: ${matched.name}`,
          bounds: matchedBounds,
        };
        const replace = args.keepExistingRegions === false || args.replaceExisting === true;
        if (replace) {
          savedRegions.length = 0;
          savedRegions.push(newRegion);
        } else {
          const existingIndex = savedRegions.findIndex((r) => r.id === matched.id || r.name === newRegion.name);
          if (existingIndex !== -1) {
            savedRegions[existingIndex] = newRegion;
          } else {
            savedRegions.push(newRegion);
          }
        }
        activeRegionId = matched.id;
        return {
          ok: true,
          structure: matched,
          bounds: matched.bounds,
          savedRegions,
          activeRegionId,
        };
      }
      case 'get_account_info': {
        return {
          authenticated: true,
          user: { id: 'local-user', name: 'Local User', email: 'user@easyschemedit.local' },
          cloudSync: false,
        };
      }
      case 'list_workspace': {
        const snap = session.snapshot();
        return {
          workspace: projectId,
          projects: [{ id: snap.id, name: snap.name, revision: snap.revision }],
          schematics: snap.placements.map((p) => ({
            id: p.id,
            name: p.name,
            nonAirCount: p.volume.nonAirCount,
          })),
        };
      }
      case 'list_projects': {
        const snap = session.snapshot();
        return {
          projects: [{ id: snap.id, name: snap.name, revision: snap.revision }],
          total: 1,
        };
      }
      case 'list_schematics': {
        const snap = session.snapshot();
        return {
          schematics: snap.placements.map((p) => ({
            id: p.id,
            name: p.name,
            nonAirCount: p.volume.nonAirCount,
            bounds: p.volume.bounds,
          })),
          total: snap.placements.length,
        };
      }
      case 'get_color_mode': {
        return { mode: session.snapshot().conflictOverlay };
      }
      case 'get_history': {
        return session.query({
          type: 'getHistory',
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
        });
      }
      case 'get_diagnostics': {
        return { diagnostics: [] };
      }
      case 'get_operation_diff': {
        const history = session.query<HistoryQueryResult>({ type: 'getHistory' });
        const entry = history?.undoStack?.find((e) => e.id === args.commandId);
        return {
          commandId: args.commandId,
          diff: entry ? entry.data : null,
        };
      }
      default:
        throw new Error(`Unknown query tool: ${toolName}`);
    }
  }

  function getSession(): EditorSession {
    return session;
  }

  function getCachedResult(requestId: string): ExecutionResult | null {
    return cache.get(requestId) ?? null;
  }

  function cacheResult(requestId: string, result: ExecutionResult): void {
    cache.set(requestId, result);
  }

  function reset(): void {
    projectId = 'default';
    documentLoaded = false;
    cache.clear();
    savedRegions.length = 0;
    activeRegionId = null;
    regionSeq = 0;
  }

  return {
    state,
    setProjectId,
    setDocumentLoaded,
    preview,
    execute,
    query,
    getSession,
    getCachedResult,
    cacheResult,
    reset,
  };
}
