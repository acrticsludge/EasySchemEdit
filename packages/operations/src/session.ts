// packages/operations/src/session.ts
// EditorSession: single command/query API over the document for UI, workers, and MCP companion (AD-1).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.

import type {
  BlockStateId,
  Bounds3i,
  Vec3Half,
  Vec3i,
} from '../../domain/types.ts';
import {
  CANONICAL_AIR,
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';
import type {
  ChunkedVoxelVolume,
  VoxelChunk,
} from '../../domain/volume.ts';
import type {
  Placement,
  PlacementAncillaryData,
  Project,
} from '../../domain/placement.ts';
import type { Transform } from '../../domain/coordinates.ts';
import {
  rotateAboutPoint,
  applyRotation,
  applyMirror,
  placementWorldBounds,
  mapCellToWorld,
} from '../../domain/coordinates.ts';
import { resolveBlockAt, type EffectiveBlockResult } from '../../domain/effective-block.ts';
import { getBlock, setBlock } from '../../domain/volume-api.ts';

import {
  createSelectionState,
  createPlacementSelection,
  createCuboidSelection,
  repairAfterDelete,
  type Selection,
  type SelectionAnchor,
  type SelectionState,
} from './selection.ts';
import {
  applyRegionOperation,
  type RegionOperation,
  type RegionOperationOptions,
  type RegionOperationResult,
} from './region-ops.ts';
import {
  ClipboardManager,
  type ClipboardEntry,
} from './clipboard.ts';
import {
  MoveStackEngine,
} from './move-stack.ts';
import {
  BakeEngine,
} from './bake.ts';
import {
  detectConflicts,
  type ConflictResult,
} from './conflict-index.ts';
import {
  generateMaterialReport,
  type MaterialReport,
} from './verify-material.ts';
import {
  HistoryManager,
  type HistoryEntry,
  type HistoryEntryType,
} from '../../persistence/src/history.ts';

import type {
  Command,
  CommandExecutionOptions,
  CommandChangedInfo,
  Query,
  Result,
  FailureResult,
  SessionError,
  SessionChangeEvent,
  SessionListener,
  HistoryQueryResult,
} from './session-types.ts';

// ============================================================================
// Internal Delta & Snapshot Types for History Atomicity
// ============================================================================

interface ChunkDeltaSnapshot {
  key: string;
  palette: BlockStateId[];
  indices: Uint8Array | Uint16Array;
}

interface ChunkDelta {
  key: string;
  before: ChunkDeltaSnapshot | null;
  after: ChunkDeltaSnapshot | null;
}

interface PlacementMetadata {
  name: string;
  transform: Transform;
  origin: Vec3Half;
  visible: boolean;
  locked: boolean;
  lockReason?: 'user' | 'import' | 'system';
  ancillary: PlacementAncillaryData;
  volumeBounds: Bounds3i;
  volumeNonAirCount: number;
  eraseTombstones: Set<string>;
}

interface PlacementDelta {
  placementId: string;
  metadataBefore?: PlacementMetadata;
  metadataAfter?: PlacementMetadata;
  chunkDeltas: ChunkDelta[];
}

interface SessionHistoryDelta {
  commandType: string;
  beforeRevision: number;
  afterRevision: number;
  placementDeltas: PlacementDelta[];
  addedPlacements: Array<{ index: number; placement: Placement }>;
  deletedPlacements: Array<{ index: number; placement: Placement }>;
  selectionBefore?: SelectionState;
  selectionAfter?: SelectionState;
}

// ============================================================================
// Helper Utilities
// ============================================================================

function bounds3iToCuboidBounds(b: Bounds3i) {
  return {
    minX: b.min[0],
    minY: b.min[1],
    minZ: b.min[2],
    maxX: b.maxExclusive[0],
    maxY: b.maxExclusive[1],
    maxZ: b.maxExclusive[2],
  };
}

function boundsIntersect3i(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] &&
    a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] &&
    a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] &&
    a.maxExclusive[2] > b.min[2]
  );
}

function createEmptyVolume(bounds: Bounds3i): ChunkedVoxelVolume {
  return {
    bounds: {
      min: [...bounds.min] as Vec3i,
      maxExclusive: [...bounds.maxExclusive] as Vec3i,
    },
    chunkSize: 16,
    chunks: new Map(),
    nonAirCount: 0,
    paletteCardinality: 1,
  };
}

