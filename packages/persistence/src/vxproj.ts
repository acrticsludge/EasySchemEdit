// packages/persistence/src/vxproj.ts
// .vxproj archive format: ZIP archive with manifest + chunks + ancillary.
// manifest.checksums is single source of truth. (SUBSPEC-C §4.8, §2.3.10)

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

export async function serializeVxproj(
  archive: VxprojArchive,
  services: VxprojServices
): Promise<ArrayBuffer> {
  const entries: { name: string; data: ArrayBuffer }[] = [];

  // Build manifest with checksums
  const manifest: VxprojManifest = {
    version: 1,
    projectId: archive.manifest.projectId,
    createdAt: archive.manifest.createdAt,
    checksums: {},
    chunks: {},
    ancillary: {},
  };

  // Add chunk entries
  for (const [chunkKey, data] of archive.chunks) {
    const checksum = await services.sha256(data);
    manifest.checksums[chunkKey] = checksum;
    manifest.chunks[chunkKey] = checksum;
    entries.push({ name: `chunks/${chunkKey}`, data });
  }

  // Add ancillary entries
  for (const [ancillaryType, data] of archive.ancillary) {
    const checksum = await services.sha256(data);
    manifest.checksums[ancillaryType] = checksum;
    manifest.ancillary[ancillaryType] = checksum;
    entries.push({ name: `ancillary/${ancillaryType}`, data });
  }

  // Add manifest entry last
  const manifestJson = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  entries.push({ name: MANIFEST_NAME, data: manifestJson.buffer });

  return services.zip(entries);
}

export async function deserializeVxproj(
  data: ArrayBuffer,
  services: VxprojServices
): Promise<VxprojArchive> {
  const entries = await services.unzip(data);

  // Find manifest
  const manifestEntry = entries.find((e) => e.name === MANIFEST_NAME);
  if (!manifestEntry) {
    throw new Error('VXPROJ_MISSING_MANIFEST: manifest.json not found in archive');
  }

  // Parse manifest
  const manifestText = new TextDecoder().decode(manifestEntry.data);
  const manifest: VxprojManifest = JSON.parse(manifestText);

  // Verify all checksums before extracting data
  const entryMap = new Map<string, ArrayBuffer>();
  for (const entry of entries) {
    entryMap.set(entry.name, entry.data);
  }

  // Verify chunk checksums
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

  // Verify ancillary checksums
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
