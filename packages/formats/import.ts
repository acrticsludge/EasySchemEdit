// packages/formats/import.ts
// Public high-level schematic import API.

import type { ImportOptions, ImportResult } from './adapter.ts';
import { NbtSafetyError } from './errors.ts';
import { detectFormat } from './format-detection.ts';
import { gzipDecompressBounded, defaultCodecServices } from './codec.ts';
import { SpongeV3Adapter } from './sponge-v3.ts';
import { SpongeV2Adapter } from './sponge-v2.ts';
import { LitematicAdapter } from './litematic.ts';
import { VanillaNbtAdapter } from './vanilla-nbt.ts';
import { DEFAULT_MAX_TOTAL_VOLUME } from './export-semantics.ts';

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  preserveSourceOrigin: false,
  autoArrange: false,
  strict: false,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxDecompressedBytes: 64 * 1024 * 1024,
  maxTotalVolume: DEFAULT_MAX_TOTAL_VOLUME,
  maxNonAirBlocks: 10_000_000,
  maxNbtNestingDepth: 512,
  maxNbtTagCount: 1_000_000,
};

export async function importSchematic(
  bytes: Uint8Array,
  fileName: string = '',
  opts?: Partial<ImportOptions>,
): Promise<ImportResult & { group?: any }> {
  const options: ImportOptions = {
    ...DEFAULT_IMPORT_OPTIONS,
    ...opts,
  };

  if (bytes.length > options.maxCompressedBytes) {
    throw new NbtSafetyError(
      'COMPRESSED_LIMIT_EXCEEDED',
      `Input size ${bytes.length} bytes exceeds maximum compressed limit of ${options.maxCompressedBytes} bytes`,
    );
  }

  // Decompress bounded
  const decompressed = gzipDecompressBounded(bytes, options.maxDecompressedBytes);

  // Extract extension
  const dotIndex = fileName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? fileName.slice(dotIndex) : '';

  // Detect format
  const detection = detectFormat(bytes, ext, defaultCodecServices);

  // Reject unsupported legacy schematic with stable error code per SPEC §3.1
  if (detection.format.kind === 'schematic-legacy') {
    throw new NbtSafetyError(
      'UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC',
      'Legacy .schematic format is unsupported in v1 import pipeline',
    );
  }

  if (detection.format.kind === 'unknown') {
    throw new NbtSafetyError(
      'IMPORT_UNSUPPORTED_FORMAT',
      detection.format.reason || 'Unrecognized schematic format',
    );
  }

  let result: ImportResult;
  switch (detection.format.kind) {
    case 'schem-v3': {
      const adapter = new SpongeV3Adapter();
      result = await adapter.import(decompressed, options);
      break;
    }
    case 'schem-v2': {
      const adapter = new SpongeV2Adapter();
      result = await adapter.import(decompressed, options);
      break;
    }
    case 'litematic': {
      const adapter = new LitematicAdapter();
      result = await adapter.import(decompressed, options);
      break;
    }
    case 'vanilla-nbt': {
      const adapter = new VanillaNbtAdapter();
      result = await adapter.import(decompressed, options);
      break;
    }
    default: {
      throw new NbtSafetyError(
        'IMPORT_UNSUPPORTED_FORMAT',
        `Unsupported format: ${(detection.format as any).kind}`,
      );
    }
  }

  return {
    ...result,
    group: result.importGroups[0],
  };
}
