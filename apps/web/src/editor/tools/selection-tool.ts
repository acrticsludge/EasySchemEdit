// apps/web/src/editor/tools/selection-tool.ts
// SelectionToolController: coordinates two-corner cuboid selection in world or placement scope.
// Bridges user click / drag interactions and numeric bounds inputs to EditorSessionStore (SUBSPEC-D §2.2, §7.1).

import type { Bounds3i, Vec3i } from '@easyschemedit/domain';
import { placementWorldBounds } from '../../../../../packages/domain/coordinates.ts';
import type { CuboidBounds, Result } from '@easyschemedit/operations';
import type { EditorSessionStore } from '../session-store.ts';

export interface SelectionDimensions {
  width: number;
  height: number;
  length: number;
  volume: number;
}

export type SelectionScope = 'world' | 'placement';

export class SelectionToolController {
  private store: EditorSessionStore;
  private corner1: Vec3i | null = null;
  private corner1PlacementId?: string;
  private currentBounds: Bounds3i | null = null;
  private currentScope: SelectionScope = 'world';
  private currentPlacementId?: string;
  private listeners: Set<() => void> = new Set();

  constructor(store: EditorSessionStore) {
    this.store = store;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('SelectionToolController listener error:', err);
      }
    }
  }

  /**
   * Sets the first corner (pos1) for two-corner cuboid selection.
   */
  public setCorner1(pos: Vec3i, placementId?: string): void {
    this.corner1 = [Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2])];
    this.corner1PlacementId = placementId;
    this.notify();
  }

  /**
   * Sets the second corner (pos2), normalizes min/max bounds (Bounds3i),
   * and executes selection:set on EditorSessionStore.
   */
  public async setCorner2(pos: Vec3i, placementId?: string): Promise<Result<any>> {
    const c1 = this.corner1 ?? pos;
    const c2: Vec3i = [Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2])];

    const minX = Math.min(c1[0], c2[0]);
    const minY = Math.min(c1[1], c2[1]);
    const minZ = Math.min(c1[2], c2[2]);

    // Half-open bounds: max coordinate is inclusive block + 1
    const maxX = Math.max(c1[0], c2[0]) + 1;
    const maxY = Math.max(c1[1], c2[1]) + 1;
    const maxZ = Math.max(c1[2], c2[2]) + 1;

    const bounds: Bounds3i = {
      min: [minX, minY, minZ],
      maxExclusive: [maxX, maxY, maxZ],
    };

    const targetPlacementId = placementId ?? this.corner1PlacementId;
    return this.setNumericBounds(bounds, targetPlacementId);
  }

  /**
   * Directly sets selection bounds from numeric inputs.
   */
  public async setNumericBounds(bounds: Bounds3i, placementId?: string): Promise<Result<any>> {
    // Normalize bounds in case min > maxExclusive
    const minX = Math.min(bounds.min[0], bounds.maxExclusive[0]);
    const minY = Math.min(bounds.min[1], bounds.maxExclusive[1]);
    const minZ = Math.min(bounds.min[2], bounds.maxExclusive[2]);
    const maxX = Math.max(bounds.min[0], bounds.maxExclusive[0]);
    const maxY = Math.max(bounds.min[1], bounds.maxExclusive[1]);
    const maxZ = Math.max(bounds.min[2], bounds.maxExclusive[2]);

    const normalizedBounds: Bounds3i = {
      min: [minX, minY, minZ],
      maxExclusive: [maxX, maxY, maxZ],
    };

    this.currentBounds = normalizedBounds;
    this.currentScope = placementId ? 'placement' : 'world';
    this.currentPlacementId = placementId;

    const cuboidBounds: CuboidBounds = {
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    };

    const result = await this.store.execute({
      type: 'selection:set',
      selection: {
        kind: 'cuboid',
        bounds: cuboidBounds,
      },
    });

    this.notify();
    return result;
  }

  /**
   * Selects the full bounding box of the specified placement.
   */
  public async selectPlacementBounds(placementId: string): Promise<Result<any>> {
    const project = this.store.session.snapshot();
    const placement = project.placements.find((p) => p.id === placementId);
    if (!placement) {
      return {
        ok: false,
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Placement ${placementId} not found`,
        },
      };
    }

    const bounds = placementWorldBounds(placement);
    return this.setNumericBounds(bounds, placementId);
  }

  /**
   * Clears selection on EditorSessionStore and resets pending corners.
   */
  public async clearSelection(): Promise<Result<any>> {
    this.corner1 = null;
    this.corner1PlacementId = undefined;
    this.currentBounds = null;
    this.currentPlacementId = undefined;
    this.currentScope = 'world';

    const result = await this.store.execute({
      type: 'selection:clear',
    });

    this.notify();
    return result;
  }

  /**
   * Calculates width, height, length, and volume for half-open Bounds3i.
   */
  public getDimensions(bounds: Bounds3i): SelectionDimensions {
    const width = Math.max(0, bounds.maxExclusive[0] - bounds.min[0]);
    const height = Math.max(0, bounds.maxExclusive[1] - bounds.min[1]);
    const length = Math.max(0, bounds.maxExclusive[2] - bounds.min[2]);
    const volume = width * height * length;
    return { width, height, length, volume };
  }

  public getCorner1(): Vec3i | null {
    return this.corner1 ? ([...this.corner1] as Vec3i) : null;
  }

  public getScope(): SelectionScope {
    return this.currentScope;
  }

  public getPlacementId(): string | undefined {
    return this.currentPlacementId;
  }

  /**
   * Returns current active bounds from controller or session.
   */
  public getActiveBounds(): Bounds3i | null {
    if (this.currentBounds) {
      if (
        this.currentBounds.maxExclusive[0] > this.currentBounds.min[0] &&
        this.currentBounds.maxExclusive[1] > this.currentBounds.min[1] &&
        this.currentBounds.maxExclusive[2] > this.currentBounds.min[2]
      ) {
        return {
          min: [...this.currentBounds.min] as Vec3i,
          maxExclusive: [...this.currentBounds.maxExclusive] as Vec3i,
        };
      }
      return null;
    }
    const sel = (this.store.session as any).selection;
    if (sel && sel.type === 'cuboid' && sel.selection.kind === 'cuboid') {
      const b = sel.selection.bounds;
      if (b.maxX > b.minX && b.maxY > b.minY && b.maxZ > b.minZ) {
        return {
          min: [b.minX, b.minY, b.minZ],
          maxExclusive: [b.maxX, b.maxY, b.maxZ],
        };
      }
    }
    return null;
  }
}
