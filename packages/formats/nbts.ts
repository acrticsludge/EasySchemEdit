// Subspec B — Slice b-1: NBT Parser+Encoder with Gzip + Safety Limits
// DataView big-endian reads/writes. Gzip via injected service.
// Safety limits enforced incrementally inside the parser.
// Error contract: throw NbtSafetyError.

import type { NbtTag, NbtElementType } from '../domain/nbt.ts';
import { NbtSafetyError } from './errors.ts';

export type NbtServices = {
  gzipCompress(bytes: Uint8Array): Uint8Array;
  gzipDecompress(bytes: Uint8Array, maxDecompressedBytes: number): Uint8Array;
};

export type NbtSafetyLimits = {
  maxTagCount: number;
  maxStringBytes: number;
  maxListElements: number;
  maxArrayLength: number;
  maxNestingDepth: number;
  maxParseDurationMs: number;
};

export const DEFAULT_LIMITS: NbtSafetyLimits = {
  maxTagCount: 1_000_000,
  maxStringBytes: 1_024 * 1_024, // 1 MiB (Int16 length prefix caps at ~32 KiB in practice)
  maxListElements: 1_000_000,
  maxArrayLength: 64 * 1_024 * 1_024, // scales with maxDecompressedBytes
  maxNestingDepth: 512,
  maxParseDurationMs: 30_000,
};

// Tag type IDs
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

export function encodeNbt(tag: NbtTag, services: NbtServices): Uint8Array {
  const parts: Uint8Array[] = [];
  encodeTag(parts, tag);
  const raw = mergeUint8Arrays(parts);
  return services.gzipCompress(raw);
}

export function decodeNbtFromBytes(
  decompressed: Uint8Array,
  limits: Partial<NbtSafetyLimits> = {},
): NbtTag {
  const merged: NbtSafetyLimits = { ...DEFAULT_LIMITS, ...limits };
  const startTime = Date.now();
  let tagCount = 0;
  let offset = 0;
  const result = readTag(decompressed, offset, merged, startTime, tagCountRef(tagCount), 0);
  if (!result) {
    throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Failed to parse NBT data');
  }
  return result.tag;
}

export function decodeNbt(
  bytes: Uint8Array,
  services: NbtServices,
  limits: Partial<NbtSafetyLimits> = {},
): NbtTag {
  let decompressed: Uint8Array;
  try {
    decompressed = services.gzipDecompress(bytes, DEFAULT_LIMITS.maxArrayLength);
  } catch {
    throw new NbtSafetyError(
      'NBT_DECOMPRESSION_FAILED',
      'Gzip decompression failed',
    );
  }
  return decodeNbtFromBytes(decompressed, limits);
}

function tagCountRef(count: number): { value: number } {
  return { value: count };
}

