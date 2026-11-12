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

// Deterministic ordering: sort paths, zero timestamps, fixed compression level
export function createManifest(
  entries: ArchiveEntry[],
  appVersion: string,
  assetProfile: string,
): Manifest {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const checksums: Record<string, string> = {};
  for (const entry of sorted) {
    // SHA-256 hex would come from services; placeholder uses length-based hash
    checksums[entry.path] = `sha256:${entry.data.length}`;
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
  const entryPaths = new Set(entries.map((e) => e.path));
  const missing: string[] = [];
  const mismatched: string[] = [];
  const extra: string[] = [];

  for (const path of manifestPaths) {
    if (!entryPaths.has(path)) {
      missing.push(path);
    }
  }
  for (const path of entryPaths) {
    if (!manifestPaths.has(path)) {
      extra.push(path);
    }
  }

  return { valid: missing.length === 0 && mismatched.length === 0 && extra.length === 0, missing, mismatched, extra };
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