function createDefaultProject(): Project {
  return {
    schemaVersion: 1,
    id: `project-${Date.now()}`,
    name: 'Untitled Project',
    placements: [],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: {
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    revision: 0,
  };
}

function cloneProject(proj: Project): Project {
  return {
    schemaVersion: proj.schemaVersion,
    id: proj.id,
    name: proj.name,
    overlapPolicy: proj.overlapPolicy,
    conflictOverlay: proj.conflictOverlay,
    metadata: { ...proj.metadata },
    revision: proj.revision,
    importGroups: proj.importGroups.map((g) => ({
      ...g,
      placementIds: [...g.placementIds],
    })),
    placements: proj.placements.map(clonePlacement),
  };
}

function cloneProjectShallow(proj: Project): Project {
  return {
    schemaVersion: proj.schemaVersion,
    id: proj.id,
    name: proj.name,
    overlapPolicy: proj.overlapPolicy,
    conflictOverlay: proj.conflictOverlay,
    metadata: { ...proj.metadata },
    revision: proj.revision,
    importGroups: proj.importGroups.map((g) => ({
      ...g,
      placementIds: [...g.placementIds],
    })),
    placements: proj.placements.map(clonePlacementShallow),
  };
}

function clonePlacementShallow(p: Placement): Placement {
  return {
    id: p.id,
    name: p.name,
    transform: {
      translation: [...p.transform.translation] as Vec3i,
      rotationY: p.transform.rotationY,
      mirror: p.transform.mirror,
    },
    origin: [...p.origin] as Vec3Half,
    ancillary: {
      blockEntities: new Map(p.ancillary.blockEntities),
      entities: p.ancillary.entities.map((e) => ({ ...e, position: [...e.position] })),
      biomes: p.ancillary.biomes ? { ...p.ancillary.biomes } : undefined,
      pendingBlockTicks: p.ancillary.pendingBlockTicks.map((t) => ({ ...t, position: [...t.position] })),
      pendingFluidTicks: p.ancillary.pendingFluidTicks.map((t) => ({ ...t, position: [...t.position] })),
      unknownTags: new Map(p.ancillary.unknownTags),
    },
    visible: p.visible,
    locked: p.locked,
    lockReason: p.lockReason,
    color: p.color,
    createdAt: p.createdAt,
    source: { ...p.source },
    eraseTombstones: new Set(p.eraseTombstones),
    volume: p.volume,
  };
}

function clonePlacement(p: Placement): Placement {
  return {
    id: p.id,
    name: p.name,
    transform: {
      translation: [...p.transform.translation] as Vec3i,
      rotationY: p.transform.rotationY,
      mirror: p.transform.mirror,
    },
    origin: [...p.origin] as Vec3Half,
    ancillary: {
      blockEntities: new Map(p.ancillary.blockEntities),
      entities: p.ancillary.entities.map((e) => ({ ...e, position: [...e.position] })),
      biomes: p.ancillary.biomes ? { ...p.ancillary.biomes } : undefined,
      pendingBlockTicks: p.ancillary.pendingBlockTicks.map((t) => ({ ...t, position: [...t.position] })),
      pendingFluidTicks: p.ancillary.pendingFluidTicks.map((t) => ({ ...t, position: [...t.position] })),
      unknownTags: new Map(p.ancillary.unknownTags),
    },
    visible: p.visible,
    locked: p.locked,
    lockReason: p.lockReason,
    color: p.color,
    createdAt: p.createdAt,
    source: { ...p.source },
    eraseTombstones: new Set(p.eraseTombstones),
    volume: cloneVolume(p.volume),
  };
}

function cloneVolume(vol: ChunkedVoxelVolume): ChunkedVoxelVolume {
  const chunks = new Map<string, VoxelChunk>();
  for (const [key, chunk] of vol.chunks) {
    chunks.set(key, {
      key: chunk.key,
      palette: chunk.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
      indices: chunk.indices.slice(),
      revision: chunk.revision,
    });
  }
  return {
    bounds: {
      min: [...vol.bounds.min] as Vec3i,
      maxExclusive: [...vol.bounds.maxExclusive] as Vec3i,
    },
    chunkSize: vol.chunkSize,
    nonAirCount: vol.nonAirCount,
    paletteCardinality: vol.paletteCardinality,
    chunks,
  };
}

function snapshotPlacementMetadata(p: Placement): PlacementMetadata {
  return {
    name: p.name,
    transform: {
      translation: [...p.transform.translation] as Vec3i,
      rotationY: p.transform.rotationY,
      mirror: p.transform.mirror,
    },
    origin: [...p.origin] as Vec3Half,
    visible: p.visible,
    locked: p.locked,
    lockReason: p.lockReason,
    ancillary: {
      blockEntities: new Map(p.ancillary.blockEntities),
      entities: [...p.ancillary.entities],
      biomes: p.ancillary.biomes ? { ...p.ancillary.biomes } : undefined,
      pendingBlockTicks: [...p.ancillary.pendingBlockTicks],
      pendingFluidTicks: [...p.ancillary.pendingFluidTicks],
      unknownTags: new Map(p.ancillary.unknownTags),
    },
    volumeBounds: {
      min: [...p.volume.bounds.min] as Vec3i,
      maxExclusive: [...p.volume.bounds.maxExclusive] as Vec3i,
    },
    volumeNonAirCount: p.volume.nonAirCount,
    eraseTombstones: new Set(p.eraseTombstones),
  };
}

function areIndicesEqual(a: Uint8Array | Uint16Array, b: Uint8Array | Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function arePalettesEqual(a: BlockStateId[], b: BlockStateId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const s1 = a[i]!;
    const s2 = b[i]!;
    if (s1.id !== s2.id) return false;
    const k1 = Object.keys(s1.props);
    const k2 = Object.keys(s2.props);
    if (k1.length !== k2.length) return false;
    for (const k of k1) {
      if (s1.props[k] !== s2.props[k]) return false;
    }
  }
  return true;
}

function fastPlacementWorldBounds(
  placement: Placement,
): Bounds3i {
  const { transform, volume, origin } = placement;
  const { min, maxExclusive } = volume.bounds;
  if (min[0] >= maxExclusive[0] || min[1] >= maxExclusive[1] || min[2] >= maxExclusive[2]) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }

  const corners: Vec3i[] = [
    [min[0], min[1], min[2]],
    [maxExclusive[0] - 1, min[1], min[2]],
    [min[0], maxExclusive[1] - 1, min[2]],
    [maxExclusive[0] - 1, maxExclusive[1] - 1, min[2]],
    [min[0], min[1], maxExclusive[2] - 1],
    [maxExclusive[0] - 1, min[1], maxExclusive[2] - 1],
    [min[0], maxExclusive[1] - 1, maxExclusive[2] - 1],
    [maxExclusive[0] - 1, maxExclusive[1] - 1, maxExclusive[2] - 1],
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const c of corners) {
    const res = mapCellToWorld(transform.translation, origin, transform.rotationY, transform.mirror, c);
    if (res.valid && res.worldBlock) {
      const [wx, wy, wz] = res.worldBlock;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wz < minZ) minZ = wz;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
      if (wz > maxZ) maxZ = wz;
    }
  }

  if (minX === Infinity) {
    return placementWorldBounds(placement);
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1] as Vec3i,
  };
}

function getProjectBounds(project: Project): Bounds3i {
  if (project.placements.length === 0) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of project.placements) {
    const pb = fastPlacementWorldBounds(p);
    minX = Math.min(minX, pb.min[0]);
    minY = Math.min(minY, pb.min[1]);
    minZ = Math.min(minZ, pb.min[2]);
    maxX = Math.max(maxX, pb.maxExclusive[0]);
    maxY = Math.max(maxY, pb.maxExclusive[1]);
    maxZ = Math.max(maxZ, pb.maxExclusive[2]);
  }
  return { min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] };
}

function normalizeType(type: string): string {
  return type.toLowerCase().replace(/[._]/g, ':');
}

function isNonVoxelMutatingCommand(type: string): boolean {
  const norm = normalizeType(type);
  if (norm.startsWith('placement:') || norm.startsWith('selection:') || norm.startsWith('group:')) {
    return true;
  }
  if (
    norm === 'overlap-policy' ||
    norm === 'overlap:policy' ||
    norm === 'overlap_policy' ||
    norm === 'conflict-overlay' ||
    norm === 'conflict:overlay' ||
    norm === 'conflict_overlay' ||
    norm === 'clipboard:copy' ||
    norm === 'copy'
  ) {
    return true;
  }
  return false;
}

function mapHistoryType(cmdType: string): HistoryEntryType {
  const norm = normalizeType(cmdType);
  if (norm.includes('paste')) return 'paste';
  if (norm.includes('delete') || norm.includes('remove')) return 'delete';
  if (norm.includes('move')) return 'move';
  if (norm.includes('rotate') || norm.includes('mirror') || norm.includes('transform')) return 'transform';
  return 'edit';
}

function lockedError(placementId: string, operation?: string): FailureResult {
  return {
    ok: false,
    success: false,
    error: {
      code: 'LOCKED_PLACEMENT',
      message: `Placement ${placementId} is locked${operation ? ` and cannot perform ${operation}` : ''}`,
      placementId,
      details: {
        code: 'ENGINE_INVARIANT_VIOLATION',
        reason: 'locked',
        placementId,
        operation,
      },
    },
  };
}

