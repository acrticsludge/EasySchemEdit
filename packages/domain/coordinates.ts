import type { ChunkCoord, Vec3i } from './types.ts';

export const CHUNK_SIZE = 16;

export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function euclideanMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function worldToChunkCoord(worldBlock: Vec3i): ChunkCoord {
  return [floorDiv(worldBlock[0], 16), floorDiv(worldBlock[1], 16), floorDiv(worldBlock[2], 16)];
}

export function localInChunk(worldBlock: Vec3i): Vec3i {
  return [euclideanMod(worldBlock[0], 16), euclideanMod(worldBlock[1], 16), euclideanMod(worldBlock[2], 16)];
}

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx}_${cy}_${cz}`;
}
