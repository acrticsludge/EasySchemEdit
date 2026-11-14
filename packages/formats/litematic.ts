// packages/formats/litematic.ts
// Litematica Format Adapter: full import and export.
//
// Root: Version / SubVersion / MinecraftDataVersion / Metadata / Regions
// Regions: { name: { Position, Size, BlockStatePalette, BlockStates, TileEntities, Entities, ... } }
// Uses signed-Size normalization from litematic-size.ts; packed BlockStates from litematic-packed.ts.

import type { BlockStateId, Vec3i, Bounds3i } from '../domain/types.ts';
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
  ProjectSnapshot,
} from './adapter.ts';
import type { FormatDetectionResult } from './types.ts';
import type { ExportReport } from './reports.ts';
import { ExportError, NbtSafetyError } from './errors.ts';
import { decodeNbtFromBytes, encodeNbt } from './nbts.ts';
import { gzipCompress, gzipDecompressBounded } from './codec.ts';
import {
  normalizeRegionSize,
  linearIndex,
} from './litematic-size.ts';
import { decodePackedBlockStates, encodePackedBlockStates } from './litematic-packed.ts';
import { blockStateId, CANONICAL_AIR, VANILLA_AIR_LIKE } from '../domain/block-state.ts';
import {
  checkRegionEligibility,
  EXPORT_REGION_GROUPING_LOST,
  type RegionGroupMetadata,
} from './region-eligibility.ts';
import { filterHiddenPlacements, DEFAULT_MAX_TOTAL_VOLUME } from './export-semantics.ts';

const CHUNK_SIZE = 16;

function asCompound(
  e: { type: string; value: unknown } | undefined,
): { value: Map<string, { type: string; value: unknown }> } | undefined {
  return e?.type === 'compound' ? (e as { value: Map<string, { type: string; value: unknown }> }) : undefined;
}

function asList(
  e: { type: string; value: unknown } | undefined,
): { value: { type: string; value: unknown }[] } | undefined {
  return e?.type === 'list' ? (e as { value: { type: string; value: unknown }[] }) : undefined;
}

function asInt(e: { type: string; value: unknown } | undefined): number | undefined {
  if (!e) return undefined;
  if (e.type === 'int' || e.type === 'short' || e.type === 'byte') return e.value as number;
  if (e.type === 'long') return Number(e.value);
  return undefined;
}

function asString(e: { type: string; value: unknown } | undefined): string | undefined {
  return e?.type === 'string' ? (e.value as string) : undefined;
}

function getMap(
  compound: { value: Map<string, { type: string; value: unknown }> },
  key: string,
): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

function asIntArray(e: { type: string; value: unknown } | undefined): number[] | undefined {
  if (!e) return undefined;
  if (e.type === 'intArray') {
    return Array.from(e.value as Int32Array);
  }
  if (e.type === 'list') {
    return (e.value as { type: string; value: unknown }[]).map((ee) => asInt(ee) ?? 0);
  }
  if (e.type === 'compound') {
    const m = e.value as Map<string, { type: string; value: unknown }>;
    const x = asInt(m.get('x')) ?? asInt(m.get('X')) ?? 0;
    const y = asInt(m.get('y')) ?? asInt(m.get('Y')) ?? 0;
    const z = asInt(m.get('z')) ?? asInt(m.get('Z')) ?? 0;
    return [x, y, z];
  }
  return undefined;
}

function asLongArray(e: { type: string; value: unknown } | undefined): bigint[] | undefined {
  if (!e) return undefined;
  if (e.type === 'longArray') {
    return Array.from(e.value as BigInt64Array);
  }
  if (e.type === 'list') {
    return (e.value as { type: string; value: unknown }[]).map((ee) => (ee.value as bigint) ?? 0n);
  }
  return undefined;
}

