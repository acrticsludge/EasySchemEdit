// Subspec B — Slice b-7: Sponge v2 Reader
// Palette is a compound (state string → int)
// BlockData is VarInt bytes
// Offset is int[3]
// Lossless read: no warning, normalizedImport false
// Does not redeclare FormatAdapter — uses shared interface from b-0.5
import type { BlockStateId, Vec3i, Vec3Half } from '../domain/types.ts';
import type { Placement } from '../domain/placement.ts';
import type { Transform } from '../domain/coordinates.ts';
import type { Diagnostic } from '../domain/shared-types.ts';
import type { NbtTag } from '../domain/nbt.ts';
import type {
  FormatAdapter,
  ImportResult,
  ExportResult,
  ImportOptions,
  ExportOptions,
  ExportTarget,
} from './adapter.ts';
import type { FormatDetectionResult } from './types.ts';
import { NbtSafetyError } from './errors.ts';
import { decodeNbtFromBytes, type NbtServices } from './nbts.ts';
import { blockStateId } from '../domain/block-state.ts';

function asCompound(e: { type: string; value: unknown } | undefined): { value: Map<string, { type: string; value: unknown }> } | undefined {
  return e?.type === 'compound' ? (e as { value: Map<string, { type: string; value: unknown }> }) : undefined;
}
function asInt(e: { type: string; value: unknown } | undefined): number | undefined {
  return e?.type === 'int' ? (e.value as number) : undefined;
}
function getMap(compound: { value: Map<string, { type: string; value: unknown }> }, key: string): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

// Read a VarInt from a byte array at offset, returns [value, bytesRead]
function readVarInt(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let result = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    byte = data[offset + bytesRead];
    result |= (byte & 0x7F) << (7 * bytesRead);
    bytesRead++;
    if (bytesRead > 5) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'VarInt too long');
    }
  } while ((byte & 0x80) !== 0);
  return { value: result, bytesRead };
}

export class SpongeV2Adapter implements FormatAdapter {
  readonly formatId = 'schem-v2' as const;

  detect(bytes: Uint8Array): FormatDetectionResult {
    return {
      format: { kind: 'schem-v2', confidence: 'low' },
      filenameExtension: '',
      extensionMatches: false,
      decompressionRequired: false,
    };
  }

  async import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult> {
    const diagnostics: Diagnostic[] = [];
    const root = decodeNbtFromBytes(bytes);
    if (root.type !== 'compound') {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v2 root is not a compound');
    }
    const entries = root.value as Map<string, { type: string; value: unknown }>;

    const paletteEntry = entries.get('Palette');
    const blockDataEntry = entries.get('BlockData');
    const offsetEntry = entries.get('Offset');
    const widthEntry = entries.get('Width');
    const heightEntry = entries.get('Height');
    const lengthEntry = entries.get('Length');

    const palette = asCompound(paletteEntry);
    if (!palette) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v2 missing Palette compound');
    }