function staleRevisionError(expectedRevision: number, currentRevision: number): FailureResult {
  return {
    ok: false,
    success: false,
    error: {
      code: 'STALE_REVISION',
      message: `Expected revision ${expectedRevision} but current revision is ${currentRevision}`,
      details: {
        expectedRevision,
        currentRevision,
      },
    },
  };
}

// ============================================================================
// EditorSession Class
// ============================================================================

export class EditorSession {
  private project: Project;
  private selection: SelectionState;
  private clipboard: ClipboardManager;
  private history: HistoryManager;
  private listeners: Set<SessionListener> = new Set();
  private cachedResults: Map<string, Result<{ revision: number; changed: CommandChangedInfo }>> = new Map();

  constructor(project?: Project) {
    this.project = project ? cloneProject(project) : createDefaultProject();
    this.selection = createSelectionState(
      'cuboid',
      createCuboidSelection({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }, { x: 0, y: 0, z: 0 }),
      { x: 0, y: 0, z: 0 },
    );
    this.clipboard = new ClipboardManager();
    this.history = new HistoryManager({
      projectId: this.project.id,
      maxEntries: 100,
    });
  }

  get revision(): number {
    return this.project.revision;
  }

  /**
   * Return a deep snapshot of current project state.
   */
  snapshot(): Project {
    return cloneProject(this.project);
  }

  /**
   * Return a direct reference to the current project state.
   * Callers must treat the returned project as read-only.
   */
  peekProject(): Project {
    return this.project;
  }

