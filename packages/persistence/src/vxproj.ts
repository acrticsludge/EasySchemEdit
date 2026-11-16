// packages/persistence/src/vxproj.ts
// .vxproj archive format: ZIP archive with manifest + chunks + ancillary.
// manifest.checksums is single source of truth. (SUBSPEC-C §4.8, §2.3.10)

import { zipSync, unzipSync } from 'fflate';
import type {
  Project,
  Placement,
  ChunkedVoxelVolume,
  VoxelChunk,
  BlockStateId,
} from '@easyschemedit/domain';

type PlacementAncillaryData = Placement['ancillary'];

export interface VxprojManifest {
  version: number;
  projectId: string;
  createdAt: string;
  checksums: Record<string, string>;  // single source of truth
  chunks: Record<string, string>;     // chunkKey → checksum
  ancillary: Record<string, string>;  // ancillary type → checksum
}

export interface VxprojArchive {
  manifest: VxprojManifest;
  chunks: Map<string, ArrayBuffer>;
  ancillary: Map<string, ArrayBuffer>;
}

export interface VxprojServices {
  zip: (entries: { name: string; data: ArrayBuffer }[]) => Promise<ArrayBuffer>;
  unzip: (data: ArrayBuffer) => Promise<{ name: string; data: ArrayBuffer }[]>;
  sha256: (data: ArrayBuffer) => Promise<string>;
}

const MANIFEST_NAME = 'manifest.json';
const CHUNK_MAGIC = new Uint8Array([0x56, 0x4f, 0x4f, 0x58]); // "VOOX"
const CHUNK_VERSION = 1;
const TYPE_CODE_UINT8 = 1;
const TYPE_CODE_UINT16 = 2;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function generatePrimes(count: number): number[] {
  const result: number[] = [];
  for (let candidate = 2; result.length < count; candidate++) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor++) {
      if (candidate % divisor === 0) {
        prime = false;
        break;
      }
    }
    if (prime) result.push(candidate);
  }
  return result;
}

const FIRST_64_PRIMES = generatePrimes(64);
const SHA256_H_INIT = FIRST_64_PRIMES.slice(0, 8).map(
  (p) => Math.floor((Math.sqrt(p) % 1) * 0x100000000) >>> 0,
);
const SHA256_K = FIRST_64_PRIMES.map(
  (p) => Math.floor((Math.cbrt(p) % 1) * 0x100000000) >>> 0,
);

function rotr(v: number, n: number): number {
  return (v >>> n) | (v << (32 - n));
}

export function sha256Hex(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let [h0, h1, h2, h3, h4, h5, h6, h7] = SHA256_H_INIT;
  const len = bytes.length;
  const bitLen = len * 8;
  const blockCount = Math.ceil((len + 9) / 64);
  const buf = new Uint8Array(blockCount * 64);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 4, bitLen, false);

  const W = new Uint32Array(64);
  for (let b = 0; b < buf.length; b += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(b + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b1, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b1) ^ (a & c) ^ (b1 & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b1;
      b1 = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b1) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((w) => w.toString(16).padStart(8, '0'))
    .join('');
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  const hex = sha256Hex(data);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function sha256BytesAsync(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const cleanBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digestBuffer = await subtle.digest('SHA-256', cleanBuffer);
      return new Uint8Array(digestBuffer);
    } catch {
      // Fallback
    }
  }
  return sha256Bytes(bytes);
}

export async function sha256HexAsync(data: Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const cleanBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digestBuffer = await subtle.digest('SHA-256', cleanBuffer);
      const digestBytes = new Uint8Array(digestBuffer);
      let hex = '';
      for (let i = 0; i < digestBytes.length; i++) {
        hex += digestBytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    } catch {
      // Fallback
    }
  }
  return sha256Hex(bytes);
}

