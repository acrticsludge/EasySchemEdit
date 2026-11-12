// Subspec B — Slice b-4: Litematic Adapter (real structure)
// Root: Version/SubVersion/MinecraftDataVersion/Metadata{Name,Author,Description,
//       TimeCreated,TimeModified,EnclosingSize,TotalVolume,TotalBlocks,RegionCount}
// Regions{name:{Position,Size,BlockStatePalette[{Name,Properties}],BlockStates long[],
//             TileEntities,Entities,PendingBlockTicks,PendingFluidTicks}}
// Uses signed-Size normalization from slice b-2; packed BlockStates from slice b-3.
import type { BlockStateId } from '../domain/types.ts';
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
import {
  normalizeRegionSize,
  rawToNormalizedCoord,
  linearIndex,
} from './litematic-size.ts';
import { decodePackedBlockStates } from './litematic-packed.ts';
import { blockStateId, CANONICAL_AIR, VANILLA_AIR_LIKE } from '../domain/block-state.ts';

const CHUNK_SIZE = 16;

function asCompound(e: { type: string; value: unknown } | undefined): { value: Map<string, { type: string; value: unknown }> } | undefined {
  return e?.type === 'compound' ? (e as { value: Map<string, { type: string; value: unknown }> }) : undefined;
}
function asList(e: { type: string; value: unknown } | undefined): { value: { type: string; value: unknown }[] } | undefined {
  return e?.type === 'list' ? (e as { value: { type: string; value: unknown }[] }) : undefined;
}
function asInt(e: { type: string; value: unknown } | undefined): number | undefined {
  return e?.type === 'int' ? (e.value as number) : undefined;
}
function asLong(e: { type: string; value: unknown } | undefined): bigint | undefined {
  return e?.type === 'long' ? (e.value as bigint) : undefined;
}
function asString(e: { type: string; value: unknown } | undefined): string | undefined {
  return e?.type === 'string' ? (e.value as string) : undefined;
}
function getMap(compound: { value: Map<string, { type: string; value: unknown }> }, key: string): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

export class LitematicAdapter implements FormatAdapter {
  readonly formatId = 'litematic' as const;

  detect(bytes: Uint8Array): FormatDetectionResult {
    return {
      format: { kind: 'litematic', confidence: 'low' },
      filenameExtension: '',
      extensionMatches: false,
      decompressionRequired: false,
    };
  }

  async import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult> {
    const diagnostics: Diagnostic[] = [];
    const root = decodeNbtFromBytes(bytes);
    if (root.type !== 'compound') {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Litematic root is not a compound');
    }
    const entries = root.value as Map<string, { type: string; value: unknown }>;

    const version = asInt(entries.get('Version'));
    const mcDataVersion = asInt(entries.get('MinecraftDataVersion'));

    const regionsEntry = entries.get('Regions');
    const regions = asCompound(regionsEntry);
    if (!regions) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Litematic root missing Regions');
    }

    const placements: Placement[] = [];
    const importGroups: any[] = [];
    let nonAirBlockCount = 0;
    let regionCount = 0;
    let totalPaletteSize = 0;

    for (const [regionName, regionEntry] of regions.value) {
      const region = asCompound(regionEntry);
      if (!region) continue;

      const positionEntry = getMap(region, 'Position');
      const sizeEntry = getMap(region, 'Size');
      const paletteEntry = getMap(region, 'BlockStatePalette');
      const blockStatesEntry = getMap(region, 'BlockStates');

      const pos = asIntArray(positionEntry);
      const size = asIntArray(sizeEntry);
      if (!pos || !size || size.length < 3) {
        diagnostics.push({ code: 'IMPORT_NBT_INVALID', severity: 'warning', message: `Region ${regionName}: missing/invalid Position or Size` });
        continue;
      }

      const ax = size[0], ay = size[1], az = size[2];
      const normSize = normalizeRegionSize({ ax, ay, az });
      const width = normSize.ax, height = normSize.ay, length = normSize.az;
      regionCount++;

      // Build palette: BlockStateId[] ({Name, Properties})
      const paletteCompound = asCompound(paletteEntry);
      const palette: BlockStateId[] = [];
      if (paletteCompound) {
        for (const [stateName, stateEntry] of paletteCompound.value) {
          const stateObj = asCompound(stateEntry);
          const name = asString(getMap(stateObj!, 'Name'));
          const propsEntry = getMap(stateObj!, 'Properties');
          const props: Record<string, string> = {};
          if (propsEntry?.type === 'compound') {
            for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
              props[pk] = asString(pv) ?? '';
            }
          }
          palette.push(blockStateId(name ?? 'minecraft:air', props));
        }
      }
      totalPaletteSize += palette.length;

      // BlockStates: long[] packed array (TAG_LONG_ARRAY in real Litematic files)
      const packedLongs: bigint[] = asLongArray(blockStatesEntry) ?? [];
      const packedBytes = longsToBytes(packedLongs);
      const bpe = palette.length <= 2 ? 2 : Math.ceil(Math.log2(palette.length));
      const totalEntries = width * height * length;

