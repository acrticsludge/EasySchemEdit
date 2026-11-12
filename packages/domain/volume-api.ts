import type { BlockStateId, Vec3i, Bounds3i } from './types.ts';
import type { ChunkedVoxelVolume, VoxelChunk } from './volume.ts';
import { voxelIndex, CHUNK_SIZE } from './volume.ts';
import { CANONICAL_AIR, isAirLike, VANILLA_AIR_LIKE } from './block-state.ts';
import { floorDiv, euclideanMod, chunkKey } from './coordinates.ts';

function getOrCreateChunk(
  volume: ChunkedVoxelVolume,
  localBlock: Vec3i,
): VoxelChunk {
  const chunkCoord = worldToChunkCoordFromLocal(localBlock);
  const key = chunkKey(chunkCoord[0], chunkCoord[1], chunkCoord[2]);

  let chunk = volume.chunks.get(key);
  if (!chunk) {
    const indices = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    indices.fill(0);
    chunk = {
      key,
      palette: [CANONICAL_AIR],
      indices,
      revision: 0,
    };
    volume.chunks.set(key, chunk);
  }
  return chunk;
}

function worldToChunkCoordFromLocal(localBlock: Vec3i): [number, number, number] {
  // Local block coordinates are already within the volume's local space.
  // Convert to chunk coordinates using floor division.
  return [floorDiv(localBlock[0], 16), floorDiv(localBlock[1], 16), floorDiv(localBlock[2], 16)];
}

function localIndexInChunk(localBlock: Vec3i): number {
  const cx = euclideanMod(localBlock[0], 16);
  const cy = euclideanMod(localBlock[1], 16);
  const cz = euclideanMod(localBlock[2], 16);
  return voxelIndex(cx, cy, cz);
}

function blockStateToPaletteIndex(
  _volume: ChunkedVoxelVolume,
  chunk: VoxelChunk,
  state: BlockStateId,
): number {
  // Find existing index in palette
  for (let i = 0; i < chunk.palette.length; i++) {
    const existing = chunk.palette[i]!;
    if (existing.id === state.id) {
      let match = true;
      const aKeys = Object.keys(existing.props);
      const bKeys = Object.keys(state.props);
      if (aKeys.length !== bKeys.length) {
        match = false;
      } else {
        for (const k of aKeys) {
          if (existing.props[k] !== state.props[k]) {
            match = false;
            break;
          }
        }
      }
      if (match) return i;
    }
  }

  // Add new entry to palette
  if (chunk.palette.length >= 4096) {
    throw new Error('Palette exceeds 4096 entries per chunk');
  }
  chunk.palette.push(state);
  return chunk.palette.length - 1;
}

function isAirState(state: BlockStateId): boolean {
  return isAirLike(state.id, VANILLA_AIR_LIKE);
}

export function getBlock(
  volume: ChunkedVoxelVolume,
  localBlock: Vec3i,
): BlockStateId {
  const chunkCoord = worldToChunkCoordFromLocal(localBlock);
  const key = chunkKey(chunkCoord[0], chunkCoord[1], chunkCoord[2]);
  const chunk = volume.chunks.get(key);
  if (!chunk) return CANONICAL_AIR;

  const idx = localIndexInChunk(localBlock);
  const paletteIndex = chunk.indices[idx]!;
  return chunk.palette[paletteIndex]!;
}

export function setBlock(
  volume: ChunkedVoxelVolume,
  localBlock: Vec3i,
  state: BlockStateId,
): void {
  const chunk = getOrCreateChunk(volume, localBlock);
  const idx = localIndexInChunk(localBlock);
  const paletteIndex = blockStateToPaletteIndex(volume, chunk, state);

  const oldPaletteIndex = chunk.indices[idx]!;
  const oldState = chunk.palette[oldPaletteIndex]!;

  chunk.indices[idx] = paletteIndex;

  // Update nonAirCount
  const oldIsAir = isAirState(oldState);
  const newIsAir = isAirState(state);
  if (oldIsAir && !newIsAir) {
    volume.nonAirCount++;
  } else if (!oldIsAir && newIsAir) {
    volume.nonAirCount--;
  }

  // If chunk is now all air, remove it
  if (newIsAir) {
    const allAir = chunk.indices.every((pi) => {
      const s = chunk.palette[pi]!;
      return isAirState(s);
    });
    if (allAir) {
      volume.chunks.delete(chunk.key);
    }
  }
}

export function fill(
  volume: ChunkedVoxelVolume,
  bounds: Bounds3i,
  state: BlockStateId,
): void {
  for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
    for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
      for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
        setBlock(volume, [x, y, z], state);
      }
    }
  }
}

export function iterateNonAir(
  volume: ChunkedVoxelVolume,
  fn: (localBlock: Vec3i, state: BlockStateId) => void,
): void {
  for (const [key, chunk] of volume.chunks) {
    const [cx, cy, cz] = key.split('_').map(Number) as [number, number, number];
    for (let i = 0; i < chunk.indices.length; i++) {
      const paletteIndex = chunk.indices[i]!;
      const state = chunk.palette[paletteIndex]!;
      if (!isAirState(state)) {
        // Convert linear index back to local block coordinates
        const lz = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        const ly = Math.floor((i % (CHUNK_SIZE * CHUNK_SIZE)) / CHUNK_SIZE);
        const lx = i % CHUNK_SIZE;
        fn([cx * 16 + lx, cy * 16 + ly, cz * 16 + lz], state);
      }
    }
  }
}

export function addToPalette(
  volume: ChunkedVoxelVolume,
  chunkKey: string,
  state: BlockStateId,
): number {
  const chunk = volume.chunks.get(chunkKey);
  if (!chunk) throw new Error(`Chunk not found: ${chunkKey}`);
  return blockStateToPaletteIndex(volume, chunk, state);
}

export function compactPalette(
  volume: ChunkedVoxelVolume,
  chunkKey: string,
): void {
  const chunk = volume.chunks.get(chunkKey);
  if (!chunk) return;

  // Build mapping from old index to new index
  const used = new Array<boolean>(chunk.palette.length).fill(false);
  for (let i = 0; i < chunk.indices.length; i++) {
    used[chunk.indices[i]!] = true;
  }

  const oldToNew = new Array<number>(chunk.palette.length).fill(0);
  const newPalette: BlockStateId[] = [];
  let newIndex = 0;

  for (let i = 0; i < chunk.palette.length; i++) {
    if (used[i]) {
      oldToNew[i] = newIndex;
      newPalette.push(chunk.palette[i]!);
      newIndex++;
    }
  }

  chunk.palette = newPalette;
  for (let i = 0; i < chunk.indices.length; i++) {
    chunk.indices[i] = oldToNew[chunk.indices[i]!]!;
  }
}