function encodePaletteEntry(entry: BlockStateId): Uint8Array {
  const idBytes = textEncoder.encode(entry.id);
  const propKeys = Object.keys(entry.props ?? {}).sort();
  const propCount = propKeys.length;
  const keyBytesList: Uint8Array[] = new Array(propCount);
  const valBytesList: Uint8Array[] = new Array(propCount);

  let propsByteLength = 0;
  for (let i = 0; i < propCount; i++) {
    const k = propKeys[i];
    const kBytes = textEncoder.encode(k);
    const vBytes = textEncoder.encode(entry.props[k]);
    keyBytesList[i] = kBytes;
    valBytesList[i] = vBytes;
    propsByteLength += 2 + kBytes.length + 2 + vBytes.length;
  }

  const totalLength = 2 + idBytes.length + 2 + propsByteLength;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  let offset = 0;
  view.setUint16(offset, idBytes.length, true);
  offset += 2;
  out.set(idBytes, offset);
  offset += idBytes.length;

  view.setUint16(offset, propCount, true);
  offset += 2;

  for (let i = 0; i < propCount; i++) {
    const kBytes = keyBytesList[i];
    const vBytes = valBytesList[i];

    view.setUint16(offset, kBytes.length, true);
    offset += 2;
    out.set(kBytes, offset);
    offset += kBytes.length;

    view.setUint16(offset, vBytes.length, true);
    offset += 2;
    out.set(vBytes, offset);
    offset += vBytes.length;
  }

  return out;
}

function decodePaletteEntry(
  bytes: Uint8Array,
  offset: number,
  view?: DataView
): { state: BlockStateId; nextOffset: number } {
  const v = view ?? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idLen = v.getUint16(offset, true);
  offset += 2;
  const id = textDecoder.decode(bytes.subarray(offset, offset + idLen));
  offset += idLen;

  const propCount = v.getUint16(offset, true);
  offset += 2;

  const props: Record<string, string> = {};
  for (let i = 0; i < propCount; i++) {
    const keyLen = v.getUint16(offset, true);
    offset += 2;
    const key = textDecoder.decode(bytes.subarray(offset, offset + keyLen));
    offset += keyLen;
    const valLen = v.getUint16(offset, true);
    offset += 2;
    const val = textDecoder.decode(bytes.subarray(offset, offset + valLen));
    offset += valLen;
    props[key] = val;
  }

  return { state: { id, props }, nextOffset: offset };
}

function buildChunkPayload(chunk: VoxelChunk): { payloadWithTrailingSpace: Uint8Array; payloadLength: number } {
  const encodedPalette: Uint8Array[] = new Array(chunk.palette.length);
  let paletteTotalBytes = 0;
  for (let i = 0; i < chunk.palette.length; i++) {
    const entryBytes = encodePaletteEntry(chunk.palette[i]);
    encodedPalette[i] = entryBytes;
    paletteTotalBytes += entryBytes.length;
  }

  const [cx, cy, cz] = chunk.key.split('_').map(Number);
  const typeCode = chunk.indices instanceof Uint8Array ? TYPE_CODE_UINT8 : TYPE_CODE_UINT16;
  const indexByteLength = chunk.indices.byteLength;

  const headerLength = 4 + 2 + 12 + 4;
  const payloadLength = headerLength + paletteTotalBytes + 4 + indexByteLength;
  const out = new Uint8Array(payloadLength + 32);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  out.set(CHUNK_MAGIC, 0);

  let offset = 4;
  view.setUint16(offset, CHUNK_VERSION, true);
  offset += 2;

  view.setInt32(offset, cx, true);
  offset += 4;
  view.setInt32(offset, cy, true);
  offset += 4;
  view.setInt32(offset, cz, true);
  offset += 4;

  view.setUint32(offset, chunk.palette.length, true);
  offset += 4;

  for (let i = 0; i < encodedPalette.length; i++) {
    out.set(encodedPalette[i], offset);
    offset += encodedPalette[i].length;
  }

  view.setUint32(offset, typeCode, true);
  offset += 4;

  const indexBytes = chunk.indices instanceof Uint8Array
    ? chunk.indices
    : new Uint8Array(chunk.indices.buffer, chunk.indices.byteOffset, chunk.indices.byteLength);
  out.set(indexBytes, offset);
  offset += indexBytes.length;

  return { payloadWithTrailingSpace: out, payloadLength };
}

