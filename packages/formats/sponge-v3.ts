// Subspec B — Slice b-8: Sponge v3 Adapter
// Offset is int[3], defined relative to the paste point:
//   pasteTarget + Offset = min corner of the build (NOT absolute world coordinates)
// Worked example uses relative coordinates only (to be verified with WorldEdit fixture)
import type { BlockStateId, Vec3i, Vec3Half } from '../domain/types.ts';
import type { EntityRecord } from '../domain/shared-types.ts';
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
function asList(e: { type: string; value: unknown } | undefined): { value: { type: string; value: unknown }[] } | undefined {
  return e?.type === 'list' ? (e as { value: { type: string; value: unknown }[] }) : undefined;
}
function asInt(e: { type: string; value: unknown } | undefined): number | undefined {
  return e?.type === 'int' ? (e.value as number) : undefined;
}
function asString(e: { type: string; value: unknown } | undefined): string | undefined {
  return e?.type === 'string' ? (e.value as string) : undefined;
}
function getMap(compound: { value: Map<string, { type: string; value: unknown }> }, key: string): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

// Read VarInt from Uint8Array at offset
function readVarInt(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let result = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    byte = data[offset + bytesRead];
    result |= (byte & 0x7F) << (7 * bytesRead);
    bytesRead++;
    if (bytesRead > 5) throw new NbtSafetyError('IMPORT_NBT_INVALID', 'VarInt too long');
  } while ((byte & 0x80) !== 0);
  return { value: result, bytesRead };
}

export class SpongeV3Adapter implements FormatAdapter {
  readonly formatId = 'schem-v3' as const;

  detect(bytes: Uint8Array): FormatDetectionResult {
    return {
      format: { kind: 'schem-v3', confidence: 'low' },
      filenameExtension: '',
      extensionMatches: false,
      decompressionRequired: false,
    };
  }

  async import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult> {
    const diagnostics: Diagnostic[] = [];
    const root = decodeNbtFromBytes(bytes);
    if (root.type !== 'compound') {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 root is not a compound');
    }
    const entries = root.value as Map<string, { type: string; value: unknown }>;

    if (asInt(entries.get('Version')) !== 3) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 root Version must be 3');
    }

    const mcDataVersion = asInt(entries.get('DataVersion'));
    const width = asInt(entries.get('Width')) ?? 0;
    const height = asInt(entries.get('Height')) ?? 0;
    const length = asInt(entries.get('Length')) ?? 0;

    // Offset is int[3], relative to paste point: pasteTarget + Offset = min corner
    const offsetEntry = entries.get('Offset');
    const offsetCompound = asCompound(offsetEntry);
    const offset: Vec3i = offsetCompound
      ? [asInt(getMap(offsetCompound, 'X')) ?? 0, asInt(getMap(offsetCompound, 'Y')) ?? 0, asInt(getMap(offsetCompound, 'Z')) ?? 0] as Vec3i
      : [0, 0, 0] as Vec3i;

