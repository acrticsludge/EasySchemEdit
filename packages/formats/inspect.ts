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
  return e?.type === 'int' ? (e.value as number) : undefined;
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
  // Decompress if gzip
  let working = bytes;
  let decompressed = false;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    working = services.gzipDecompress(bytes, 64 * 1024 * 1024);
    decompressed = true;
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

  const entries = root.value as Map<string, { type: string; value: unknown }>;
  const version = asInt(entries.get('Version'));
  const dataVersion = asInt(entries.get('DataVersion'));
  const width = asInt(entries.get('Width'));
  const height = asInt(entries.get('Height'));
  const length = asInt(entries.get('Length'));
  const hasPalette = entries.has('Palette');
  const hasBlockData = entries.has('BlockData');
  const hasMaterials = entries.has('Materials');
  const hasBlocks = entries.has('Blocks');
  const hasSize = entries.has('size');
  const hasRegions = entries.get('Regions');
  const hasMetadata = entries.get('Metadata');
  const hasMCDataVersion = entries.get('MinecraftDataVersion');

  let format: DetectedFormat;

  if (version === 3 && width !== undefined && height !== undefined && length !== undefined && hasBlocks && dataVersion !== undefined) {
    format = { kind: 'schem-v3', confidence: 'high' };
  } else if (hasRegions && hasMetadata && hasMCDataVersion) {
    format = { kind: 'litematic', confidence: 'high' };
  } else if (hasPalette && hasBlockData) {
    format = { kind: 'schem-v2', confidence: 'high' };
  } else if (hasMaterials && hasBlocks) {
    format = { kind: 'schematic-legacy', confidence: 'high' };
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

  // Dimensions from Width/Height/Length (v3) or size (vanilla) — cheaply available
  if (width !== undefined && height !== undefined && length !== undefined) {
    result.dimensions = { width, height, length };
  } else if (hasSize) {
    const sizeEntry = entries.get('size');
    const sizeCompound = asCompound(sizeEntry);
    if (sizeCompound) {
      const sx = asInt(getMap(sizeCompound, 'x'));
      const sy = asInt(getMap(sizeCompound, 'y'));
      const sz = asInt(getMap(sizeCompound, 'z'));
      if (sx !== undefined && sy !== undefined && sz !== undefined) {
        result.dimensions = { width: sx, height: sy, length: sz };
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