    const blockData = blockDataEntry?.type === 'byteArray' ? (blockDataEntry.value as Uint8Array) : undefined;
    if (!blockData) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v2 missing BlockData byte array');
    }

    const offsetCompoundEntry = entries.get('Offset');
    const offsetCompound = asCompound(offsetCompoundEntry);
    const offset: Vec3i = offsetCompound
      ? [asInt(getMap(offsetCompound, 'X')) ?? 0, asInt(getMap(offsetCompound, 'Y')) ?? 0, asInt(getMap(offsetCompound, 'Z')) ?? 0] as Vec3i
      : [0, 0, 0] as Vec3i;
    const width = asInt(widthEntry) ?? 0;
    const height = asInt(heightEntry) ?? 0;
    const length = asInt(lengthEntry) ?? 0;

    // Build palette: state string → int index
    const paletteMap = new Map<string, number>();
    for (const [stateName, indexEntry] of palette.value) {
      const idx = asInt(indexEntry);
      if (idx !== undefined) {
        paletteMap.set(stateName, idx);
      }
    }

    // Decode BlockData VarInts → palette indices
    const decodedIndices: number[] = [];
    let byteOffset = 0;
    while (byteOffset < blockData.length) {
      const { value, bytesRead } = readVarInt(blockData, byteOffset);
      decodedIndices.push(value);
      byteOffset += bytesRead;
    }

    const totalEntries = width * height * length;
    if (decodedIndices.length !== totalEntries) {
      diagnostics.push({
        code: 'IMPORT_NBT_INVALID',
        severity: 'warning',
        message: `BlockData length ${decodedIndices.length} !== total entries ${totalEntries}`,
      });
    }

    // Build palette array: index → BlockStateId
    const paletteArray: BlockStateId[] = [];
    let maxIndex = -1;
    for (const idx of decodedIndices) {
      if (idx > maxIndex) maxIndex = idx;
    }
    for (const idx of paletteMap.values()) {
      if (idx > maxIndex) maxIndex = idx;
    }
    maxIndex += 1;
    for (let i = 0; i < maxIndex; i++) {
      // Find state name for this index
      let stateName = 'minecraft:air';
      for (const [name, idx] of paletteMap) {
        if (idx === i) { stateName = name; break; }
      }
      paletteArray.push(blockStateId(stateName));
    }

    // Build volume: single chunk if small enough, else multiple chunks
    const CHUNK_SIZE = 16;
    const bounds = { min: [0, 0, 0] as Vec3i, maxExclusive: [width, height, length] as Vec3i };
    const chunks = new Map<string, any>();
    let nonAirBlockCount = 0;

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const flat = x + z * width + y * width * length;
          const stateIdx = decodedIndices[flat] ?? 0;
          const state = paletteArray[stateIdx] ?? blockStateId('minecraft:air');
          if (state.id !== 'minecraft:air') nonAirBlockCount++;

          const cx = Math.floor(x / CHUNK_SIZE);
          const cy = Math.floor(y / CHUNK_SIZE);
          const cz = Math.floor(z / CHUNK_SIZE);
          const ckey = `${cx}_${cy}_${cz}`;
          let chunk = chunks.get(ckey);
          if (!chunk) {
            chunk = {
              key: ckey,
              palette: [blockStateId('minecraft:air')],
              indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
              revision: 0,
            };
            chunks.set(ckey, chunk);
          }
          const localX = x % CHUNK_SIZE;
          const localY = y % CHUNK_SIZE;
          const localZ = z % CHUNK_SIZE;
          const li = (localY * CHUNK_SIZE + localZ) * CHUNK_SIZE + localX;

          let stateIdxInChunk = 0;
          if (state.id !== 'minecraft:air') {
            let existingIdx = -1;
            for (let pi = 1; pi < chunk.palette.length; pi++) {
              if (chunk.palette[pi].id === state.id) { existingIdx = pi; break; }
            }
            if (existingIdx >= 0) {
              stateIdxInChunk = existingIdx;
            } else {
              stateIdxInChunk = chunk.palette.length;
              chunk.palette.push(state);
            }
          }
          chunk.indices[li] = stateIdxInChunk;
        }
      }
    }

    const volume = {
      bounds,
      chunkSize: CHUNK_SIZE,
      chunks,
      nonAirCount: nonAirBlockCount,
      paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
    };

    const transform: Transform = { translation: offset as Vec3i, rotationY: 0, mirror: 'none' };
    const origin: Vec3Half = [(offset[0] * 2) as number, (offset[1] * 2) as number, (offset[2] * 2) as number] as Vec3Half;

    const ancillary = {
      blockEntities: new Map<string, { position: [number, number, number]; nbt: NbtTag }>(),
      entities: [],
      biomes: undefined,
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map<string, NbtTag>(),
    };

    const placement = {
      id: 'sponge-v2',
      name: 'sponge-v2',
      volume,
      transform,
      origin: origin as any,
      visible: true,
      locked: false,
      createdAt: new Date().toISOString(),
      source: {
        format: 'schem-v2',
        filename: undefined,
        regionName: undefined,
        dataVersion: undefined,
        formatVersion: undefined,
        sourceGroupId: undefined,
        rawMetadata: undefined,
        diagnostics: [],
      },
      eraseTombstones: new Set(),
      ancillary,
    } as Placement;

    const report: any = {
      format: { kind: 'schem-v2', confidence: 'high' },
      dimensions: { width, height, length },
      volume: BigInt(totalEntries),
      nonAirBlockCount,
      paletteSize: paletteArray.length,
      regionCount: 1,
      fileSizeBytes: bytes.length,
      compressedSizeBytes: bytes.length,
      decompressedSizeBytes: bytes.length,
      preserved: { blockEntities: 0, entities: 0, biomes: false, ticks: 0 },
      unsupported: { tags: [], blockStates: [] },
      sameStateOverlaps: 0,
      stateConflicts: 0,
      normalized: [],
      dropped: [],
      warnings: diagnostics,
      errors: [],
    };

    // Lossless read: no warning, normalizedImport false
    return { placements: [placement], importGroups: [], report, normalizedImport: false };
  }

  async export(_snapshot: any, _target: ExportTarget, _options: ExportOptions): Promise<ExportResult> {
    throw new NbtSafetyError('EXPORT_NOT_IMPLEMENTED', 'Sponge v2 export not implemented in v1');
  }
}

function asIntArray(e: { type: string; value: unknown } | undefined): number[] | undefined {
  if (e?.type === 'intArray') {
    return Array.from(e.value as Int32Array);
  }
  if (e?.type === 'list') {
    return (e.value as { type: string; value: unknown }[]).map((ee) => asInt(ee) ?? 0);
  }
  return undefined;
}