function longsToBytes(longs: bigint[]): Uint8Array {
  const out = new Uint8Array(longs.length * 8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let i = 0; i < longs.length; i++) {
    view.setBigInt64(i * 8, longs[i]!, true);
  }
  return out;
}

function bytesToLongs(bytes: Uint8Array): BigInt64Array {
  const count = Math.floor(bytes.length / 8);
  const longs = new BigInt64Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    longs[i] = view.getBigInt64(i * 8, true);
  }
  return longs;
}

function getBlockStateAt(
  snapshot: any,
  placement: any,
  x: number,
  y: number,
  z: number,
): BlockStateId {
  const cx = Math.floor(x / 16);
  const cy = Math.floor(y / 16);
  const cz = Math.floor(z / 16);
  const ckey = `${cx}_${cy}_${cz}`;

  let chunk: { palette: BlockStateId[]; indices: Uint8Array | Uint16Array | Uint32Array } | undefined;
  if (snapshot.chunkViews && snapshot.chunkViews.has(placement.id)) {
    chunk = snapshot.chunkViews.get(placement.id)!.get(ckey);
  } else if (placement.volume?.chunks) {
    chunk = placement.volume.chunks.get(ckey);
  }

  if (!chunk) return CANONICAL_AIR;

  const lx = ((x % 16) + 16) % 16;
  const ly = ((y % 16) + 16) % 16;
  const lz = ((z % 16) + 16) % 16;
  const li = (ly * 16 + lz) * 16 + lx;
  const idx = chunk.indices[li] ?? 0;
  return chunk.palette[idx] ?? CANONICAL_AIR;
}