function readTag(
  bytes: Uint8Array,
  offset: number,
  limits: NbtSafetyLimits,
  startTime: number,
  counter: { value: number },
  depth: number,
): { tag: NbtTag; nextOffset: number } | null {
  // Check duration limit incrementally
  if (Date.now() - startTime > limits.maxParseDurationMs) {
    throw new NbtSafetyError('NBT_PARSE_DURATION_EXCEEDED', 'Parsing took too long');
  }

  // Check nesting depth incrementally
  if (depth > limits.maxNestingDepth) {
    throw new NbtSafetyError('NBT_NESTING_DEPTH_EXCEEDED', 'Nesting depth exceeds limit');
  }

  if (offset >= bytes.length) return null;
  const typeId = bytes[offset];
  offset++;

  counter.value++;
  if (counter.value > limits.maxTagCount) {
    throw new NbtSafetyError('NBT_TAG_COUNT_EXCEEDED', 'Tag count exceeds limit');
  }

  // TAG_END at top level = empty compound
  if (typeId === TAG_END) {
    return { tag: { type: 'compound', value: new Map() }, nextOffset: offset };
  }

  switch (typeId) {
    case TAG_BYTE:
      return { tag: { type: 'byte', value: readInt8(bytes, offset) }, nextOffset: offset + 1 };
    case TAG_SHORT:
      return { tag: { type: 'short', value: readInt16BE(bytes, offset) }, nextOffset: offset + 2 };
    case TAG_INT:
      return { tag: { type: 'int', value: readInt32BE(bytes, offset) }, nextOffset: offset + 4 };
    case TAG_LONG:
      return { tag: { type: 'long', value: readInt64BE(bytes, offset) }, nextOffset: offset + 8 };
    case TAG_FLOAT:
      return { tag: { type: 'float', value: readFloat32BE(bytes, offset) }, nextOffset: offset + 4 };
    case TAG_DOUBLE:
      return { tag: { type: 'double', value: readFloat64BE(bytes, offset) }, nextOffset: offset + 8 };
    case TAG_BYTE_ARRAY: {
      const len = readInt32BE(bytes, offset);
      offset += 4;
      if (len > limits.maxArrayLength) {
        throw new NbtSafetyError('NBT_ARRAY_TOO_LONG', 'Byte array exceeds limit');
      }
      return {
        tag: { type: 'byteArray', value: bytes.slice(offset, offset + len) },
        nextOffset: offset + len,
      };
    }
    case TAG_STRING: {
      const len = readInt16BE(bytes, offset);
      offset += 2;
      const strBytes = bytes.slice(offset, offset + len);
      if (strBytes.length > limits.maxStringBytes) {
        throw new NbtSafetyError('NBT_STRING_TOO_LONG', 'String exceeds limit');
      }
      const str = decodeModifiedUtf8(strBytes);
      return { tag: { type: 'string', value: str }, nextOffset: offset + len };
    }
    case TAG_LIST: {
      const elemType = bytes[offset];
      offset += 1;
      const count = readInt32BE(bytes, offset);
      offset += 4;
      if (count > limits.maxListElements) {
        throw new NbtSafetyError('NBT_TAG_COUNT_EXCEEDED', 'List element count exceeds limit');
      }
      const elems: NbtTag[] = [];
      for (let i = 0; i < count; i++) {
        const elem = readTag(bytes, offset, limits, startTime, counter, depth + 1);
        if (!elem) return null;
        elems.push(elem.tag);
        offset = elem.nextOffset;
      }
      const elemTypeName = elemTypeIdToName(elemType) as NbtElementType;
      return { tag: { type: 'list', elementType: elemTypeName, value: elems }, nextOffset: offset };
    }
    case TAG_COMPOUND: {
      const map = new Map<string, NbtTag>();
      const seen = new Set<string>();
      while (true) {
        if (Date.now() - startTime > limits.maxParseDurationMs) {
          throw new NbtSafetyError('NBT_PARSE_DURATION_EXCEEDED', 'Parsing took too long');
        }
        if (offset >= bytes.length) return null;
        const entryType = bytes[offset];
        offset++;
        if (entryType === TAG_END) break;
        const nameLen = readInt16BE(bytes, offset);
        offset += 2;
        const name = decodeModifiedUtf8(bytes.slice(offset, offset + nameLen));
        offset += nameLen;

        // Duplicate required field check
        if (seen.has(name)) {
          throw new NbtSafetyError('NBT_DUPLICATE_REQUIRED_FIELD', `Duplicate field: ${name}`);
        }
        seen.add(name);

        const entry = readTag(bytes, offset, limits, startTime, counter, depth + 1);
        if (!entry) return null;
        map.set(name, entry.tag);
        offset = entry.nextOffset;
      }
      return { tag: { type: 'compound', value: map }, nextOffset: offset };
    }
    case TAG_INT_ARRAY: {
      const len = readInt32BE(bytes, offset);
      offset += 4;
      if (len > limits.maxArrayLength) {
        throw new NbtSafetyError('NBT_ARRAY_TOO_LONG', 'Int array exceeds limit');
      }
      const arr = new Int32Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = readInt32BE(bytes, offset);
        offset += 4;
      }
      return { tag: { type: 'intArray', value: arr }, nextOffset: offset };
    }
    case TAG_LONG_ARRAY: {
      const len = readInt32BE(bytes, offset);
      offset += 4;
      if (len > limits.maxArrayLength) {
        throw new NbtSafetyError('NBT_ARRAY_TOO_LONG', 'Long array exceeds limit');
      }
      const arr = new BigInt64Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = readInt64BE(bytes, offset);
        offset += 8;
      }
      return { tag: { type: 'longArray', value: arr }, nextOffset: offset };
    }
    default:
      return null;
  }
}

