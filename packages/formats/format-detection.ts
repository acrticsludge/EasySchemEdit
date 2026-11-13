// Subspec B — Slice b-1.5: Format Detection
// Mandatory order per SUBSPEC-B §2.1:
// 1. Gzip magic (1f 8b) → decompressionRequired, decompress with bounded decompressor
// 2. Inspect NBT structure: v3 "Schematic", v2 Palette+BlockData, legacy Materials/Blocks/Data, vanilla size/palette/blocks/DataVersion
// 3. Extension cross-check (never trusted alone); mismatch → warning, import proceeds using detected format
export type { FormatDetectionResult, DetectedFormat } from './types.ts';
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

function isCompressed(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  const b0 = bytes[0]!;
  const b1 = bytes[1]!;
  if (b0 === GZIP_MAGIC_0 && b1 === GZIP_MAGIC_1) return true;
  return (b0 & 0x0f) === 8 && (((b0 << 8) | b1) % 31) === 0;
}

function getInt(entries: ReadonlyMap<string, NbtTagEntry>, key: string): number | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.type === 'int' || entry.type === 'short' || entry.type === 'byte') return entry.value as number;
  if (entry.type === 'long') return Number(entry.value);
  return undefined;
}

function getDim(entries: ReadonlyMap<string, NbtTagEntry>, key: string): number | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.type === 'short') {
    const v = entry.value as number;
    return v < 0 ? v + 65536 : v;
  }
  if (entry.type === 'int' || entry.type === 'byte') return entry.value as number;
  if (entry.type === 'long') return Number(entry.value);
  return undefined;
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

  // Step 1: compression detection (gzip or zlib)
  if (isCompressed(bytes)) {
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

  let entries = root.value as ReadonlyMap<string, NbtTagEntry>;
  const wrapped = entries.get('Schematic');
  if (wrapped?.type === 'compound') entries = wrapped.value as typeof entries;

  const version = getInt(entries, 'Version');
  const dataVersion = getInt(entries, 'DataVersion');
  const width = getDim(entries, 'Width');
  const height = getDim(entries, 'Height');
  const length = getDim(entries, 'Length');
  const hasWidth = width !== undefined;
  const hasHeight = height !== undefined;
  const hasLength = length !== undefined;
  const hasPalette = entries.has('Palette');
  const hasPaletteLower = entries.has('palette');
  const hasBlockData = entries.has('BlockData');
  const hasMaterials = entries.has('Materials');
  const blocksEntry = entries.get('Blocks');
  const blocksCompound = isCompound(blocksEntry);
  const blocksMap = blocksCompound ? (blocksEntry.value as ReadonlyMap<string, NbtTagEntry>) : undefined;
  const blocksHasDataOrPalette = blocksMap ? (blocksMap.has('Data') || blocksMap.has('Palette')) : false;
  const hasBlocks = blocksEntry !== undefined;
  const hasSize = entries.has('size');
  const hasRegions = entries.has('Regions');
  const hasMetadata = entries.has('Metadata');
  const hasMinecraftDataVersion = entries.has('MinecraftDataVersion');

  let format: DetectedFormat;

  // 1. Legacy .schematic: root Materials + Blocks (checked first)
  if (hasMaterials && hasBlocks) {
    format = { kind: 'schematic-legacy', confidence: 'high' };
  }
  // 2. Sponge v3: Width & Height & Length present AND Blocks is a compound AND (version === 3 OR Blocks.value has Data or Palette)
  else if (
    hasWidth &&
    hasHeight &&
    hasLength &&
    blocksCompound &&
    (version === 3 || blocksHasDataOrPalette)
  ) {
    format = { kind: 'schem-v3', confidence: 'high' };
  }
  // 3. Litematic: root {Version, SubVersion, MinecraftDataVersion, Metadata, Regions{...}}
  else if (hasRegions && hasMetadata && hasMinecraftDataVersion) {
    format = { kind: 'litematic', confidence: 'high' };
  }
  // 4. Sponge v2: (Palette && BlockData) OR (Width && Height && Length && BlockData)
  else if ((hasPalette && hasBlockData) || (hasWidth && hasHeight && hasLength && hasBlockData)) {
    const palette = entries.get('Palette');
    const blockData = entries.get('BlockData');
    if (isCompound(palette) && isByteArray(blockData)) {
      format = { kind: 'schem-v2', confidence: 'high' };
    } else {
      format = { kind: 'schem-v2', confidence: hasBlockData ? 'high' : 'low' };
    }
  }
  // 5. Vanilla .nbt: root size + palette + blocks + DataVersion
  else if (hasSize && hasPaletteLower && entries.has('blocks') && dataVersion !== undefined) {
    format = { kind: 'vanilla-nbt', confidence: 'high' };
  }
  else {
    format = { kind: 'unknown', reason: 'no recognized structure' };
  }
  const ext = filenameExtension.toLowerCase();
  let extensionMatches = false;
  switch (format.kind) {
    case 'schem-v3':
    case 'schem-v2':
      extensionMatches = ext === '.schem';
      break;
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
