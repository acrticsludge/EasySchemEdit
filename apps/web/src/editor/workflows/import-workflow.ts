// apps/web/src/editor/workflows/import-workflow.ts
// Pure TypeScript Import-and-Place Workflow Controller (Slice E3.5, SUBSPEC-D §4.6.4).
// Manages pending schematic import, format inspection, ghost cursor preview,
// ground snap, rotation/mirror transformations, and transactional placement commit/undo.

import type {
  Bounds3i,
  Placement,
  Vec3Half,
  Vec3i,
} from '@easyschemedit/domain';
import {
  importSchematic,
  type ImportOptions,
  type ImportReport,
  type ImportResult,
} from '@easyschemedit/formats';
import type { EditorSessionStore } from '../session-store.ts';
import { useSyncExternalStore } from 'react';

export interface ImportGroup {
  id: string;
  name: string;
  sourceFilename: string;
  placementIds: string[];
  sourceFormat: 'schem-v2' | 'schem-v3' | 'litematic';
  sourceMetadata?: any;
}

export type ImportWorkflowStateKind =
  | 'idle'
  | 'loading'
  | 'review-report'
  | 'ghost-preview'
  | 'failed';

export type GhostRotationY = 0 | 90 | 180 | 270;
export type GhostMirror = 'none' | 'x' | 'z';

export interface RaycastHitInput {
  voxelPosition: Vec3i;
  adjacentPosition: Vec3i;
}

export type ParseSchematicFn = (
  bytes: Uint8Array,
  fileName: string,
  options?: Partial<ImportOptions>,
) => Promise<ImportResult & { group?: any }>;

export interface ImportWorkflowOptions {
  parseFn?: ParseSchematicFn;
}

export interface ImportWorkflowState {
  readonly state: ImportWorkflowStateKind;
  readonly cursorPosition: Vec3i;
  readonly ghostRotationY: GhostRotationY;
  readonly ghostMirror: GhostMirror;
  readonly pendingImport: (ImportResult & { group?: ImportGroup }) | null;
  readonly fileName: string | null;
  readonly errorMessage: string | null;
}

/**
 * Pure 3D math helper: rotates vector (x, y, z) about Y axis by 0, 90, 180, or 270 degrees.
 * Matches Minecraft coordinate conventions (SUBSPEC-D §4.2, coordinates.ts).
 */
export function applyRotation(
  x: number,
  y: number,
  z: number,
  rotationY: GhostRotationY,
): [number, number, number] {
  switch (rotationY) {
    case 0:
      return [x, y, z];
    case 90:
      return [z, y, -x];
    case 180:
      return [-x, y, -z];
    case 270:
      return [-z, y, x];
  }
}

/**
 * Pure 3D math helper: mirrors vector (x, y, z) along X or Z axis.
 */
export function applyMirror(
  x: number,
  y: number,
  z: number,
  mirror: GhostMirror,
): [number, number, number] {
  switch (mirror) {
    case 'none':
      return [x, y, z];
    case 'x':
      return [-x, y, z];
    case 'z':
      return [x, y, -z];
  }
}

/**
 * Pure TypeScript controller managing the import-and-place lifecycle.
 * Dispatches atomic commands to EditorSessionStore upon confirmation.
 */
export class ImportWorkflowController {
  private state: ImportWorkflowStateKind = 'idle';
  private cursorPosition: Vec3i = [0, 0, 0];
  private ghostRotationY: GhostRotationY = 0;
  private ghostMirror: GhostMirror = 'none';
  private pendingImport: (ImportResult & { group?: ImportGroup }) | null = null;
  private basePlacements: Placement[] = [];
  private baseAnchor: Vec3i = [0, 0, 0];
  private fileName: string | null = null;
  private errorMessage: string | null = null;
  private lastImportedPlacementIds: string[] = [];
  private listeners: Set<() => void> = new Set();
  private currentSnapshot: ImportWorkflowState = this.buildSnapshot();
  public readonly store: EditorSessionStore;
  private readonly parseFn?: ParseSchematicFn;

  constructor(
    store: EditorSessionStore,
    options?: ImportWorkflowOptions,
  ) {
    this.store = store;
    this.parseFn = options?.parseFn;
    this.currentSnapshot = this.buildSnapshot();
  }

  // --------------------------------------------------------------------------
  // Reactive subscription
  // --------------------------------------------------------------------------

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private buildSnapshot(): ImportWorkflowState {
    return {
      state: this.state,
      cursorPosition: [...this.cursorPosition] as Vec3i,
      ghostRotationY: this.ghostRotationY,
      ghostMirror: this.ghostMirror,
      pendingImport: this.pendingImport,
      fileName: this.fileName,
      errorMessage: this.errorMessage,
    };
  }

