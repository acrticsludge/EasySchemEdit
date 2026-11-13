// apps/web/src/editor/workflows/placement-ops.ts
// Placement Operations Controller & Gizmo Drag State Machine (Slice E3.6, SUBSPEC-D §§3–5).
// Wraps EditorSessionStore for single-placement and group placement transforms.

import type { Bounds3i, Placement, Project, Vec3Half, Vec3i } from '@easyschemedit/domain';
import type { Result } from '@easyschemedit/operations';
import { placementWorldBounds } from '../../../../../packages/domain/coordinates.ts';
import type { EditorSessionStore } from '../session-store.ts';

export type RotationY = 0 | 90 | 180 | 270;
export type MirrorAxis = 'none' | 'x' | 'z';
export type GizmoAxis = 'x' | 'y' | 'z';

export interface GroupTransformOptions {
  pivot?: Vec3Half;
  rotationY?: RotationY;
  mirror?: MirrorAxis;
  translation?: Vec3i;
}

export interface GizmoDragSession {
  placementId: string;
  axis: GizmoAxis;
  startWorldCoord: number;
  initialTranslation: Vec3i;
  currentDelta: Vec3i;
  currentTranslation: Vec3i;
}

export interface IEditorSessionStore {
  execute(cmd: any, opts?: any): Promise<Result<any>>;
  getSnapshot(): { project: Project; [key: string]: any };
  undo?(): Promise<Result<any>>;
  redo?(): Promise<Result<any>>;
}

/**
 * Controller for placement transform operations and interactive gizmo drags.
 * Dispatches verified atomic commands to EditorSessionStore with undo/redo integration.
 */
export class PlacementOperationsController {
  public readonly store: IEditorSessionStore;
  private activeDrag: GizmoDragSession | null = null;

  constructor(store: IEditorSessionStore) {
    this.store = store;
  }

  // --------------------------------------------------------------------------
  // Single-Placement Operations
  // --------------------------------------------------------------------------