// ---------- Writing ----------

function encodeTag(parts: Uint8Array[], tag: NbtTag): void {
  switch (tag.type) {
    case 'byte':
      parts.push(new Uint8Array([TAG_BYTE]));
      parts.push(writeInt8(tag.value));
      break;
    case 'short':
      parts.push(new Uint8Array([TAG_SHORT]));
      parts.push(writeInt16BE(tag.value));
      break;
    case 'int':
      parts.push(new Uint8Array([TAG_INT]));
      parts.push(writeInt32BE(tag.value));
      break;
    case 'long':
      parts.push(new Uint8Array([TAG_LONG]));
      parts.push(writeInt64BE(tag.value));
      break;
    case 'float':
      parts.push(new Uint8Array([TAG_FLOAT]));
      parts.push(writeFloat32BE(tag.value));
      break;
    case 'double':
      parts.push(new Uint8Array([TAG_DOUBLE]));
      parts.push(writeFloat64BE(tag.value));
      break;
    case 'byteArray':
      parts.push(new Uint8Array([TAG_BYTE_ARRAY]));
      parts.push(writeInt32BE(tag.value.length));
      parts.push(tag.value);
      break;
    case 'string':
      parts.push(new Uint8Array([TAG_STRING]));
      const strBytes = encodeModifiedUtf8(tag.value);
      parts.push(writeInt16BE(strBytes.length));
      parts.push(strBytes);
      break;
    case 'list':
      parts.push(new Uint8Array([TAG_LIST]));
      parts.push(new Uint8Array([tagElementTypeId(tag.elementType)]));
      parts.push(writeInt32BE(tag.value.length));
      for (const elem of tag.value) {
        encodeTag(parts, elem);
      }
      break;
    case 'compound':
      parts.push(new Uint8Array([TAG_COMPOUND]));
      for (const [name, value] of tag.value) {
        parts.push(new Uint8Array([tagTypeId(value)]));
        const nameBytes = encodeModifiedUtf8(name);
        parts.push(writeInt16BE(nameBytes.length));
        parts.push(nameBytes);
        encodeTag(parts, value);
      }
      parts.push(new Uint8Array([TAG_END]));
      break;
    case 'intArray':
      parts.push(new Uint8Array([TAG_INT_ARRAY]));
      parts.push(writeInt32BE(tag.value.length));
      for (const v of tag.value) {
        parts.push(writeInt32BE(v));
      }
      break;
    case 'longArray':
      parts.push(new Uint8Array([TAG_LONG_ARRAY]));
      parts.push(writeInt32BE(tag.value.length));
      for (const v of tag.value) {
        parts.push(writeInt64BE(v));
      }
      break;
  }
}

function tagTypeId(tag: NbtTag): number {
  switch (tag.type) {
    case 'byte': return TAG_BYTE;
    case 'short': return TAG_SHORT;
    case 'int': return TAG_INT;
    case 'long': return TAG_LONG;
    case 'float': return TAG_FLOAT;
    case 'double': return TAG_DOUBLE;
    case 'byteArray': return TAG_BYTE_ARRAY;
    case 'string': return TAG_STRING;
    case 'list': return TAG_LIST;
    case 'compound': return TAG_COMPOUND;
    case 'intArray': return TAG_INT_ARRAY;
    case 'longArray': return TAG_LONG_ARRAY;
  }
}

