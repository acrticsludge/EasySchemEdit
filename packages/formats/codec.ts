// packages/formats/codec.ts
// Pure TypeScript gzip compression and bounded streaming decompression via fflate.

import { gzipSync, Gunzip, Decompress } from 'fflate';
import { NbtSafetyError } from './errors.ts';
import type { NbtServices } from './nbts.ts';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
}

export function isZlib(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  const cmf = bytes[0]!;
  const flg = bytes[1]!;
  return (cmf & 0x0f) === 0x08 && (((cmf << 8) | flg) % 31 === 0);
}

export function gzipCompress(bytes: Uint8Array): Uint8Array {
  return gzipSync(bytes, { mtime: 0 });
}

export function gzipDecompressBounded(
  bytes: Uint8Array,
  maxDecompressedBytes: number = 64 * 1024 * 1024,
): Uint8Array {
  // If neither gzip nor zlib magic bytes are present, treat as uncompressed raw NBT passthrough
  if (!isGzip(bytes) && !isZlib(bytes)) {
    if (bytes.length > maxDecompressedBytes) {
      throw new NbtSafetyError(
        'DECOMPRESSION_LIMIT_EXCEEDED',
        `Uncompressed data exceeds maximum allowed size of ${maxDecompressedBytes} bytes (size: ${bytes.length})`,
      );
    }
    return bytes;
  }

  const outputChunks: Uint8Array[] = [];
  let totalDecompressed = 0;

  const onData = (chunk: Uint8Array, _final?: boolean) => {
    if (chunk.length === 0) return;
    if (totalDecompressed + chunk.length > maxDecompressedBytes) {
      throw new NbtSafetyError(
        'DECOMPRESSION_LIMIT_EXCEEDED',
        `Decompressed data exceeded maximum allowed size of ${maxDecompressedBytes} bytes (reached ${totalDecompressed + chunk.length})`,
      );
    }
    totalDecompressed += chunk.length;
    outputChunks.push(chunk);
  };

  const stream = isGzip(bytes) ? new Gunzip(onData) : new Decompress(onData);

  try {
    const INPUT_CHUNK_SIZE = 16384;
    for (let offset = 0; offset < bytes.length; offset += INPUT_CHUNK_SIZE) {
      const end = Math.min(offset + INPUT_CHUNK_SIZE, bytes.length);
      const isFinal = end >= bytes.length;
      stream.push(bytes.subarray(offset, end), isFinal);
    }
  } catch (err: unknown) {
    if (err instanceof NbtSafetyError) {
      throw err;
    }
    throw new NbtSafetyError(
      'NBT_DECOMPRESSION_FAILED',
      err instanceof Error ? err.message : 'Decompression failed',
    );
  }

  if (outputChunks.length === 1) {
    return outputChunks[0]!;
  }
  const result = new Uint8Array(totalDecompressed);
  let pos = 0;
  for (const c of outputChunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}

export const defaultCodecServices: NbtServices = {
  gzipCompress,
  gzipDecompress: gzipDecompressBounded,
};
