// Subspec B — Slice b-1.5: Format Detection
// Mandatory order per SUBSPEC-B §2.1:
// 1. Gzip magic (1f 8b) → decompressionRequired, decompress with bounded decompressor
// 2. Inspect NBT structure: v3 "Schematic", v2 Palette+BlockData, legacy Materials/Blocks/Data, vanilla size/palette/blocks/DataVersion
// 3. Extension cross-check (never trusted alone); mismatch → warning, import proceeds using detected format
import type {
  FormatDetectionResult,
  DetectedFormat,
} from './types.ts';
import {
  decodeNbtFromBytes,
  type NbtServices,
} from './nbts.ts';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

function hasGzipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
}

function getInt(entries: ReadonlyMap<string, NbtTagEntry>, key: string): number | undefined {
  const entry = entries.get(key);
  if (!entry || entry.type !== 'int') return undefined;
  return entry.value;
}

type NbtTagEntry = {
  type: string;
  value: unknown;
};

function isCompound(entry: NbtTagEntry | undefined): entry is NbtTagEntry & { type: 'compound'; value: ReadonlyMap<string, NbtTagEntry> } {
  return entry?.type === 'compound';
}

function isByteArray(entry: NbtTagEntry | undefined): entry is NbtTagEntry & { type: 'byteArray'; value: Uint8Array } {
  return entry?.type === 'byteArray';
}

export function detectFormat(
  bytes: Uint8Array,
  filenameExtension: string,
  services?: NbtServices,
): FormatDetectionResult {
  let working = bytes;
  let decompressionRequired = false;

  // Step 1: gzip magic detection
  if (hasGzipMagic(bytes)) {
    decompressionRequired = true;
    if (!services) {
      return {
        format: {
          kind: 'unknown',
          reason: 'gzip-compressed, decompressor required',
          confidence: 'low',
        } as DetectedFormat,
        filenameExtension,
        extensionMatches: false,
        decompressionRequired: true,
      };
    }
    working = services.gzipDecompress(bytes, 64 * 1024 * 1024);
  }

  // Step 2: parse NBT and inspect root structure
  let root: { type: string; value: unknown };
  try {
    root = decodeNbtFromBytes(working);
  } catch {
    return {
      format: { kind: 'unknown', reason: 'invalid NBT', confidence: 'low' } as DetectedFormat,
      filenameExtension,
      extensionMatches: false,
      decompressionRequired,
    };
  }

  if (root.type !== 'compound') {
    return {
      format: { kind: 'unknown', reason: 'root is not a compound', confidence: 'low' } as DetectedFormat,
      filenameExtension,
      extensionMatches: false,
      decompressionRequired,
    };
  }

  const entries = root.value as ReadonlyMap<string, NbtTagEntry>;
  const version = getInt(entries as unknown as ReadonlyMap<string, NbtTagEntry>, 'Version');
  const dataVersion = getInt(entries as unknown as ReadonlyMap<string, NbtTagEntry>, 'DataVersion');
  const hasPalette = entries.has('Palette');
  const hasPaletteLower = entries.has('palette');
  const hasBlockData = entries.has('BlockData');
  const hasMaterials = entries.has('Materials');
  const hasBlocks = entries.has('Blocks');
  const hasSize = entries.has('size');
  const hasWidth = entries.has('Width');
  const hasHeight = entries.has('Height');
  const hasLength = entries.has('Length');
  const hasOffset = entries.has('Offset');
  const hasRegions = entries.has('Regions');
  const hasMetadata = entries.has('Metadata');
  const hasMinecraftDataVersion = entries.has('MinecraftDataVersion');

  let format: DetectedFormat;

  // Sponge v3: root "Schematic" compound {Version=3, DataVersion, W/H/L, Offset, Blocks{...}, Entities, Biomes}
  if (
    version === 3 &&
    hasWidth &&
    hasHeight &&
    hasLength &&
    hasOffset &&
    hasBlocks &&
    dataVersion !== undefined
  ) {
    format = { kind: 'schem-v3', confidence: 'high' };
  }
  // Litematic: root {Version, SubVersion, MinecraftDataVersion, Metadata, Regions{...}}
  else if (hasRegions && hasMetadata && hasMinecraftDataVersion) {
    format = { kind: 'litematic', confidence: 'high' };
  }
  // Sponge v2: root Palette (compound: state string -> int) + BlockData (VarInt bytes)
  else if (hasPalette && hasBlockData) {
    const palette = entries.get('Palette');
    const blockData = entries.get('BlockData');
    if (isCompound(palette) && isByteArray(blockData)) {
      format = { kind: 'schem-v2', confidence: 'high' };
    } else {
      format = { kind: 'schem-v2', confidence: 'low' };
    }
  }
  // Legacy .schematic: root Materials + Blocks + Data
  else if (hasMaterials && hasBlocks) {
    format = { kind: 'schematic-legacy', confidence: 'high' };
  }
  // Vanilla .nbt: root size + palette + blocks + DataVersion
  else if (hasSize && hasPaletteLower && entries.has('blocks') && dataVersion !== undefined) {
    format = { kind: 'vanilla-nbt', confidence: 'high' };
  }
  else {
    format = { kind: 'unknown', reason: 'no recognized NBT structure', confidence: 'low' };
  }

  // Step 3: extension cross-check (never trusted alone)
  const ext = filenameExtension.toLowerCase();
  let extensionMatches = false;
  switch (format.kind) {
    case 'schem-v3':
      extensionMatches = ext === '.schem';
      break;
    case 'schem-v2':
    case 'litematic':
      extensionMatches = ext === '.litematic';
      break;
    case 'schematic-legacy':
      extensionMatches = ext === '.schematic';
      break;
    case 'vanilla-nbt':
      extensionMatches = ext === '.nbt';
      break;
    default:
      extensionMatches = false;
  }

  return {
    format,
    filenameExtension,
    extensionMatches,
    decompressionRequired,
  };
}
