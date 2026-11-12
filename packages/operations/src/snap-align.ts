// packages/operations/src/snap-align.ts
// Snap & align tools: snap to origin, align edges, snap to placement (SUBSPEC-D §2.4).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  Bounds3i,
  Vec3i,
} from '../../domain/types.ts';
import type { Placement as PlacementType, Project } from '../../domain/placement.ts';
import {
  placementWorldBounds,
} from '../../domain/coordinates.ts';

export interface SnapOptions {
  snapToGrid: boolean;
  snapToOrigin: boolean;
  snapToPlacementId?: string;
  snapOffset: Vec3i;
}

export interface SnapResult {
  success: boolean;
  newPosition: Vec3i;
  snapped: boolean;
  warnings: string[];
}

export interface AlignOptions {
  alignTo: 'min' | 'max' | 'center';
  axis: 'x' | 'y' | 'z';
  targetPlacementId: string;
}

export interface AlignResult {
  success: boolean;
  newPosition: Vec3i;
  aligned: boolean;
  warnings: string[];
}

export class SnapAlignEngine {
  // Snap placement translation to nearest integer grid.
  snapToGrid(project: Project, placementId: string): SnapResult {
    const placement = project.placements.find((p) => p.id === placementId);
    if (!placement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} not found`],
      };
    }

    if (placement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} is locked`],
      };
    }

    const translation = placement.transform.translation;
    const newPosition: Vec3i = [
      Math.round(translation[0]),
      Math.round(translation[1]),
      Math.round(translation[2]),
    ] as Vec3i;

    const snapped = newPosition[0] !== translation[0] ||
      newPosition[1] !== translation[1] ||
      newPosition[2] !== translation[2];

    return {
      success: true,
      newPosition,
      snapped,
      warnings: [],
    };
  }

  // Snap placement so its origin aligns to grid origin (0,0,0).
  snapToOrigin(project: Project, placementId: string): SnapResult {
    const placement = project.placements.find((p) => p.id === placementId);
    if (!placement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} not found`],
      };
    }

    if (placement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} is locked`],
      };
    }

    // Origin must be integral (even half-block components)
    const origin = placement.origin;
    if (origin[0] % 2 !== 0 || origin[1] % 2 !== 0 || origin[2] % 2 !== 0) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} origin is not integral — cannot snap to origin`],
      };
    }

    // Translation should be 0 for origin to be at grid origin
    const newPosition: Vec3i = [0, 0, 0] as Vec3i;
    const snapped = newPosition[0] !== placement.transform.translation[0] ||
      newPosition[1] !== placement.transform.translation[1] ||
      newPosition[2] !== placement.transform.translation[2];

    return {
      success: true,
      newPosition,
      snapped,
      warnings: [],
    };
  }

  // Snap placement relative to another placement with offset.
  snapToPlacement(
    project: Project,
    placementId: string,
    targetPlacementId: string,
    offset: Vec3i,
  ): SnapResult {
    const placement = project.placements.find((p) => p.id === placementId);
    const targetPlacement = project.placements.find((p) => p.id === targetPlacementId);

    if (!placement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} not found`],
      };
    }

    if (!targetPlacement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        snapped: false,
        warnings: [`Target placement ${targetPlacementId} not found`],
      };
    }

    if (placement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        snapped: false,
        warnings: [`Placement ${placementId} is locked`],
      };
    }

    if (targetPlacement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        snapped: false,
        warnings: [`Target placement ${targetPlacementId} is locked`],
      };
    }

    // Compute new translation: target translation + offset
    const targetTranslation = targetPlacement.transform.translation;
    const newPosition: Vec3i = [
      targetTranslation[0] + offset[0],
      targetTranslation[1] + offset[1],
      targetTranslation[2] + offset[2],
    ] as Vec3i;

    const snapped = newPosition[0] !== placement.transform.translation[0] ||
      newPosition[1] !== placement.transform.translation[1] ||
      newPosition[2] !== placement.transform.translation[2];

    return {
      success: true,
      newPosition,
      snapped,
      warnings: [],
    };
  }

  // Align placement edges along specified axis relative to target placement.
  alignEdges(
    project: Project,
    placementId: string,
    options: AlignOptions,
  ): AlignResult {
    const placement = project.placements.find((p) => p.id === placementId);
    const targetPlacement = project.placements.find((p) => p.id === options.targetPlacementId);

    if (!placement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        aligned: false,
        warnings: [`Placement ${placementId} not found`],
      };
    }

    if (!targetPlacement) {
      return {
        success: false,
        newPosition: [0, 0, 0] as Vec3i,
        aligned: false,
        warnings: [`Target placement ${options.targetPlacementId} not found`],
      };
    }

    if (placement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        aligned: false,
        warnings: [`Placement ${placementId} is locked`],
      };
    }

    if (targetPlacement.locked) {
      return {
        success: false,
        newPosition: [...placement.transform.translation] as Vec3i,
        aligned: false,
        warnings: [`Target placement ${options.targetPlacementId} is locked`],
      };
    }

    const placementBounds = placementWorldBounds(placement);
    const targetBounds = placementWorldBounds(targetPlacement);

    const axisIndex = options.axis === 'x' ? 0 : options.axis === 'y' ? 1 : 2;

    let targetValue: number;
    switch (options.alignTo) {
      case 'min':
        targetValue = targetBounds.min[axisIndex];
        break;
      case 'max':
        targetValue = targetBounds.maxExclusive[axisIndex] - 1;
        break;
      case 'center':
        targetValue = Math.floor((targetBounds.min[axisIndex] + targetBounds.maxExclusive[axisIndex] - 1) / 2);
        break;
      default:
        targetValue = targetBounds.min[axisIndex];
    }

    // Compute new translation to align
    const currentTranslation = [...placement.transform.translation] as number[];
    const currentBounds = placementWorldBounds(placement);
    const currentValue = currentBounds.min[axisIndex];

    const delta = targetValue - currentValue;
    currentTranslation[axisIndex] += delta;

    const newPosition: Vec3i = currentTranslation as unknown as Vec3i;
    const aligned = delta !== 0;

    return {
      success: true,
      newPosition,
      aligned,
      warnings: [],
    };
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

export function snapToGrid(
  project: Project,
  placementId: string,
): SnapResult {
  const engine = new SnapAlignEngine();
  return engine.snapToGrid(project, placementId);
}

export function snapToOrigin(
  project: Project,
  placementId: string,
): SnapResult {
  const engine = new SnapAlignEngine();
  return engine.snapToOrigin(project, placementId);
}

export function snapToPlacement(
  project: Project,
  placementId: string,
  targetPlacementId: string,
  offset: Vec3i,
): SnapResult {
  const engine = new SnapAlignEngine();
  return engine.snapToPlacement(project, placementId, targetPlacementId, offset);
}

export function alignEdges(
  project: Project,
  placementId: string,
  options: AlignOptions,
): AlignResult {
  const engine = new SnapAlignEngine();
  return engine.alignEdges(project, placementId, options);
}
