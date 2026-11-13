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
  // - exactly 1 part with exactly 1 element
  // - from: [0, 0, 0] and to: [16, 16, 16]
  // - no element rotation
  // - all 6 faces present
  let isFullCube = false;
  if (parts.length === 1 && parts[0]!.elements.length === 1) {
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
  blockInfoCache: Map<string, CachedBlockInfo>
): boolean {
  if (!face.cullface) {
    return false;
  }

  const effCullDir = rotateDirection(face.cullface, part.x, part.y);
  const offset = DIR_VECTORS[effCullDir];
  if (!offset) {
    return false;
  }

  const nx = lx + offset[0];
  const ny = ly + offset[1];
  const nz = lz + offset[2];

  const neighborRaw = getBlockAt(nx, ny, nz);
  const neighborParsed = parseBlockData(neighborRaw);
  if (!neighborParsed) {
    return false;
  }

  const neighborKey = formatBlockStateCacheKey(neighborParsed.name, neighborParsed.properties ?? {});
  let neighborInfo = blockInfoCache.get(neighborKey);
  if (!neighborInfo) {
    neighborInfo = computeBlockInfo(neighborParsed, assets);
    blockInfoCache.set(neighborKey, neighborInfo);
  }

  // Condition 1: Neighbor is an opaque full cube
  if (neighborInfo.isOpaqueFullCube) {
    return true;
  }

  // Condition 2: Same-block non-opaque culling
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

  for (let ly = 0; ly < 16; ly++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const rawBlock = getBlockAt(lx, ly, lz);
        const parsed = parseBlockData(rawBlock);
        if (!parsed) continue;

        const blockKey = formatBlockStateCacheKey(parsed.name, parsed.properties ?? {}, seed);
        let info = blockInfoCache.get(blockKey);
        if (!info) {
          info = computeBlockInfo(parsed, assets, seed, modelCache);
          blockInfoCache.set(blockKey, info);
        }

        // Process each resolved model part
        for (const part of info.parts) {
          const partX = part.x ?? 0;
          const partY = part.y ?? 0;
          const uvlock = Boolean(part.uvlock);

          for (const el of part.elements) {
            for (const [dir, face] of Object.entries(el.faces)) {
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
                  blockInfoCache
                )
              ) {
                continue;
              }

              // Determine pass for this face/texture
              const texInfo = getTextureUv ? getTextureUv(face.texture) : undefined;
              const facePass = classifyPass(
                parsed.name,
                texInfo?.hasAlpha ?? 'none',
                { properties: parsed.properties }
              );

              // 1. Get raw quad vertices and normal
              const rawQuad = getRawFaceQuad(dir, el.from, el.to);

              // 2. Element-level rotation
              const elRotatedQuad = rawQuad.vertices.map((v) =>
                rotateElementVertex(v[0], v[1], v[2], el.rotation)
              ) as [
                [number, number, number],
                [number, number, number],
                [number, number, number],
                [number, number, number]
              ];
              const elRotatedNormal = rotateElementNormal(
                rawQuad.normal[0],
                rawQuad.normal[1],
                rawQuad.normal[2],
                el.rotation
              );

              // 3. Model-part rotation around block center [0.5, 0.5, 0.5]
              const partRotatedQuad = elRotatedQuad.map((v) =>
                rotatePointPart(v[0], v[1], v[2], partX, partY)
              ) as [
                [number, number, number],
                [number, number, number],
                [number, number, number],
                [number, number, number]
              ];
              const finalNormal = rotateVectorPart(
                elRotatedNormal[0],
                elRotatedNormal[1],
                elRotatedNormal[2],
                partX,
                partY
              );

              // 4. Translate to chunk/block world coordinates
              const v0: [number, number, number] = [
                origin[0] + lx + partRotatedQuad[0][0],
                origin[1] + ly + partRotatedQuad[0][1],
                origin[2] + lz + partRotatedQuad[0][2],
              ];
              const v1: [number, number, number] = [
                origin[0] + lx + partRotatedQuad[1][0],
                origin[1] + ly + partRotatedQuad[1][1],
                origin[2] + lz + partRotatedQuad[1][2],
              ];
              const v2: [number, number, number] = [
                origin[0] + lx + partRotatedQuad[2][0],
                origin[1] + ly + partRotatedQuad[2][1],
                origin[2] + lz + partRotatedQuad[2][2],
              ];
              const v3: [number, number, number] = [
                origin[0] + lx + partRotatedQuad[3][0],
                origin[1] + ly + partRotatedQuad[3][1],
                origin[2] + lz + partRotatedQuad[3][2],
              ];

              // 5. UV Mapping & rotation
              const [u1, v1_uv, u2, v2_uv] = face.uv;
              const rawUvs: [number, number][] = [
                [u1, v1_uv],
                [u1, v2_uv],
                [u2, v2_uv],
                [u2, v1_uv],
              ];

              let faceRot = face.rotation ?? 0;
              if (uvlock) {
                const lowerDir = dir.toLowerCase();
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

              const mapUv = (raw: [number, number]): [number, number] => [
                atlasU0 + (raw[0] / 16) * du,
                atlasV0 + (raw[1] / 16) * dv,
              ];

              const uv0 = mapUv(rawUvs[shift % 4]!);
              const uv1 = mapUv(rawUvs[(shift + 1) % 4]!);
              const uv2 = mapUv(rawUvs[(shift + 2) % 4]!);
              const uv3 = mapUv(rawUvs[(shift + 3) % 4]!);

              // 6. Vertex Colors (Tint + Directional Shade)
              let baseR = 1.0;
              let baseG = 1.0;
              let baseB = 1.0;
              if (face.tintindex !== undefined && face.tintindex >= 0) {
                const tint = getTint(parsed.name, face.tintindex);
                if (tint) {
                  baseR = tint[0];
                  baseG = tint[1];
                  baseB = tint[2];
                }
              }

              let shade = 1.0;
              if (el.shade !== false) {
                const ax = Math.abs(finalNormal[0]);
                const ay = Math.abs(finalNormal[1]);
                const az = Math.abs(finalNormal[2]);
                if (ay >= ax && ay >= az) {
                  shade = finalNormal[1] > 0 ? 1.0 : 0.5;
                } else if (az >= ax && az >= ay) {
                  shade = 0.8;
                } else {
                  shade = 0.6;
                }
              }

              const finalColor: [number, number, number] = [
                baseR * shade,
                baseG * shade,
                baseB * shade,
              ];

              // Add face to builder for facePass
              passBuilders[facePass].addFace(
                v0,
                v1,
                v2,
                v3,
                finalNormal,
                uv0,
                uv1,
                uv2,
                uv3,
                finalColor
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