  private notify(): void {
    this.currentSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('ImportWorkflowController listener error:', err);
      }
    }
  }

  public getSnapshot = (): ImportWorkflowState => this.currentSnapshot;

  public getState(): ImportWorkflowStateKind {
    return this.state;
  }

  public getCursorPosition(): Vec3i {
    return [...this.cursorPosition] as Vec3i;
  }

  public getRotationY(): GhostRotationY {
    return this.ghostRotationY;
  }

  public getMirror(): GhostMirror {
    return this.ghostMirror;
  }

  public getPendingImport(): (ImportResult & { group?: ImportGroup }) | null {
    return this.pendingImport;
  }

  public getReport(): ImportReport | null {
    return this.pendingImport?.report ?? null;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getFileName(): string | null {
    return this.fileName;
  }

  public getLastImportedPlacementIds(): string[] {
    return [...this.lastImportedPlacementIds];
  }

  // --------------------------------------------------------------------------
  // Workflow lifecycle
  // --------------------------------------------------------------------------

  /**
   * Starts importing a schematic from raw bytes.
   * Calls importSchematic (or injected parseFn), creates pending ImportOutput,
   * and enters 'review-report' or 'ghost-preview' (or 'failed' if report has fatal errors).
   */
  public async startFileImport(
    bytes: Uint8Array,
    fileName: string,
    options?: Partial<ImportOptions> & { autoPreview?: boolean },
  ): Promise<void> {
    this.state = 'loading';
    this.fileName = fileName;
    this.errorMessage = null;
    this.notify();

    try {
      const runner = this.parseFn ?? importSchematic;
      const output = await runner(bytes, fileName, options);

      // Ensure import group is tracked for multi-region imports if not already set
      if (!output.group && output.importGroups && output.importGroups.length > 0) {
        output.group = output.importGroups[0];
      }
      if (!output.group && output.placements && output.placements.length > 1) {
        const baseName = fileName.replace(/\.[^/.]+$/, '') || 'imported';
        output.group = {
          id: `group_${baseName}`,
          name: baseName,
          sourceFilename: fileName,
          placementIds: output.placements.map((p) => p.id),
          sourceFormat: (output.report?.format?.kind as any) ?? 'litematic',
        };
        if (!output.importGroups || output.importGroups.length === 0) {
          output.importGroups = [output.group];
        }
      }

      this.pendingImport = output;

      // Validate report errors
      const reportErrors = output.report?.errors ?? [];
      const isReportOk =
        (output.report as any)?.ok !== undefined
          ? Boolean((output.report as any).ok)
          : reportErrors.length === 0;

      if (!isReportOk) {
        this.state = 'failed';
        this.errorMessage =
          reportErrors[0]?.message ?? 'Import report contained fatal errors';
        this.notify();
        return;
      }

      // Initialize base placements and anchor for ghost preview
      this.basePlacements = output.placements.map((p) => this.clonePlacement(p));
      if (this.basePlacements.length > 0) {
        const minX = Math.min(...this.basePlacements.map((p) => p.transform.translation[0]));
        const minY = Math.min(...this.basePlacements.map((p) => p.transform.translation[1]));
        const minZ = Math.min(...this.basePlacements.map((p) => p.transform.translation[2]));
        this.baseAnchor = [minX, minY, minZ];
      } else {
        this.baseAnchor = [0, 0, 0];
      }

      this.cursorPosition = [0, 0, 0];
      this.ghostRotationY = 0;
      this.ghostMirror = 'none';

      this.state = options?.autoPreview ? 'ghost-preview' : 'review-report';
      this.notify();
    } catch (err: any) {
      this.state = 'failed';
      const message = err?.message || String(err);
      const code = err?.code || 'IMPORT_FAILED';
      this.errorMessage = message;

      const errorReport: ImportReport = {
        format: { kind: 'unknown', reason: message },
        dimensions: { width: 0, height: 0, length: 0 },
        volume: 0n,
        nonAirBlockCount: 0,
        paletteSize: 0,
        regionCount: 0,
        fileSizeBytes: bytes.length,
        compressedSizeBytes: bytes.length,
        decompressedSizeBytes: bytes.length,
        preserved: { blockEntities: 0, entities: 0, biomes: false, ticks: 0 },
        unsupported: { tags: [], blockStates: [] },
        sameStateOverlaps: 0,
        stateConflicts: 0,
        normalized: [],
        dropped: [],
        warnings: [],
        errors: [
          {
            code,
            severity: 'error',
            message,
          },
        ],
      };

      this.pendingImport = {
        placements: [],
        importGroups: [],
        report: errorReport,
        normalizedImport: false,
      };

      this.notify();
    }
  }

  /**
   * Enters ghost preview mode from review report.
   */
  public startGhostPreview(): void {
    if (this.pendingImport && this.basePlacements.length > 0) {
      this.state = 'ghost-preview';
      this.notify();
    }
  }

  /**
   * Sets the 3D world cursor position for the ghost preview.
   */
  public setCursorPosition(pos: Vec3i): void {
    this.cursorPosition = [pos[0], pos[1], pos[2]];
    this.notify();
  }

  /**
   * Ground-snap helper:
   * - When hitting an existing voxel (raycastHit !== null), snaps to adjacentPosition.
   * - Otherwise, snaps to [cursorPosition[0], defaultY ?? 0, cursorPosition[2]] on ground plane.
   * Updates and returns the new cursor position.
   */
  public snapGhostToGround(
    raycastHit: RaycastHitInput | null,
    defaultY: number = 0,
  ): Vec3i {
    if (raycastHit) {
      this.cursorPosition = [
        raycastHit.adjacentPosition[0],
        raycastHit.adjacentPosition[1],
        raycastHit.adjacentPosition[2],
      ];
    } else {
      this.cursorPosition = [
        this.cursorPosition[0],
        defaultY,
        this.cursorPosition[2],
      ];
    }
    this.notify();
    return [...this.cursorPosition] as Vec3i;
  }

  /**
   * Cycles ghost rotation clockwise: 0 -> 90 -> 180 -> 270 -> 0 (R key).
   */
  public rotateGhostClockwise(): GhostRotationY {
    const next = ((this.ghostRotationY + 90) % 360) as GhostRotationY;
    this.ghostRotationY = next;
    this.notify();
    return next;
  }

  /**
   * Cycles or sets ghost mirror: 'none' -> 'x' -> 'z' -> 'none' (M key).
   */
  public mirrorGhost(axis?: 'x' | 'z'): GhostMirror {
    if (axis !== undefined) {
      this.ghostMirror = this.ghostMirror === axis ? 'none' : axis;
    } else {
      switch (this.ghostMirror) {
        case 'none':
          this.ghostMirror = 'x';
          break;
        case 'x':
          this.ghostMirror = 'z';
          break;
        case 'z':
          this.ghostMirror = 'none';
          break;
        default:
          this.ghostMirror = 'none';
          break;
      }
    }
    this.notify();
    return this.ghostMirror;
  }

  /**
   * Returns pending placements offset by cursorPosition with ghost rotation/mirror applied.
   * Preserves relative offsets for multi-region .litematic import groups.
   */
  public getGhostPreviewPlacements(): Placement[] {
    if (!this.pendingImport || this.basePlacements.length === 0) {
      return [];
    }

    return this.basePlacements.map((base) => {
      // Relative offset from base group anchor
      const relX = base.transform.translation[0] - this.baseAnchor[0];
      const relY = base.transform.translation[1] - this.baseAnchor[1];
      const relZ = base.transform.translation[2] - this.baseAnchor[2];

      // Mirror then rotate relative offset
      const [mx, my, mz] = applyMirror(relX, relY, relZ, this.ghostMirror);
      const [rx, ry, rz] = applyRotation(mx, my, mz, this.ghostRotationY);

      const translation: Vec3i = [
        Math.round(this.cursorPosition[0] + rx),
        Math.round(this.cursorPosition[1] + ry),
        Math.round(this.cursorPosition[2] + rz),
      ];

      // Compose rotations
      const composedRotation = ((base.transform.rotationY + this.ghostRotationY) % 360) as GhostRotationY;

      // Compose mirror
      let composedMirror: GhostMirror = base.transform.mirror;
      if (this.ghostMirror !== 'none') {
        if (base.transform.mirror === 'none') {
          composedMirror = this.ghostMirror;
        } else if (base.transform.mirror === this.ghostMirror) {
          composedMirror = 'none';
        } else {
          composedMirror = this.ghostMirror;
        }
      }

      const cloned = this.clonePlacement(base);
      cloned.transform = {
        translation,
        rotationY: composedRotation,
        mirror: composedMirror,
      };

      // Preserve groupId from ImportOutput.group for multi-region litematics
      const groupId = this.pendingImport?.group?.id;
      if (groupId) {
        cloned.source = {
          ...cloned.source,
          sourceGroupId: groupId,
        };
        (cloned as any).groupId = groupId;
      }

      return cloned;
    });
  }

  /**
   * Confirms placement:
   * Executes placement:add commands on EditorSessionStore for each pending placement
   * (preserving groupId from ImportOutput.group.id for multi-region litematics),
   * records the import report on store.setImportReport(report), and transitions to 'idle'.
   */
  public async confirmPlace(): Promise<string[]> {
    if (!this.pendingImport || this.basePlacements.length === 0) {
      return [];
    }

    const placementsToPlace = this.getGhostPreviewPlacements();
    const addedIds: string[] = [];
    const groupId = this.pendingImport.group?.id;

    for (const placement of placementsToPlace) {
      if (groupId) {
        placement.source = {
          ...placement.source,
          sourceGroupId: groupId,
        };
        (placement as any).groupId = groupId;
      }
      const res = await this.store.execute({
        type: 'placement:add',
        placement,
      });
      if (res.ok) {
        addedIds.push(placement.id);
      }
    }

    // Preserve group in project if session has importGroups array
    if (groupId) {
      const existingGroup = this.pendingImport.group;
      const importGroup: ImportGroup = existingGroup ?? {
        id: groupId,
        name: this.fileName ?? 'Import Group',
        sourceFilename: this.fileName ?? '',
        placementIds: addedIds,
        sourceFormat: (this.pendingImport.report?.format?.kind as any) ?? 'litematic',
      };
      const currentGroups = (this.store.session as any).project?.importGroups;
      if (Array.isArray(currentGroups)) {
        const existing = currentGroups.find((g: any) => g.id === importGroup.id);
        if (!existing) {
          currentGroups.push({ ...importGroup, placementIds: [...addedIds] });
        } else {
          existing.placementIds = [
            ...new Set([...existing.placementIds, ...addedIds]),
          ];
        }
      }
    }

    // Record import report on store
    if (this.pendingImport.report) {
      this.store.setImportReport(this.pendingImport.report);
    }

    this.lastImportedPlacementIds = [...addedIds];
    this.state = 'idle';
    this.pendingImport = null;
    this.basePlacements = [];
    this.notify();

    return addedIds;
  }

  /**
   * Undoes all placements added in the last import step.
   */
  public async undoLastImport(): Promise<void> {
    const count = this.lastImportedPlacementIds.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      if (this.store.canUndo()) {
        await this.store.undo();
      }
    }
    this.lastImportedPlacementIds = [];
    this.notify();
  }

  /**
   * Cancels ghost preview (Esc key): discards pending import and returns to 'idle'.
   */
  public cancelGhostPreview(): void {
    this.state = 'idle';
    this.pendingImport = null;
    this.basePlacements = [];
    this.cursorPosition = [0, 0, 0];
    this.ghostRotationY = 0;
    this.ghostMirror = 'none';
    this.errorMessage = null;
    this.notify();
  }

  /**
   * Resets entire workflow back to idle initial state.
   */
  public reset(): void {
    this.cancelGhostPreview();
  }

  /**
   * Handles keyboard shortcuts for ghost preview:
   * - R: rotate clockwise 90°
   * - M: cycle mirror
   * - Esc: cancel ghost preview
   * - Enter: confirm placement
   */
  public handleKeyDown(e: { key: string; preventDefault?: () => void }): boolean {
    if (this.state !== 'ghost-preview') return false;

    const key = e.key.toLowerCase();
    if (key === 'r') {
      e.preventDefault?.();
      this.rotateGhostClockwise();
      return true;
    }
    if (key === 'm') {
      e.preventDefault?.();
      this.mirrorGhost();
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault?.();
      this.cancelGhostPreview();
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault?.();
      void this.confirmPlace();
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  private clonePlacement(p: Placement): Placement {
    return {
      ...p,
      transform: {
        translation: [...p.transform.translation] as Vec3i,
        rotationY: p.transform.rotationY,
        mirror: p.transform.mirror,
      },
      origin: [...p.origin] as Vec3Half,
      source: {
        ...p.source,
        diagnostics: [...(p.source.diagnostics || [])],
      },
      ancillary: {
        blockEntities: new Map(p.ancillary.blockEntities),
        entities: p.ancillary.entities.map((e) => ({ ...e, position: [...e.position] })),
        biomes: p.ancillary.biomes ? { ...p.ancillary.biomes } : undefined,
        pendingBlockTicks: p.ancillary.pendingBlockTicks.map((t) => ({ ...t, position: [...t.position] })),
        pendingFluidTicks: p.ancillary.pendingFluidTicks.map((t) => ({ ...t, position: [...t.position] })),
        unknownTags: new Map(p.ancillary.unknownTags),
      },
      eraseTombstones: new Set(p.eraseTombstones),
    };
  }
}

/**
 * React hook to subscribe to the ImportWorkflowController via useSyncExternalStore.
 */
export function useImportWorkflow(
  controller: ImportWorkflowController,
): ImportWorkflowState {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