function encodeVoxelChunk(chunk: VoxelChunk): Uint8Array {
  const { payloadWithTrailingSpace, payloadLength } = buildChunkPayload(chunk);
  const payload = payloadWithTrailingSpace.subarray(0, payloadLength);
  const hash = sha256Bytes(payload);
  payloadWithTrailingSpace.set(hash, payloadLength);
  return payloadWithTrailingSpace;
}

async function encodeVoxelChunkAsync(chunk: VoxelChunk): Promise<Uint8Array> {
  const { payloadWithTrailingSpace, payloadLength } = buildChunkPayload(chunk);
  const payload = payloadWithTrailingSpace.subarray(0, payloadLength);
  const hash = await sha256BytesAsync(payload);
  payloadWithTrailingSpace.set(hash, payloadLength);
  return payloadWithTrailingSpace;
}

function parseChunkPayload(bytes: Uint8Array): VoxelChunk {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 4;
  const _version = view.getUint16(offset, true);
  offset += 2;

  const cx = view.getInt32(offset, true);
  offset += 4;
  const cy = view.getInt32(offset, true);
  offset += 4;
  const cz = view.getInt32(offset, true);
  offset += 4;

  const paletteCount = view.getUint32(offset, true);
  offset += 4;

  const palette: BlockStateId[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const decoded = decodePaletteEntry(bytes, offset, view);
    palette.push(decoded.state);
    offset = decoded.nextOffset;
  }

  const typeCode = view.getUint32(offset, true);
  offset += 4;

  const indicesCount = 16 * 16 * 16;
  let indices: Uint8Array | Uint16Array;
  if (typeCode === TYPE_CODE_UINT8) {
    indices = bytes.slice(offset, offset + indicesCount);
  } else {
    const indicesSlice = bytes.subarray(offset, offset + indicesCount * 2);
    const u16 = new Uint16Array(indicesCount);
    new Uint8Array(u16.buffer).set(indicesSlice);
    indices = u16;
  }

  return {
    key: `${cx}_${cy}_${cz}`,
    palette,
    indices,
    revision: 0,
  };
}

function decodeVoxelChunk(bytes: Uint8Array): VoxelChunk {
  if (bytes.length < 32 + 4 + 2 + 12 + 4 + 4) {
    throw new Error('CHUNK_TRUNCATED: Binary chunk buffer too short');
  }

  const payload = bytes.subarray(0, bytes.length - 32);
  const computedHash = sha256Bytes(payload);
  const hashOffset = bytes.length - 32;

  for (let i = 0; i < 32; i++) {
    if (bytes[hashOffset + i] !== computedHash[i]) {
      throw new Error('CHUNK_CHECKSUM_MISMATCH: Trailing hash does not match chunk payload');
    }
  }

  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC[i]) {
      throw new Error('CHUNK_INVALID_MAGIC: Chunk magic header invalid');
    }
  }

  return parseChunkPayload(bytes);
}

async function decodeVoxelChunkAsync(bytes: Uint8Array): Promise<VoxelChunk> {
  if (bytes.length < 32 + 4 + 2 + 12 + 4 + 4) {
    throw new Error('CHUNK_TRUNCATED: Binary chunk buffer too short');
  }

  const payload = bytes.subarray(0, bytes.length - 32);
  const computedHash = await sha256BytesAsync(payload);
  const hashOffset = bytes.length - 32;

  for (let i = 0; i < 32; i++) {
    if (bytes[hashOffset + i] !== computedHash[i]) {
      throw new Error('CHUNK_CHECKSUM_MISMATCH: Trailing hash does not match chunk payload');
    }
  }

  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC[i]) {
      throw new Error('CHUNK_INVALID_MAGIC: Chunk magic header invalid');
    }
  }

  return parseChunkPayload(bytes);
}

