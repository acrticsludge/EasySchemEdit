// Subspec B — Slice b-11: Vanilla .nbt Convert-on-Import
// Structure: size, palette/palettes {Name,Properties}, blocks[].pos/state/nbt,
// entities, DataVersion
// Produces normalizedImport: true (palette remapping)
import type { BlockStateId, Vec3i, Vec3Half } from '../domain/types.ts';
import type { Placement } from '../domain/placement.ts';
import type { Transform } from '../domain/coordinates.ts';
import type { Diagnostic, EntityRecord } from '../domain/shared-types.ts';
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
import { blockStateId, CANONICAL_AIR } from '../domain/block-state.ts';

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
function asString(e: { type: string; value: unknown } | undefined): string | undefined {
  return e?.type === 'string' ? (e.value as string) : undefined;
}
function getMap(compound: { value: Map<string, { type: string; value: unknown }> }, key: string): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

export class VanillaNbtAdapter implements FormatAdapter {
  readonly formatId = 'vanilla-nbt' as const;

  detect(bytes: Uint8Array): FormatDetectionResult {
    return {
      format: { kind: 'vanilla-nbt', confidence: 'low' },
      filenameExtension: '',
      extensionMatches: false,
      decompressionRequired: false,
    };
  }

  async import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult> {
    const diagnostics: Diagnostic[] = [];
    const root = decodeNbtFromBytes(bytes);
    if (root.type !== 'compound') {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Vanilla .nbt root is not a compound');
    }
    const entries = root.value as Map<string, { type: string; value: unknown }>;

    const dataVersion = asInt(entries.get('DataVersion'));

    const sizeEntry = entries.get('size');
    const sizeCompound = asCompound(sizeEntry);
    const width = sizeCompound ? asInt(getMap(sizeCompound, 'x')) ?? 0 : 0;
    const height = sizeCompound ? asInt(getMap(sizeCompound, 'y')) ?? 0 : 0;
    const length = sizeCompound ? asInt(getMap(sizeCompound, 'z')) ?? 0 : 0;

    // Palette: List<Compound { Name, Properties }> — support multiple palettes
    const paletteEntry = entries.get('palette');
    const palettesEntry = entries.get('palettes');
    const palettes: BlockStateId[][] = [];

    if (palettesEntry?.type === 'list') {
      // Multiple palettes
      for (const palEntry of palettesEntry.value as unknown[]) {
        const palCompound = asCompound(palEntry as { type: string; value: unknown });
        if (!palCompound) continue;
        const pal: BlockStateId[] = [];
        for (const [, stateEntry] of palCompound.value) {
          const stateObj = asCompound(stateEntry);
          const name = asString(getMap(stateObj!, 'Name'));
          const propsEntry = getMap(stateObj!, 'Properties');
          const props: Record<string, string> = {};
          if (propsEntry?.type === 'compound') {
            for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
              props[pk] = asString(pv) ?? '';
            }
          }
          pal.push(blockStateId(name ?? 'minecraft:air', props));
        }
        palettes.push(pal);
      }
    } else if (paletteEntry?.type === 'list') {
      // Single palette as List<Compound>
      const pal: BlockStateId[] = [];
      for (const stateEntry of (paletteEntry.value as { type: string; value: unknown }[])) {
        const stateObj = asCompound(stateEntry);
        const name = asString(getMap(stateObj!, 'Name'));
        const propsEntry = getMap(stateObj!, 'Properties');
        const props: Record<string, string> = {};
        if (propsEntry?.type === 'compound') {
          for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
            props[pk] = asString(pv) ?? '';
          }
        }
        pal.push(blockStateId(name ?? 'minecraft:air', props));
      }
      palettes.push(pal);
    } else {
      // Single palette as Compound
      const palCompound = asCompound(paletteEntry);
      const pal: BlockStateId[] = [];
      if (palCompound) {
        for (const [, stateEntry] of palCompound.value) {
          const stateObj = asCompound(stateEntry);
          const name = asString(getMap(stateObj!, 'Name'));
          const propsEntry = getMap(stateObj!, 'Properties');
          const props: Record<string, string> = {};
          if (propsEntry?.type === 'compound') {
            for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
              props[pk] = asString(pv) ?? '';
            }
          }
          pal.push(blockStateId(name ?? 'minecraft:air', props));
        }
      }
      palettes.push(pal);
    }

    // Blocks: List<Compound { pos: Int[3], state: Int, nbt?: Compound }>
    const blocksEntry = entries.get('blocks');
    const blocksList = asList(blocksEntry);

    const bounds = { min: [0, 0, 0] as Vec3i, maxExclusive: [width, height, length] as Vec3i };
    const chunks = new Map<string, any>();
    let nonAirBlockCount = 0;

    const chunkPalette: BlockStateId[] = [CANONICAL_AIR];
    const chunkIndexByState = new Map<string, number>([[CANONICAL_AIR.id, 0]]);

    if (blocksList) {
      for (const blockEntry of blocksList.value) {
        const blockObj = asCompound(blockEntry);
        if (!blockObj) continue;

        const posEntry = getMap(blockObj, 'pos');
        const pos = asIntArray(posEntry);
        const x = pos?.[0] ?? 0;
        const y = pos?.[1] ?? 0;
        const z = pos?.[2] ?? 0;

        const stateIdx = asInt(getMap(blockObj, 'state')) ?? 0;
        // Use first palette (palettes[0]) for state lookup
        const palette = palettes[0] ?? [CANONICAL_AIR];
        const state = palette[stateIdx] ?? CANONICAL_AIR;
        if (state.id !== 'minecraft:air') nonAirBlockCount++;

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

    const volume = {
      bounds,
      chunkSize: CHUNK_SIZE,
      chunks,
      nonAirCount: nonAirBlockCount,
      paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
    };

    const transform: Transform = { translation: [0, 0, 0], rotationY: 0, mirror: 'none' };
    const origin: Vec3Half = [0, 0, 0] as Vec3Half;

    const ancillary = {
      blockEntities: new Map<string, { position: [number, number, number]; nbt: NbtTag }>(),
      entities: [] as EntityRecord[],
      biomes: undefined,
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map<string, NbtTag>(),
    };

    // Entities
    const entitiesEntry = entries.get('entities');
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

    // Collect block entities from blocks with nbt
    if (blocksList) {
      for (const blockEntry of blocksList.value) {
        const blockObj = asCompound(blockEntry);
        if (!blockObj) continue;
        const posEntry = getMap(blockObj, 'pos');
        const pos = asIntArray(posEntry);
        const x = pos?.[0] ?? 0;
        const y = pos?.[1] ?? 0;
        const z = pos?.[2] ?? 0;
        const nbtEntry = getMap(blockObj, 'nbt');
        if (nbtEntry && nbtEntry.type === 'compound') {
          ancillary.blockEntities.set(`${x}_${y}_${z}`, { position: [x, y, z], nbt: nbtEntry as any });
        }
      }
    }

    const placement = {
      id: 'vanilla-nbt',
      name: 'vanilla-nbt',
      volume,
      transform,
      origin: origin as any,
      visible: true,
      locked: false,
      createdAt: new Date().toISOString(),
      source: {
        format: 'vanilla-nbt',
        filename: undefined,
        regionName: undefined,
        dataVersion,
        formatVersion: dataVersion,
        sourceGroupId: undefined,
        rawMetadata: undefined,
        diagnostics: [],
      },
      eraseTombstones: new Set(),
      ancillary,
    } as Placement;

    const report: any = {
      format: { kind: 'vanilla-nbt', confidence: 'high' },
      minecraftDataVersion: dataVersion,
      dimensions: { width, height, length },
      volume: BigInt(width * height * length),
      nonAirBlockCount,
      paletteSize: palettes[0]?.length ?? 0,
      regionCount: 1,
      fileSizeBytes: bytes.length,
      compressedSizeBytes: bytes.length,
      decompressedSizeBytes: bytes.length,
      preserved: { blockEntities: ancillary.blockEntities.size, entities: ancillary.entities.length, biomes: false, ticks: 0 },
      unsupported: { tags: [], blockStates: [] },
      sameStateOverlaps: 0,
      stateConflicts: 0,
      normalized: [],
      dropped: [],
      warnings: [],
      errors: [],
    };

    // Vanilla .nbt convert-on-import: normalizedImport = true (palette remapping)
    return { placements: [placement], importGroups: [], report, normalizedImport: true };
  }

  async export(_snapshot: any, _target: ExportTarget, _options: ExportOptions): Promise<ExportResult> {
    throw new NbtSafetyError('EXPORT_NOT_IMPLEMENTED', 'Vanilla .nbt export not implemented in v1');
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
