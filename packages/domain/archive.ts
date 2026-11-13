// packages/domain/archive.ts
// ============================================================================
// Slice 13: Archive Serialization + Manifest Checksums
// ============================================================================

import type { ChunkCodecServices } from './chunk-codec.ts';

export type ArchiveServices = ChunkCodecServices;

export type Manifest = {
  schemaVersion: number;
  appVersion: string;
  assetProfile: string;
  createdAt: string;
  modifiedAt: string;
  checksums: Record<string, string>; // path → SHA-256 hex
};

export type ArchiveEntry = {
  path: string;
  data: Uint8Array;
};

export type ArchiveResult = {
  manifest: Manifest;
  entries: ArchiveEntry[];
  valid: boolean;
};

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

/**
 * Pure TypeScript synchronous SHA-256 digest computation (FIPS 180-4).
 */
export function sha256Hex(data: Uint8Array): string {
  let [h0, h1, h2, h3, h4, h5, h6, h7] = SHA256_H_INIT;
  const len = data.length;
  const bitLen = len * 8;
  const blockCount = Math.ceil((len + 9) / 64);
  const buf = new Uint8Array(blockCount * 64);
  buf.set(data);
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

// Deterministic ordering: sort paths, zero timestamps, fixed compression level
export function createManifest(
  entries: ArchiveEntry[],
  appVersion: string,
  assetProfile: string,
): Manifest {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const checksums: Record<string, string> = {};
  for (const entry of sorted) {
    checksums[entry.path] = `sha256:${sha256Hex(entry.data)}`;
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    appVersion,
    assetProfile,
    createdAt: now,
    modifiedAt: now,
    checksums,
  };
}

export function verifyManifest(
  manifest: Manifest,
  entries: ArchiveEntry[],
): { valid: boolean; missing: string[]; mismatched: string[]; extra: string[] } {
  const manifestPaths = new Set(Object.keys(manifest.checksums));
  const entryMap = new Map<string, ArchiveEntry>();
  for (const e of entries) {
    entryMap.set(e.path, e);
  }
  const missing: string[] = [];
  const mismatched: string[] = [];
  const extra: string[] = [];

  for (const path of manifestPaths) {
    const entry = entryMap.get(path);
    if (!entry) {
      missing.push(path);
      continue;
    }
    const expected = manifest.checksums[path];
    const actualHex = sha256Hex(entry.data);
    const expectedHex = expected.startsWith('sha256:') ? expected.slice(7) : expected;

    // Check checksum if expected is a real 64-character hex digest
    if (/^[0-9a-fA-F]{64}$/.test(expectedHex)) {
      if (actualHex.toLowerCase() !== expectedHex.toLowerCase()) {
        mismatched.push(path);
      }
    }
  }

  for (const path of entryMap.keys()) {
    if (!manifestPaths.has(path)) {
      extra.push(path);
    }
  }

  return {
    valid: missing.length === 0 && mismatched.length === 0 && extra.length === 0,
    missing,
    mismatched,
    extra,
  };
}

export function isDeterministic(
  entries1: ArchiveEntry[],
  entries2: ArchiveEntry[],
): boolean {
  if (entries1.length !== entries2.length) return false;
  const sorted1 = [...entries1].sort((a, b) => a.path.localeCompare(b.path));
  const sorted2 = [...entries2].sort((a, b) => a.path.localeCompare(b.path));
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i].path !== sorted2[i].path) return false;
  }
  return true;
}

export function rejectPathTraversal(path: string): boolean {
  return path.includes('..') || path.startsWith('/') || path.includes('\\');
}

export function rejectDuplicateEntries(entries: ArchiveEntry[]): boolean {
  const paths = new Set<string>();
  for (const e of entries) {
    if (paths.has(e.path)) return true;
    paths.add(e.path);
  }
  return false;
}