  /**
   * Subscribe to document change events.
   * Emits { revision, kind, placementIds, chunkKeys } on commit, undo, and redo.
   * Returns an unsubscribe function.
   */
  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  /**
   * Execute a command transactionally.
   * Enforces revision check, locked state validation, idempotency caching,
   * chunk delta history tracking, and atomic commit/rollback.
   */
  execute(
    cmd: Command,
    opts?: CommandExecutionOptions,
  ): Result<{ revision: number; changed: CommandChangedInfo }> {
    // 1. Idempotency check
    if (opts?.requestId && this.cachedResults.has(opts.requestId)) {
      return this.cachedResults.get(opts.requestId)!;
    }

    // 2. Concurrency check
    if (opts?.expectedRevision !== undefined && opts.expectedRevision !== this.revision) {
      return staleRevisionError(opts.expectedRevision, this.revision);
    }

    // 3. Snapshot before mutation for rollback atomicity & delta computation
    const prevProject = isNonVoxelMutatingCommand(cmd.type)
      ? cloneProjectShallow(this.project)
      : cloneProject(this.project);
    const selectionBefore = { ...this.selection };

    try {
      // 4. Dispatch and execute command
      const dispatchResult = this.dispatchCommand(cmd);
      if (!dispatchResult.ok) {
        // Validation/precondition failure: state already untouched
        this.project = prevProject;
        this.selection = selectionBefore;
        return {
          ok: false,
          success: false,
          error: dispatchResult.error || { code: 'EXECUTION_FAILED', message: 'Command failed' },
        };
      }

      // 5. Compute chunk deltas and identify changed placements/chunks
      const { placementDeltas, addedPlacements, deletedPlacements, chunkKeys, placementIds, changedCells } =
        this.computeDeltas(prevProject, this.project, dispatchResult.affectedPlacementIds, dispatchResult.changedCells);

      // 6. Monotonically increment revision
      const oldRevision = this.project.revision;
      const newRevision = oldRevision + 1;
      this.project.revision = newRevision;
      this.project.metadata.modifiedAt = new Date().toISOString();

      // 7. Record atomic history entry
      const delta: SessionHistoryDelta = {
        commandType: cmd.type,
        beforeRevision: oldRevision,
        afterRevision: newRevision,
        placementDeltas,
        addedPlacements,
        deletedPlacements,
        selectionBefore,
        selectionAfter: { ...this.selection },
      };

      const historyEntry: HistoryEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: mapHistoryType(cmd.type),
        projectId: this.project.id,
        timestamp: Date.now(),
        beforeRevision: oldRevision,
        afterRevision: newRevision,
        data: delta,
      };
      this.history.record(historyEntry);

      // 8. Build success result
      const changedInfo: CommandChangedInfo = {
        cells: changedCells,
        placementIds: Array.from(new Set(placementIds)),
        chunkKeys: Array.from(new Set(chunkKeys)),
        bounds: dispatchResult.bounds,
      };

      const result: Result<{ revision: number; changed: CommandChangedInfo }> = {
        ok: true,
        success: true,
        revision: newRevision,
        changed: changedInfo,
        value: {
          revision: newRevision,
          changed: changedInfo,
        },
      };

      // 9. Cache for idempotency if requested
      if (opts?.requestId) {
        this.cachedResults.set(opts.requestId, result);
      }

      // 10. Emit document change event to subscribers
      this.emitEvent({
        revision: newRevision,
        kind: cmd.type,
        placementIds: changedInfo.placementIds,
        chunkKeys: changedInfo.chunkKeys,
      });

      return result;
    } catch (err) {
      // Atomic rollback on unexpected error
      this.project = prevProject;
      this.selection = selectionBefore;
      return {
        ok: false,
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: err instanceof Error ? err.message : String(err),
          details: { error: String(err) },
        },
      };
    }
  }

  /**
   * Undo the most recent transaction.
   * Restores exact block contents and placement transforms.
   * Monotonically increments revision and emits change event.
   */
  undo(): Result<{ revision: number; changed: CommandChangedInfo }> | null {
    if (!this.history.canUndo()) {
      return null;
    }

    const entry = this.history.undo();
    if (!entry) return null;

    const delta = entry.data as SessionHistoryDelta;
    const affectedPlacementIds: string[] = [];
    const affectedChunkKeys: string[] = [];

    // 1. Remove placements that were added by the command
    for (const item of delta.addedPlacements) {
      const idx = this.project.placements.findIndex((p) => p.id === item.placement.id);
      if (idx >= 0) {
        this.project.placements.splice(idx, 1);
        affectedPlacementIds.push(item.placement.id);
      }
    }

    // 2. Restore placements that were deleted
    for (const item of delta.deletedPlacements) {
      const insertIdx = Math.min(item.index, this.project.placements.length);
      this.project.placements.splice(insertIdx, 0, clonePlacement(item.placement));
      affectedPlacementIds.push(item.placement.id);
      for (const k of item.placement.volume.chunks.keys()) {
        affectedChunkKeys.push(k);
      }
    }

    // 3. Restore modified placements (metadata + chunks)
    for (const pDelta of delta.placementDeltas) {
      const placement = this.project.placements.find((p) => p.id === pDelta.placementId);
      if (!placement) continue;

      affectedPlacementIds.push(placement.id);

      // Restore metadata
      if (pDelta.metadataBefore) {
        placement.name = pDelta.metadataBefore.name;
        placement.transform = {
          translation: [...pDelta.metadataBefore.transform.translation] as Vec3i,
          rotationY: pDelta.metadataBefore.transform.rotationY,
          mirror: pDelta.metadataBefore.transform.mirror,
        };
        placement.origin = [...pDelta.metadataBefore.origin] as Vec3Half;
        placement.visible = pDelta.metadataBefore.visible;
        placement.locked = pDelta.metadataBefore.locked;
        placement.lockReason = pDelta.metadataBefore.lockReason;
        placement.ancillary = {
          blockEntities: new Map(pDelta.metadataBefore.ancillary.blockEntities),
          entities: [...pDelta.metadataBefore.ancillary.entities],
          biomes: pDelta.metadataBefore.ancillary.biomes ? { ...pDelta.metadataBefore.ancillary.biomes } : undefined,
          pendingBlockTicks: [...pDelta.metadataBefore.ancillary.pendingBlockTicks],
          pendingFluidTicks: [...pDelta.metadataBefore.ancillary.pendingFluidTicks],
          unknownTags: new Map(pDelta.metadataBefore.ancillary.unknownTags),
        };
        placement.volume.bounds = {
          min: [...pDelta.metadataBefore.volumeBounds.min] as Vec3i,
          maxExclusive: [...pDelta.metadataBefore.volumeBounds.maxExclusive] as Vec3i,
        };
        placement.volume.nonAirCount = pDelta.metadataBefore.volumeNonAirCount;
        placement.eraseTombstones = new Set(pDelta.metadataBefore.eraseTombstones);
      }

      // Restore chunks
      for (const cDelta of pDelta.chunkDeltas) {
        affectedChunkKeys.push(cDelta.key);
        if (cDelta.before === null) {
          placement.volume.chunks.delete(cDelta.key);
        } else {
          placement.volume.chunks.set(cDelta.key, {
            key: cDelta.key,
            palette: cDelta.before.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
            indices: cDelta.before.indices.slice(),
            revision: 0,
          });
        }
      }
    }

    // 4. Restore selection if captured
    if (delta.selectionBefore) {
      this.selection = { ...delta.selectionBefore };
    }

    // 5. Monotonic revision increment (SUBSPEC-C C7)
    this.project.revision++;
    const newRevision = this.project.revision;

    const changedInfo: CommandChangedInfo = {
      cells: 0,
      placementIds: Array.from(new Set(affectedPlacementIds)),
      chunkKeys: Array.from(new Set(affectedChunkKeys)),
    };

    // 6. Emit event
    this.emitEvent({
      revision: newRevision,
      kind: 'undo',
      placementIds: changedInfo.placementIds,
      chunkKeys: changedInfo.chunkKeys,
    });

    return {
      ok: true,
      success: true,
      revision: newRevision,
      changed: changedInfo,
      value: {
        revision: newRevision,
        changed: changedInfo,
      },
    };
  }

  /**
   * Redo the undone transaction.
   * Restores exact state, monotonically increments revision, and emits change event.
   */
  redo(): Result<{ revision: number; changed: CommandChangedInfo }> | null {
    if (!this.history.canRedo()) {
      return null;
    }

    const entry = this.history.redo();
    if (!entry) return null;

    const delta = entry.data as SessionHistoryDelta;
    const affectedPlacementIds: string[] = [];
    const affectedChunkKeys: string[] = [];

    // 1. Remove placements that were deleted by the command
    for (const item of delta.deletedPlacements) {
      const idx = this.project.placements.findIndex((p) => p.id === item.placement.id);
      if (idx >= 0) {
        this.project.placements.splice(idx, 1);
        affectedPlacementIds.push(item.placement.id);
      }
    }

    // 2. Re-insert placements that were added by the command
    for (const item of delta.addedPlacements) {
      const insertIdx = Math.min(item.index, this.project.placements.length);
      this.project.placements.splice(insertIdx, 0, clonePlacement(item.placement));
      affectedPlacementIds.push(item.placement.id);
      for (const k of item.placement.volume.chunks.keys()) {
        affectedChunkKeys.push(k);
      }
    }

    // 3. Re-apply modified placements (metadata + chunks)
    for (const pDelta of delta.placementDeltas) {
      const placement = this.project.placements.find((p) => p.id === pDelta.placementId);
      if (!placement) continue;

      affectedPlacementIds.push(placement.id);

      // Re-apply metadata
      if (pDelta.metadataAfter) {
        placement.name = pDelta.metadataAfter.name;
        placement.transform = {
          translation: [...pDelta.metadataAfter.transform.translation] as Vec3i,
          rotationY: pDelta.metadataAfter.transform.rotationY,
          mirror: pDelta.metadataAfter.transform.mirror,
        };
        placement.origin = [...pDelta.metadataAfter.origin] as Vec3Half;
        placement.visible = pDelta.metadataAfter.visible;
        placement.locked = pDelta.metadataAfter.locked;
        placement.lockReason = pDelta.metadataAfter.lockReason;
        placement.ancillary = {
          blockEntities: new Map(pDelta.metadataAfter.ancillary.blockEntities),
          entities: [...pDelta.metadataAfter.ancillary.entities],
          biomes: pDelta.metadataAfter.ancillary.biomes ? { ...pDelta.metadataAfter.ancillary.biomes } : undefined,
          pendingBlockTicks: [...pDelta.metadataAfter.ancillary.pendingBlockTicks],
          pendingFluidTicks: [...pDelta.metadataAfter.ancillary.pendingFluidTicks],
          unknownTags: new Map(pDelta.metadataAfter.ancillary.unknownTags),
        };
        placement.volume.bounds = {
          min: [...pDelta.metadataAfter.volumeBounds.min] as Vec3i,
          maxExclusive: [...pDelta.metadataAfter.volumeBounds.maxExclusive] as Vec3i,
        };
        placement.volume.nonAirCount = pDelta.metadataAfter.volumeNonAirCount;
        placement.eraseTombstones = new Set(pDelta.metadataAfter.eraseTombstones);
      }

      // Re-apply chunks
      for (const cDelta of pDelta.chunkDeltas) {
        affectedChunkKeys.push(cDelta.key);
        if (cDelta.after === null) {
          placement.volume.chunks.delete(cDelta.key);
        } else {
          placement.volume.chunks.set(cDelta.key, {
            key: cDelta.key,
            palette: cDelta.after.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
            indices: cDelta.after.indices.slice(),
            revision: 0,
          });
        }
      }
    }

    // 4. Restore selection
    if (delta.selectionAfter) {
      this.selection = { ...delta.selectionAfter };
    }

    // 5. Monotonic revision increment
    this.project.revision++;
    const newRevision = this.project.revision;

    const changedInfo: CommandChangedInfo = {
      cells: 0,
      placementIds: Array.from(new Set(affectedPlacementIds)),
      chunkKeys: Array.from(new Set(affectedChunkKeys)),
    };

    // 6. Emit event
    this.emitEvent({
      revision: newRevision,
      kind: 'redo',
      placementIds: changedInfo.placementIds,
      chunkKeys: changedInfo.chunkKeys,
    });

    return {
      ok: true,
      success: true,
      revision: newRevision,
      changed: changedInfo,
      value: {
        revision: newRevision,
        changed: changedInfo,
      },
    };
  }

  /**
   * Execute a query against current document state.
   */
  query<T = unknown>(q: Query): T {
    const norm = normalizeType(q.type);

    switch (norm) {
      case 'getproject':
      case 'project': {
        return this.snapshot() as unknown as T;
      }

      case 'listplacements': {
        const query = q as { filter?: string; limit?: number; offset?: number };
        let placements = this.project.placements;
        if (query.filter) {
          const f = query.filter.toLowerCase();
          placements = placements.filter((p) => p.id.toLowerCase().includes(f) || p.name.toLowerCase().includes(f));
        }
        if (query.offset !== undefined || query.limit !== undefined) {
          const offset = query.offset ?? 0;
          const limit = query.limit ?? placements.length;
          placements = placements.slice(offset, offset + limit);
        }
        return placements.map(clonePlacement) as unknown as T;
      }

      case 'getplacement': {
        const query = q as { placementId: string };
        const p = this.project.placements.find((pl) => pl.id === query.placementId);
        return (p ? clonePlacement(p) : null) as unknown as T;
      }

      case 'getblock': {
        const query = q as { worldPos: Vec3i };
        const res = resolveBlockAt(this.project, query.worldPos, this.project.overlapPolicy);
        return {
          state: res.state,
          owningPlacementId: res.owningPlacementId,
          isErase: res.isErase,
          id: res.state.id,
          props: res.state.props,
        } as unknown as T;
      }

      case 'getselection': {
        return { ...this.selection } as unknown as T;
      }

      case 'materiallist': {
        const query = q as { mode?: 'effective' | 'perPlacement'; placementId?: string; bounds?: Bounds3i };
        if (query.mode === 'perPlacement') {
          const targetPlacements = query.placementId
            ? this.project.placements.filter((p) => p.id === query.placementId)
            : this.project.placements;
          const reportMap: Record<string, MaterialReport> = {};
          for (const placement of targetPlacements) {
            const pb = fastPlacementWorldBounds(placement);
            const singleProj: Project = {
              ...this.project,
              placements: [placement],
            };
            reportMap[placement.id] = generateMaterialReport(singleProj, pb);
          }
          if (query.placementId) {
            return (reportMap[query.placementId] ?? null) as unknown as T;
          }
          return reportMap as unknown as T;
        }

        const b = query.bounds ?? getProjectBounds(this.project);
        return generateMaterialReport(this.project, b) as unknown as T;
      }

      case 'detectconflicts': {
        const query = q as { bounds?: Bounds3i; proposedState?: BlockStateId; overlapPolicy?: 'top-wins' | 'bottom-wins' };
        const b = query.bounds ?? getProjectBounds(this.project);
        return detectConflicts(
          this.project,
          b,
          query.proposedState,
          query.overlapPolicy ?? this.project.overlapPolicy,
        ) as unknown as T;
      }

      case 'gethistory': {
        const query = q as { limit?: number; offset?: number };
        let undoStack = this.history.getUndoStack();
        if (query.offset !== undefined || query.limit !== undefined) {
          const offset = query.offset ?? 0;
          const limit = query.limit ?? undoStack.length;
          undoStack = undoStack.slice(offset, offset + limit);
        }
        const res: HistoryQueryResult = {
          undoStack,
          redoStack: this.history.getRedoStack(),
          canUndo: this.history.canUndo(),
          canRedo: this.history.canRedo(),
          undoCount: this.history.undoCount(),
          redoCount: this.history.redoCount(),
        };
        return res as unknown as T;
      }

      default:
        throw new Error(`Unknown query type: ${(q as { type: string }).type}`);
    }
  }

  // ==========================================================================
  // Private Command Dispatchers
  // ==========================================================================

  private dispatchCommand(cmd: Command): {
    ok: boolean;
    error?: SessionError;
    affectedPlacementIds?: string[];
    changedCells?: number;
    bounds?: Bounds3i;
  } {
    const norm = normalizeType(cmd.type);

    // ── Placements ──
    if (norm === 'placement:add') {
      const c = cmd as { placement: Placement };
      if (this.project.placements.some((p) => p.id === c.placement.id)) {
        return {
          ok: false,
          error: {
            code: 'ENGINE_INVARIANT_VIOLATION',
            message: `Duplicate placement id: ${c.placement.id}`,
          },
        };
      }
      this.project.placements.push(clonePlacement(c.placement));
      return { ok: true, affectedPlacementIds: [c.placement.id] };
    }

    if (norm === 'placement:remove' || norm === 'placement:delete') {
      const c = cmd as { placementId: string };
      const idx = this.project.placements.findIndex((p) => p.id === c.placementId);
      if (idx === -1) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      const target = this.project.placements[idx]!;
      if (target.locked) {
        return lockedError(target.id, 'delete');
      }
      this.project.placements.splice(idx, 1);
      const repair = repairAfterDelete(this.selection, [target.id]);
      this.selection = repair.state;
      return { ok: true, affectedPlacementIds: [target.id] };
    }

    if (norm === 'placement:duplicate') {
      const c = cmd as { placementId: string; offset?: Vec3i };
      const idx = this.project.placements.findIndex((p) => p.id === c.placementId);
      if (idx === -1) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      const source = this.project.placements[idx]!;
      if (source.locked) {
        return lockedError(source.id, 'duplicate');
      }
      const duplicate = clonePlacement(source);
      duplicate.id = `${source.id}-copy-${Date.now()}`;
      duplicate.name = `${source.name} (Copy)`;
      duplicate.createdAt = new Date().toISOString();
      if (c.offset) {
        duplicate.transform.translation = [
          duplicate.transform.translation[0] + c.offset[0],
          duplicate.transform.translation[1] + c.offset[1],
          duplicate.transform.translation[2] + c.offset[2],
        ];
      }
      this.project.placements.splice(idx + 1, 0, duplicate);
      return { ok: true, affectedPlacementIds: [duplicate.id] };
    }

    if (norm === 'placement:rename') {
      const c = cmd as { placementId: string; name: string };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'rename');
      }
      placement.name = c.name;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:move') {
      const c = cmd as { placementId: string; translation?: Vec3i; offset?: Vec3i };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'move');
      }
      if (c.translation) {
        placement.transform.translation = [...c.translation] as Vec3i;
      } else if (c.offset) {
        placement.transform.translation = [
          placement.transform.translation[0] + c.offset[0],
          placement.transform.translation[1] + c.offset[1],
          placement.transform.translation[2] + c.offset[2],
        ];
      }
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:rotate') {
      const c = cmd as { placementId: string; rotationY: 0 | 90 | 180 | 270 };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'rotate');
      }
      placement.transform.rotationY = c.rotationY;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:mirror') {
      const c = cmd as { placementId: string; mirror: 'none' | 'x' | 'z' };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'mirror');
      }
      placement.transform.mirror = c.mirror;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:transform') {
      const c = cmd as {
        placementId: string;
        translation?: Vec3i;
        rotationY?: 0 | 90 | 180 | 270;
        mirror?: 'none' | 'x' | 'z';
      };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'transform');
      }
      if (c.translation !== undefined) {
        placement.transform.translation = [
          Math.round(c.translation[0]),
          Math.round(c.translation[1]),
          Math.round(c.translation[2]),
        ] as Vec3i;
      }
      if (c.rotationY !== undefined) {
        placement.transform.rotationY = c.rotationY;
      }
      if (c.mirror !== undefined) {
        placement.transform.mirror = c.mirror;
      }
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:setorigin') {
      const c = cmd as { placementId: string; origin: Vec3Half; keepBlocksInPlace?: boolean };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      if (placement.locked) {
        return lockedError(placement.id, 'setOrigin');
      }
      if (c.origin[0] % 2 !== 0 || c.origin[1] % 2 !== 0 || c.origin[2] % 2 !== 0) {
        return {
          ok: false,
          error: { code: 'ENGINE_OFF_GRID_TRANSFORM', message: 'Origin must be integral (even half-block numbers)' },
        };
      }
      if (c.keepBlocksInPlace !== false) {
        const [ox, oy, oz] = placement.origin;
        const [nx, ny, nz] = c.origin;
        const dHalfX = (nx - ox) / 2;
        const dHalfY = (ny - oy) / 2;
        const dHalfZ = (nz - oz) / 2;
        const [mx, my, mz] = applyMirror(dHalfX, dHalfY, dHalfZ, placement.transform.mirror);
        const [rx, ry, rz] = applyRotation(mx, my, mz, placement.transform.rotationY);
        placement.transform.translation = [
          Math.round(placement.transform.translation[0] + rx),
          Math.round(placement.transform.translation[1] + ry),
          Math.round(placement.transform.translation[2] + rz),
        ];
      }
      placement.origin = [...c.origin] as Vec3Half;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:sethidden' || norm === 'placement:setvisibility') {
      const c = cmd as { placementId: string; hidden?: boolean; visible?: boolean };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      // Visibility is allowed while locked (SUBSPEC-D §2.1)
      const nextVisible = c.visible !== undefined ? c.visible : !c.hidden;
      placement.visible = nextVisible;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    if (norm === 'placement:setlocked') {
      const c = cmd as { placementId: string; locked: boolean; lockReason?: 'user' | 'import' | 'system' };
      const placement = this.project.placements.find((p) => p.id === c.placementId);
      if (!placement) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `Placement ${c.placementId} not found` },
        };
      }
      placement.locked = c.locked;
      if (c.lockReason) placement.lockReason = c.lockReason;
      return { ok: true, affectedPlacementIds: [placement.id] };
    }

    // ── Group Transforms ──
    if (norm === 'group:transform' || norm === 'group:rotate' || norm === 'group:mirror') {
      const c = cmd as {
        placementIds: string[];
        pivot?: Vec3Half;
        rotationY?: 0 | 90 | 180 | 270;
        mirror?: 'none' | 'x' | 'z';
        translation?: Vec3i;
      };

      for (const id of c.placementIds) {
        const p = this.project.placements.find((pl) => pl.id === id);
        if (p && p.locked) {
          return lockedError(p.id, 'groupTransform');
        }
      }

      for (const id of c.placementIds) {
        const placement = this.project.placements.find((pl) => pl.id === id);
        if (!placement) continue;

        if (c.pivot && (c.rotationY !== undefined || c.mirror !== undefined)) {
          const newTransform = rotateAboutPoint(
            placement,
            c.pivot,
            c.rotationY ?? placement.transform.rotationY,
            c.mirror ?? placement.transform.mirror,
          );
          placement.transform = newTransform;
        }

        if (c.translation) {
          placement.transform.translation = [
            placement.transform.translation[0] + c.translation[0],
            placement.transform.translation[1] + c.translation[1],
            placement.transform.translation[2] + c.translation[2],
          ];
        }
      }

      return { ok: true, affectedPlacementIds: c.placementIds };
    }

    // ── Selection Commands ──
    if (norm === 'selection:set') {
      const c = cmd as { selection: Selection };
      this.selection = createSelectionState(c.selection.kind, c.selection, this.selection.anchor);
      return { ok: true, affectedPlacementIds: [] };
    }

    if (norm === 'selection:clear') {
      this.selection = createSelectionState(
        'cuboid',
        createCuboidSelection({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }, this.selection.anchor),
        this.selection.anchor,
      );
      return { ok: true, affectedPlacementIds: [] };
    }

    if (norm === 'selection:edit') {
      const c = cmd as { bounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }; anchor?: SelectionAnchor; placementIds?: string[] };
      const anchor = c.anchor ?? this.selection.anchor;
      if (c.bounds) {
        this.selection = createSelectionState('cuboid', createCuboidSelection(c.bounds, anchor), anchor);
      } else if (c.placementIds) {
        this.selection = createSelectionState('placement', createPlacementSelection(c.placementIds, anchor), anchor);
      }
      return { ok: true, affectedPlacementIds: [] };
    }

    // ── Region Operations ──
    if (
      norm === 'region:fill' ||
      norm === 'fill' ||
      norm === 'region:replace' ||
      norm === 'replace' ||
      norm === 'region:delete' ||
      norm === 'delete' ||
      norm === 'region:hollow' ||
      norm === 'hollow' ||
      norm === 'region:walls' ||
      norm === 'walls'
    ) {
      const bounds = (cmd as { bounds: Bounds3i }).bounds;
      const targetPlacementId =
        (cmd as { targetPlacementId?: string; placementId?: string }).targetPlacementId ??
        (cmd as { targetPlacementId?: string; placementId?: string }).placementId;
      const options = (cmd as { options?: RegionOperationOptions }).options;

      // Validate lock status for intersecting placements
      for (const p of this.project.placements) {
        if (targetPlacementId && p.id !== targetPlacementId) continue;
        const pb = placementWorldBounds(p);
        if (boundsIntersect3i(bounds, pb) && p.locked) {
          return lockedError(p.id, norm);
        }
      }

      let op: RegionOperation;
      if (norm.includes('fill')) {
        op = { kind: 'fill', state: (cmd as { block: BlockStateId }).block };
      } else if (norm.includes('replace')) {
        const rc = cmd as { matcher: any; replacement: BlockStateId; preserveProperties?: boolean };
        op = { kind: 'replace', matcher: rc.matcher, replacement: rc.replacement, preserveProperties: !!rc.preserveProperties };
      } else if (norm.includes('delete')) {
        const dc = cmd as { removeBlockEntities?: boolean; removeEntities?: boolean };
        op = { kind: 'delete', removeBlockEntities: dc.removeBlockEntities, removeEntities: dc.removeEntities };
      } else if (norm.includes('hollow')) {
        op = { kind: 'hollow', shellThickness: (cmd as { shellThickness?: number }).shellThickness };
      } else {
        const wc = cmd as { wallBlock: BlockStateId; fillInterior?: BlockStateId | null; includeTop?: boolean; includeBottom?: boolean };
        op = {
          kind: 'walls',
          wallBlock: wc.wallBlock,
          fillInterior: wc.fillInterior ?? null,
          includeTop: wc.includeTop ?? true,
          includeBottom: wc.includeBottom ?? true,
        };
      }

      const mergedOptions = targetPlacementId
        ? { ...options, targetPlacementId, scope: 'single-placement' as const }
        : options;

      const targetProject = targetPlacementId
        ? { ...this.project, placements: this.project.placements.filter((p) => p.id === targetPlacementId) }
        : this.project;

      const res = applyRegionOperation(targetProject, op, bounds, mergedOptions as RegionOperationOptions);
      const affectedIds = res.perPlacementChanges.map((c) => c.placementId);
      return {
        ok: true,
        affectedPlacementIds: affectedIds,
        changedCells: res.changedCells,
        bounds,
      };
    }

    if (norm === 'region:move' || norm === 'move') {
      const c = cmd as { sourceBounds: Bounds3i; offset: Vec3i; affectedPlacements?: string[]; overlapPolicy?: 'top-wins' | 'bottom-wins' };
      const affected = c.affectedPlacements ?? this.project.placements.map((p) => p.id);

      for (const id of affected) {
        const p = this.project.placements.find((pl) => pl.id === id);
        if (p && p.locked) {
          return lockedError(p.id, 'regionMove');
        }
      }

      const engine = new MoveStackEngine();
      const res = engine.moveRegion(this.project, c.sourceBounds, c.offset, {
        overlapPolicy: c.overlapPolicy ?? this.project.overlapPolicy,
        affectedPlacements: affected,
      });

      return {
        ok: true,
        affectedPlacementIds: res.changedPlacements,
        changedCells: res.changedCells,
        bounds: c.sourceBounds,
      };
    }

    // ── Clipboard Operations ──
    if (norm === 'clipboard:copy' || norm === 'copy') {
      const c = cmd as { selection?: any; scope?: 'effective-composite' | 'source-placement' };
      let sel = c.selection;
      if (!sel) {
        if (this.selection.type === 'cuboid') {
          const cb = this.selection.selection as { bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } };
          sel = {
            kind: 'cuboid',
            bounds: {
              min: [cb.bounds.minX, cb.bounds.minY, cb.bounds.minZ] as Vec3i,
              maxExclusive: [cb.bounds.maxX, cb.bounds.maxY, cb.bounds.maxZ] as Vec3i,
            },
          };
        } else {
          sel = this.selection.selection;
        }
      }
      this.clipboard.copy(this.project, sel, c.scope ?? 'effective-composite');
      return { ok: true, affectedPlacementIds: [] };
    }

    if (norm === 'clipboard:cut' || norm === 'cut') {
      const c = cmd as { selection?: any; scope?: 'effective-composite' | 'source-placement'; options?: any };
      let sel = c.selection;
      if (!sel && this.selection.type === 'cuboid') {
        const cb = this.selection.selection as { bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } };
        sel = {
          kind: 'cuboid',
          bounds: {
            min: [cb.bounds.minX, cb.bounds.minY, cb.bounds.minZ] as Vec3i,
            maxExclusive: [cb.bounds.maxX, cb.bounds.maxY, cb.bounds.maxZ] as Vec3i,
          },
        };
      }
      if (!sel) {
        return { ok: false, error: { code: 'INVALID_SELECTION', message: 'No selection to cut' } };
      }

      // Validate lock
      if (sel.kind === 'cuboid') {
        for (const p of this.project.placements) {
          const pb = placementWorldBounds(p);
          if (boundsIntersect3i(sel.bounds, pb) && p.locked) {
            return lockedError(p.id, 'cut');
          }
        }
      }

      this.clipboard.cut(this.project, sel, c.options);
      return { ok: true, affectedPlacementIds: this.project.placements.map((p) => p.id) };
    }

    if (norm === 'clipboard:paste' || norm === 'paste') {
      const c = cmd as {
        targetPosition: Vec3i;
        entry?: ClipboardEntry;
        entryId?: string;
        intoPlacementId?: string;
        overrideAir?: boolean;
        skipAir?: boolean;
        rotationY?: 0 | 90 | 180 | 270;
        mirror?: 'none' | 'x' | 'z';
        pasteAtOriginalPosition?: boolean;
      };

      const entry = c.entry ?? (c.entryId ? this.clipboard.getEntry(c.entryId) : this.clipboard.listEntries().pop());
      if (!entry) {
        return { ok: false, error: { code: 'CLIPBOARD_EMPTY', message: 'No clipboard entry to paste' } };
      }

      if (c.intoPlacementId) {
        const p = this.project.placements.find((pl) => pl.id === c.intoPlacementId);
        if (p && p.locked) {
          return lockedError(p.id, 'paste');
        }
      }

      const res = this.clipboard.paste(this.project, entry, {
        targetPosition: c.targetPosition,
        intoPlacementId: c.intoPlacementId,
        overrideAir: c.overrideAir,
        skipAir: c.skipAir,
        rotationY: c.rotationY,
        mirror: c.mirror,
        pasteAtOriginalPosition: c.pasteAtOriginalPosition,
      });

      return {
        ok: true,
        affectedPlacementIds: res.placementId ? [res.placementId] : this.project.placements.map((p) => p.id),
        changedCells: res.changedCells,
        bounds: res.affectedBounds,
      };
    }

    // ── Bake ──
    if (norm === 'bake' || norm === 'bake:placements') {
      const c = cmd as {
        placementIds?: string[];
        createNewPlacement?: boolean;
        newPlacementName?: string;
        overlapPolicy?: 'top-wins' | 'bottom-wins';
      };

      const placementIds = c.placementIds ?? this.project.placements.map((p) => p.id);
      const affected = this.project.placements.filter((p) => placementIds.includes(p.id));

      if (affected.length < 2) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'Bake requires at least 2 placements' } };
      }

      for (const p of affected) {
        if (p.locked) {
          return lockedError(p.id, 'bake');
        }
      }

      const engine = new BakeEngine({
        overlapPolicy: c.overlapPolicy ?? this.project.overlapPolicy,
        affectedPlacements: placementIds,
        createNewPlacement: !!c.createNewPlacement,
        newPlacementName: c.newPlacementName,
      });
      const res = engine.bake(this.project);
      return {
        ok: true,
        affectedPlacementIds: res.changedPlacements,
        changedCells: res.changedCells,
        bounds: res.unionBounds,
      };
    }

    return {
      ok: false,
      error: { code: 'UNKNOWN_COMMAND', message: `Unknown command type: ${(cmd as { type: string }).type}` },
    };
  }

  // ==========================================================================
  // Delta & Event Computing
  // ==========================================================================

  private computeDeltas(
    prevProject: Project,
    currProject: Project,
    hintPlacementIds?: string[],
    explicitChangedCells?: number,
  ): {
    placementDeltas: PlacementDelta[];
    addedPlacements: Array<{ index: number; placement: Placement }>;
    deletedPlacements: Array<{ index: number; placement: Placement }>;
    chunkKeys: string[];
    placementIds: string[];
    changedCells: number;
  } {
    const prevMap = new Map(prevProject.placements.map((p) => [p.id, p]));
    const currMap = new Map(currProject.placements.map((p) => [p.id, p]));

    const addedPlacements: Array<{ index: number; placement: Placement }> = [];
    const deletedPlacements: Array<{ index: number; placement: Placement }> = [];
    const placementDeltas: PlacementDelta[] = [];
    const changedChunkKeys = new Set<string>();
    const changedPlacementIds = new Set<string>(hintPlacementIds ?? []);
    let computedCellDiffs = 0;

    // 1. Detect added placements
    for (let i = 0; i < currProject.placements.length; i++) {
      const currP = currProject.placements[i];
      if (!prevMap.has(currP.id)) {
        addedPlacements.push({ index: i, placement: clonePlacement(currP) });
        changedPlacementIds.add(currP.id);
        for (const k of currP.volume.chunks.keys()) {
          changedChunkKeys.add(k);
        }
        computedCellDiffs += currP.volume.nonAirCount;
      }
    }

    // 2. Detect deleted placements
    for (let i = 0; i < prevProject.placements.length; i++) {
      const prevP = prevProject.placements[i];
      if (!currMap.has(prevP.id)) {
        deletedPlacements.push({ index: i, placement: clonePlacement(prevP) });
        changedPlacementIds.add(prevP.id);
        for (const k of prevP.volume.chunks.keys()) {
          changedChunkKeys.add(k);
        }
        computedCellDiffs += prevP.volume.nonAirCount;
      }
    }

    // 3. Detect modified placements
    for (const [id, prevP] of prevMap) {
      const currP = currMap.get(id);
      if (!currP) continue;

      const metadataBefore = snapshotPlacementMetadata(prevP);
      const metadataAfter = snapshotPlacementMetadata(currP);

      // Check metadata change
      const metadataChanged =
        metadataBefore.name !== metadataAfter.name ||
        metadataBefore.visible !== metadataAfter.visible ||
        metadataBefore.locked !== metadataAfter.locked ||
        metadataBefore.lockReason !== metadataAfter.lockReason ||
        metadataBefore.origin[0] !== metadataAfter.origin[0] ||
        metadataBefore.origin[1] !== metadataAfter.origin[1] ||
        metadataBefore.origin[2] !== metadataAfter.origin[2] ||
        metadataBefore.transform.translation[0] !== metadataAfter.transform.translation[0] ||
        metadataBefore.transform.translation[1] !== metadataAfter.transform.translation[1] ||
        metadataBefore.transform.translation[2] !== metadataAfter.transform.translation[2] ||
        metadataBefore.transform.rotationY !== metadataAfter.transform.rotationY ||
        metadataBefore.transform.mirror !== metadataAfter.transform.mirror;

      if (metadataChanged) {
        changedPlacementIds.add(id);
      }

      // Check chunk changes (skip scanning chunks if volume references are identical)
      const chunkDeltas: ChunkDelta[] = [];
      if (prevP.volume !== currP.volume) {
        const prevChunks = prevP.volume.chunks;
        const currChunks = currP.volume.chunks;

        // Deleted chunks
        for (const [k, pc] of prevChunks) {
          if (!currChunks.has(k)) {
            chunkDeltas.push({
              key: k,
              before: {
                key: k,
                palette: pc.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
                indices: pc.indices.slice(),
              },
              after: null,
            });
            changedChunkKeys.add(k);
            changedPlacementIds.add(id);
            computedCellDiffs += pc.indices.length;
          }
        }

        // Added or modified chunks
        for (const [k, cc] of currChunks) {
          const pc = prevChunks.get(k);
          if (!pc) {
            chunkDeltas.push({
              key: k,
              before: null,
              after: {
                key: k,
                palette: cc.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
                indices: cc.indices.slice(),
              },
            });
            changedChunkKeys.add(k);
            changedPlacementIds.add(id);
            computedCellDiffs += cc.indices.length;
          } else {
            const indEq = areIndicesEqual(pc.indices, cc.indices);
            const palEq = arePalettesEqual(pc.palette, cc.palette);
            if (!indEq || !palEq) {
              chunkDeltas.push({
                key: k,
                before: {
                  key: k,
                  palette: pc.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
                  indices: pc.indices.slice(),
                },
                after: {
                  key: k,
                  palette: cc.palette.map((s) => ({ id: s.id, props: { ...s.props } })),
                  indices: cc.indices.slice(),
                },
              });
              changedChunkKeys.add(k);
              changedPlacementIds.add(id);
              // Count cell differences
              for (let i = 0; i < pc.indices.length; i++) {
                if (pc.indices[i] !== cc.indices[i]) computedCellDiffs++;
              }
            }
          }
        }
      }

      if (metadataChanged || chunkDeltas.length > 0) {
        placementDeltas.push({
          placementId: id,
          metadataBefore,
          metadataAfter,
          chunkDeltas,
        });
      }
    }

    const finalCells = explicitChangedCells !== undefined ? explicitChangedCells : computedCellDiffs;

    return {
      placementDeltas,
      addedPlacements,
      deletedPlacements,
      chunkKeys: Array.from(changedChunkKeys),
      placementIds: Array.from(changedPlacementIds),
      changedCells: finalCells,
    };
  }

  private emitEvent(event: SessionChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // Subscriber errors do not break session
      }
    }
  }

  private createPlaceholderPlacement(id: string): Placement {
    return {
      id,
      name: id,
      volume: createEmptyVolume({ min: [0, 0, 0], maxExclusive: [16, 16, 16] }),
      transform: {
        translation: [0, 0, 0],
        rotationY: 0,
        mirror: 'none',
      },
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
      source: {
        format: 'generated',
        filename: `${id}.schem`,
        diagnostics: [],
      },
      eraseTombstones: new Set(),
    };
  }
}
