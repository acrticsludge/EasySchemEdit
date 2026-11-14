// packages/renderer/src/chunk-mesher.ts
// Pure-TypeScript 16³ chunk mesher producing typed-array geometry per render pass (slice E2.3, SUBSPEC-E).
// Handles variants, multipart, model/element rotations, texture atlas UV mapping,
// cross-chunk face culling, same-block transparent culling, tinting, and directional shading.
// Zero Three.js / DOM / Node imports.

import type { MeshPass } from './chunk-mesh.ts';
import { classifyPass } from './render-pass.ts';
import { getTint } from './tints.ts';
import {
  resolveBlockModels,
  normalizeResourceLocation,
  formatBlockStateCacheKey,
  type AssetSource,
  type ResolvedModelPart,
  type ResolvedElement,
  type ResolvedFace,
} from './model-resolver.ts';

// ============================================================================
// Types
// ============================================================================

export interface BlockStateData {
  name: string;
  properties?: Record<string, string>;
}

export type BlockLookupResult = BlockStateData | string | null | undefined;

export interface TextureUvInfo {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  hasAlpha?: 'none' | 'binary' | 'partial';
}

export interface ChunkMeshInput {
  chunkKey: string;
  chunkOrigin?: [number, number, number];
  getBlock?: (lx: number, ly: number, lz: number) => BlockLookupResult;
  palette?: (BlockStateData | string)[];
  indices?: Uint8Array | Uint16Array | Uint32Array | number[];
  getNeighborBlock?: (lx: number, ly: number, lz: number) => BlockLookupResult;
  assets: AssetSource;
  getTextureUv?: (textureId: string) => TextureUvInfo | undefined;
  seed?: number;
  modelCache?: Map<string, ResolvedModelPart[]>;
}

export interface PassGeometryBuffer {
  pass: MeshPass;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

export interface ChunkMeshOutput {
  chunkKey: string;
  passes: Record<MeshPass, PassGeometryBuffer | null>;
  totalVertexCount: number;
  totalFaceCount: number;
}

// Direction vectors
const DIR_VECTORS: Record<string, [number, number, number]> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

const ALL_FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

export const FACE_SHADE: Record<string, number> = {
  up: 1.0,
  down: 1.0,
  north: 1.0,
  south: 1.0,
  west: 1.0,
  east: 1.0,
};

export function getFluidFamily(name: string): 'water' | 'lava' | null {
  if (!name) return null;
  let base = name.trim().toLowerCase();
  const bracket = base.indexOf('[');
  if (bracket !== -1) {
    base = base.slice(0, bracket).trim();
  }
  if (base.startsWith('minecraft:')) {
    base = base.slice('minecraft:'.length);
  }
  if (base === 'water' || base === 'flowing_water') return 'water';
  if (base === 'lava' || base === 'flowing_lava') return 'lava';
  return null;
}

// ============================================================================
// Air and Block Normalization Helpers
// ============================================================================

const AIR_BLOCK_NAMES = new Set([
  'air',
  'minecraft:air',
  'cave_air',
  'minecraft:cave_air',
  'void_air',
  'minecraft:void_air',
]);

export function isAirBlock(block: BlockLookupResult): boolean {
  if (block === null || block === undefined) return true;
  if (typeof block === 'string') {
    const trimmed = block.trim().toLowerCase();
    if (trimmed === '' || AIR_BLOCK_NAMES.has(trimmed)) return true;
    const bracket = trimmed.indexOf('[');
    const base = bracket !== -1 ? trimmed.slice(0, bracket).trim() : trimmed;
    return AIR_BLOCK_NAMES.has(base);
  }
  if (typeof block === 'object') {
    const name = (block.name ?? '').trim().toLowerCase();
    return name === '' || AIR_BLOCK_NAMES.has(name);
  }
  return false;
}

export function parseBlockData(block: BlockLookupResult): BlockStateData | null {
  if (isAirBlock(block)) return null;

  if (typeof block === 'string') {
    let s = block.trim();
    const bracketIndex = s.indexOf('[');
    if (bracketIndex === -1) {
      return { name: normalizeResourceLocation(s), properties: {} };
    }
    const name = s.slice(0, bracketIndex);
    const closingIndex = s.lastIndexOf(']');
    const propStr = closingIndex !== -1 ? s.slice(bracketIndex + 1, closingIndex) : s.slice(bracketIndex + 1);
    const properties: Record<string, string> = {};
    for (const pair of propStr.split(',')) {
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim();
        if (k) properties[k] = v;
      }
    }
    return { name: normalizeResourceLocation(name), properties };
  }

  if (typeof block === 'object' && block !== null) {
    return {
      name: normalizeResourceLocation(block.name),
      properties: block.properties ? { ...block.properties } : {},
    };
  }

  return null;
}

// ============================================================================
// Rotation Math Helpers
// ============================================================================

/**
 * Rotates a cardinal direction by model-part rotation (x then y in 0, 90, 180, 270 degrees).
 */
export function rotateDirection(dir: string, xDeg: number, yDeg: number): string {
  const v = DIR_VECTORS[dir.toLowerCase()];
  if (!v) return dir;
  if (xDeg === 0 && yDeg === 0) return dir;

  const [x, y, z] = v;

  // 1. Rotate around X (pitch)
  let x1 = x;
  let y1 = y;
  let z1 = z;
  if (xDeg !== 0) {
    const radX = (xDeg * Math.PI) / 180;
    const cosX = Math.round(Math.cos(radX));
    const sinX = Math.round(Math.sin(radX));
    y1 = y * cosX - z * sinX;
    z1 = y * sinX + z * cosX;
  }

  // 2. Rotate around Y (yaw)
  let x2 = x1;
  let y2 = y1;
  let z2 = z1;
  if (yDeg !== 0) {
    const radY = (yDeg * Math.PI) / 180;
    const cosY = Math.round(Math.cos(radY));
    const sinY = Math.round(Math.sin(radY));
    x2 = x1 * cosY - z1 * sinY;
    z2 = x1 * sinY + z1 * cosY;
  }

  const rx = Math.round(x2);
  const ry = Math.round(y2);
  const rz = Math.round(z2);

  if (ry === 1) return 'up';
  if (ry === -1) return 'down';
  if (rz === -1) return 'north';
  if (rz === 1) return 'south';
  if (rx === -1) return 'west';
  if (rx === 1) return 'east';

  return dir;
}

