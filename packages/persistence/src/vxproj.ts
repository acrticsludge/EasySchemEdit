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

function mergeUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    result.set(a, pos);
    pos += a.length;
  }
  return result;
}

function encodePaletteEntry(entry: BlockStateId): Uint8Array {
  const idBytes = new TextEncoder().encode(entry.id);
  const idLenBuf = new ArrayBuffer(2);
  new DataView(idLenBuf).setUint16(0, idBytes.length, true);

  const propKeys = Object.keys(entry.props ?? {}).sort();
  const propBufs: Uint8Array[] = [];
  for (const key of propKeys) {
    const keyBytes = new TextEncoder().encode(key);
    const valBytes = new TextEncoder().encode(entry.props[key]);
    const keyLenBuf = new ArrayBuffer(2);
    new DataView(keyLenBuf).setUint16(0, keyBytes.length, true);
    const valLenBuf = new ArrayBuffer(2);
    new DataView(valLenBuf).setUint16(0, valBytes.length, true);
    propBufs.push(
      new Uint8Array(keyLenBuf),
      keyBytes,
      new Uint8Array(valLenBuf),
      valBytes
    );
  }
  const propCountBuf = new ArrayBuffer(2);
  new DataView(propCountBuf).setUint16(0, propKeys.length, true);

  return mergeUint8Arrays([
    new Uint8Array(idLenBuf),
    idBytes,
    new Uint8Array(propCountBuf),
    ...propBufs,
  ]);
}

function decodePaletteEntry(bytes: Uint8Array, offset: number): { state: BlockStateId; nextOffset: number } {
  const idLen = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
  offset += 2;
  const id = new TextDecoder().decode(bytes.slice(offset, offset + idLen));
  offset += idLen;

  const propCount = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
  offset += 2;

  const props: Record<string, string> = {};
  for (let i = 0; i < propCount; i++) {
    const keyLen = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
    offset += 2;
    const key = new TextDecoder().decode(bytes.slice(offset, offset + keyLen));
    offset += keyLen;
    const valLen = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
    offset += 2;
    const val = new TextDecoder().decode(bytes.slice(offset, offset + valLen));
    offset += valLen;
    props[key] = val;
  }

  return { state: { id, props }, nextOffset: offset };
}

function encodeVoxelChunk(chunk: VoxelChunk): Uint8Array {
  const parts: Uint8Array[] = [];

  parts.push(CHUNK_MAGIC);

  const versionBuf = new ArrayBuffer(2);
  new DataView(versionBuf).setUint16(0, CHUNK_VERSION, true);
  parts.push(new Uint8Array(versionBuf));

  const [cx, cy, cz] = chunk.key.split('_').map(Number);
  for (const c of [cx, cy, cz]) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, c, true);
    parts.push(new Uint8Array(buf));
  }

  const paletteBuf = new ArrayBuffer(4);
  new DataView(paletteBuf).setUint32(0, chunk.palette.length, true);
  parts.push(new Uint8Array(paletteBuf));

  for (const entry of chunk.palette) {
    parts.push(encodePaletteEntry(entry));
  }

  const typeCode = chunk.indices instanceof Uint8Array ? TYPE_CODE_UINT8 : TYPE_CODE_UINT16;
  const typeBuf = new ArrayBuffer(4);
  new DataView(typeBuf).setUint32(0, typeCode, true);
  parts.push(new Uint8Array(typeBuf));

  const indexBytes = chunk.indices instanceof Uint8Array
    ? chunk.indices
    : new Uint8Array(chunk.indices.buffer, chunk.indices.byteOffset, chunk.indices.byteLength);
  parts.push(indexBytes);

  const payload = mergeUint8Arrays(parts);
  const hash = sha256Bytes(payload);
  return mergeUint8Arrays([payload, hash]);
}

function decodeVoxelChunk(bytes: Uint8Array): VoxelChunk {
  if (bytes.length < 32 + 4 + 2 + 12 + 4 + 4) {
    throw new Error('CHUNK_TRUNCATED: Binary chunk buffer too short');
  }

  const payload = bytes.slice(0, bytes.length - 32);
  const providedHash = bytes.slice(bytes.length - 32);
  const computedHash = sha256Bytes(payload);

  for (let i = 0; i < 32; i++) {
    if (providedHash[i] !== computedHash[i]) {
      throw new Error('CHUNK_CHECKSUM_MISMATCH: Trailing hash does not match chunk payload');
    }
  }

  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC[i]) {
      throw new Error('CHUNK_INVALID_MAGIC: Chunk magic header invalid');
    }
  }

  let offset = 4;
  const _version = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
  offset += 2;

  const cx = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;
  const cy = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;
  const cz = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;

  const paletteCount = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;

  const palette: BlockStateId[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const decoded = decodePaletteEntry(bytes, offset);
    palette.push(decoded.state);
    offset = decoded.nextOffset;
  }

  const typeCode = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;

  const indicesCount = 16 * 16 * 16;
  let indices: Uint8Array | Uint16Array;
  if (typeCode === TYPE_CODE_UINT8) {
    indices = new Uint8Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + indicesCount));
  } else {
    indices = new Uint16Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + indicesCount * 2));
  }

  return {
    key: `${cx}_${cy}_${cz}`,
    palette,
    indices,
    revision: 0,
  };
}

export function packVxprojArchive(
  project: Project,
  opts?: { assetProfile?: string }
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
  addEntry('project.json', new TextEncoder().encode(JSON.stringify(projectMetadata, null, 2)));

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
    addEntry(`placements/${p.id}/placement.json`, new TextEncoder().encode(JSON.stringify(placementMeta, null, 2)));

    const ancillaryMeta = {
      blockEntities: Array.from(p.ancillary.blockEntities?.entries() ?? []),
      entities: p.ancillary.entities ?? [],
      biomes: p.ancillary.biomes,
      pendingBlockTicks: p.ancillary.pendingBlockTicks ?? [],
      pendingFluidTicks: p.ancillary.pendingFluidTicks ?? [],
      unknownTags: Array.from(p.ancillary.unknownTags?.entries() ?? []),
    };
    addEntry(`placements/${p.id}/ancillary.json`, new TextEncoder().encode(JSON.stringify(ancillaryMeta, null, 2)));

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
  zipEntries[MANIFEST_NAME] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  return zipSync(zipEntries, { level: 6 });
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

  const manifest: VxprojManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
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
  const projectDoc = JSON.parse(new TextDecoder().decode(projectJsonBytes));

  const placements: Placement[] = [];
  const placementIds: string[] = projectDoc.placementIds || [];

  for (const pid of placementIds) {
    const pPath = `placements/${pid}/placement.json`;
    const ancPath = `placements/${pid}/ancillary.json`;

    if (!unzipped[pPath]) {
      throw new Error(`VXPROJ_MISSING_PLACEMENT: ${pPath} not found`);
    }
    const pMeta = JSON.parse(new TextDecoder().decode(unzipped[pPath]));
    const ancMeta = unzipped[ancPath]
      ? JSON.parse(new TextDecoder().decode(unzipped[ancPath]))
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

  const manifestJson = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
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

  const manifestText = new TextDecoder().decode(manifestEntry.data);
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