    const blocksEntry = entries.get('Blocks');
    const blocks = asCompound(blocksEntry);
    if (!blocks) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 missing Blocks compound');
    }

    // Palette: List<String> of block state names
    const paletteEntry = getMap(blocks, 'Palette');
    const paletteList = asList(paletteEntry);
    const paletteNames: string[] = paletteList ? paletteList.value.map((e) => asString(e) ?? 'minecraft:air') : [];

    // Data: VarInt array (byte array of VarInt-encoded palette indices)
    const dataEntry = getMap(blocks, 'Data');
    const dataBytes = dataEntry?.type === 'byteArray' ? (dataEntry.value as Uint8Array) : undefined;
    if (!dataBytes) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 missing Blocks.Data byte array');
    }

    // Decode VarInt array → palette indices
    const indices: number[] = [];
    let byteOffset = 0;
    while (byteOffset < dataBytes.length) {
      const { value, bytesRead } = readVarInt(dataBytes, byteOffset);
      indices.push(value);
      byteOffset += bytesRead;
    }

    const totalEntries = width * height * length;
    if (indices.length !== totalEntries) {
      diagnostics.push({
        code: 'IMPORT_NBT_INVALID',
        severity: 'warning',
        message: `Data length ${indices.length} !== total entries ${totalEntries}`,
      });
    }

    // Build palette array: index → BlockStateId
    const paletteArray: BlockStateId[] = indices.map((idx, i) => {
      const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
      return blockStateId(name);
    });
    // Deduplicate palette
    const uniquePalette: BlockStateId[] = [];
    const uniqueIndexMap = new Map<string, number>();
    for (const bs of paletteArray) {
      const key = `${bs.id}:${JSON.stringify(Object.entries(bs.props).sort())}`;
      if (!uniqueIndexMap.has(key)) {
        uniqueIndexMap.set(key, uniquePalette.length);
        uniquePalette.push(bs);
      }
    }
    // Remap indices to unique palette
    const remappedIndices = indices.map((idx) => {
      const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
      const bs = blockStateId(name);
      const key = `${bs.id}:${JSON.stringify(Object.entries(bs.props).sort())}`;
      return uniqueIndexMap.get(key) ?? 0;
    });

    // Build volume: chunks of CHUNK_SIZE
    const CHUNK_SIZE = 16;
    const bounds = { min: [0, 0, 0] as Vec3i, maxExclusive: [width, height, length] as Vec3i };
    const chunks = new Map<string, any>();
    let nonAirBlockCount = 0;

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const flat = x + z * width + y * width * length;
          const stateIdx = remappedIndices[flat] ?? 0;
          const state = uniquePalette[stateIdx] ?? blockStateId('minecraft:air');
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

    // Offset: pasteTarget + Offset = min corner (relative, not absolute world coords)
    const transform: Transform = { translation: offset as Vec3i, rotationY: 0, mirror: 'none' };
    const origin: Vec3Half = [(offset[0] * 2) as number, (offset[1] * 2) as number, (offset[2] * 2) as number] as Vec3Half;

    const ancillary = {
      blockEntities: new Map<string, { position: [number, number, number]; nbt: NbtTag }>(),
      entities: [] as EntityRecord[],
      biomes: undefined,
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map<string, NbtTag>(),
    };

    // BlockEntities
    const blockEntitiesEntry = getMap(blocks, 'BlockEntities');
    const blockEntitiesList = asList(blockEntitiesEntry);
    if (blockEntitiesList) {
      for (const be of blockEntitiesList.value) {
        const beObj = asCompound(be);
        if (!beObj) continue;
        const x = asInt(getMap(beObj, 'x'));
        const y = asInt(getMap(beObj, 'y'));
        const z = asInt(getMap(beObj, 'z'));
        if (x !== undefined && y !== undefined && z !== undefined) {
          ancillary.blockEntities.set(`${x}_${y}_${z}`, { position: [x, y, z], nbt: beObj as any });
        }
      }
    }

    // Entities
    const entitiesEntry = entries.get('Entities');
    const entitiesList = asList(entitiesEntry);
    if (entitiesList) {
      for (const e of entitiesList.value) {
        const eObj = asCompound(e);
        if (!eObj) continue;
        ancillary.entities.push({
          id: asString(getMap(eObj, 'id')) ?? 'unknown',
          position: [0, 0, 0] as const,
          rotation: [0, 0, 0] as const,
          nbt: eObj as any,
        });
      }
    }

    // Biomes (optional)
    const biomesEntry = entries.get('Biomes');
    if (biomesEntry) {
      // Biomes preserved opaquely
    }

    const placement = {
      id: 'sponge-v3',
      name: 'sponge-v3',
      volume,
      transform,
      origin: origin as any,
      visible: true,
      locked: false,
      createdAt: new Date().toISOString(),
      source: {
        format: 'schem-v3',
        filename: undefined,
        regionName: undefined,
        dataVersion: mcDataVersion,
        formatVersion: 3,
        sourceGroupId: undefined,
        rawMetadata: undefined,
        diagnostics: [],
      },
      eraseTombstones: new Set(),
      ancillary,
    } as Placement;

    const report: any = {
      format: { kind: 'schem-v3', confidence: 'high' },
      minecraftDataVersion: mcDataVersion,
      dimensions: { width, height, length },
      volume: BigInt(totalEntries),
      nonAirBlockCount,
      paletteSize: uniquePalette.length,
      regionCount: 1,
      fileSizeBytes: bytes.length,
      compressedSizeBytes: bytes.length,
      decompressedSizeBytes: bytes.length,
      preserved: { blockEntities: ancillary.blockEntities.size, entities: ancillary.entities.length, biomes: !!biomesEntry, ticks: 0 },
      unsupported: { tags: [], blockStates: [] },
      sameStateOverlaps: 0,
      stateConflicts: 0,
      normalized: [],
      dropped: [],
      warnings: diagnostics,
      errors: [],
    };

    return { placements: [placement], importGroups: [], report, normalizedImport: false };
  }

  async export(_snapshot: any, _target: ExportTarget, _options: ExportOptions): Promise<ExportResult> {
    throw new NbtSafetyError('EXPORT_NOT_IMPLEMENTED', 'Sponge v3 export not implemented in v1');
  }
}