/**
 * Rotates a 3D point around block center [0.5, 0.5, 0.5] by part.x then part.y.
 */
function rotatePointPart(
  x: number,
  y: number,
  z: number,
  xDeg: number,
  yDeg: number
): [number, number, number] {
  if (xDeg === 0 && yDeg === 0) return [x, y, z];

  let px = x - 0.5;
  let py = y - 0.5;
  let pz = z - 0.5;

  if (xDeg !== 0) {
    const radX = (xDeg * Math.PI) / 180;
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const ny = py * cosX - pz * sinX;
    const nz = py * sinX + pz * cosX;
    py = ny;
    pz = nz;
  }

  if (yDeg !== 0) {
    const radY = (yDeg * Math.PI) / 180;
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const nx = px * cosY - pz * sinY;
    const nz = px * sinY + pz * cosY;
    px = nx;
    pz = nz;
  }

  return [px + 0.5, py + 0.5, pz + 0.5];
}

/**
 * Rotates a 3D direction/normal vector by part.x then part.y.
 */
function rotateVectorPart(
  x: number,
  y: number,
  z: number,
  xDeg: number,
  yDeg: number
): [number, number, number] {
  if (xDeg === 0 && yDeg === 0) return [x, y, z];

  let px = x;
  let py = y;
  let pz = z;

  if (xDeg !== 0) {
    const radX = (xDeg * Math.PI) / 180;
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const ny = py * cosX - pz * sinX;
    const nz = py * sinX + pz * cosX;
    py = ny;
    pz = nz;
  }

  if (yDeg !== 0) {
    const radY = (yDeg * Math.PI) / 180;
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const nx = px * cosY - pz * sinY;
    const nz = px * sinY + pz * cosY;
    px = nx;
    pz = nz;
  }

  return [px, py, pz];
}

/**
 * Rotates an element vertex around element rotation origin.
 */
