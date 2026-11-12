import type {
  BlockStateId,
  Bounds3i,
  ChunkCoord,
  Vec3Half,
  Vec3i,
} from './types.ts';
import type { NbtTag } from './nbt.ts';
import type {
  BlockEntityRecord,
  BiomeVolume,
  Diagnostic,
  EntityRecord,
  ImportGroup,
  PlacementSource,
  PendingTickRecord,
} from './shared-types.ts';
import { CANONICAL_AIR, type AirLikeRegistry, VANILLA_AIR_LIKE } from './block-state.ts';
import { CHUNK_SIZE, voxelIndex } from './volume.ts';
import type { VoxelChunk, ChunkedVoxelVolume } from './volume.ts';
import type { Transform } from './coordinates.ts';

// ============================================================================
// Slice 8: Placement + Project Types + Invariants
// ============================================================================

export type PlacementAncillaryData = {
  blockEntities: Map<string, BlockEntityRecord>;
  entities: EntityRecord[];
  biomes?: BiomeVolume;
  pendingBlockTicks: PendingTickRecord[];
  pendingFluidTicks: PendingTickRecord[];
  unknownTags: Map<string, NbtTag>;
};

export type Placement = {
  id: string;
  name: string;
  volume: ChunkedVoxelVolume;
  transform: Transform;
  origin: Vec3Half;
  ancillary: PlacementAncillaryData;
  visible: boolean;
  locked: boolean;
  color?: string;
  createdAt: string;
  source: PlacementSource;
  eraseTombstones: Set<string>;
};

export type Project = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: Placement[];
  importGroups: ImportGroup[];
  overlapPolicy: 'top-wins' | 'bottom-wins';
  conflictOverlay: 'off' | 'conflicts' | 'full';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
  revision: number;
};

export type InvariantResult = {
  ok: boolean;
  violations: string[];
};

export const INVARIANT_CODES = {
  DUPLICATE_PLACEMENT_ID: 'DUPLICATE_PLACEMENT_ID',
  MISSING_IMPORT_GROUP_PLACEMENT: 'MISSING_IMPORT_GROUP_PLACEMENT',
  NON_ZERO_BOUNDS_MIN: 'NON_ZERO_BOUNDS_MIN',
  FRACTIONAL_TRANSLATION: 'FRACTIONAL_TRANSLATION',
  NON_INTEGRAL_ORIGIN: 'NON_INTEGRAL_ORIGIN',
  CHUNK_OUT_OF_BOUNDS: 'CHUNK_OUT_OF_BOUNDS',
  PALETTE_AIR_NOT_FIRST: 'PALETTE_AIR_NOT_FIRST',
  WRONG_INDICES_LENGTH: 'WRONG_INDICES_LENGTH',
  DUPLICATE_PALETTE_ENTRY: 'DUPLICATE_PALETTE_ENTRY',
  PALETTE_INDEX_OUT_OF_RANGE: 'PALETTE_INDEX_OUT_OF_RANGE',
  NONAIR_COUNT_MISMATCH: 'NONAIR_COUNT_MISMATCH',
  TOMBSTONE_OUT_OF_BOUNDS: 'TOMBSTONE_OUT_OF_BOUNDS',
  ALL_AIR_CHUNK_NOT_OMITTED: 'ALL_AIR_CHUNK_NOT_OMITTED',
} as const;

