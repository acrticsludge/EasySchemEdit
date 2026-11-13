// Subspec B — Slice b-9: inspect() Header-Only Import Preview
// async, takes services
// nonAirBlockCount optional/absent unless cheaply available
// Reads only enough to determine format and dimensions — no full block data decompression
import type { FormatDetectionResult, DetectedFormat } from './types.ts';
import { decodeNbtFromBytes, type NbtServices } from './nbts.ts';

function asCompound(e: { type: string; value: unknown } | undefined): { value: Map<string, { type: string; value: unknown }> } | undefined {
  return e?.type === 'compound' ? (e as { value: Map<string, { type: string; value: unknown }> }) : undefined;
}
function asInt(e: { type: string; value: unknown } | undefined): number | undefined {
  if (!e) return undefined;
  if (e.type === 'int' || e.type === 'short' || e.type === 'byte') return e.value as number;
  if (e.type === 'long') return Number(e.value);
  return undefined;
}
function asDim(e: { type: string; value: unknown } | undefined): number | undefined {
  if (!e) return undefined;
  if (e.type === 'short') {
    const v = e.value as number;
    return v < 0 ? v + 65536 : v;
  }
  if (e.type === 'int' || e.type === 'byte') return e.value as number;
  if (e.type === 'long') return Number(e.value);
  return undefined;
}
function getMap(compound: { value: Map<string, { type: string; value: unknown }> }, key: string): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

export type InspectResult = {
  format: FormatDetectionResult['format'];
  dimensions?: { width: number; height: number; length: number };
  nonAirBlockCount?: number;   // optional — absent unless cheaply available
  paletteSize?: number;
  regionCount?: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
};

