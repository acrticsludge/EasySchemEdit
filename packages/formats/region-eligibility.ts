// Subspec B — Slice b-6: Multi-Region Export Eligibility
// RegionGroupMetadata with rules:
//   same import group, not baked, relative positions intact,
//   common rotation/mirror, litematic sources
// Else single region + EXPORT_REGION_GROUPING_LOST
import type { Vec3i } from '../domain/types.ts';
import type { Transform } from '../domain/coordinates.ts';

export const EXPORT_REGION_GROUPING_LOST = 'EXPORT_REGION_GROUPING_LOST';

export type RegionGroupMetadata = {
  importGroupId: string;
  baked: boolean;
  relativePositions: Vec3i[];      // relative to group origin
  rotation: Transform;
  mirror: 'none' | 'x' | 'z' | 'xz';
  sourceFormat: 'litematic' | 'schem-v3' | 'schem-v2' | 'schematic-legacy' | 'vanilla-nbt';
  regions: string[];               // region names in group
};

export type RegionEligibilityResult = {
  eligible: boolean;
  reason?: string;
  lostGrouping: boolean;
  exportAsSingleRegion: boolean;
};

function transformsEqual(a: Transform, b: Transform): boolean {
  return (
    a.translation[0] === b.translation[0] &&
    a.translation[1] === b.translation[1] &&
    a.translation[2] === b.translation[2] &&
    a.rotationY === b.rotationY &&
    a.mirror === b.mirror
  );
}

function mirrorsCompatible(a: 'none' | 'x' | 'z' | 'xz', b: 'none' | 'x' | 'z' | 'xz'): boolean {
  // Common mirror: both must have the same effective mirror
  if (a === b) return true;
  // 'xz' is compatible with 'x' or 'z' only if the other matches one axis
  if (a === 'xz' && (b === 'x' || b === 'z')) return true;
  if (b === 'xz' && (a === 'x' || a === 'z')) return true;
  return false;
}

export function checkRegionEligibility(groups: RegionGroupMetadata[]): RegionEligibilityResult {
  if (groups.length === 0) {
    return { eligible: true, lostGrouping: false, exportAsSingleRegion: false };
  }
  if (groups.length === 1) {
    return { eligible: true, lostGrouping: false, exportAsSingleRegion: false };
  }

  const first = groups[0];

  // Rule 1: same import group
  for (const g of groups) {
    if (g.importGroupId !== first.importGroupId) {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
  }

  // Rule 2: not baked
  for (const g of groups) {
    if (g.baked) {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
  }

  // Rule 3: relative positions intact
  for (const g of groups) {
    if (g.relativePositions.length !== first.relativePositions.length) {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
    for (let i = 0; i < g.relativePositions.length; i++) {
      const a = g.relativePositions[i];
      const b = first.relativePositions[i];
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
        return {
          eligible: false,
          reason: EXPORT_REGION_GROUPING_LOST,
          lostGrouping: true,
          exportAsSingleRegion: true,
        };
      }
    }
  }

  // Rule 4: common rotation/mirror
  for (const g of groups) {
    if (!transformsEqual(g.rotation, first.rotation)) {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
    if (!mirrorsCompatible(g.mirror, first.mirror)) {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
  }

  // Rule 5: litematic sources
  for (const g of groups) {
    if (g.sourceFormat !== 'litematic') {
      return {
        eligible: false,
        reason: EXPORT_REGION_GROUPING_LOST,
        lostGrouping: true,
        exportAsSingleRegion: true,
      };
    }
  }

  return { eligible: true, lostGrouping: false, exportAsSingleRegion: false };
}