  /**
   * Sets the absolute world translation of a placement.
   */
  public async movePlacement(placementId: string, translation: Vec3i): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:move',
      placementId,
      translation: [
        Math.round(translation[0]),
        Math.round(translation[1]),
        Math.round(translation[2]),
      ],
    });
  }

  /**
   * Nudges a placement by a relative offset vector.
   */
  public async nudgePlacement(placementId: string, delta: Vec3i): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:move',
      placementId,
      offset: [
        Math.round(delta[0]),
        Math.round(delta[1]),
        Math.round(delta[2]),
      ],
    });
  }

  /**
   * Sets the absolute Y rotation (0°, 90°, 180°, 270°) of a placement.
   */
  public async rotatePlacement(placementId: string, rotationY: RotationY): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:rotate',
      placementId,
      rotationY,
    });
  }

  /**
   * Rotates a placement by 90° in the specified direction ('cw' = clockwise, 'ccw' = counter-clockwise).
   */
  public async rotatePlacementStep(placementId: string, direction: 'cw' | 'ccw'): Promise<Result<any>> {
    const placement = this.getPlacement(placementId);
    if (!placement) {
      return {
        ok: false,
        success: false,
        error: { code: 'NOT_FOUND', message: `Placement ${placementId} not found` },
      };
    }
    const current = placement.transform.rotationY ?? 0;
    const nextRotation: RotationY =
      direction === 'cw'
        ? ((current + 90) % 360 as RotationY)
        : (((current - 90 + 360) % 360) as RotationY);

    return this.rotatePlacement(placementId, nextRotation);
  }

  /**
   * Sets the mirror axis ('none', 'x', 'z') of a placement.
   */
  public async mirrorPlacement(placementId: string, mirror: MirrorAxis): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:mirror',
      placementId,
      mirror,
    });
  }

  /**
   * Sets the placement local origin.
   * If keepBlocksInPlace is true (default), the translation is adjusted so world blocks stay at current positions.
   */
  public async setPlacementOrigin(
    placementId: string,
    origin: Vec3Half,
    keepBlocksInPlace: boolean = true
  ): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:setOrigin',
      placementId,
      origin: [
        Math.round(origin[0]),
        Math.round(origin[1]),
        Math.round(origin[2]),
      ],
      keepBlocksInPlace,
    });
  }

  /**
   * Helper to set origin to the center of the placement's local voxel volume.
   */
  public async centerPlacementOrigin(
    placementId: string,
    keepBlocksInPlace: boolean = true
  ): Promise<Result<any>> {
    const placement = this.getPlacement(placementId);
    if (!placement) {
      return {
        ok: false,
        success: false,
        error: { code: 'NOT_FOUND', message: `Placement ${placementId} not found` },
      };
    }
    const b = placement.volume.bounds;
    const localCenterX = Math.floor((b.min[0] + b.maxExclusive[0]) / 2);
    const localCenterY = Math.floor((b.min[1] + b.maxExclusive[1]) / 2);
    const localCenterZ = Math.floor((b.min[2] + b.maxExclusive[2]) / 2);
    // Vec3Half stores doubled half-block values (coord * 2)
    const origin: Vec3Half = [localCenterX * 2, localCenterY * 2, localCenterZ * 2];
    return this.setPlacementOrigin(placementId, origin, keepBlocksInPlace);
  }

  /**
   * Toggles visibility of a placement.
   */
  public async setPlacementHidden(placementId: string, hidden: boolean): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:setHidden',
      placementId,
      hidden,
    });
  }

  /**
   * Locks or unlocks a placement against mutations.
   */
  public async setPlacementLocked(
    placementId: string,
    locked: boolean,
    lockReason: 'user' | 'import' | 'system' = 'user'
  ): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:setLocked',
      placementId,
      locked,
      lockReason,
    });
  }

  /**
   * Renames a placement.
   */
  public async renamePlacement(placementId: string, name: string): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:rename',
      placementId,
      name,
    });
  }

  /**
   * Duplicates a placement with an optional world-space offset.
   */
  public async duplicatePlacement(placementId: string, offset?: Vec3i): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:duplicate',
      placementId,
      offset: offset ? [Math.round(offset[0]), Math.round(offset[1]), Math.round(offset[2])] : undefined,
    });
  }

  /**
   * Deletes a placement from the project.
   */
  public async deletePlacement(placementId: string): Promise<Result<any>> {
    return this.store.execute({
      type: 'placement:remove',
      placementId,
    });
  }

  // --------------------------------------------------------------------------
  // Group Transform Operations
  // --------------------------------------------------------------------------

  /**
   * Computes the center of the union world bounds for a set of placements as a Vec3Half.
   */
  public computeGroupPivot(placementIds: string[]): Vec3Half | undefined {
    const placements = this.store
      .getSnapshot()
      .project.placements.filter((p: Placement) => placementIds.includes(p.id));
    if (placements.length === 0) return undefined;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const p of placements) {
      const wb = placementWorldBounds(p);
      if (wb.min[0] < minX) minX = wb.min[0];
      if (wb.min[1] < minY) minY = wb.min[1];
      if (wb.min[2] < minZ) minZ = wb.min[2];
      if (wb.maxExclusive[0] > maxX) maxX = wb.maxExclusive[0];
      if (wb.maxExclusive[1] > maxY) maxY = wb.maxExclusive[1];
      if (wb.maxExclusive[2] > maxZ) maxZ = wb.maxExclusive[2];
    }

    if (!Number.isFinite(minX)) return [0, 0, 0];

    // Vec3Half stores doubled coordinates: (min + max) / 2 * 2 = min + max
    return [
      Math.round(minX + maxX),
      Math.round(minY + maxY),
      Math.round(minZ + maxZ),
    ] as Vec3Half;
  }

  /**
   * Transforms a group of placements around a common pivot in a single undoable transaction.
   */
  public async transformGroup(
    placementIds: string[],
    opts: GroupTransformOptions
  ): Promise<Result<any>> {
    let pivot = opts.pivot;
    if (!pivot && (opts.rotationY !== undefined || opts.mirror !== undefined)) {
      pivot = this.computeGroupPivot(placementIds);
    }

    return this.store.execute({
      type: 'group:transform',
      placementIds,
      pivot,
      rotationY: opts.rotationY,
      mirror: opts.mirror,
      translation: opts.translation
        ? [
            Math.round(opts.translation[0]),
            Math.round(opts.translation[1]),
            Math.round(opts.translation[2]),
          ]
        : undefined,
    });
  }

  // --------------------------------------------------------------------------
  // Interactive Gizmo Drag State Machine
  // --------------------------------------------------------------------------

  /**
   * Current active gizmo drag session (if dragging).
   */
  public get activeGizmoDrag(): GizmoDragSession | null {
    return this.activeDrag ? { ...this.activeDrag } : null;
  }

  /**
   * Returns true if an interactive gizmo drag is in progress.
   */
  public isDragging(): boolean {
    return this.activeDrag !== null;
  }

  /**
   * Begins an interactive gizmo drag along a specific axis ('x' | 'y' | 'z').
   * Records the initial translation and mouse world coordinate.
   */
  public beginGizmoDrag(placementId: string, axis: GizmoAxis, startWorldCoord: number): void {
    const placement = this.getPlacement(placementId);
    const initialTranslation: Vec3i = placement
      ? ([...placement.transform.translation] as Vec3i)
      : [0, 0, 0];

    this.activeDrag = {
      placementId,
      axis,
      startWorldCoord,
      initialTranslation,
      currentDelta: [0, 0, 0],
      currentTranslation: [...initialTranslation],
    };
  }

  /**
   * Updates an active gizmo drag with the current mouse world coordinate along the dragged axis.
   * Snaps the delta to integer block increments and returns the new world translation vector.
   */
  public updateGizmoDrag(currentWorldCoord: number): Vec3i {
    if (!this.activeDrag) {
      throw new Error('No active gizmo drag session. Call beginGizmoDrag first.');
    }

    const rawDelta = currentWorldCoord - this.activeDrag.startWorldCoord;
    const snappedStep = Math.round(rawDelta);

    const deltaVec: Vec3i = [
      this.activeDrag.axis === 'x' ? snappedStep : 0,
      this.activeDrag.axis === 'y' ? snappedStep : 0,
      this.activeDrag.axis === 'z' ? snappedStep : 0,
    ];

    const newTranslation: Vec3i = [
      this.activeDrag.initialTranslation[0] + deltaVec[0],
      this.activeDrag.initialTranslation[1] + deltaVec[1],
      this.activeDrag.initialTranslation[2] + deltaVec[2],
    ];

    this.activeDrag.currentDelta = deltaVec;
    this.activeDrag.currentTranslation = newTranslation;

    return newTranslation;
  }

  /**
   * Commits the active gizmo drag as a single undoable `placement:move` command.
   */
  public async commitGizmoDrag(): Promise<Result<any>> {
    if (!this.activeDrag) {
      return {
        ok: false,
        success: false,
        error: { code: 'NO_ACTIVE_DRAG', message: 'No active gizmo drag session' },
      };
    }

    const drag = this.activeDrag;
    this.activeDrag = null;

    return this.store.execute({
      type: 'placement:move',
      placementId: drag.placementId,
      translation: drag.currentTranslation,
    });
  }

  /**
   * Cancels the active gizmo drag without executing any command.
   */
  public cancelGizmoDrag(): void {
    this.activeDrag = null;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  public getPlacement(placementId: string): Placement | undefined {
    return this.store.getSnapshot().project.placements.find((p: Placement) => p.id === placementId);
  }
}