export function packVxprojArchive(
  project: Project,
  opts?: { assetProfile?: string; compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};

  function addEntry(path: string, data: Uint8Array) {
    const hash = sha256Hex(data);
    checksums[path] = hash;
    zipEntries[path] = data;
  }

  const projectMetadata = {
    schemaVersion: project.schemaVersion ?? 1,
    id: project.id,
    name: project.name,
    overlapPolicy: project.overlapPolicy,
    conflictOverlay: project.conflictOverlay,
    metadata: project.metadata,
    revision: project.revision,
    importGroups: project.importGroups ?? [],
    placementIds: project.placements.map((p) => p.id),
  };
  addEntry('project.json', textEncoder.encode(JSON.stringify(projectMetadata, null, 2)));

  for (const p of project.placements) {
    const placementMeta = {
      id: p.id,
      name: p.name,
      transform: p.transform,
      origin: p.origin,
      visible: p.visible,
      locked: p.locked,
      lockReason: p.lockReason,
      color: p.color,
      createdAt: p.createdAt,
      source: p.source,
      eraseTombstones: Array.from(p.eraseTombstones ?? []),
      volume: {
        bounds: p.volume.bounds,
        chunkSize: p.volume.chunkSize,
        nonAirCount: p.volume.nonAirCount,
        paletteCardinality: p.volume.paletteCardinality,
        chunkKeys: Array.from(p.volume.chunks.keys()),
      },
    };
    addEntry(`placements/${p.id}/placement.json`, textEncoder.encode(JSON.stringify(placementMeta, null, 2)));

    const ancillaryMeta = {
      blockEntities: Array.from(p.ancillary.blockEntities?.entries() ?? []),
      entities: p.ancillary.entities ?? [],
      biomes: p.ancillary.biomes,
      pendingBlockTicks: p.ancillary.pendingBlockTicks ?? [],
      pendingFluidTicks: p.ancillary.pendingFluidTicks ?? [],
      unknownTags: Array.from(p.ancillary.unknownTags?.entries() ?? []),
    };
    addEntry(`placements/${p.id}/ancillary.json`, textEncoder.encode(JSON.stringify(ancillaryMeta, null, 2)));

    for (const [chunkKey, chunk] of p.volume.chunks) {
      const chunkBytes = encodeVoxelChunk(chunk);
      addEntry(`placements/${p.id}/chunks/${chunkKey}.bin`, chunkBytes);
    }
  }

  const manifest: VxprojManifest = {
    version: 1,
    projectId: project.id,
    createdAt: project.metadata?.createdAt || new Date().toISOString(),
    checksums,
    chunks: {},
    ancillary: {},
  };
  zipEntries[MANIFEST_NAME] = textEncoder.encode(JSON.stringify(manifest, null, 2));

  return zipSync(zipEntries, { level: opts?.compressionLevel ?? 6 });
}

async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const size = Math.max(1, batchSize);
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map((item) => fn(item)));
    for (const res of batchResults) {
      results.push(res);
    }
  }
  return results;
}