function tagElementTypeId(type: string): number {
  switch (type) {
    case 'byte': return TAG_BYTE;
    case 'short': return TAG_SHORT;
    case 'int': return TAG_INT;
    case 'long': return TAG_LONG;
    case 'float': return TAG_FLOAT;
    case 'double': return TAG_DOUBLE;
    case 'byteArray': return TAG_BYTE_ARRAY;
    case 'string': return TAG_STRING;
    case 'list': return TAG_LIST;
    case 'compound': return TAG_COMPOUND;
    case 'intArray': return TAG_INT_ARRAY;
    case 'longArray': return TAG_LONG_ARRAY;
    default: return TAG_BYTE;
  }
}

function writeInt8(v: number): Uint8Array {
  const buf = new ArrayBuffer(1);
  new DataView(buf).setInt8(0, v);
  return new Uint8Array(buf);
}

function writeInt16BE(v: number): Uint8Array {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, v, false);
  return new Uint8Array(buf);
}

function writeInt32BE(v: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, v, false);
  return new Uint8Array(buf);
}

function writeInt64BE(v: bigint): Uint8Array {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setBigInt64(0, v, false);
  return new Uint8Array(buf);
}

function writeFloat32BE(v: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, v, false);
  return new Uint8Array(buf);
}

function writeFloat64BE(v: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, v, false);
  return new Uint8Array(buf);
}

function encodeModifiedUtf8(s: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0) {
      bytes.push(0xC0, 0x80);
    } else if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    } else if (code < 0xD800 || code >= 0xE000) {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    } else {
      const pair = s.codePointAt(i)!;
      i++;
      bytes.push(0xF0 | (pair >> 18), 0x80 | ((pair >> 12) & 0x3F), 0x80 | ((pair >> 6) & 0x3F), 0x80 | (pair & 0x3F));
    }
  }
  return new Uint8Array(bytes);
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

// ---------- Decoding helpers ----------

function readInt8(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 1).getInt8(0);
}

function readInt16BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getInt16(0, false);
}

function readInt32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
}

function readInt64BE(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigInt64(0, false);
}

function readFloat32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, false);
}

function readFloat64BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, false);
}

function decodeModifiedUtf8(bytes: Uint8Array): string {
  const chars: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 === 0xC0 && i + 1 < bytes.length && bytes[i + 1] === 0x80) {
      chars.push('\u0000');
      i += 2;
    } else if (b0 < 0x80) {
      chars.push(String.fromCharCode(b0));
      i += 1;
    } else if ((b0 & 0xE0) === 0xC0 && i + 1 < bytes.length) {
      const code = ((b0 & 0x1F) << 6) | (bytes[i + 1] & 0x3F);
      chars.push(String.fromCharCode(code));
      i += 2;
    } else if ((b0 & 0xF0) === 0xE0 && i + 2 < bytes.length) {
      const code = ((b0 & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F);
      chars.push(String.fromCharCode(code));
      i += 3;
    } else if ((b0 & 0xF8) === 0xF0 && i + 3 < bytes.length) {
      const code = ((b0 & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
      chars.push(String.fromCodePoint(code));
      i += 4;
    } else {
      chars.push(String.fromCharCode(b0));
      i += 1;
    }
  }
  return chars.join('');
}

function elemTypeIdToName(id: number): string {
  switch (id) {
    case TAG_BYTE: return 'byte';
    case TAG_SHORT: return 'short';
    case TAG_INT: return 'int';
    case TAG_LONG: return 'long';
    case TAG_FLOAT: return 'float';
    case TAG_DOUBLE: return 'double';
    case TAG_BYTE_ARRAY: return 'byteArray';
    case TAG_STRING: return 'string';
    case TAG_LIST: return 'list';
    case TAG_COMPOUND: return 'compound';
    case TAG_INT_ARRAY: return 'intArray';
    case TAG_LONG_ARRAY: return 'longArray';
    default: return 'byte';
  }
}