export function checkInvariants(project: Project): InvariantResult {
  const violations: string[] = [];

  // 1. No duplicate placement IDs
  const placementIds = new Set<string>();
  for (const p of project.placements) {
    if (placementIds.has(p.id)) {
      violations.push(`Duplicate placement id: ${p.id}`);
    }
    placementIds.add(p.id);
  }

  // 2. Every ImportGroup placementId exists
  const placementIdSet = new Set(project.placements.map((p) => p.id));
  for (const g of project.importGroups) {
    for (const pid of g.placementIds) {
      if (!placementIdSet.has(pid)) {
        violations.push(`ImportGroup ${g.id} references missing placement ${pid}`);
      }
    }
  }

  for (const p of project.placements) {
    // 3. bounds.min = [0,0,0]
    if (p.volume.bounds.min[0] !== 0 || p.volume.bounds.min[1] !== 0 || p.volume.bounds.min[2] !== 0) {
      violations.push(`Placement ${p.id}: bounds.min is not [0,0,0]`);
    }

    // 4. translation is Vec3i (integer)
    for (const c of p.transform.translation) {
      if (!Number.isInteger(c)) {
        violations.push(`Placement ${p.id}: fractional translation component ${c}`);
      }
    }

    // 5. origin has even half-block components (integral origin)
    if (p.origin[0] % 2 !== 0 || p.origin[1] % 2 !== 0 || p.origin[2] % 2 !== 0) {
      violations.push(`Placement ${p.id}: origin ${p.origin} is not integral`);
    }

    for (const [key, chunk] of p.volume.chunks) {
      // 6. chunk key maps to chunkCoord within bounds
      const [cx, cy, cz] = (key.split('_').map(Number) as unknown as ChunkCoord);
      const chunkWorldMin: Vec3i = [cx * 16, cy * 16, cz * 16];
      const chunkWorldMax: Vec3i = [cx * 16 + 16, cy * 16 + 16, cz * 16 + 16];
      const volMin = p.volume.bounds.min;
      const volMax = p.volume.bounds.maxExclusive;
      if (
        chunkWorldMin[0] < volMin[0] || chunkWorldMax[0] > volMax[0] ||
        chunkWorldMin[1] < volMin[1] || chunkWorldMax[1] > volMax[1] ||
        chunkWorldMin[2] < volMin[2] || chunkWorldMax[2] > volMax[2]
      ) {
        violations.push(`Placement ${p.id}: chunk ${key} outside volume bounds`);
      }

      // 7. palette[0] is CANONICAL_AIR
      if (chunk.palette[0]?.id !== CANONICAL_AIR.id) {
        violations.push(`Placement ${p.id} chunk ${key}: palette[0] is not CANONICAL_AIR`);
      }

      // 8. indices length = 4096
      if (chunk.indices.length !== CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE) {
        violations.push(`Placement ${p.id} chunk ${key}: indices length ${chunk.indices.length} !== 4096`);
      }

      // 9. palette entries unique
      const paletteIds = new Set<string>();
      for (const entry of chunk.palette) {
        const pk = `${entry.id}:${JSON.stringify(Object.entries(entry.props).sort())}`;
        if (paletteIds.has(pk)) {
          violations.push(`Placement ${p.id} chunk ${key}: duplicate palette entry ${entry.id}`);
        }
        paletteIds.add(pk);
      }

      // 10. every index < palette.length
      for (let i = 0; i < chunk.indices.length; i++) {
        const idx = chunk.indices[i];
        if (idx >= chunk.palette.length) {
          violations.push(`Placement ${p.id} chunk ${key}: index ${idx} >= palette.length ${chunk.palette.length}`);
        }
      }

      // 11. nonAirCount matches actual count
      let actualNonAir = 0;
      for (let i = 0; i < chunk.indices.length; i++) {
        const state = chunk.palette[chunk.indices[i]];
        if (state && !VANILLA_AIR_LIKE.has(state.id)) {
          actualNonAir++;
        }
      }
      if (p.volume.nonAirCount !== actualNonAir) {
        violations.push(`Placement ${p.id} chunk ${key}: nonAirCount ${p.volume.nonAirCount} !== actual ${actualNonAir}`);
      }

      // 13. all-air chunks omitted (if chunk exists, it has at least one non-air)
      const hasNonAir = actualNonAir > 0;
      if (!hasNonAir) {
        violations.push(`Placement ${p.id} chunk ${key}: all-air chunk not omitted`);
      }
    }

    // 12. tombstone positions inside bounds
    for (const tombstone of p.eraseTombstones) {
      const [tx, ty, tz] = tombstone.split('_').map(Number);
      const volMin = p.volume.bounds.min;
      const volMax = p.volume.bounds.maxExclusive;
      if (tx < volMin[0] || tx >= volMax[0] || ty < volMin[1] || ty >= volMax[1] || tz < volMin[2] || tz >= volMax[2]) {
        violations.push(`Placement ${p.id}: tombstone ${tombstone} outside volume bounds`);
      }
    }
  }

  // revision is non-negative integer
  if (!Number.isInteger(project.revision) || project.revision < 0) {
    violations.push(`Project ${project.id}: revision ${project.revision} is not a non-negative integer`);
  }

  return { ok: violations.length === 0, violations };
}

export type { ChunkedVoxelVolume, VoxelChunk } from './volume.ts';