export async function packVxprojArchiveAsync(
  project: Project,
  opts?: { assetProfile?: string; compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
): Promise<Uint8Array> {
  const zipEntries: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};

  const projectMetadata = {
    schemaVersion: project.schemaVersion ?? 1,
    id: project.id,
    name: project.name,
    overlapPolicy: project.overlapPolicy,
    conflictOverlay: project.conflictOverlay,
    metadata: project.metadata,
    revision: project.revision,
    importGroups: project.importGroups ?? [],
    placementIds: project.placements.map((p) => p.id),
  };
  const projectBytes = textEncoder.encode(JSON.stringify(projectMetadata, null, 2));

  interface RawEntry {
    path: string;
    data: Uint8Array;
  }
  const rawEntries: RawEntry[] = [
    { path: 'project.json', data: projectBytes },
  ];

  interface ChunkTask {
    path: string;
    chunk: VoxelChunk;
  }
  const chunkTasks: ChunkTask[] = [];

  for (const p of project.placements) {
    const placementMeta = {
      id: p.id,
      name: p.name,
      transform: p.transform,
      origin: p.origin,
      visible: p.visible,
      locked: p.locked,
      lockReason: p.lockReason,
      color: p.color,
      createdAt: p.createdAt,
      source: p.source,
      eraseTombstones: Array.from(p.eraseTombstones ?? []),
      volume: {
        bounds: p.volume.bounds,
        chunkSize: p.volume.chunkSize,
        nonAirCount: p.volume.nonAirCount,
        paletteCardinality: p.volume.paletteCardinality,
        chunkKeys: Array.from(p.volume.chunks.keys()),
      },
    };
    rawEntries.push({
      path: `placements/${p.id}/placement.json`,
      data: textEncoder.encode(JSON.stringify(placementMeta, null, 2)),
    });

    const ancillaryMeta = {
      blockEntities: Array.from(p.ancillary.blockEntities?.entries() ?? []),
      entities: p.ancillary.entities ?? [],
      biomes: p.ancillary.biomes,
      pendingBlockTicks: p.ancillary.pendingBlockTicks ?? [],
      pendingFluidTicks: p.ancillary.pendingFluidTicks ?? [],
      unknownTags: Array.from(p.ancillary.unknownTags?.entries() ?? []),
    };
    rawEntries.push({
      path: `placements/${p.id}/ancillary.json`,
      data: textEncoder.encode(JSON.stringify(ancillaryMeta, null, 2)),
    });

    for (const [chunkKey, chunk] of p.volume.chunks) {
      chunkTasks.push({
        path: `placements/${p.id}/chunks/${chunkKey}.bin`,
        chunk,
      });
    }
  }

  const encodedChunks = await mapInBatches(
    chunkTasks,
    64,
    async (task) => {
      const chunkBytes = await encodeVoxelChunkAsync(task.chunk);
      return { path: task.path, data: chunkBytes };
    }
  );

  const allEntries: RawEntry[] = rawEntries.concat(encodedChunks);

  await mapInBatches(
    allEntries,
    64,
    async (entry) => {
      const hash = await sha256HexAsync(entry.data);
      checksums[entry.path] = hash;
      zipEntries[entry.path] = entry.data;
    }
  );

  const manifest: VxprojManifest = {
    version: 1,
    projectId: project.id,
    createdAt: project.metadata?.createdAt || new Date().toISOString(),
    checksums,
    chunks: {},
    ancillary: {},
  };
  zipEntries[MANIFEST_NAME] = textEncoder.encode(JSON.stringify(manifest, null, 2));

  return zipSync(zipEntries, { level: opts?.compressionLevel ?? 1 });
}

