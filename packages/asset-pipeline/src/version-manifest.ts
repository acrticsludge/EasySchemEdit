// packages/asset-pipeline/src/version-manifest.ts
// Fetch Mojang version manifest, resolve 1.21.11 client JAR URL + SHA-1.
// SUBSPEC-H §4.5: Phase 0 must verify auto-download path end-to-end.

export const PINNED_1_21_11_CLIENT_JAR_SHA1 = 'ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd';
export const PINNED_1_21_11_CLIENT_JAR_SIZE = 31152600;
export const TARGET_MINECRAFT_VERSION = '1.21.11';

export const MINECRAFT_VERSION_MANIFEST_URL =
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export type FetchFn = typeof globalThis.fetch;
export type Sha1Fn = (data: Uint8Array) => Promise<string>;

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string; time: string; releaseTime: string }>;
}

export interface VersionJson {
  id: string;
  type: string;
  mainClass?: string;
  minimumLauncherVersion?: number;
  releaseTime?: string;
  time?: string;
  downloads: {
    client: { sha1: string; size: number; url: string };
    server?: { sha1: string; size: number; url: string };
    client_mappings?: { sha1: string; size: number; url: string };
  };
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string };
}

/**
 * Default SHA-1 hex calculator using Web Crypto API.
 */
export async function defaultSha1Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto subtle digest not available in this environment');
  }
  const cleanBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(cleanBuffer).set(data);
  const hashBuffer = await subtle.digest('SHA-1', cleanBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-1 hex string for given bytes, using optional injected sha1Fn.
 */
export async function sha1Hex(data: Uint8Array, sha1Fn?: Sha1Fn): Promise<string> {
  if (sha1Fn) {
    return sha1Fn(data);
  }
  return defaultSha1Hex(data);
}

/**
 * Fetch the version manifest and resolve the list of available versions.
 */
export async function fetchVersionManifest(options?: {
  fetchFn?: FetchFn;
  manifestUrl?: string;
}): Promise<VersionManifest> {
  const customFetch = options?.fetchFn ?? globalThis.fetch;
  const url = options?.manifestUrl ?? MINECRAFT_VERSION_MANIFEST_URL;
  const response = await customFetch(url);
  if (!response.ok) {
    throw new Error(`ASSET_MANIFEST_FETCH_FAILED: HTTP ${response.status}`);
  }
  return (await response.json()) as VersionManifest;
}

/**
 * Fetch a specific version's package JSON descriptor.
 */
export async function fetchVersionJson(
  versionUrl: string,
  options?: { fetchFn?: FetchFn },
): Promise<VersionJson> {
  const customFetch = options?.fetchFn ?? globalThis.fetch;
  const response = await customFetch(versionUrl);
  if (!response.ok) {
    throw new Error(`ASSET_VERSION_JSON_FETCH_FAILED: HTTP ${response.status}`);
  }
  return (await response.json()) as VersionJson;
}

/**
 * Resolve the target version's client JAR download URL, expected SHA-1, and byte size.
 */
export async function resolveClientJar(
  versionId: string = TARGET_MINECRAFT_VERSION,
  options?: {
    fetchFn?: FetchFn;
    manifestUrl?: string;
  },
): Promise<{
  version: string;
  clientJarUrl: string;
  clientJarSha1: string;
  size: number;
}> {
  const manifest = await fetchVersionManifest(options);
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry) {
    throw new Error(`ASSET_VERSION_NOT_FOUND: version ${versionId} not in manifest`);
  }

  const versionJson = await fetchVersionJson(entry.url, options);
  const client = versionJson.downloads.client;
  if (!client) {
    throw new Error(`ASSET_NO_CLIENT_JAR: no client download for ${versionId}`);
  }

  return {
    version: versionJson.id,
    clientJarUrl: client.url,
    clientJarSha1: client.sha1,
    size: client.size,
  };
}

/**
 * Verify downloaded JAR bytes against expected SHA-1 hex string.
 */
export async function verifyClientJarSha1(
  jarBytes: Uint8Array,
  expectedSha1: string,
  sha1Fn?: Sha1Fn,
): Promise<{ valid: boolean; actualSha1: string }> {
  const actualSha1 = await sha1Hex(jarBytes, sha1Fn);
  return {
    valid: actualSha1.toLowerCase() === expectedSha1.toLowerCase(),
    actualSha1,
  };
}
