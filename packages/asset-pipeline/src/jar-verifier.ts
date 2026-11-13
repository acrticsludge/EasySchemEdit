// packages/asset-pipeline/src/jar-verifier.ts
// SHA-1 verification against downloads.client.sha1 from version JSON.
// Inspect extracted version.json and pack.mcmeta for version integrity.

import { strFromU8 } from 'fflate';
import { PINNED_1_21_11_CLIENT_JAR_SHA1, sha1Hex, type Sha1Fn } from './version-manifest.ts';
import { findZipEntrySync } from './asset-extractor.ts';

export interface JarVerificationResult {
  valid: boolean;
  expectedSha1: string;
  actualSha1: string;
  reason?: string;
}

export interface JarVersionInfo {
  version?: string;
  name?: string;
  packFormat?: number;
  description?: string;
  error?: string;
}

/**
 * Verify a client JAR's SHA-1 against expected value (defaults to PINNED_1_21_11_CLIENT_JAR_SHA1).
 */
export async function verifyClientJar(
  jarBytes: Uint8Array,
  expectedSha1: string = PINNED_1_21_11_CLIENT_JAR_SHA1,
  sha1Fn?: Sha1Fn,
): Promise<JarVerificationResult> {
  const actualSha1 = await sha1Hex(jarBytes, sha1Fn);

  if (!expectedSha1) {
    return { valid: false, expectedSha1: '', actualSha1, reason: 'ASSET_NO_EXPECTED_SHA1' };
  }

  if (actualSha1.toLowerCase() !== expectedSha1.toLowerCase()) {
    return {
      valid: false,
      expectedSha1,
      actualSha1,
      reason: 'SHA1_MISMATCH',
    };
  }

  return { valid: true, expectedSha1, actualSha1 };
}

/**
 * Detect Minecraft version and metadata from JAR/zip synchronously by reading
 * version.json and pack.mcmeta.
 */
export function detectJarVersionSync(jarBytes: Uint8Array): JarVersionInfo {
  try {
    const versionBytes = findZipEntrySync(jarBytes, 'version.json');
    const packBytes = findZipEntrySync(jarBytes, 'pack.mcmeta');

    if (!versionBytes && !packBytes) {
      return {
        error: 'ASSET_NO_VERSION_METADATA_IN_JAR: Neither version.json nor pack.mcmeta found',
      };
    }

    let detectedVersion: string | undefined;
    let detectedName: string | undefined;
    let detectedPackFormat: number | undefined;
    let detectedDesc: string | undefined;

    if (versionBytes) {
      try {
        const vj = JSON.parse(strFromU8(versionBytes)) as {
          id?: string;
          name?: string;
          pack_version?: { resource?: number; data?: number };
        };
        detectedVersion = vj.id || vj.name;
        detectedName = vj.name || vj.id;
        if (vj.pack_version?.resource !== undefined) {
          detectedPackFormat = vj.pack_version.resource;
        }
      } catch (err) {
        return { error: `ASSET_MALFORMED_VERSION_JSON: ${(err as Error).message}` };
      }
    }

    if (packBytes) {
      try {
        const pm = JSON.parse(strFromU8(packBytes)) as {
          pack?: {
            description?: string | unknown;
            pack_format?: number;
          };
        };
        if (pm.pack) {
          if (detectedPackFormat === undefined && typeof pm.pack.pack_format === 'number') {
            detectedPackFormat = pm.pack.pack_format;
          }
          if (pm.pack.description) {
            detectedDesc =
              typeof pm.pack.description === 'string'
                ? pm.pack.description
                : JSON.stringify(pm.pack.description);
          }
        }
      } catch (err) {
        // pack.mcmeta parse failure is not fatal if version.json succeeded
        if (!detectedVersion) {
          return { error: `ASSET_MALFORMED_PACK_MCMETA: ${(err as Error).message}` };
        }
      }
    }

    return {
      version: detectedVersion,
      name: detectedName,
      packFormat: detectedPackFormat,
      description: detectedDesc,
    };
  } catch (err) {
    return { error: `ASSET_JAR_READ_FAILED: ${(err as Error).message}` };
  }
}

/**
 * Detect Minecraft version and metadata from JAR metadata (async wrapper).
 */
export async function detectJarVersion(jarBytes: Uint8Array): Promise<JarVersionInfo> {
  return detectJarVersionSync(jarBytes);
}