function rotateElementVertex(
  x: number,
  y: number,
  z: number,
  rot?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
    rescale?: boolean;
  }
): [number, number, number] {
  if (!rot || rot.angle === 0) return [x, y, z];

  const ox = rot.origin[0] / 16;
  const oy = rot.origin[1] / 16;
  const oz = rot.origin[2] / 16;
  const rad = (rot.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const scale = rot.rescale ? 1 / cos : 1.0;

  let dx = x - ox;
  let dy = y - oy;
  let dz = z - oz;

  switch (rot.axis) {
    case 'x': {
      dy *= scale;
      dz *= scale;
      const ny = dy * cos - dz * sin;
      const nz = dy * sin + dz * cos;
      return [x, oy + ny, oz + nz];
    }
    case 'y': {
      dx *= scale;
      dz *= scale;
      const nx = dx * cos - dz * sin;
      const nz = dx * sin + dz * cos;
      return [ox + nx, y, oz + nz];
    }
    case 'z': {
      dx *= scale;
      dy *= scale;
      const nx = dx * cos - dy * sin;
      const ny = dx * sin + dy * cos;
      return [ox + nx, oy + ny, z];
    }
  }
}

/**
 * Rotates an element normal vector around element rotation axis.
 */
function rotateElementNormal(
  nx: number,
  ny: number,
  nz: number,
  rot?: {
    axis: 'x' | 'y' | 'z';
    angle: number;
  }
): [number, number, number] {
  if (!rot || rot.angle === 0) return [nx, ny, nz];

  const rad = (rot.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  switch (rot.axis) {
    case 'x': {
      return [nx, ny * cos - nz * sin, ny * sin + nz * cos];
    }
    case 'y': {
      return [nx * cos - nz * sin, ny, nx * sin + nz * cos];
    }
    case 'z': {
      return [nx * cos - ny * sin, nx * sin + ny * cos, nz];
    }
  }
}

// ============================================================================
// Internal Block Info & Cache
// ============================================================================

interface CachedBlockInfo {
  key: string;
  name: string;
  properties: Record<string, string>;
  parts: ResolvedModelPart[];
  isFullCube: boolean;
  isOpaqueFullCube: boolean;
  pass: MeshPass;
}

function computeBlockInfo(
  block: BlockStateData,
  assets: AssetSource,
  seed?: number,
  modelCache?: Map<string, ResolvedModelPart[]>
): CachedBlockInfo {
  const key = formatBlockStateCacheKey(block.name, block.properties ?? {}, seed);
  const parts = resolveBlockModels(block.name, block.properties ?? {}, assets, {
    seed,
    cache: modelCache,
  });

  const pass = classifyPass(block.name, 'none', { properties: block.properties });

  // Check full cube criteria:
  // - exactly 1 part with at least 1 element
  // - base element: from: [0, 0, 0] and to: [16, 16, 16]
  // - no element rotation
  // - all 6 faces present
  let isFullCube = false;
  if (parts.length === 1 && parts[0]!.elements.length >= 1) {
    const el = parts[0]!.elements[0]!;
    if (
      !el.rotation &&
      el.from[0] === 0 &&
      el.from[1] === 0 &&
      el.from[2] === 0 &&
      el.to[0] === 16 &&
      el.to[1] === 16 &&
      el.to[2] === 16 &&
      ALL_FACES.every((f) => el.faces[f] !== undefined)
    ) {
      isFullCube = true;
    }
  }

  const isOpaqueFullCube = isFullCube && pass === 'opaque';

  return {
    key,
    name: block.name,
    properties: block.properties ?? {},
    parts,
    isFullCube,
    isOpaqueFullCube,
    pass,
  };
}

export function isOpaqueFullCube(
  block: BlockLookupResult,
  assets: AssetSource,
  blockInfoCache?: Map<string, CachedBlockInfo>
): boolean {
  const parsed = parseBlockData(block);
  if (!parsed) return false;

  const key = formatBlockStateCacheKey(parsed.name, parsed.properties ?? {});
  if (blockInfoCache?.has(key)) {
    return blockInfoCache.get(key)!.isOpaqueFullCube;
  }

  const info = computeBlockInfo(parsed, assets);
  if (blockInfoCache) {
    blockInfoCache.set(key, info);
  }
  return info.isOpaqueFullCube;
}

// ============================================================================
// Face Culling Logic
// ============================================================================

export function shouldCullFace(
  face: ResolvedFace,
  part: ResolvedModelPart,
  currentBlockInfo: CachedBlockInfo,
  lx: number,
  ly: number,
  lz: number,
  getBlockAt: (x: number, y: number, z: number) => BlockLookupResult,
  assets: AssetSource,
  blockInfoCache: Map<string, CachedBlockInfo>,
  getNeighborInfo?: (nx: number, ny: number, nz: number) => CachedBlockInfo | null | undefined
): boolean {
  if (!face.cullface) {
    return false;
  }

  let offset: [number, number, number] | undefined;
  const partX = part.x ?? 0;
  const partY = part.y ?? 0;
  if (partX === 0 && partY === 0) {
    offset = DIR_VECTORS[face.cullface.toLowerCase()];
  } else {
    const effCullDir = rotateDirection(face.cullface, partX, partY);
    offset = DIR_VECTORS[effCullDir];
  }
  if (!offset) {
    return false;
  }

  const nx = lx + offset[0];
  const ny = ly + offset[1];
  const nz = lz + offset[2];

  let neighborInfo: CachedBlockInfo | null | undefined;
  if (getNeighborInfo) {
    neighborInfo = getNeighborInfo(nx, ny, nz);
  }

  if (neighborInfo === undefined) {
    const neighborRaw = getBlockAt(nx, ny, nz);
    const neighborParsed = parseBlockData(neighborRaw);
    if (!neighborParsed) {
      return false;
    }

    const neighborKey = formatBlockStateCacheKey(neighborParsed.name, neighborParsed.properties ?? {});
    neighborInfo = blockInfoCache.get(neighborKey);
    if (!neighborInfo) {
      neighborInfo = computeBlockInfo(neighborParsed, assets);
      blockInfoCache.set(neighborKey, neighborInfo);
    }
  }

  if (!neighborInfo) {
    return false;
  }

  // Condition 1: Neighbor is an opaque full cube
  if (neighborInfo.isOpaqueFullCube) {
    return true;
  }

  // Condition 2: Fluid interior face culling
  // If current block is a fluid (water, flowing_water, lava, flowing_lava) and neighbor
  // is in the same fluid family, cull the interior face between them.
  const currentFluid = getFluidFamily(currentBlockInfo.name);
  if (currentFluid !== null) {
    const neighborFluid = getFluidFamily(neighborInfo.name);
    if (neighborFluid === currentFluid) {
      return true;
    }
  }

  // Condition 3: Same-block non-opaque culling
  // If current block is a full-cube cutout or translucent block, and neighbor has exact same blockstate
  if (
    currentBlockInfo.isFullCube &&
    (currentBlockInfo.pass === 'cutout' || currentBlockInfo.pass === 'translucent') &&
    neighborInfo.key === currentBlockInfo.key
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Dynamic Buffer Builder
// ============================================================================

class PassBufferBuilder {
  public vertexCount = 0;
  public faceCount = 0;
  public positions: Float32Array;
  public normals: Float32Array;
  public uvs: Float32Array;
  public colors: Float32Array;
  public indices: Uint32Array;
  private capacity: number;

  constructor(initialCapacity = 512) {
    this.capacity = initialCapacity;
    this.positions = new Float32Array(initialCapacity * 3);
    this.normals = new Float32Array(initialCapacity * 3);
    this.uvs = new Float32Array(initialCapacity * 2);
    this.colors = new Float32Array(initialCapacity * 3);
    this.indices = new Uint32Array(Math.floor(initialCapacity * 1.5));
  }

  private ensureCapacity(additionalVertices: number, additionalIndices: number): void {
    const requiredVertices = this.vertexCount + additionalVertices;
    const requiredIndices = this.faceCount * 6 + additionalIndices;

    if (requiredVertices > this.capacity || requiredIndices > this.indices.length) {
      const newCapacity = Math.max(this.capacity * 2, requiredVertices);
      const newPositions = new Float32Array(newCapacity * 3);
      const newNormals = new Float32Array(newCapacity * 3);
      const newUvs = new Float32Array(newCapacity * 2);
      const newColors = new Float32Array(newCapacity * 3);
      const newIndices = new Uint32Array(Math.max(Math.floor(newCapacity * 1.5), requiredIndices));

      newPositions.set(this.positions.subarray(0, this.vertexCount * 3));
      newNormals.set(this.normals.subarray(0, this.vertexCount * 3));
      newUvs.set(this.uvs.subarray(0, this.vertexCount * 2));
      newColors.set(this.colors.subarray(0, this.vertexCount * 3));
      newIndices.set(this.indices.subarray(0, this.faceCount * 6));

      this.positions = newPositions;
      this.normals = newNormals;
      this.uvs = newUvs;
      this.colors = newColors;
      this.indices = newIndices;
      this.capacity = newCapacity;
    }
  }

  public addFace(
    v0: [number, number, number],
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number],
    normal: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    uv3: [number, number],
    color: [number, number, number]
  ): void {
    this.ensureCapacity(4, 6);

    const vIdx = this.vertexCount;
    const pOffset = vIdx * 3;
    const nOffset = vIdx * 3;
    const uvOffset = vIdx * 2;
    const cOffset = vIdx * 3;
    const iOffset = this.faceCount * 6;

    // V0
    this.positions[pOffset] = v0[0];
    this.positions[pOffset + 1] = v0[1];
    this.positions[pOffset + 2] = v0[2];
    this.normals[nOffset] = normal[0];
    this.normals[nOffset + 1] = normal[1];
    this.normals[nOffset + 2] = normal[2];
    this.uvs[uvOffset] = uv0[0];
    this.uvs[uvOffset + 1] = uv0[1];
    this.colors[cOffset] = color[0];
    this.colors[cOffset + 1] = color[1];
    this.colors[cOffset + 2] = color[2];

    // V1
    this.positions[pOffset + 3] = v1[0];
    this.positions[pOffset + 4] = v1[1];
    this.positions[pOffset + 5] = v1[2];
    this.normals[nOffset + 3] = normal[0];
    this.normals[nOffset + 4] = normal[1];
    this.normals[nOffset + 5] = normal[2];
    this.uvs[uvOffset + 2] = uv1[0];
    this.uvs[uvOffset + 3] = uv1[1];
    this.colors[cOffset + 3] = color[0];
    this.colors[cOffset + 4] = color[1];
    this.colors[cOffset + 5] = color[2];

    // V2
    this.positions[pOffset + 6] = v2[0];
    this.positions[pOffset + 7] = v2[1];
    this.positions[pOffset + 8] = v2[2];
    this.normals[nOffset + 6] = normal[0];
    this.normals[nOffset + 7] = normal[1];
    this.normals[nOffset + 8] = normal[2];
    this.uvs[uvOffset + 4] = uv2[0];
    this.uvs[uvOffset + 5] = uv2[1];
    this.colors[cOffset + 6] = color[0];
    this.colors[cOffset + 7] = color[1];
    this.colors[cOffset + 8] = color[2];

    // V3
    this.positions[pOffset + 9] = v3[0];
    this.positions[pOffset + 10] = v3[1];
    this.positions[pOffset + 11] = v3[2];
    this.normals[nOffset + 9] = normal[0];
    this.normals[nOffset + 10] = normal[1];
    this.normals[nOffset + 11] = normal[2];
    this.uvs[uvOffset + 6] = uv3[0];
    this.uvs[uvOffset + 7] = uv3[1];
    this.colors[cOffset + 9] = color[0];
    this.colors[cOffset + 10] = color[1];
    this.colors[cOffset + 11] = color[2];

    // Indices: (0, 1, 2) and (0, 2, 3)
    this.indices[iOffset] = vIdx;
    this.indices[iOffset + 1] = vIdx + 1;
    this.indices[iOffset + 2] = vIdx + 2;
    this.indices[iOffset + 3] = vIdx;
    this.indices[iOffset + 4] = vIdx + 2;
    this.indices[iOffset + 5] = vIdx + 3;

    this.vertexCount += 4;
    this.faceCount += 1;
  }

  public addFaceDirect(
    v0x: number, v0y: number, v0z: number,
    v1x: number, v1y: number, v1z: number,
    v2x: number, v2y: number, v2z: number,
    v3x: number, v3y: number, v3z: number,
    nx: number, ny: number, nz: number,
    uv0u: number, uv0v: number,
    uv1u: number, uv1v: number,
    uv2u: number, uv2v: number,
    uv3u: number, uv3v: number,
    colorR: number, colorG: number, colorB: number
  ): void {
    this.ensureCapacity(4, 6);

    const vIdx = this.vertexCount;
    const pOffset = vIdx * 3;
    const uvOffset = vIdx * 2;
    const iOffset = this.faceCount * 6;

    // V0
    this.positions[pOffset] = v0x;
    this.positions[pOffset + 1] = v0y;
    this.positions[pOffset + 2] = v0z;
    this.normals[pOffset] = nx;
    this.normals[pOffset + 1] = ny;
    this.normals[pOffset + 2] = nz;
    this.uvs[uvOffset] = uv0u;
    this.uvs[uvOffset + 1] = uv0v;
    this.colors[pOffset] = colorR;
    this.colors[pOffset + 1] = colorG;
    this.colors[pOffset + 2] = colorB;

    // V1
    this.positions[pOffset + 3] = v1x;
    this.positions[pOffset + 4] = v1y;
    this.positions[pOffset + 5] = v1z;
    this.normals[pOffset + 3] = nx;
    this.normals[pOffset + 4] = ny;
    this.normals[pOffset + 5] = nz;
    this.uvs[uvOffset + 2] = uv1u;
    this.uvs[uvOffset + 3] = uv1v;
    this.colors[pOffset + 3] = colorR;
    this.colors[pOffset + 4] = colorG;
    this.colors[pOffset + 5] = colorB;

    // V2
    this.positions[pOffset + 6] = v2x;
    this.positions[pOffset + 7] = v2y;
    this.positions[pOffset + 8] = v2z;
    this.normals[pOffset + 6] = nx;
    this.normals[pOffset + 7] = ny;
    this.normals[pOffset + 8] = nz;
    this.uvs[uvOffset + 4] = uv2u;
    this.uvs[uvOffset + 5] = uv2v;
    this.colors[pOffset + 6] = colorR;
    this.colors[pOffset + 7] = colorG;
    this.colors[pOffset + 8] = colorB;

    // V3
    this.positions[pOffset + 9] = v3x;
    this.positions[pOffset + 10] = v3y;
    this.positions[pOffset + 11] = v3z;
    this.normals[pOffset + 9] = nx;
    this.normals[pOffset + 10] = ny;
    this.normals[pOffset + 11] = nz;
    this.uvs[uvOffset + 6] = uv3u;
    this.uvs[uvOffset + 7] = uv3v;
    this.colors[pOffset + 9] = colorR;
    this.colors[pOffset + 10] = colorG;
    this.colors[pOffset + 11] = colorB;

    // Indices: (0, 1, 2) and (0, 2, 3)
    this.indices[iOffset] = vIdx;
    this.indices[iOffset + 1] = vIdx + 1;
    this.indices[iOffset + 2] = vIdx + 2;
    this.indices[iOffset + 3] = vIdx;
    this.indices[iOffset + 4] = vIdx + 2;
    this.indices[iOffset + 5] = vIdx + 3;

    this.vertexCount += 4;
    this.faceCount += 1;
  }

  public toBuffer(pass: MeshPass): PassGeometryBuffer | null {
    if (this.faceCount === 0) return null;
    return {
      pass,
      positions: this.positions.slice(0, this.vertexCount * 3),
      normals: this.normals.slice(0, this.vertexCount * 3),
      uvs: this.uvs.slice(0, this.vertexCount * 2),
      colors: this.colors.slice(0, this.vertexCount * 3),
      indices: this.indices.slice(0, this.faceCount * 6),
      vertexCount: this.vertexCount,
      faceCount: this.faceCount,
    };
  }
}

// ============================================================================
// Face Geometry Computation
// ============================================================================

function getRawFaceQuad(
  dir: string,
  from: [number, number, number],
  to: [number, number, number]
): {
  vertices: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
  normal: [number, number, number];
} {
  const [x1, y1, z1] = [from[0] / 16, from[1] / 16, from[2] / 16];
  const [x2, y2, z2] = [to[0] / 16, to[1] / 16, to[2] / 16];

  switch (dir.toLowerCase()) {
    case 'down':
      return {
        vertices: [
          [x1, y1, z2],
          [x1, y1, z1],
          [x2, y1, z1],
          [x2, y1, z2],
        ],
        normal: [0, -1, 0],
      };
    case 'up':
      return {
        vertices: [
          [x1, y2, z1],
          [x1, y2, z2],
          [x2, y2, z2],
          [x2, y2, z1],
        ],
        normal: [0, 1, 0],
      };
    case 'north':
      return {
        vertices: [
          [x2, y2, z1],
          [x2, y1, z1],
          [x1, y1, z1],
          [x1, y2, z1],
        ],
        normal: [0, 0, -1],
      };
    case 'south':
      return {
        vertices: [
          [x1, y2, z2],
          [x1, y1, z2],
          [x2, y1, z2],
          [x2, y2, z2],
        ],
        normal: [0, 0, 1],
      };
    case 'west':
      return {
        vertices: [
          [x1, y2, z1],
          [x1, y1, z1],
          [x1, y1, z2],
          [x1, y2, z2],
        ],
        normal: [-1, 0, 0],
      };
    case 'east':
      return {
        vertices: [
          [x2, y2, z2],
          [x2, y1, z2],
          [x2, y1, z1],
          [x2, y2, z1],
        ],
        normal: [1, 0, 0],
      };
    default:
      return {
        vertices: [
          [x1, y2, z1],
          [x1, y1, z1],
          [x2, y1, z1],
          [x2, y2, z1],
        ],
        normal: [0, 0, -1],
      };
  }
}

// ============================================================================
// Main API: meshChunk
// ============================================================================

/**
 * Meshes a 16³ chunk into typed array geometry per render pass.
 */
export function meshChunk(input: ChunkMeshInput): ChunkMeshOutput {
  const chunkKey = input.chunkKey;
  const origin = input.chunkOrigin ?? [0, 0, 0];
  const assets = input.assets;
  const getTextureUv = input.getTextureUv;
  const seed = input.seed ?? 0;
  const modelCache = input.modelCache;

  // Unified block accessor
  const getBlockAt = (x: number, y: number, z: number): BlockLookupResult => {
    if (
      input.indices &&
      input.palette &&
      x >= 0 &&
      x < 16 &&
      y >= 0 &&
      y < 16 &&
      z >= 0 &&
      z < 16
    ) {
      const idx = x + z * 16 + y * 256;
      const pIdx = input.indices[idx];
      return pIdx !== undefined ? input.palette[pIdx] : null;
    }
    if (x < 0 || x >= 16 || y < 0 || y >= 16 || z < 0 || z >= 16) {
      if (input.getNeighborBlock) {
        return input.getNeighborBlock(x, y, z);
      }
      if (input.getBlock) {
        return input.getBlock(x, y, z);
      }
      return null;
    }
    if (input.getBlock) {
      return input.getBlock(x, y, z);
    }
    return null;
  };

  const blockInfoCache = new Map<string, CachedBlockInfo>();
  const passBuilders: Record<MeshPass, PassBufferBuilder> = {
    opaque: new PassBufferBuilder(),
    cutout: new PassBufferBuilder(),
    translucent: new PassBufferBuilder(),
    emissive: new PassBufferBuilder(),
  };

  const hasPaletteIndices = Boolean(input.palette && input.indices);
  let paletteParsed: (BlockStateData | null)[] | null = null;
  let paletteInfo: (CachedBlockInfo | null)[] | null = null;

  if (hasPaletteIndices) {
    const pal = input.palette!;
    const palLen = pal.length;
    paletteParsed = new Array(palLen);
    paletteInfo = new Array(palLen);
    for (let i = 0; i < palLen; i++) {
      const raw = pal[i];
      const parsed = parseBlockData(raw);
      paletteParsed[i] = parsed;
      if (parsed) {
        const blockKey = formatBlockStateCacheKey(parsed.name, parsed.properties ?? {}, seed);
        let info = blockInfoCache.get(blockKey);
        if (!info) {
          info = computeBlockInfo(parsed, assets, seed, modelCache);
          blockInfoCache.set(blockKey, info);
        }
        paletteInfo[i] = info;
      } else {
        paletteInfo[i] = null;
      }
    }
  }

  const indices = input.indices;
  const getNeighborInfo = hasPaletteIndices
    ? (nx: number, ny: number, nz: number): CachedBlockInfo | null | undefined => {
        if (nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && nz >= 0 && nz < 16) {
          const nIdx = nx + nz * 16 + ny * 256;
          const nPIdx = indices![nIdx];
          return nPIdx !== undefined ? (paletteInfo![nPIdx] ?? null) : null;
        }
        return undefined;
      }
    : undefined;

  let idx = 0;
  for (let ly = 0; ly < 16; ly++) {
    const originY = origin[1] + ly;
    for (let lz = 0; lz < 16; lz++) {
      const originZ = origin[2] + lz;
      for (let lx = 0; lx < 16; lx++, idx++) {
        const originX = origin[0] + lx;

        let info: CachedBlockInfo | null = null;
        if (hasPaletteIndices) {
          const pIdx = indices![idx];
          if (pIdx === undefined) continue;
          info = paletteInfo![pIdx] ?? null;
          if (!info) continue;
        } else {
          const rawBlock = getBlockAt(lx, ly, lz);
          const parsed = parseBlockData(rawBlock);
          if (!parsed) continue;

          const blockKey = formatBlockStateCacheKey(parsed.name, parsed.properties ?? {}, seed);
          info = blockInfoCache.get(blockKey) ?? null;
          if (!info) {
            info = computeBlockInfo(parsed, assets, seed, modelCache);
            blockInfoCache.set(blockKey, info);
          }
        }

        // Process each resolved model part
        for (const part of info.parts) {
          const partX = part.x ?? 0;
          const partY = part.y ?? 0;
          const uvlock = Boolean(part.uvlock);

          const hasPartRot = partX !== 0 || partY !== 0;
          let cosPartX = 1;
          let sinPartX = 0;
          let cosPartY = 1;
          let sinPartY = 0;
          if (partX !== 0) {
            const radX = (partX * Math.PI) / 180;
            cosPartX = Math.cos(radX);
            sinPartX = Math.sin(radX);
          }
          if (partY !== 0) {
            const radY = (partY * Math.PI) / 180;
            cosPartY = Math.cos(radY);
            sinPartY = Math.sin(radY);
          }

          for (const el of part.elements) {
            const x1 = el.from[0] / 16;
            const y1 = el.from[1] / 16;
            const z1 = el.from[2] / 16;
            const x2 = el.to[0] / 16;
            const y2 = el.to[1] / 16;
            const z2 = el.to[2] / 16;

            const hasElRot = Boolean(el.rotation && el.rotation.angle !== 0);
            let elOx = 0;
            let elOy = 0;
            let elOz = 0;
            let elCos = 1;
            let elSin = 0;
            let elScale = 1;
            let elAxis: 'x' | 'y' | 'z' = 'y';
            if (hasElRot) {
              const rot = el.rotation!;
              elOx = rot.origin[0] / 16;
              elOy = rot.origin[1] / 16;
              elOz = rot.origin[2] / 16;
              const rad = (rot.angle * Math.PI) / 180;
              elCos = Math.cos(rad);
              elSin = Math.sin(rad);
              elScale = rot.rescale ? 1 / elCos : 1.0;
              elAxis = rot.axis;
            }

            for (const dir in el.faces) {
              const face = (el.faces as Record<string, ResolvedFace | undefined>)[dir];
              if (!face) continue;

              // Face culling test
              if (
                shouldCullFace(
                  face,
                  part,
                  info,
                  lx,
                  ly,
                  lz,
                  getBlockAt,
                  assets,
                  blockInfoCache,
                  getNeighborInfo
                )
              ) {
                continue;
              }

              // Determine pass for this face/texture
              const texInfo = getTextureUv ? getTextureUv(face.texture) : undefined;
              let hasAlpha = texInfo?.hasAlpha ?? 'none';
              if (
                hasAlpha === 'none' &&
                (face.texture.includes('overlay') || face.texture.includes('grass_block_side_overlay'))
              ) {
                hasAlpha = 'binary';
              }
              const facePass =
                hasAlpha === 'none'
                  ? info.pass
                  : classifyPass(info.name, hasAlpha, { properties: info.properties });

              // 1. Get raw quad coordinates and normal
              let p0x: number, p0y: number, p0z: number;
              let p1x: number, p1y: number, p1z: number;
              let p2x: number, p2y: number, p2z: number;
              let p3x: number, p3y: number, p3z: number;
              let nx: number, ny: number, nz: number;

              const lowerDir = dir.toLowerCase();
              switch (lowerDir) {
                case 'down':
                  p0x = x1; p0y = y1; p0z = z2;
                  p1x = x1; p1y = y1; p1z = z1;
                  p2x = x2; p2y = y1; p2z = z1;
                  p3x = x2; p3y = y1; p3z = z2;
                  nx = 0; ny = -1; nz = 0;
                  break;
                case 'up':
                  p0x = x1; p0y = y2; p0z = z1;
                  p1x = x1; p1y = y2; p1z = z2;
                  p2x = x2; p2y = y2; p2z = z2;
                  p3x = x2; p3y = y2; p3z = z1;
                  nx = 0; ny = 1; nz = 0;
                  break;
                case 'north':
                  p0x = x2; p0y = y2; p0z = z1;
                  p1x = x2; p1y = y1; p1z = z1;
                  p2x = x1; p2y = y1; p2z = z1;
                  p3x = x1; p3y = y2; p3z = z1;
                  nx = 0; ny = 0; nz = -1;
                  break;
                case 'south':
                  p0x = x1; p0y = y2; p0z = z2;
                  p1x = x1; p1y = y1; p1z = z2;
                  p2x = x2; p2y = y1; p2z = z2;
                  p3x = x2; p3y = y2; p3z = z2;
                  nx = 0; ny = 0; nz = 1;
                  break;
                case 'west':
                  p0x = x1; p0y = y2; p0z = z1;
                  p1x = x1; p1y = y1; p1z = z1;
                  p2x = x1; p2y = y1; p2z = z2;
                  p3x = x1; p3y = y2; p3z = z2;
                  nx = -1; ny = 0; nz = 0;
                  break;
                case 'east':
                  p0x = x2; p0y = y2; p0z = z2;
                  p1x = x2; p1y = y1; p1z = z2;
                  p2x = x2; p2y = y1; p2z = z1;
                  p3x = x2; p3y = y2; p3z = z1;
                  nx = 1; ny = 0; nz = 0;
                  break;
                default:
                  p0x = x1; p0y = y2; p0z = z1;
                  p1x = x1; p1y = y1; p1z = z1;
                  p2x = x2; p2y = y1; p2z = z1;
                  p3x = x2; p3y = y2; p3z = z1;
                  nx = 0; ny = 0; nz = -1;
                  break;
              }

              // 2. Element-level rotation
              if (hasElRot) {
                if (elAxis === 'x') {
                  let dy = (p0y - elOy) * elScale; let dz = (p0z - elOz) * elScale;
                  p0y = elOy + dy * elCos - dz * elSin; p0z = elOz + dy * elSin + dz * elCos;
                  dy = (p1y - elOy) * elScale; dz = (p1z - elOz) * elScale;
                  p1y = elOy + dy * elCos - dz * elSin; p1z = elOz + dy * elSin + dz * elCos;
                  dy = (p2y - elOy) * elScale; dz = (p2z - elOz) * elScale;
                  p2y = elOy + dy * elCos - dz * elSin; p2z = elOz + dy * elSin + dz * elCos;
                  dy = (p3y - elOy) * elScale; dz = (p3z - elOz) * elScale;
                  p3y = elOy + dy * elCos - dz * elSin; p3z = elOz + dy * elSin + dz * elCos;

                  const nny = ny * elCos - nz * elSin;
                  const nnz = ny * elSin + nz * elCos;
                  ny = nny; nz = nnz;
                } else if (elAxis === 'y') {
                  let dx = (p0x - elOx) * elScale; let dz = (p0z - elOz) * elScale;
                  p0x = elOx + dx * elCos - dz * elSin; p0z = elOz + dx * elSin + dz * elCos;
                  dx = (p1x - elOx) * elScale; dz = (p1z - elOz) * elScale;
                  p1x = elOx + dx * elCos - dz * elSin; p1z = elOz + dx * elSin + dz * elCos;
                  dx = (p2x - elOx) * elScale; dz = (p2z - elOz) * elScale;
                  p2x = elOx + dx * elCos - dz * elSin; p2z = elOz + dx * elSin + dz * elCos;
                  dx = (p3x - elOx) * elScale; dz = (p3z - elOz) * elScale;
                  p3x = elOx + dx * elCos - dz * elSin; p3z = elOz + dx * elSin + dz * elCos;

                  const nnx = nx * elCos - nz * elSin;
                  const nnz = nx * elSin + nz * elCos;
                  nx = nnx; nz = nnz;
                } else {
                  let dx = (p0x - elOx) * elScale; let dy = (p0y - elOy) * elScale;
                  p0x = elOx + dx * elCos - dy * elSin; p0y = elOy + dx * elSin + dy * elCos;
                  dx = (p1x - elOx) * elScale; dy = (p1y - elOy) * elScale;
                  p1x = elOx + dx * elCos - dy * elSin; p1y = elOy + dx * elSin + dy * elCos;
                  dx = (p2x - elOx) * elScale; dy = (p2y - elOy) * elScale;
                  p2x = elOx + dx * elCos - dy * elSin; p2y = elOy + dx * elSin + dy * elCos;
                  dx = (p3x - elOx) * elScale; dy = (p3y - elOy) * elScale;
                  p3x = elOx + dx * elCos - dy * elSin; p3y = elOy + dx * elSin + dy * elCos;

                  const nnx = nx * elCos - ny * elSin;
                  const nny = nx * elSin + ny * elCos;
                  nx = nnx; ny = nny;
                }
              }

              // 3. Model-part rotation around block center [0.5, 0.5, 0.5]
              if (hasPartRot) {
                // P0
                let px = p0x - 0.5, py = p0y - 0.5, pz = p0z - 0.5;
                if (partX !== 0) {
                  const nny = py * cosPartX - pz * sinPartX;
                  const nnz = py * sinPartX + pz * cosPartX;
                  py = nny; pz = nnz;
                }
                if (partY !== 0) {
                  const nnx = px * cosPartY - pz * sinPartY;
                  const nnz = px * sinPartY + pz * cosPartY;
                  px = nnx; pz = nnz;
                }
                p0x = px + 0.5; p0y = py + 0.5; p0z = pz + 0.5;

                // P1
                px = p1x - 0.5; py = p1y - 0.5; pz = p1z - 0.5;
                if (partX !== 0) {
                  const nny = py * cosPartX - pz * sinPartX;
                  const nnz = py * sinPartX + pz * cosPartX;
                  py = nny; pz = nnz;
                }
                if (partY !== 0) {
                  const nnx = px * cosPartY - pz * sinPartY;
                  const nnz = px * sinPartY + pz * cosPartY;
                  px = nnx; pz = nnz;
                }
                p1x = px + 0.5; p1y = py + 0.5; p1z = pz + 0.5;

                // P2
                px = p2x - 0.5; py = p2y - 0.5; pz = p2z - 0.5;
                if (partX !== 0) {
                  const nny = py * cosPartX - pz * sinPartX;
                  const nnz = py * sinPartX + pz * cosPartX;
                  py = nny; pz = nnz;
                }
                if (partY !== 0) {
                  const nnx = px * cosPartY - pz * sinPartY;
                  const nnz = px * sinPartY + pz * cosPartY;
                  px = nnx; pz = nnz;
                }
                p2x = px + 0.5; p2y = py + 0.5; p2z = pz + 0.5;

                // P3
                px = p3x - 0.5; py = p3y - 0.5; pz = p3z - 0.5;
                if (partX !== 0) {
                  const nny = py * cosPartX - pz * sinPartX;
                  const nnz = py * sinPartX + pz * cosPartX;
                  py = nny; pz = nnz;
                }
                if (partY !== 0) {
                  const nnx = px * cosPartY - pz * sinPartY;
                  const nnz = px * sinPartY + pz * cosPartY;
                  px = nnx; pz = nnz;
                }
                p3x = px + 0.5; p3y = py + 0.5; p3z = pz + 0.5;

                // Normal
                px = nx; py = ny; pz = nz;
                if (partX !== 0) {
                  const nny = py * cosPartX - pz * sinPartX;
                  const nnz = py * sinPartX + pz * cosPartX;
                  py = nny; pz = nnz;
                }
                if (partY !== 0) {
                  const nnx = px * cosPartY - pz * sinPartY;
                  const nnz = px * sinPartY + pz * cosPartY;
                  px = nnx; pz = nnz;
                }
                nx = px; ny = py; nz = pz;
              }

              // 4. Translate to chunk/block world coordinates
              const v0x = originX + p0x;
              const v0y = originY + p0y;
              const v0z = originZ + p0z;

              const v1x = originX + p1x;
              const v1y = originY + p1y;
              const v1z = originZ + p1z;

              const v2x = originX + p2x;
              const v2y = originY + p2y;
              const v2z = originZ + p2z;

              const v3x = originX + p3x;
              const v3y = originY + p3y;
              const v3z = originZ + p3z;

              // 5. UV Mapping & rotation
              const u1 = face.uv[0];
              const v1_uv = face.uv[1];
              const u2 = face.uv[2];
              const v2_uv = face.uv[3];

              let faceRot = face.rotation ?? 0;
              if (uvlock) {
                if (lowerDir === 'up') {
                  faceRot = (faceRot + 360 - (partY % 360)) % 360;
                } else if (lowerDir === 'down') {
                  faceRot = (faceRot + (partY % 360)) % 360;
                } else if (lowerDir === 'east') {
                  faceRot = (faceRot + 360 - (partX % 360)) % 360;
                } else if (lowerDir === 'west') {
                  faceRot = (faceRot + (partX % 360)) % 360;
                }
              }

              const shift = ((Math.round(faceRot / 90) % 4) + 4) % 4;

              const atlasU0 = texInfo?.u0 ?? 0;
              const atlasV0 = texInfo?.v0 ?? 0;
              const atlasU1 = texInfo?.u1 ?? 1;
              const atlasV1 = texInfo?.v1 ?? 1;
              const du = atlasU1 - atlasU0;
              const dv = atlasV1 - atlasV0;

              const raw0 = shift % 4;
              const uv0u = atlasU0 + ((raw0 === 0 || raw0 === 1 ? u1 : u2) / 16) * du;
              const uv0v = atlasV0 + ((raw0 === 0 || raw0 === 3 ? v1_uv : v2_uv) / 16) * dv;

              const raw1 = (shift + 1) % 4;
              const uv1u = atlasU0 + ((raw1 === 0 || raw1 === 1 ? u1 : u2) / 16) * du;
              const uv1v = atlasV0 + ((raw1 === 0 || raw1 === 3 ? v1_uv : v2_uv) / 16) * dv;

              const raw2 = (shift + 2) % 4;
              const uv2u = atlasU0 + ((raw2 === 0 || raw2 === 1 ? u1 : u2) / 16) * du;
              const uv2v = atlasV0 + ((raw2 === 0 || raw2 === 3 ? v1_uv : v2_uv) / 16) * dv;

              const raw3 = (shift + 3) % 4;
              const uv3u = atlasU0 + ((raw3 === 0 || raw3 === 1 ? u1 : u2) / 16) * du;
              const uv3v = atlasV0 + ((raw3 === 0 || raw3 === 3 ? v1_uv : v2_uv) / 16) * dv;

              // 6. Vertex Colors (Tint + Directional Shade)
              let baseR = 1.0;
              let baseG = 1.0;
              let baseB = 1.0;
              if (face.tintindex !== undefined && face.tintindex >= 0) {
                const tint = getTint(info.name, face.tintindex);
                if (tint) {
                  baseR = tint[0];
                  baseG = tint[1];
                  baseB = tint[2];
                }
              }

              // Directional shading multiplier: all faces set to 1.0 to eliminate dark unlit face shadows
              const shade = 1.0;

              const colorR = baseR * shade;
              const colorG = baseG * shade;
              const colorB = baseB * shade;

              // Add face to builder for facePass
              passBuilders[facePass].addFaceDirect(
                v0x, v0y, v0z,
                v1x, v1y, v1z,
                v2x, v2y, v2z,
                v3x, v3y, v3z,
                nx, ny, nz,
                uv0u, uv0v,
                uv1u, uv1v,
                uv2u, uv2v,
                uv3u, uv3v,
                colorR, colorG, colorB
              );
            }
          }
        }
      }
    }
  }

  const opaque = passBuilders.opaque.toBuffer('opaque');
  const cutout = passBuilders.cutout.toBuffer('cutout');
  const translucent = passBuilders.translucent.toBuffer('translucent');
  const emissive = passBuilders.emissive.toBuffer('emissive');

  const totalVertexCount =
    (opaque?.vertexCount ?? 0) +
    (cutout?.vertexCount ?? 0) +
    (translucent?.vertexCount ?? 0) +
    (emissive?.vertexCount ?? 0);

  const totalFaceCount =
    (opaque?.faceCount ?? 0) +
    (cutout?.faceCount ?? 0) +
    (translucent?.faceCount ?? 0) +
    (emissive?.faceCount ?? 0);

  return {
    chunkKey,
    passes: {
      opaque,
      cutout,
      translucent,
      emissive,
    },
    totalVertexCount,
    totalFaceCount,
  };
}