      let indices: Uint16Array | Uint32Array;
      try {
        const result = decodePackedBlockStates(palette, packedBytes, bpe, totalEntries);
        indices = result.indices;
      } catch (e) {
        diagnostics.push({ code: 'IMPORT_NBT_INVALID', severity: 'error', message: `Region ${regionName}: ${e}` });
        continue;
      }

      // Build volume: chunks of CHUNK_SIZE
      const bounds = { min: [0, 0, 0] as const, maxExclusive: [width, height, length] as const };
      const chunks = new Map<string, any>();
      let regionNonAir = 0;
      const chunkPalette: BlockStateId[] = [CANONICAL_AIR];
      const chunkIndexByState = new Map<string, number>([[CANONICAL_AIR.id, 0]]);

      for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
          for (let x = 0; x < width; x++) {
            const nc = rawToNormalizedCoord(x, y, z, { ax, ay, az });
            const flat = linearIndex(nc.x, nc.z, nc.y, ax, az);
            const stateIdx = Number(indices[flat]);
            const state = palette[stateIdx] ?? CANONICAL_AIR;
            if (!VANILLA_AIR_LIKE.has(state.id)) regionNonAir++;

            const cx = Math.floor(x / CHUNK_SIZE);
            const cy = Math.floor(y / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const ckey = `${cx}_${cy}_${cz}`;
            let chunk = chunks.get(ckey);
            if (!chunk) {
              chunk = {
                key: ckey,
                palette: [...chunkPalette],
                indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
                revision: 0,
              };
              chunks.set(ckey, chunk);
            }
            const localX = x % CHUNK_SIZE;
            const localY = y % CHUNK_SIZE;
            const localZ = z % CHUNK_SIZE;
            const li = (localY * CHUNK_SIZE + localZ) * CHUNK_SIZE + localX;

            let stateIdxInChunk = chunkIndexByState.get(state.id);
            if (stateIdxInChunk === undefined) {
              stateIdxInChunk = chunk.palette.length;
              chunk.palette.push(state);
              chunkIndexByState.set(state.id, stateIdxInChunk as number);
            }
            chunk.indices[li] = stateIdxInChunk as number;
          }
        }
      }

      nonAirBlockCount += regionNonAir;
      const volume = {
        bounds,
        chunkSize: CHUNK_SIZE,
        chunks,
        nonAirCount: regionNonAir,
        paletteCardinality: chunkPalette.length,
      };

      const transform: Transform = { translation: [pos[0], pos[1], pos[2]], rotationY: 0, mirror: 'none' };
      const origin: [number, number, number] = [pos[0] * 2, pos[1] * 2, pos[2] * 2];

      const ancillary = {
        blockEntities: new Map<string, { position: [number, number, number]; nbt: NbtTag }>(),
        entities: [] as EntityRecord[],
        biomes: undefined,
        pendingBlockTicks: [],
        pendingFluidTicks: [],
        unknownTags: new Map<string, NbtTag>(),
      };

      // TileEntities → blockEntities
      const tileEntities = asList(getMap(region, 'TileEntities'));
      if (tileEntities) {
        for (const te of tileEntities.value) {
          const teObj = asCompound(te);
          if (!teObj) continue;
          const x = asInt(getMap(teObj, 'x'));
          const y = asInt(getMap(teObj, 'y'));
          const z = asInt(getMap(teObj, 'z'));
          if (x !== undefined && y !== undefined && z !== undefined) {
            ancillary.blockEntities.set(`${x}_${y}_${z}`, { position: [x, y, z], nbt: teObj as any });
          }
        }
      }

      // Entities
      const ents = asList(getMap(region, 'Entities'));
      if (ents) {
        for (const e of ents.value) {
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

      placements.push({
        id: regionName,
        name: regionName,
        volume,
        transform,
        origin: origin as any,
        visible: true,
        locked: false,
        createdAt: new Date().toISOString(),
        source: {
          format: 'litematic',
          filename: undefined,
          regionName,
          dataVersion: mcDataVersion,
          formatVersion: version,
          sourceGroupId: undefined,
          rawMetadata: undefined,
          diagnostics: [],
        },
        eraseTombstones: new Set(),
        ancillary,
      } as Placement);
    }

    const report: any = {
      format: { kind: 'litematic', confidence: 'high' },
      minecraftDataVersion: mcDataVersion,
      dimensions: { width: 0, height: 0, length: 0 },
      volume: BigInt(0),
      nonAirBlockCount,
      paletteSize: totalPaletteSize,
      regionCount,
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

    return { placements, importGroups, report, normalizedImport: false };
  }

  async export(_snapshot: any, _target: ExportTarget, _options: ExportOptions): Promise<ExportResult> {
    throw new NbtSafetyError('EXPORT_NOT_IMPLEMENTED', 'Litematic export not implemented in v1');
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

function asLongArray(e: { type: string; value: unknown } | undefined): bigint[] | undefined {
  if (e?.type === 'longArray') {
    return Array.from(e.value as BigInt64Array);
  }
  return undefined;
}

function longsToBytes(longs: bigint[]): Uint8Array {
  const out = new Uint8Array(longs.length * 8);
  for (let i = 0; i < longs.length; i++) {
    new DataView(out.buffer, i * 8, 8).setBigInt64(0, longs[i], true);
  }
  return out;
}
