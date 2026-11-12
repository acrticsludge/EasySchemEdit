// packages/asset-pipeline/src/version-manifest.ts
// Fetch Mojang version manifest, resolve 1.21.11 client JAR URL + SHA-1.
// SUBSPEC-H §4.5: Phase 0 must verify auto-download path end-to-end.

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string; time: string; releaseTime: string }>;
}

export interface VersionJson {
  id: string;
  type: string;
  mainClass: string;
  minimumLauncherVersion: number;
  releaseTime: string;
  time: string;
  downloads: {
    client: { sha1: string; size: number; url: string };
    server?: { sha1: string; size: number; url: string };
    client_mappings?: { sha1: string; size: number; url: string };
  };
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string };
}

export const MINECRAFT_VERSION_MANIFEST_URL =
  'https://launchermeta.mojang.com/mc/game/version_manifest.json';

export const TARGET_MINECRAFT_VERSION = '1.21.11';

// Fetch the version manifest and resolve the target version's entry.
export async function fetchVersionManifest(): Promise<VersionManifest> {
  const response = await fetch(MINECRAFT_VERSION_MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`ASSET_MANIFEST_FETCH_FAILED: HTTP ${response.status}`);
  }
  return (await response.json()) as VersionManifest;
}

export async function fetchVersionJson(versionUrl: string): Promise<VersionJson> {
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`ASSET_VERSION_JSON_FETCH_FAILED: HTTP ${response.status}`);
  }
  return (await response.json()) as VersionJson;
}

// Resolve the target version's client JAR URL and SHA-1 from the manifest.
export async function resolveClientJar(versionId: string = TARGET_MINECRAFT_VERSION): Promise<{
  version: string;
  clientJarUrl: string;
  clientJarSha1: string;
}> {
  const manifest = await fetchVersionManifest();
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry) {
    throw new Error(`ASSET_VERSION_NOT_FOUND: version ${versionId} not in manifest`);
  }

  const versionJson = await fetchVersionJson(entry.url);
  const client = versionJson.downloads.client;
  if (!client) {
    throw new Error(`ASSET_NO_CLIENT_JAR: no client download for ${versionId}`);
  }

  return {
    version: versionJson.id,
    clientJarUrl: client.url,
    clientJarSha1: client.sha1,
  };
}

// Compute SHA-1 of a Uint8Array (Web Crypto API).
export async function sha1Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Verify downloaded JAR bytes against expected SHA-1.
export async function verifyClientJarSha1(
  jarBytes: Uint8Array,
  expectedSha1: string,
): Promise<{ valid: boolean; actualSha1: string }> {
  const actualSha1 = await sha1Hex(jarBytes);
  return { valid: actualSha1.toLowerCase() === expectedSha1.toLowerCase(), actualSha1 };
}
