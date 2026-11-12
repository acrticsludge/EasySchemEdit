import type { Diagnostic } from './shared-types.ts';

export type ErrorCodeEntry = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
};

export const ERROR_CODES: Record<string, ErrorCodeEntry> = {
  // ENGINE
  ENGINE_OFF_GRID_TRANSFORM: {
    code: 'ENGINE_OFF_GRID_TRANSFORM',
    severity: 'error',
    message: 'Transform translation or origin is off the block lattice',
    remediation: 'Use integer translation and integral (even half-block) origin',
  },
  ENGINE_INVARIANT_VIOLATION: {
    code: 'ENGINE_INVARIANT_VIOLATION',
    severity: 'error',
    message: 'Project invariant violated — commit halted',
    remediation: 'Fix the invalid placement, volume, or palette state',
  },
  ENGINE_OPERATION_TOO_LARGE: {
    code: 'ENGINE_OPERATION_TOO_LARGE',
    severity: 'error',
    message: 'Operation exceeds maximum allowed region size',
    remediation: 'Split the operation into smaller regions',
  },
  ENGINE_STORAGE_LIMIT: {
    code: 'ENGINE_STORAGE_LIMIT',
    severity: 'error',
    message: 'Storage quota exceeded',
    remediation: 'Reduce volume size or free storage',
  },
  ENGINE_EMPTY_VOLUME: {
    code: 'ENGINE_EMPTY_VOLUME',
    severity: 'info',
    message: 'Volume is empty (all air)',
    remediation: 'No action required — empty volumes are valid',
  },

  // NBT
  NBT_TAG_COUNT_EXCEEDED: {
    code: 'NBT_TAG_COUNT_EXCEEDED',
    severity: 'error',
    message: 'NBT tag count exceeds maximum limit',
    remediation: 'Reduce the number of tags in the NBT structure',
  },
  NBT_STRING_TOO_LONG: {
    code: 'NBT_STRING_TOO_LONG',
    severity: 'error',
    message: 'NBT string exceeds maximum length',
    remediation: 'Shorten the string value',
  },
  NBT_ARRAY_TOO_LONG: {
    code: 'NBT_ARRAY_TOO_LONG',
    severity: 'error',
    message: 'NBT array exceeds maximum length',
    remediation: 'Reduce the array size',
  },
  NBT_DECOMPRESSION_RATIO_EXCEEDED: {
    code: 'NBT_DECOMPRESSION_RATIO_EXCEEDED',
    severity: 'error',
    message: 'NBT decompression ratio exceeds safety limit',
    remediation: 'Use a smaller or less compressed NBT source',
  },
  NBT_PARSE_DURATION_EXCEEDED: {
    code: 'NBT_PARSE_DURATION_EXCEEDED',
    severity: 'error',
    message: 'NBT parsing took too long',
    remediation: 'Use a smaller NBT source',
  },
  NBT_NESTING_DEPTH_EXCEEDED: {
    code: 'NBT_NESTING_DEPTH_EXCEEDED',
    severity: 'error',
    message: 'NBT nesting depth exceeds maximum limit',
    remediation: 'Reduce nesting depth in the NBT structure',
  },
  NBT_INTEGER_OVERFLOW: {
    code: 'NBT_INTEGER_OVERFLOW',
    severity: 'error',
    message: 'NBT integer value exceeds safe range',
    remediation: 'Use a value within the safe integer range',
  },
  NBT_DUPLICATE_REQUIRED_FIELD: {
    code: 'NBT_DUPLICATE_REQUIRED_FIELD',
    severity: 'error',
    message: 'Duplicate required field in NBT compound',
    remediation: 'Remove the duplicate field',
  },
  NBT_MIXED_TYPE_LIST: {
    code: 'NBT_MIXED_TYPE_LIST',
    severity: 'error',
    message: 'NBT list contains mixed tag types',
    remediation: 'Ensure all list elements have the same tag type',
  },

  // CORRUPT
  CORRUPT_ARCHIVE: {
    code: 'CORRUPT_ARCHIVE',
    severity: 'error',
    message: 'Archive is corrupted — checksum mismatch',
    remediation: 'Restore from backup or re-download the archive',
  },
  CORRUPT_CHUNK: {
    code: 'CORRUPT_CHUNK',
    severity: 'error',
    message: 'Chunk data is corrupted',
    remediation: 'Re-import the affected region',
  },
  CORRUPT_CACHE: {
    code: 'CORRUPT_CACHE',
    severity: 'error',
    message: 'Cache is corrupted',
    remediation: 'Clear the cache and re-fetch',
  },

  // ASSET
  ASSET_DOWNLOAD_FAILED: {
    code: 'ASSET_DOWNLOAD_FAILED',
    severity: 'error',
    message: 'Asset download failed',
    remediation: 'Check network connection or use manual JAR import',
  },
  ASSET_CORRUPT_JAR: {
    code: 'ASSET_CORRUPT_JAR',
    severity: 'error',
    message: 'Asset JAR is corrupt or invalid',
    remediation: 'Re-download or re-import the JAR',
  },
  ASSET_WRONG_VERSION: {
    code: 'ASSET_WRONG_VERSION',
    severity: 'error',
    message: 'Asset JAR version does not match expected version',
    remediation: 'Use a JAR for the correct version',
  },
  ASSET_DOWNLOAD_CANCELLED: {
    code: 'ASSET_DOWNLOAD_CANCELLED',
    severity: 'info',
    message: 'Asset download was cancelled',
    remediation: 'Retry the download if needed',
  },
  ASSET_CACHE_CORRUPT: {
    code: 'ASSET_CACHE_CORRUPT',
    severity: 'error',
    message: 'Asset cache is corrupted',
    remediation: 'Clear the cache and re-download assets',
  },

  // FORMAT
  FORMAT_EXTENSION_MISMATCH: {
    code: 'FORMAT_EXTENSION_MISMATCH',
    severity: 'warning',
    message: 'File extension does not match detected format',
    remediation: 'Verify the file extension matches the content',
  },
  FORMAT_UNKNOWN_SIGNATURE: {
    code: 'FORMAT_UNKNOWN_SIGNATURE',
    severity: 'error',
    message: 'Unknown file signature — format cannot be determined',
    remediation: 'Provide a supported file format',
  },
  FORMAT_AMBIGUOUS_STRUCTURE: {
    code: 'FORMAT_AMBIGUOUS_STRUCTURE',
    severity: 'warning',
    message: 'File structure is ambiguous — multiple formats match',
    remediation: 'Specify the format explicitly',
  },

  // EXPORT
  EXPORT_DIMENSION_LIMIT: {
    code: 'EXPORT_DIMENSION_LIMIT',
    severity: 'error',
    message: 'Export dimension exceeds supported limit',
    remediation: 'Split the export into smaller regions or enable auto-split',
  },
  EXPORT_UNSUPPORTED_BLOCK_ENTITY: {
    code: 'EXPORT_UNSUPPORTED_BLOCK_ENTITY',
    severity: 'warning',
    message: 'Block entity is not supported in the target format',
    remediation: 'Remove or replace the unsupported block entity',
  },
  EXPORT_INVALID_ORIGIN: {
    code: 'EXPORT_INVALID_ORIGIN',
    severity: 'error',
    message: 'Export origin is invalid',
    remediation: 'Use an integral origin for export',
  },
  EXPORT_REGION_GROUPING_LOST: {
    code: 'EXPORT_REGION_GROUPING_LOST',
    severity: 'warning',
    message: 'Multi-region grouping may be lost in this format',
    remediation: 'Use a format that supports multi-region grouping',
  },

  // IMPORT
  IMPORT_NBT_INVALID: {
    code: 'IMPORT_NBT_INVALID',
    severity: 'error',
    message: 'Invalid NBT data in import',
    remediation: 'Provide a valid NBT file',
  },
  IMPORT_REGION_INVALID: {
    code: 'IMPORT_REGION_INVALID',
    severity: 'error',
    message: 'Invalid region data in import',
    remediation: 'Provide a valid region file',
  },
  IMPORT_TRUNCATED_DATA: {
    code: 'IMPORT_TRUNCATED_DATA',
    severity: 'error',
    message: 'Import data is truncated',
    remediation: 'Re-import the complete file',
  },
  IMPORT_UNSUPPORTED_FORMAT: {
    code: 'IMPORT_UNSUPPORTED_FORMAT',
    severity: 'error',
    message: 'Import format is not supported',
    remediation: 'Use a supported file format',
  },
  IMPORT_UNKNOWN_BLOCK: {
    code: 'IMPORT_UNKNOWN_BLOCK',
    severity: 'warning',
    message: 'Unknown block encountered during import',
    remediation: 'The block will be preserved as-is; verify after import',
  },
} as const;

export function getErrorCode(code: string): ErrorCodeEntry | undefined {
  return ERROR_CODES[code];
}

export function makeDiagnostic(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
  remediation?: string,
): Diagnostic {
  const entry = ERROR_CODES[code];
  if (!entry) {
    return {
      code,
      severity: 'error',
      message: message || `Unknown error code: ${code}`,
      details,
      remediation,
    };
  }
  return {
    code,
    severity: entry.severity,
    message: message || entry.message,
    details: entry.details ?? details,
    remediation: entry.remediation ?? remediation,
  };
}
