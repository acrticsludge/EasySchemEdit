import type { BlockStateId, Vec3i } from './types.ts';
import type { VoxelChunk } from './volume.ts';
import { CHUNK_SIZE, voxelIndex } from './volume.ts';

// ============================================================================
// Slice 9: Binary Chunk Codec
// ============================================================================

export type ChunkCodecServices = {
  hashSha256(bytes: Uint8Array): Promise<Uint8Array>;
};

const MAGIC = new Uint8Array([0x56, 0x4F, 0x4F, 0x58]); // "VOOX"
const VERSION = 1;
const TYPE_CODE_UINT8 = 1;
const TYPE_CODE_UINT16 = 2;

export function encodeChunk(
  chunk: VoxelChunk,
  services: ChunkCodecServices,
): Promise<Uint8Array> {
  return encodeChunkBytes(chunk, services);
}

async function encodeChunkBytes(
  chunk: VoxelChunk,
  services: ChunkCodecServices,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];

  // Magic
  parts.push(MAGIC);

  // Version (uint16 LE)
  const versionBuf = new ArrayBuffer(2);
  new DataView(versionBuf).setUint16(0, VERSION, true);
  parts.push(new Uint8Array(versionBuf));

  // Chunk coords (int32 LE each)
  const [cx, cy, cz] = chunk.key.split('_').map(Number) as [number, number, number];
  for (const c of [cx, cy, cz]) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, c, true);
    parts.push(new Uint8Array(buf));
  }

  // Palette entry count
  const paletteBuf = new ArrayBuffer(4);
  new DataView(paletteBuf).setUint32(0, chunk.palette.length, true);
  parts.push(new Uint8Array(paletteBuf));

  // Palette entries
  for (const entry of chunk.palette) {
    parts.push(encodePaletteEntry(entry));
  }

  // Index array type code
  const typeCode = chunk.indices instanceof Uint8Array ? TYPE_CODE_UINT8 : TYPE_CODE_UINT16;
  const typeBuf = new ArrayBuffer(4);
  new DataView(typeBuf).setUint32(0, typeCode, true);
  parts.push(new Uint8Array(typeBuf));

  // Index array data
  parts.push(chunk.indices as Uint8Array);

  const payload = mergeUint8Arrays(parts);

  // SHA-256 of payload
  const hash = await services.hashSha256(payload);

  // Final: payload + hash
  return mergeUint8Arrays([payload, hash]);
}

function encodePaletteEntry(entry: BlockStateId): Uint8Array {
  const idBytes = new TextEncoder().encode(entry.id);
  const idLenBuf = new ArrayBuffer(2);
  new DataView(idLenBuf).setUint16(0, idBytes.length, true);

  const propKeys = Object.keys(entry.props).sort();
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
      valBytes,
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

export async function decodeChunk(
  bytes: Uint8Array,
  services: ChunkCodecServices,
): Promise<{ chunk: VoxelChunk; valid: boolean }> {
  // Verify SHA-256: last 32 bytes
  const payload = bytes.slice(0, bytes.length - 32);
  const providedHash = bytes.slice(bytes.length - 32);
  const computedHash = await services.hashSha256(payload);
  const valid = arraysEqual(providedHash, computedHash);
  if (!valid) {
    return { chunk: null as unknown as VoxelChunk, valid: false };
  }

  let offset = 0;

  // Magic
  if (!arraysEqual(bytes.slice(0, 4), MAGIC)) {
    return { chunk: null as unknown as VoxelChunk, valid: false };
  }
  offset = 4;

  // Version
  const version = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
  offset += 2;

  // Chunk coords
  const cx = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;
  const cy = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;
  const cz = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
  offset += 4;

  // Palette count
  const paletteCount = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;

  // Palette entries
  const palette: BlockStateId[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const entry = decodePaletteEntry(bytes, offset);
    palette.push(entry.state);
    offset = entry.nextOffset;
  }

  // Type code
  const typeCode = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;

  // Index array
  const indices = typeCode === TYPE_CODE_UINT8
    ? new Uint8Array(bytes.buffer, bytes.byteOffset + offset, CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE)
    : new Uint16Array(bytes.buffer, bytes.byteOffset + offset, CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);

  const chunk: VoxelChunk = {
    key: `${cx}_${cy}_${cz}`,
    palette,
    indices: indices as unknown as Uint8Array | Uint16Array,
    revision: 0,
  };

  return { chunk, valid: true };
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

  return { state: { id, props: props as Readonly<Record<string, string>> }, nextOffset: offset };
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

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