export function unpackVxprojArchive(zipBytes: Uint8Array): Project {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBytes);
  } catch (err) {
    throw new Error(`VXPROJ_CORRUPT_ARCHIVE: Failed to unzip archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const manifestBytes = unzipped[MANIFEST_NAME];
  if (!manifestBytes) {
    throw new Error('VXPROJ_MISSING_MANIFEST: manifest.json not found in archive');
  }

  const manifest: VxprojManifest = JSON.parse(textDecoder.decode(manifestBytes));
  delete unzipped[MANIFEST_NAME];
  if (!manifest.checksums || typeof manifest.checksums !== 'object') {
    throw new Error('VXPROJ_INVALID_MANIFEST: Manifest missing checksums object');
  }

  for (const [path, data] of Object.entries(unzipped)) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      throw new Error(`VXPROJ_PATH_TRAVERSAL: Illegal file path in archive: ${path}`);
    }
    if (path === MANIFEST_NAME) continue;

    const expectedChecksum = manifest.checksums[path];
    if (!expectedChecksum) {
      throw new Error(`VXPROJ_UNEXPECTED_ENTRY: File ${path} present in archive but not in manifest`);
    }

    const actualChecksum = sha256Hex(data);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`VXPROJ_CHECKSUM_MISMATCH: Checksum mismatch for ${path}: expected ${expectedChecksum}, got ${actualChecksum}`);
    }
  }

  for (const path of Object.keys(manifest.checksums)) {
    if (!unzipped[path]) {
      throw new Error(`VXPROJ_MISSING_ENTRY: File ${path} listed in manifest but missing from archive`);
    }
  }

  const projectJsonBytes = unzipped['project.json'];
  if (!projectJsonBytes) {
    throw new Error('VXPROJ_MISSING_PROJECT: project.json not found in archive');
  }
  const projectDoc = JSON.parse(textDecoder.decode(projectJsonBytes));

  const placements: Placement[] = [];
  const placementIds: string[] = projectDoc.placementIds || [];

  for (const pid of placementIds) {
    const pPath = `placements/${pid}/placement.json`;
    const ancPath = `placements/${pid}/ancillary.json`;

    if (!unzipped[pPath]) {
      throw new Error(`VXPROJ_MISSING_PLACEMENT: ${pPath} not found`);
    }
    const pMeta = JSON.parse(textDecoder.decode(unzipped[pPath]));
    const ancMeta = unzipped[ancPath]
      ? JSON.parse(textDecoder.decode(unzipped[ancPath]))
      : { blockEntities: [], entities: [], unknownTags: [] };

    const chunks = new Map<string, VoxelChunk>();
    const chunkKeys: string[] = pMeta.volume?.chunkKeys || [];
    for (const chunkKey of chunkKeys) {
      const cPath = `placements/${pid}/chunks/${chunkKey}.bin`;
      const cBytes = unzipped[cPath];
      if (!cBytes) {
        throw new Error(`VXPROJ_MISSING_CHUNK: Chunk ${cPath} not found`);
      }
      const chunk = decodeVoxelChunk(cBytes);
      chunks.set(chunkKey, chunk);
    }

    const volume: ChunkedVoxelVolume = {
      bounds: pMeta.volume.bounds,
      chunkSize: pMeta.volume.chunkSize || 16,
      chunks,
      nonAirCount: pMeta.volume.nonAirCount ?? 0,
      paletteCardinality: pMeta.volume.paletteCardinality ?? 0,
    };

    const ancillary: PlacementAncillaryData = {
      blockEntities: new Map(ancMeta.blockEntities ?? []),
      entities: ancMeta.entities ?? [],
      biomes: ancMeta.biomes,
      pendingBlockTicks: ancMeta.pendingBlockTicks ?? [],
      pendingFluidTicks: ancMeta.pendingFluidTicks ?? [],
      unknownTags: new Map(ancMeta.unknownTags ?? []),
    };

    const placement: Placement = {
      id: pMeta.id,
      name: pMeta.name,
      volume,
      transform: pMeta.transform,
      origin: pMeta.origin,
      ancillary,
      visible: pMeta.visible ?? true,
      locked: pMeta.locked ?? false,
      lockReason: pMeta.lockReason,
      color: pMeta.color,
      createdAt: pMeta.createdAt,
      source: pMeta.source,
      eraseTombstones: new Set(pMeta.eraseTombstones ?? []),
    };

    placements.push(placement);
  }

  return {
    schemaVersion: projectDoc.schemaVersion ?? 1,
    id: projectDoc.id,
    name: projectDoc.name,
    placements,
    importGroups: projectDoc.importGroups ?? [],
    overlapPolicy: projectDoc.overlapPolicy ?? 'top-wins',
    conflictOverlay: projectDoc.conflictOverlay ?? 'off',
    metadata: projectDoc.metadata ?? { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: projectDoc.revision ?? 0,
  };
}

export async function unpackVxprojArchiveAsync(zipBytes: Uint8Array): Promise<Project> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBytes);
  } catch (err) {
    throw new Error(`VXPROJ_CORRUPT_ARCHIVE: Failed to unzip archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const manifestBytes = unzipped[MANIFEST_NAME];
  if (!manifestBytes) {
    throw new Error('VXPROJ_MISSING_MANIFEST: manifest.json not found in archive');
  }

  const manifest: VxprojManifest = JSON.parse(textDecoder.decode(manifestBytes));
  delete unzipped[MANIFEST_NAME];
  if (!manifest.checksums || typeof manifest.checksums !== 'object') {
    throw new Error('VXPROJ_INVALID_MANIFEST: Manifest missing checksums object');
  }

  for (const [path] of Object.entries(unzipped)) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
      throw new Error(`VXPROJ_PATH_TRAVERSAL: Illegal file path in archive: ${path}`);
    }
    if (path === MANIFEST_NAME) continue;

    const expectedChecksum = manifest.checksums[path];
    if (!expectedChecksum) {
      throw new Error(`VXPROJ_UNEXPECTED_ENTRY: File ${path} present in archive but not in manifest`);
    }
  }

  for (const path of Object.keys(manifest.checksums)) {
    if (!unzipped[path]) {
      throw new Error(`VXPROJ_MISSING_ENTRY: File ${path} listed in manifest but missing from archive`);
    }
  }

  // Verify all entry checksums concurrently via mapInBatches + sha256HexAsync
  const entriesToCheck = Object.entries(unzipped).filter(([path]) => path !== MANIFEST_NAME);
  await mapInBatches(
    entriesToCheck,
    64,
    async ([path, data]) => {
      const expectedChecksum = manifest.checksums[path];
      const actualChecksum = await sha256HexAsync(data);
      if (actualChecksum !== expectedChecksum) {
        throw new Error(`VXPROJ_CHECKSUM_MISMATCH: Checksum mismatch for ${path}: expected ${expectedChecksum}, got ${actualChecksum}`);
      }
    }
  );

  const projectJsonBytes = unzipped['project.json'];
  if (!projectJsonBytes) {
    throw new Error('VXPROJ_MISSING_PROJECT: project.json not found in archive');
  }
  const projectDoc = JSON.parse(textDecoder.decode(projectJsonBytes));
  delete unzipped['project.json'];

  const placements: Placement[] = [];
  const placementIds: string[] = projectDoc.placementIds || [];

  for (const pid of placementIds) {
    const pPath = `placements/${pid}/placement.json`;
    const ancPath = `placements/${pid}/ancillary.json`;

    if (!unzipped[pPath]) {
      throw new Error(`VXPROJ_MISSING_PLACEMENT: ${pPath} not found`);
    }
    const pMeta = JSON.parse(textDecoder.decode(unzipped[pPath]));
    delete unzipped[pPath];
    const ancMeta = unzipped[ancPath]
      ? JSON.parse(textDecoder.decode(unzipped[ancPath]))
      : { blockEntities: [], entities: [], unknownTags: [] };
    delete unzipped[ancPath];

    const chunkKeys: string[] = pMeta.volume?.chunkKeys || [];
    for (const chunkKey of chunkKeys) {
      const cPath = `placements/${pid}/chunks/${chunkKey}.bin`;
      if (!unzipped[cPath]) {
        throw new Error(`VXPROJ_MISSING_CHUNK: Chunk ${cPath} not found`);
      }
    }

    const decodedChunks = await Promise.all(
      chunkKeys.map(async (chunkKey) => {
        const cPath = `placements/${pid}/chunks/${chunkKey}.bin`;
        const cBytes = unzipped[cPath];
        delete unzipped[cPath];
        const chunk = await decodeVoxelChunkAsync(cBytes);
        return { chunkKey, chunk };
      })
    );

    const chunks = new Map<string, VoxelChunk>();
    for (const { chunkKey, chunk } of decodedChunks) {
      chunks.set(chunkKey, chunk);
    }

    const volume: ChunkedVoxelVolume = {
      bounds: pMeta.volume.bounds,
      chunkSize: pMeta.volume.chunkSize || 16,
      chunks,
      nonAirCount: pMeta.volume.nonAirCount ?? 0,
      paletteCardinality: pMeta.volume.paletteCardinality ?? 0,
    };

    const ancillary: PlacementAncillaryData = {
      blockEntities: new Map(ancMeta.blockEntities ?? []),
      entities: ancMeta.entities ?? [],
      biomes: ancMeta.biomes,
      pendingBlockTicks: ancMeta.pendingBlockTicks ?? [],
      pendingFluidTicks: ancMeta.pendingFluidTicks ?? [],
      unknownTags: new Map(ancMeta.unknownTags ?? []),
    };

    const placement: Placement = {
      id: pMeta.id,
      name: pMeta.name,
      volume,
      transform: pMeta.transform,
      origin: pMeta.origin,
      ancillary,
      visible: pMeta.visible ?? true,
      locked: pMeta.locked ?? false,
      lockReason: pMeta.lockReason,
      color: pMeta.color,
      createdAt: pMeta.createdAt,
      source: pMeta.source,
      eraseTombstones: new Set(pMeta.eraseTombstones ?? []),
    };

    placements.push(placement);
  }

  return {
    schemaVersion: projectDoc.schemaVersion ?? 1,
    id: projectDoc.id,
    name: projectDoc.name,
    placements,
    importGroups: projectDoc.importGroups ?? [],
    overlapPolicy: projectDoc.overlapPolicy ?? 'top-wins',
    conflictOverlay: projectDoc.conflictOverlay ?? 'off',
    metadata: projectDoc.metadata ?? { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: projectDoc.revision ?? 0,
  };
}

