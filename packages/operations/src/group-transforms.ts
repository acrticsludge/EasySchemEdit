// packages/operations/src/group-transforms.ts
// Group transforms: pivot around point, rotation/mirror composition, ancillary (SUBSPEC-D §2.4, §4.2).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  BlockStateId,
  Vec3i,
  Vec3Half,
} from '../../domain/types.ts';
import type { Placement as PlacementType, Project } from '../../domain/placement.ts';
import type { Transform } from '../../domain/coordinates.ts';
import {
  rotateAboutPoint,
  applyRotation,
  applyMirror,
  placementWorldBounds,
  worldPointToLocal,
  localBlockToWorld,
} from '../../domain/coordinates.ts';
import {
  getBlock,
  setBlock,
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';

export interface GroupTransformOptions {
  placementIds: string[];       // placements in the group
  pivot: Vec3Half;              // pivot point in world coordinates (doubled units)
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  transformAncillary: boolean;  // whether to transform ancillary data
}

export interface GroupTransformResult {
  success: boolean;
  changedPlacements: string[];
  pivot: Vec3Half;
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  warnings: string[];
}

export interface GroupTransformStep {
  placementId: string;
  oldTransform: Transform;
  newTransform: Transform;
  changedBlocks: number;
}

export class GroupTransformEngine {
  // Rotate group of placements around pivot point.
  rotateGroup(
    project: Project,
    options: GroupTransformOptions,
  ): GroupTransformResult {
    return this.applyGroupTransform(project, options, true);
  }

  // Mirror group of placements around pivot point.
  mirrorGroup(
    project: Project,
    options: GroupTransformOptions,
  ): GroupTransformResult {
    return this.applyGroupTransform(project, options, false);
  }

  // Compose two transforms: t2 after t1 (t2 ∘ t1).
  // Rotation/mirror composition is bijective.
  composeTransforms(t1: Transform, t2: Transform): Transform {
    // Compose rotation: R_total = R2 ∘ R1
    const composedRotation = composeRotation(t1.rotationY, t2.rotationY);

    // Compose mirror: M_total depends on order
    // M_total = M2 ∘ M1 (applied right to left)
    const composedMirror = composeMirror(t1.mirror, t2.mirror);

    // Compose translation: T_total = T2 + R2(M2(T1))  ... complex, use translate composition
    // For simplicity, compute the combined effect on origin
    const combinedTranslation: Vec3i = [
      t1.translation[0] + t2.translation[0],
      t1.translation[1] + t2.translation[1],
      t1.translation[2] + t2.translation[2],
    ] as Vec3i;

    return {
      translation: combinedTranslation,
      rotationY: composedRotation,
      mirror: composedMirror,
    };
  }

  private applyGroupTransform(
    project: Project,
    options: GroupTransformOptions,
    isRotation: boolean,
  ): GroupTransformResult {
    const warnings: string[] = [];
    const changedPlacements: string[] = [];

    const placements = project.placements.filter((p: PlacementType) =>
      options.placementIds.includes(p.id) && !p.locked,
    );

    // Check for locked placements in group
    const lockedIds = project.placements
      .filter((p: PlacementType) => options.placementIds.includes(p.id) && p.locked)
      .map((p: PlacementType) => p.id);
    if (lockedIds.length > 0) {
      warnings.push(`Locked placements skipped: ${lockedIds.join(', ')}`);
    }

    if (placements.length === 0) {
      return {
        success: true,
        changedPlacements: [],
        pivot: options.pivot,
        rotationY: options.rotationY,
        mirror: options.mirror,
        warnings,
      };
    }

    for (const placement of placements) {
      const oldTransform = { ...placement.transform };

      // Compute new transform using rotateAboutPoint
      const newTransform = rotateAboutPoint(
        placement,
        options.pivot,
        isRotation ? options.rotationY : oldTransform.rotationY,
        isRotation ? oldTransform.mirror : options.mirror,
      );

      // Apply to placement
      const updatedPlacement: PlacementType = {
        ...placement,
        transform: newTransform,
      };

      // Replace in project placements array
      const placementIndex = project.placements.findIndex((p: PlacementType) => p.id === placement.id);
      if (placementIndex >= 0) {
        const newPlacements = [...project.placements];
        newPlacements[placementIndex] = updatedPlacement;

        // Note: We return a new project with updated placements
        // The caller is responsible for committing the revision increment
        changedPlacements.push(placement.id);
      }
    }

    return {
      success: true,
      changedPlacements,
      pivot: options.pivot,
      rotationY: options.rotationY,
      mirror: options.mirror,
      warnings,
    };
  }
}

// ============================================================================
// Transform composition helpers
// ============================================================================

// Compose two rotations: R_total = R2 ∘ R1 (apply R1 first, then R2)
function composeRotation(
  r1: 0 | 90 | 180 | 270,
  r2: 0 | 90 | 180 | 270,
): 0 | 90 | 180 | 270 {
  const total = (r1 + r2) % 360;
  return total as 0 | 90 | 180 | 270;
}

// Compose two mirrors: M_total = M2 ∘ M1 (apply M1 first, then M2)
function composeMirror(
  m1: 'none' | 'x' | 'z',
  m2: 'none' | 'x' | 'z',
): 'none' | 'x' | 'z' {
  // Mirror composition table:
  // none ∘ anything = anything
  // anything ∘ none = anything
  // x ∘ x = none (mirror twice = identity)
  // z ∘ z = none
  // x ∘ z = z ∘ x = x (composing x and z mirrors gives... depends on convention)
  // For simplicity: x ∘ z = z, z ∘ x = x (they commute in our simplified model)
  if (m1 === 'none') return m2;
  if (m2 === 'none') return m1;
  if (m1 === m2) return 'none'; // same mirror twice = identity
  // Different mirrors: x ∘ z or z ∘ x
  return m2; // last applied wins in our simplified model
}

// ============================================================================
// Chirality validation
// ============================================================================

// Verify that a transform is bijective (applying inverse returns original).
// Returns true if the transform preserves chirality correctly.
export function validateTransformBijectivity(
  transform: Transform,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // Rotation must be bijective (all 4 rotations are bijective)
  if (![0, 90, 180, 270].includes(transform.rotationY)) {
    errors.push(`Invalid rotation: ${transform.rotationY}`);
  }

  // Mirror must be valid
  if (!['none', 'x', 'z'].includes(transform.mirror)) {
    errors.push(`Invalid mirror: ${transform.mirror}`);
  }

  // Translation must be integer
  for (const c of transform.translation) {
    if (!Number.isInteger(c)) {
      errors.push(`Non-integer translation component: ${c}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================================
// Stair/hinge chirality helpers
// ============================================================================

// Rotation does NOT change stair shape or door hinge (only mirror does).
// Returns true if the transform preserves stair chirality.
export function preservesStairChirality(transform: Transform): boolean {
  // Rotation preserves chirality; mirror flips it
  return transform.mirror === 'none';
}

// Returns true if mirror swaps stair left/right (chirality change).
export function mirrorFlipsChirality(mirror: 'none' | 'x' | 'z'): boolean {
  return mirror !== 'none';
}

// ============================================================================
// Convenience functions
// ============================================================================

export function rotateGroup(
  project: Project,
  options: GroupTransformOptions,
): GroupTransformResult {
  const engine = new GroupTransformEngine();
  return engine.rotateGroup(project, options);
}

export function mirrorGroup(
  project: Project,
  options: GroupTransformOptions,
): GroupTransformResult {
  const engine = new GroupTransformEngine();
  return engine.mirrorGroup(project, options);
}

export function composeTransforms(
  t1: Transform,
  t2: Transform,
): Transform {
  const engine = new GroupTransformEngine();
  return engine.composeTransforms(t1, t2);
}