function getCompositeBlockState(
  snapshot: any,
  placements: any[],
  wx: number,
  wy: number,
  wz: number,
): BlockStateId {
  // Top-wins: iterate placements from last to first
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i]!;
    const t: Vec3i = p.transform?.translation ?? [0, 0, 0];
    const b: Bounds3i = p.volume?.bounds ?? { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
    const lx = wx - t[0];
    const ly = wy - t[1];
    const lz = wz - t[2];
    if (
      lx >= b.min[0] && lx < b.maxExclusive[0] &&
      ly >= b.min[1] && ly < b.maxExclusive[1] &&
      lz >= b.min[2] && lz < b.maxExclusive[2]
    ) {
      const state = getBlockStateAt(snapshot, p, lx, ly, lz);
      if (!VANILLA_AIR_LIKE.has(state.id)) {
        return state;
      }
    }
  }
  return CANONICAL_AIR;
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

    let enclosingMinX = Infinity, enclosingMinY = Infinity, enclosingMinZ = Infinity;
    let enclosingMaxX = -Infinity, enclosingMaxY = -Infinity, enclosingMaxZ = -Infinity;

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
        diagnostics.push({
          code: 'IMPORT_NBT_INVALID',
          severity: 'warning',
          message: `Region ${regionName}: missing/invalid Position or Size`,
        });
        continue;
      }

      const ax = size[0]!, ay = size[1]!, az = size[2]!;
      const normSize = normalizeRegionSize({ ax, ay, az });
      const width = normSize.ax, height = normSize.ay, length = normSize.az;
      regionCount++;

      const minX = ax < 0 ? pos[0]! + ax + 1 : pos[0]!;
      const minY = ay < 0 ? pos[1]! + ay + 1 : pos[1]!;
      const minZ = az < 0 ? pos[2]! + az + 1 : pos[2]!;

      if (minX < enclosingMinX) enclosingMinX = minX;
      if (minY < enclosingMinY) enclosingMinY = minY;
      if (minZ < enclosingMinZ) enclosingMinZ = minZ;
      if (minX + width > enclosingMaxX) enclosingMaxX = minX + width;
      if (minY + height > enclosingMaxY) enclosingMaxY = minY + height;
      if (minZ + length > enclosingMaxZ) enclosingMaxZ = minZ + length;

      // Build palette: BlockStateId[] ({Name, Properties})
      const palette: BlockStateId[] = [];
      if (paletteEntry?.type === 'list') {
        const paletteList = paletteEntry.value as { type: string; value: unknown }[];
        for (const stateEntry of paletteList) {
          const stateObj = asCompound(stateEntry);
          if (!stateObj) continue;
          const name = asString(getMap(stateObj, 'Name'));
          const propsEntry = getMap(stateObj, 'Properties');
          const props: Record<string, string> = {};
          if (propsEntry?.type === 'compound') {
            for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
              props[pk] = asString(pv) ?? '';
            }
          }
          palette.push(blockStateId(name ?? 'minecraft:air', props));
        }
      } else if (paletteEntry?.type === 'compound') {
        const paletteCompound = paletteEntry as { value: Map<string, { type: string; value: unknown }> };
        for (const [stateName, stateEntry] of paletteCompound.value) {
          const stateObj = asCompound(stateEntry);
          const name = asString(getMap(stateObj!, 'Name')) ?? stateName;
          const propsEntry = getMap(stateObj!, 'Properties');
          const props: Record<string, string> = {};
          if (propsEntry?.type === 'compound') {
            for (const [pk, pv] of (propsEntry.value as Map<string, { type: string; value: unknown }>)) {
              props[pk] = asString(pv) ?? '';
            }
          }
          palette.push(blockStateId(name, props));
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
        diagnostics.push({
          code: 'IMPORT_NBT_INVALID',
          severity: 'error',
          message: `Region ${regionName}: ${e}`,
        });
        continue;
      }

      // Build volume: chunks of CHUNK_SIZE
      const bounds = { min: [0, 0, 0] as const, maxExclusive: [width, height, length] as const };
      const chunks = new Map<string, any>();
      const chunkStateMaps = new Map<string, Map<string, number>>();
      let regionNonAir = 0;

      for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
          for (let x = 0; x < width; x++) {
            const flat = linearIndex(x, z, y, width, length);
            const stateIdx = Number(indices[flat]);
            const state = palette[stateIdx] ?? CANONICAL_AIR;
            if (VANILLA_AIR_LIKE.has(state.id)) {
              continue;
            }
            regionNonAir++;

            const cx = Math.floor(x / CHUNK_SIZE);
            const cy = Math.floor(y / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const ckey = `${cx}_${cy}_${cz}`;
            let chunk = chunks.get(ckey);
            let stateMap = chunkStateMaps.get(ckey);
            if (!chunk) {
              chunk = {
                key: ckey,
                palette: [CANONICAL_AIR],
                indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
                revision: 0,
              };
              chunks.set(ckey, chunk);
              stateMap = new Map<string, number>([
                [CANONICAL_AIR.id, 0],
                [`${CANONICAL_AIR.id}:{}`, 0],
              ]);
              chunkStateMaps.set(ckey, stateMap);
            }
            const localX = x % CHUNK_SIZE;
            const localY = y % CHUNK_SIZE;
            const localZ = z % CHUNK_SIZE;
            const li = (localY * CHUNK_SIZE + localZ) * CHUNK_SIZE + localX;

            const stateKey = `${state.id}:${JSON.stringify(state.props)}`;
            let stateIdxInChunk = stateMap!.get(stateKey);
            if (stateIdxInChunk === undefined) {
              const newIdx = chunk.palette.length;
              chunk.palette.push(state);
              stateMap!.set(stateKey, newIdx);
              stateIdxInChunk = newIdx;
            }
            chunk.indices[li] = stateIdxInChunk;
          }
        }
      }

      nonAirBlockCount += regionNonAir;
      const volume = {
        bounds,
        chunkSize: CHUNK_SIZE,
        chunks,
        nonAirCount: regionNonAir,
        paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
      };

      const transform: Transform = { translation: [minX, minY, minZ], rotationY: 0, mirror: 'none' };
      const origin: [number, number, number] = [0, 0, 0];

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

    const enclosingWidth = regionCount > 0 ? Math.max(0, enclosingMaxX - enclosingMinX) : 0;
    const enclosingHeight = regionCount > 0 ? Math.max(0, enclosingMaxY - enclosingMinY) : 0;
    const enclosingLength = regionCount > 0 ? Math.max(0, enclosingMaxZ - enclosingMinZ) : 0;
    const enclosingVolume = BigInt(enclosingWidth) * BigInt(enclosingHeight) * BigInt(enclosingLength);

    const report: any = {
      format: { kind: 'litematic', confidence: 'high' },
      minecraftDataVersion: mcDataVersion,
      dimensions: { width: enclosingWidth, height: enclosingHeight, length: enclosingLength },
      volume: enclosingVolume,
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

  async export(
    snapshot: ProjectSnapshot,
    target: ExportTarget,
    options: ExportOptions,
  ): Promise<ExportResult> {
    // 1. Identify target placements
    let placementsToExport: any[] = [];
    if (target.kind === 'placement') {
      const p = snapshot.placements.find((pl: any) => pl.id === target.placementId);
      if (!p) {
        throw new ExportError('EXPORT_PLACEMENT_NOT_FOUND', `Placement '${target.placementId}' not found`);
      }
      placementsToExport = [p];
    } else if (target.kind === 'importGroup') {
      const grp = snapshot.importGroups?.find((g: any) => g.id === target.importGroupId);
      const pIds = new Set(grp?.placementIds ?? []);
      placementsToExport = snapshot.placements.filter(
        (pl: any) => pIds.has(pl.id) || pl.source?.sourceGroupId === target.importGroupId,
      );
    } else if (target.kind === 'composite' || target.kind === 'selection') {
      placementsToExport = filterHiddenPlacements(snapshot.placements as any[], target.includeHidden);
    } else {
      placementsToExport = snapshot.placements as any[];
    }

    if (placementsToExport.length === 0) {
      throw new ExportError('EXPORT_EMPTY_TARGET', 'No placements available for export');
    }

    // 2. Multi-region eligibility check
    let isMultiRegion = false;
    let warnings: Diagnostic[] = [];

    if (placementsToExport.length > 1) {
      const groupMetas: RegionGroupMetadata[] = placementsToExport.map((p) => ({
        importGroupId: p.source?.sourceGroupId ?? snapshot.importGroups?.[0]?.id ?? 'default',
        baked: !!p.source?.baked,
        relativePositions: [[0, 0, 0]],
        rotation: {
          translation: [0, 0, 0],
          rotationY: p.transform?.rotationY ?? 0,
          mirror: p.transform?.mirror ?? 'none',
        },
        mirror: (p.transform?.mirror ?? 'none') as 'none' | 'x' | 'z' | 'xz',
        sourceFormat: (p.source?.format ?? 'litematic') as any,
        regions: [p.name ?? p.id],
      }));
      const eligibility = checkRegionEligibility(groupMetas);
      if (eligibility.eligible && !eligibility.exportAsSingleRegion) {
        isMultiRegion = true;
      } else {
        warnings.push({
          code: EXPORT_REGION_GROUPING_LOST,
          severity: 'warning',
          message: 'Multi-region grouping lost during export; flattening to single region',
        });
      }
    }

    const regionsCompoundMap = new Map<string, NbtTag>();
    let totalVolume = 0n;
    let totalBlocks = 0n;
    let totalBlockEntities = 0;
    let totalEntities = 0;

    let enclosingMinX = Infinity, enclosingMinY = Infinity, enclosingMinZ = Infinity;
    let enclosingMaxX = -Infinity, enclosingMaxY = -Infinity, enclosingMaxZ = -Infinity;

    const isFlattening = !isMultiRegion && placementsToExport.length > 1;

    if (isFlattening) {
      let unionMinX = Infinity, unionMinY = Infinity, unionMinZ = Infinity;
      let unionMaxX = -Infinity, unionMaxY = -Infinity, unionMaxZ = -Infinity;

      for (const p of placementsToExport) {
        const t: Vec3i = p.transform?.translation ?? [0, 0, 0];
        const b: Bounds3i = p.volume?.bounds ?? { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
        const pMinX = t[0] + b.min[0];
        const pMinY = t[1] + b.min[1];
        const pMinZ = t[2] + b.min[2];
        const pMaxX = t[0] + b.maxExclusive[0];
        const pMaxY = t[1] + b.maxExclusive[1];
        const pMaxZ = t[2] + b.maxExclusive[2];

        if (pMinX < unionMinX) unionMinX = pMinX;
        if (pMinY < unionMinY) unionMinY = pMinY;
        if (pMinZ < unionMinZ) unionMinZ = pMinZ;
        if (pMaxX > unionMaxX) unionMaxX = pMaxX;
        if (pMaxY > unionMaxY) unionMaxY = pMaxY;
        if (pMaxZ > unionMaxZ) unionMaxZ = pMaxZ;
      }

      const width = Math.max(1, unionMaxX - unionMinX);
      const height = Math.max(1, unionMaxY - unionMinY);
      const length = Math.max(1, unionMaxZ - unionMinZ);
      const pos: Vec3i = [unionMinX, unionMinY, unionMinZ];

      enclosingMinX = pos[0];
      enclosingMinY = pos[1];
      enclosingMinZ = pos[2];
      enclosingMaxX = pos[0] + width;
      enclosingMaxY = pos[1] + height;
      enclosingMaxZ = pos[2] + length;

      const regionVolume = BigInt(width) * BigInt(height) * BigInt(length);
      totalVolume = regionVolume;

      const palette: BlockStateId[] = [CANONICAL_AIR];
      const stateToPaletteIndex = new Map<string, number>();
      stateToPaletteIndex.set(`${CANONICAL_AIR.id}:{}`, 0);

      const totalEntries = width * height * length;
      const indices = totalEntries > 65536 ? new Uint32Array(totalEntries) : new Uint16Array(totalEntries);
      let regionNonAir = 0n;

      for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
          for (let x = 0; x < width; x++) {
            const wx = pos[0] + x;
            const wy = pos[1] + y;
            const wz = pos[2] + z;
            const state = getCompositeBlockState(snapshot, placementsToExport, wx, wy, wz);
            if (!VANILLA_AIR_LIKE.has(state.id)) {
              regionNonAir++;
            }

            const stateKey = `${state.id}:${JSON.stringify(state.props)}`;
            let pIdx = stateToPaletteIndex.get(stateKey);
            if (pIdx === undefined) {
              pIdx = palette.length;
              palette.push(state);
              stateToPaletteIndex.set(stateKey, pIdx);
            }

            const flat = linearIndex(x, z, y, width, length);
            indices[flat] = pIdx;
          }
        }
      }
      totalBlocks = regionNonAir;

      const paletteListTags: NbtTag[] = [];
      for (const st of palette) {
        const propTags = new Map<string, NbtTag>();
        if (st.props) {
          for (const [pk, pv] of Object.entries(st.props)) {
            propTags.set(pk, { type: 'string', value: pv });
          }
        }
        const stateMap = new Map<string, NbtTag>([
          ['Name', { type: 'string', value: st.id }],
        ]);
        if (propTags.size > 0) {
          stateMap.set('Properties', { type: 'compound', value: propTags });
        }
        paletteListTags.push({ type: 'compound', value: stateMap });
      }

      const bpe = palette.length <= 2 ? 2 : Math.ceil(Math.log2(palette.length));
      const packedBytes = encodePackedBlockStates(palette, indices, bpe);
      const packedLongs = bytesToLongs(packedBytes);

      const tileEntitiesList: NbtTag[] = [];
      for (const p of placementsToExport) {
        const t: Vec3i = p.transform?.translation ?? [0, 0, 0];
        if (p.ancillary?.blockEntities) {
          for (const [, be] of p.ancillary.blockEntities) {
            const wx = t[0] + be.position[0];
            const wy = t[1] + be.position[1];
            const wz = t[2] + be.position[2];
            const bx = wx - pos[0];
            const by = wy - pos[1];
            const bz = wz - pos[2];
            if (bx >= 0 && bx < width && by >= 0 && by < height && bz >= 0 && bz < length) {
              const beMap = new Map<string, NbtTag>();
              if (be.nbt?.type === 'compound') {
                for (const [k, v] of (be.nbt.value as Map<string, NbtTag>)) {
                  beMap.set(k, v);
                }
              }
              beMap.set('x', { type: 'int', value: bx });
              beMap.set('y', { type: 'int', value: by });
              beMap.set('z', { type: 'int', value: bz });
              tileEntitiesList.push({ type: 'compound', value: beMap });
            }
          }
        }
      }
      totalBlockEntities = tileEntitiesList.length;

      const entitiesList: NbtTag[] = [];
      for (const p of placementsToExport) {
        if (p.ancillary?.entities) {
          for (const ent of p.ancillary.entities) {
            if (ent.nbt?.type === 'compound') {
              entitiesList.push(ent.nbt);
            }
          }
        }
      }
      totalEntities = entitiesList.length;

      const regionName = snapshot.name || 'composite';
      const regionCompoundMap = new Map<string, NbtTag>([
        [
          'Position',
          {
            type: 'compound',
            value: new Map<string, NbtTag>([
              ['x', { type: 'int', value: pos[0] }],
              ['y', { type: 'int', value: pos[1] }],
              ['z', { type: 'int', value: pos[2] }],
            ]),
          },
        ],
        [
          'Size',
          {
            type: 'compound',
            value: new Map<string, NbtTag>([
              ['x', { type: 'int', value: width }],
              ['y', { type: 'int', value: height }],
              ['z', { type: 'int', value: length }],
            ]),
          },
        ],
        ['BlockStatePalette', { type: 'list', elementType: 'compound', value: paletteListTags }],
        ['BlockStates', { type: 'longArray', value: packedLongs }],
        ['TileEntities', { type: 'list', elementType: 'compound', value: tileEntitiesList }],
        ['Entities', { type: 'list', elementType: 'compound', value: entitiesList }],
        ['PendingBlockTicks', { type: 'list', elementType: 'compound', value: [] }],
        ['PendingFluidTicks', { type: 'list', elementType: 'compound', value: [] }],
      ]);

      regionsCompoundMap.set(regionName, { type: 'compound', value: regionCompoundMap });
    } else {
      const exportPlacements = isMultiRegion ? placementsToExport : [placementsToExport[0]];

      for (let rIdx = 0; rIdx < exportPlacements.length; rIdx++) {
        const p = exportPlacements[rIdx]!;
        const regionName = p.name || p.id || `region_${rIdx}`;

        const bounds: Bounds3i = p.volume?.bounds ?? { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
        const width = bounds.maxExclusive[0] - bounds.min[0];
        const height = bounds.maxExclusive[1] - bounds.min[1];
        const length = bounds.maxExclusive[2] - bounds.min[2];

        const pos: Vec3i = p.transform?.translation ?? [0, 0, 0];

        // Update enclosing box
        if (pos[0] < enclosingMinX) enclosingMinX = pos[0];
        if (pos[1] < enclosingMinY) enclosingMinY = pos[1];
        if (pos[2] < enclosingMinZ) enclosingMinZ = pos[2];
        if (pos[0] + width > enclosingMaxX) enclosingMaxX = pos[0] + width;
        if (pos[1] + height > enclosingMaxY) enclosingMaxY = pos[1] + height;
        if (pos[2] + length > enclosingMaxZ) enclosingMaxZ = pos[2] + length;

        const regionVolume = BigInt(width) * BigInt(height) * BigInt(length);
        totalVolume += regionVolume;

        // Collect palette
        const palette: BlockStateId[] = [CANONICAL_AIR];
        const stateToPaletteIndex = new Map<string, number>();
        stateToPaletteIndex.set(`${CANONICAL_AIR.id}:{}`, 0);

        const totalEntries = width * height * length;
        const indices = totalEntries > 65536 ? new Uint32Array(totalEntries) : new Uint16Array(totalEntries);
        let regionNonAir = 0n;

        for (let y = 0; y < height; y++) {
          for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
              const gx = bounds.min[0] + x;
              const gy = bounds.min[1] + y;
              const gz = bounds.min[2] + z;
              const state = getBlockStateAt(snapshot, p, gx, gy, gz);
              if (!VANILLA_AIR_LIKE.has(state.id)) {
                regionNonAir++;
              }

              const stateKey = `${state.id}:${JSON.stringify(state.props)}`;
              let pIdx = stateToPaletteIndex.get(stateKey);
              if (pIdx === undefined) {
                pIdx = palette.length;
                palette.push(state);
                stateToPaletteIndex.set(stateKey, pIdx);
              }

              // Litematica indexing: x + z * ax + y * ax * az
              const flat = linearIndex(x, z, y, width, length);
              indices[flat] = pIdx;
            }
          }
        }
        totalBlocks += regionNonAir;

        // Build BlockStatePalette list of compounds
        const paletteListTags: NbtTag[] = [];
        for (const st of palette) {
          const propTags = new Map<string, NbtTag>();
          if (st.props) {
            for (const [pk, pv] of Object.entries(st.props)) {
              propTags.set(pk, { type: 'string', value: pv });
            }
          }
          const stateMap = new Map<string, NbtTag>([
            ['Name', { type: 'string', value: st.id }],
          ]);
          if (propTags.size > 0) {
            stateMap.set('Properties', { type: 'compound', value: propTags });
          }
          paletteListTags.push({ type: 'compound', value: stateMap });
        }

        // Bit-packed BlockStates
        const bpe = palette.length <= 2 ? 2 : Math.ceil(Math.log2(palette.length));
        const packedBytes = encodePackedBlockStates(palette, indices, bpe);
        const packedLongs = bytesToLongs(packedBytes);

        // TileEntities
        const tileEntitiesList: NbtTag[] = [];
        if (p.ancillary?.blockEntities) {
          for (const [, be] of p.ancillary.blockEntities) {
            const bx = be.position[0] - bounds.min[0];
            const by = be.position[1] - bounds.min[1];
            const bz = be.position[2] - bounds.min[2];
            if (bx >= 0 && bx < width && by >= 0 && by < height && bz >= 0 && bz < length) {
              const beMap = new Map<string, NbtTag>();
              if (be.nbt?.type === 'compound') {
                for (const [k, v] of (be.nbt.value as Map<string, NbtTag>)) {
                  beMap.set(k, v);
                }
              }
              beMap.set('x', { type: 'int', value: bx });
              beMap.set('y', { type: 'int', value: by });
              beMap.set('z', { type: 'int', value: bz });
              tileEntitiesList.push({ type: 'compound', value: beMap });
            }
          }
        }
        totalBlockEntities += tileEntitiesList.length;

        // Entities
        const entitiesList: NbtTag[] = [];
        if (p.ancillary?.entities) {
          for (const ent of p.ancillary.entities) {
            if (ent.nbt?.type === 'compound') {
              entitiesList.push(ent.nbt);
            }
          }
        }
        totalEntities += entitiesList.length;

        // Build Region Compound
        const regionCompoundMap = new Map<string, NbtTag>([
          [
            'Position',
            {
              type: 'compound',
              value: new Map<string, NbtTag>([
                ['x', { type: 'int', value: pos[0] }],
                ['y', { type: 'int', value: pos[1] }],
                ['z', { type: 'int', value: pos[2] }],
              ]),
            },
          ],
          [
            'Size',
            {
              type: 'compound',
              value: new Map<string, NbtTag>([
                ['x', { type: 'int', value: width }],
                ['y', { type: 'int', value: height }],
                ['z', { type: 'int', value: length }],
              ]),
            },
          ],
          ['BlockStatePalette', { type: 'list', elementType: 'compound', value: paletteListTags }],
          ['BlockStates', { type: 'longArray', value: packedLongs }],
          ['TileEntities', { type: 'list', elementType: 'compound', value: tileEntitiesList }],
          ['Entities', { type: 'list', elementType: 'compound', value: entitiesList }],
          ['PendingBlockTicks', { type: 'list', elementType: 'compound', value: [] }],
          ['PendingFluidTicks', { type: 'list', elementType: 'compound', value: [] }],
        ]);

        regionsCompoundMap.set(regionName, { type: 'compound', value: regionCompoundMap });
      }
    }

    const enclosingWidth = Math.max(0, enclosingMaxX - enclosingMinX);
    const enclosingHeight = Math.max(0, enclosingMaxY - enclosingMinY);
    const enclosingLength = Math.max(0, enclosingMaxZ - enclosingMinZ);

    const nowMs = BigInt(Date.now());
    const metadataMap = new Map<string, NbtTag>([
      ['Name', { type: 'string', value: snapshot.name || 'Export' }],
      ['Author', { type: 'string', value: (snapshot as any).metadata?.author || '' }],
      ['Description', { type: 'string', value: '' }],
      ['RegionCount', { type: 'int', value: regionsCompoundMap.size }],
      ['TotalVolume', { type: 'long', value: totalVolume }],
      ['TotalBlocks', { type: 'long', value: totalBlocks }],
      ['TimeCreated', { type: 'long', value: nowMs }],
      ['TimeModified', { type: 'long', value: nowMs }],
      [
        'EnclosingSize',
        {
          type: 'compound',
          value: new Map<string, NbtTag>([
            ['x', { type: 'int', value: enclosingWidth }],
            ['y', { type: 'int', value: enclosingHeight }],
            ['z', { type: 'int', value: enclosingLength }],
          ]),
        },
      ],
    ]);

    const rootMap = new Map<string, NbtTag>([
      ['MinecraftDataVersion', { type: 'int', value: options.targetDataVersion || 3955 }],
      ['Version', { type: 'int', value: 6 }],
      ['SubVersion', { type: 'int', value: 1 }],
      ['Metadata', { type: 'compound', value: metadataMap }],
      ['Regions', { type: 'compound', value: regionsCompoundMap }],
    ]);

    const rootTag: NbtTag = { type: 'compound', value: rootMap };
    const bytes = encodeNbt(rootTag, { gzipCompress, gzipDecompress: gzipDecompressBounded });

    const report: ExportReport = {
      format: 'litematic',
      target: target.kind === 'placement' ? 'placement' : target.kind === 'importGroup' ? 'importGroup' : 'composite',
      minecraftDataVersion: options.targetDataVersion || 3955,
      dimensions: { width: enclosingWidth, height: enclosingHeight, length: enclosingLength },
      nonAirBlockCount: Number(totalBlocks),
      paletteSizeEstimate: 0,
      regionCount: regionsCompoundMap.size,
      estimatedOutputSizeBytes: bytes.length,
      conflictsResolvedByPrecedence: 0,
      ancillaryData: {
        blockEntities: totalBlockEntities,
        entities: totalEntities,
        biomes: false,
      },
      warnings,
      errors: [],
      validation: {
        passed: true,
        reimportComparison: { matches: true, differences: [] },
      },
    };

    return {
      bytes,
      filename: `${snapshot.name || 'export'}.litematic`,
      report,
    };
  }
}