export async function serializeVxproj(
  archive: VxprojArchive,
  services: VxprojServices
): Promise<ArrayBuffer> {
  const entries: { name: string; data: ArrayBuffer }[] = [];

  const manifest: VxprojManifest = {
    version: 1,
    projectId: archive.manifest.projectId,
    createdAt: archive.manifest.createdAt,
    checksums: {},
    chunks: {},
    ancillary: {},
  };

  for (const [chunkKey, data] of archive.chunks) {
    const checksum = await services.sha256(data);
    manifest.checksums[chunkKey] = checksum;
    manifest.chunks[chunkKey] = checksum;
    entries.push({ name: `chunks/${chunkKey}`, data });
  }

  for (const [ancillaryType, data] of archive.ancillary) {
    const checksum = await services.sha256(data);
    manifest.checksums[ancillaryType] = checksum;
    manifest.ancillary[ancillaryType] = checksum;
    entries.push({ name: `ancillary/${ancillaryType}`, data });
  }

  const manifestJson = textEncoder.encode(JSON.stringify(manifest, null, 2));
  entries.push({ name: MANIFEST_NAME, data: manifestJson.buffer });

  return services.zip(entries);
}

export async function deserializeVxproj(
  data: ArrayBuffer,
  services: VxprojServices
): Promise<VxprojArchive> {
  const entries = await services.unzip(data);

  const manifestEntry = entries.find((e) => e.name === MANIFEST_NAME);
  if (!manifestEntry) {
    throw new Error('VXPROJ_MISSING_MANIFEST: manifest.json not found in archive');
  }

  const manifestText = textDecoder.decode(manifestEntry.data);
  const manifest: VxprojManifest = JSON.parse(manifestText);

  const entryMap = new Map<string, ArrayBuffer>();
  for (const entry of entries) {
    entryMap.set(entry.name, entry.data);
  }

  const chunks: Map<string, ArrayBuffer> = new Map();
  for (const [chunkKey, expectedChecksum] of Object.entries(manifest.chunks)) {
    const entryName = `chunks/${chunkKey}`;
    const data = entryMap.get(entryName);
    if (!data) {
      throw new Error(`VXPROJ_MISSING_CHUNK: ${entryName} not found in archive`);
    }
    const actualChecksum = await services.sha256(data);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(
        `VXPROJ_CHECKSUM_MISMATCH: ${entryName} expected ${expectedChecksum}, got ${actualChecksum}`
      );
    }
    chunks.set(chunkKey, data);
  }

  const ancillary: Map<string, ArrayBuffer> = new Map();
  for (const [ancillaryType, expectedChecksum] of Object.entries(manifest.ancillary)) {
    const entryName = `ancillary/${ancillaryType}`;
    const data = entryMap.get(entryName);
    if (!data) {
      throw new Error(`VXPROJ_MISSING_ANCILLARY: ${entryName} not found in archive`);
    }
    const actualChecksum = await services.sha256(data);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(
        `VXPROJ_CHECKSUM_MISMATCH: ${entryName} expected ${expectedChecksum}, got ${actualChecksum}`
      );
    }
    ancillary.set(ancillaryType, data);
  }

  return {
    manifest,
    chunks,
    ancillary,
  };
}