export async function inspect(
  bytes: Uint8Array,
  services: NbtServices,
): Promise<InspectResult> {
  // Decompress if gzip or zlib
  let working = bytes;
  let decompressed = false;
  if (bytes.length >= 2) {
    const b0 = bytes[0]!;
    const b1 = bytes[1]!;
    if ((b0 === 0x1f && b1 === 0x8b) || ((b0 & 0x0f) === 8 && (((b0 << 8) | b1) % 31) === 0)) {
      working = services.gzipDecompress(bytes, 64 * 1024 * 1024);
      decompressed = true;
    }
  }

  // Parse NBT header only — enough to get format and dimensions
  let root: { type: string; value: unknown };
  try {
    root = decodeNbtFromBytes(working);
  } catch {
    return {
      format: { kind: 'unknown', reason: 'invalid NBT', confidence: 'low' } as const,
      fileSizeBytes: bytes.length,
      compressedSizeBytes: bytes.length,
    } as InspectResult;
  }

  if (root.type !== 'compound') {
    return {
      format: { kind: 'unknown', reason: 'root is not a compound', confidence: 'low' } as const,
      fileSizeBytes: bytes.length,
      compressedSizeBytes: bytes.length,
    } as InspectResult;
  }

  let entries = root.value as Map<string, { type: string; value: unknown }>;
  const wrapped = entries.get('Schematic');
  if (wrapped?.type === 'compound') entries = wrapped.value as typeof entries;

  const version = asInt(entries.get('Version'));
  const dataVersion = asInt(entries.get('DataVersion'));
  const width = asDim(entries.get('Width'));
  const height = asDim(entries.get('Height'));
  const length = asDim(entries.get('Length'));
  const hasWidth = width !== undefined;
  const hasHeight = height !== undefined;
  const hasLength = length !== undefined;
  const hasPalette = entries.has('Palette') || entries.has('palette');
  const hasBlockData = entries.has('BlockData');
  const hasMaterials = entries.has('Materials');
  const blocksEntry = entries.get('Blocks');
  const hasBlocks = blocksEntry !== undefined;
  const blocksCompound = asCompound(blocksEntry);
  const blocksHasDataOrPalette = blocksCompound ? (blocksCompound.value.has('Data') || blocksCompound.value.has('Palette')) : false;
  const hasSize = entries.has('size');
  const hasRegions = entries.get('Regions');
  const hasMetadata = entries.get('Metadata');
  const hasMCDataVersion = entries.get('MinecraftDataVersion');

  let format: DetectedFormat;

  if (hasMaterials && hasBlocks) {
    format = { kind: 'schematic-legacy', confidence: 'high' };
  } else if (
    hasWidth &&
    hasHeight &&
    hasLength &&
    blocksCompound &&
    (version === 3 || blocksHasDataOrPalette)
  ) {
    format = { kind: 'schem-v3', confidence: 'high' };
  } else if (hasRegions && hasMetadata && hasMCDataVersion) {
    format = { kind: 'litematic', confidence: 'high' };
  } else if ((hasPalette && hasBlockData) || (hasWidth && hasHeight && hasLength && hasBlockData)) {
    format = { kind: 'schem-v2', confidence: 'high' };
  } else if (hasSize && hasPalette && entries.has('blocks') && dataVersion !== undefined) {
    format = { kind: 'vanilla-nbt', confidence: 'high' };
  } else {
    format = { kind: 'unknown', reason: 'no recognized structure' };
  }

  const result: InspectResult = {
    format,
    fileSizeBytes: bytes.length,
    compressedSizeBytes: bytes.length,
  };

  // Dimensions from Width/Height/Length (v3/v2) or size (vanilla) — cheaply available
  if (width !== undefined && height !== undefined && length !== undefined) {
    result.dimensions = { width, height, length };
  } else if (hasSize) {
    const sizeEntry = entries.get('size');
    if (sizeEntry?.type === 'compound') {
      const sizeCompound = asCompound(sizeEntry);
      if (sizeCompound) {
        const sx = asInt(getMap(sizeCompound, 'x')) ?? asInt(getMap(sizeCompound, 'X'));
        const sy = asInt(getMap(sizeCompound, 'y')) ?? asInt(getMap(sizeCompound, 'Y'));
        const sz = asInt(getMap(sizeCompound, 'z')) ?? asInt(getMap(sizeCompound, 'Z'));
        if (sx !== undefined && sy !== undefined && sz !== undefined) {
          result.dimensions = { width: sx, height: sy, length: sz };
        }
      }
    } else if (sizeEntry?.type === 'intArray') {
      const arr = sizeEntry.value as Int32Array | number[];
      if (arr.length >= 3) {
        result.dimensions = { width: arr[0]!, height: arr[1]!, length: arr[2]! };
      }
    } else if (sizeEntry?.type === 'list') {
      const list = (sizeEntry.value as { type: string; value: unknown }[]).map((e) => asInt(e) ?? 0);
      if (list.length >= 3) {
        result.dimensions = { width: list[0]!, height: list[1]!, length: list[2]! };
      }
    }
  }

  // Palette exists at root (vanilla .nbt) or inside Blocks (Sponge v3)
  const hasPaletteRoot = entries.has('Palette');
  let hasPaletteInBlocks = false;
  let blocksTop: { value: Map<string, { type: string; value: unknown }> } | undefined;
  const blocksEntryTop = entries.get('Blocks');
  if (blocksEntryTop) {
    blocksTop = asCompound(blocksEntryTop);
    if (blocksTop) {
      hasPaletteInBlocks = blocksTop.value.has('Palette');
    }
  }

  // Palette size — cheaply available from palette list/compound
  if (hasPaletteRoot || hasPaletteInBlocks) {
    let paletteEntry = entries.get('Palette');
    // Sponge v3: Palette is inside Blocks compound
    if (!paletteEntry && blocksTop) {
      paletteEntry = blocksTop.value.get('Palette');
    }
    const palette = asCompound(paletteEntry);
    if (palette) {
      result.paletteSize = palette.value.size;
    } else {
      const paletteList = paletteEntry;
      if (paletteList?.type === 'list') {
        result.paletteSize = (paletteList.value as unknown[]).length;
      }
    }
  }

  // Region count — cheaply available from Regions compound
  if (hasRegions) {
    const regions = asCompound(hasRegions);
    if (regions) {
      result.regionCount = regions.value.size;
    }
  }

  // nonAirBlockCount is NOT included unless cheaply available
  // (requires full block data decompression, which inspect() avoids)

  return result;
}
