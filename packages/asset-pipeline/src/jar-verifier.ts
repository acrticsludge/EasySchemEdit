// packages/asset-pipeline/src/jar-verifier.ts
// SHA-1 verification against downloads.client.sha1 from version JSON.
// Manual JAR path: reject corrupt/wrong-version JARs.

export interface JarVerificationResult {
  valid: boolean;
  expectedSha1: string;
  actualSha1: string;
  reason?: string;
}

// Verify a client JAR's SHA-1 against the expected value from version JSON.
// Returns valid=true if the JAR matches; valid=false with reason otherwise.
export async function verifyClientJar(
  jarBytes: Uint8Array,
  expectedSha1: string,
): Promise<JarVerificationResult> {
  const { sha1Hex } = await import('./version-manifest.ts');
  const actualSha1 = await sha1Hex(jarBytes);

  if (!expectedSha1) {
    return { valid: false, expectedSha1: '', actualSha1, reason: 'ASSET_NO_EXPECTED_SHA1' };
  }

  if (actualSha1.toLowerCase() !== expectedSha1.toLowerCase()) {
    return {
      valid: false,
      expectedSha1,
      actualSha1,
      reason: 'ASSET_SHA1_MISMATCH',
    };
  }

  return { valid: true, expectedSha1, actualSha1 };
}

// Detect Minecraft version from JAR metadata (version.json inside the JAR).
// Used to validate a user-provided manual JAR against the pinned expected version.
export async function detectJarVersion(jarBytes: Uint8Array): Promise<{ version?: string; error?: string }> {
  // Minimal zip parsing to read version.json from the JAR.
  // Full zip extraction is in asset-extractor.ts; this is a lightweight header read.
  try {
    const { findZipEntry } = await import('./asset-extractor.ts');
    const versionJsonEntry = await findZipEntry(jarBytes, 'version.json');
    if (!versionJsonEntry) {
      return { version: undefined, error: 'ASSET_NO_VERSION_JSON_IN_JAR' };
    }
    const versionJson = JSON.parse(
      new TextDecoder().decode(versionJsonEntry),
    ) as { id?: string };
    return { version: versionJson.id };
  } catch (err) {
    return { version: undefined, error: `ASSET_JAR_READ_FAILED: ${(err as Error).message}` };
  }
}
