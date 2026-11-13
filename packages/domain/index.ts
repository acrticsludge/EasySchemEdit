// packages/domain/index.ts
// Public API for the domain package.

export type {
  Vec3i,
  Vec3d,
  Vec3Half,
  ChunkCoord,
  Bounds3i,
  BlockStateId,
} from './types.ts';

export const CHUNK_SIZE = 16;

export type {
  NbtTag,
} from './nbt.ts';

export type {
  VoxelChunk,
  ChunkedVoxelVolume,
} from './volume.ts';

export type {
  Transform,
} from './coordinates.ts';
export {
  floorDiv,
  euclideanMod,
  worldToChunkCoord,
  localInChunk,
  chunkKey,
  applyRotation,
  applyMirror,
  mapCellToWorld,
  isLatticeSafe,
  localBlockToWorld,
  placementWorldBounds,
  rotateAboutPoint,
  localPointToWorld,
  worldPointToLocal,
} from './coordinates.ts';

export type {
  Placement,
  Project,
  InvariantResult,
} from './placement.ts';

export {
  INVARIANT_CODES,
  checkInvariants,
} from './placement.ts';

export type {
  BlockStateId as CanonicalBlockStateId,
} from './block-state.ts';

export {
  CANONICAL_AIR,
  isAirLike,
  type AirLikeRegistry,
} from './block-state.ts';

export {
  parseBlockStateString,
  formatBlockStateString,
} from './block-state-string.ts';

export {
  BlockStateTransformRegistry,
  makeVanillaHandler,
  REGISTRY,
  validateBijectivity,
} from './block-state-transforms.ts';

export {
  add,
  sub,
  equals,
  union,
  intersect,
  contains,
  size,
  translate,
  chunkKeysInBounds,
  addHalf,
  subHalf,
  equalsHalf,
  isIntegral,
} from './bounds.ts';

export type {
  ChunkCodecServices,
} from './chunk-codec.ts';
export {
  encodeChunk,
  decodeChunk,
} from './chunk-codec.ts';

export type {
  ArchiveServices,
} from './archive.ts';
export {
  createManifest,
  verifyManifest,
  isDeterministic,
  rejectPathTraversal,
  rejectDuplicateEntries,
} from './archive.ts';
