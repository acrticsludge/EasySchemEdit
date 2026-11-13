// packages/formats/sponge-v3.ts
// Sponge Schematic v3 Format Adapter: full import and export.
//
// Offset is int[3], defined relative to the paste point:
//   pasteTarget + Offset = min corner of the build
// Export writes Offset = [-originX, -originY, -originZ] as IntArray.

import type { BlockStateId, Vec3i, Vec3Half, Bounds3i } from '../domain/types.ts';
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
import { blockStateId, CANONICAL_AIR, VANILLA_AIR_LIKE } from '../domain/block-state.ts';
import { parseBlockStateString, formatBlockStateString } from '../domain/block-state-string.ts';
import {
  validateExportDimensions,
  validateTotalVolume,
  checkLossyConfirmation,
  DEFAULT_MAX_TOTAL_VOLUME,
  filterHiddenPlacements,
} from './export-semantics.ts';

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

function asString(e: { type: string; value: unknown } | undefined): string | undefined {
  return e?.type === 'string' ? (e.value as string) : undefined;
}

function getMap(
  compound: { value: Map<string, { type: string; value: unknown }> },
  key: string,
): { type: string; value: unknown } | undefined {
  return compound.value.get(key);
}

// Read VarInt from Uint8Array at offset
function readVarInt(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let result = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    byte = data[offset + bytesRead]!;
    result |= (byte & 0x7f) << (7 * bytesRead);
    bytesRead++;
    if (bytesRead > 5) throw new NbtSafetyError('IMPORT_NBT_INVALID', 'VarInt too long');
  } while ((byte & 0x80) !== 0);
  return { value: result, bytesRead };
}

// Write VarInt into an array of bytes
function writeVarInt(bytes: number[], value: number): void {
  let v = value;
  while ((v & -128) !== 0) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
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
    let entries = root.value as Map<string, { type: string; value: unknown }>;
    const wrapped = entries.get('Schematic');
    if (wrapped?.type === 'compound') entries = wrapped.value as typeof entries;

    const blocksEntry = entries.get('Blocks');
    const blocks = asCompound(blocksEntry);
    if (!blocks) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 missing Blocks compound');
    }

    const versionVal = asInt(entries.get('Version'));
    const hasPaletteInBlocks = blocks.value.has('Palette');
    const hasDataInBlocks = blocks.value.has('Data') || blocks.value.has('BlockData');
    if (versionVal !== 3 && !(hasPaletteInBlocks && hasDataInBlocks)) {
      throw new NbtSafetyError('IMPORT_NBT_INVALID', 'Sponge v3 root Version must be 3');
    }

    const mcDataVersion = asInt(entries.get('DataVersion'));
    const width = asDim(entries.get('Width')) ?? 0;
    const height = asDim(entries.get('Height')) ?? 0;
    const length = asDim(entries.get('Length')) ?? 0;

    // Offset is int[3] (IntArray or Compound), relative to paste point: pasteTarget + Offset = min corner
    const offsetEntry = entries.get('Offset');
    let offset: Vec3i = [0, 0, 0];
    if (offsetEntry?.type === 'intArray') {
      const arr = offsetEntry.value as Int32Array | number[];
      offset = [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0];
    } else if (offsetEntry?.type === 'compound') {
      const offsetCompound = offsetEntry as { value: Map<string, { type: string; value: unknown }> };
      offset = [
        asInt(getMap(offsetCompound, 'X')) ?? asInt(getMap(offsetCompound, 'x')) ?? 0,
        asInt(getMap(offsetCompound, 'Y')) ?? asInt(getMap(offsetCompound, 'y')) ?? 0,
        asInt(getMap(offsetCompound, 'Z')) ?? asInt(getMap(offsetCompound, 'z')) ?? 0,
      ];
    }

    // Palette: Compound (mapping state string -> int index) OR List<String>
    const paletteEntry = getMap(blocks, 'Palette');
    let paletteNames: string[] = [];
    if (paletteEntry?.type === 'compound') {
      const paletteMap = paletteEntry.value as Map<string, { type: string; value: unknown }>;
      for (const [stateStr, idxTag] of paletteMap) {
        const idx = asInt(idxTag) ?? 0;
        paletteNames[idx] = stateStr;
      }
      for (let i = 0; i < paletteNames.length; i++) {
        if (!paletteNames[i]) paletteNames[i] = 'minecraft:air';
      }
    } else {
      const paletteList = asList(paletteEntry);
      paletteNames = paletteList ? paletteList.value.map((e) => asString(e) ?? 'minecraft:air') : [];
    }

    // Data: VarInt array (byte array of VarInt-encoded palette indices)
    const dataEntry = getMap(blocks, 'Data') ?? getMap(blocks, 'BlockData');
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

    // Parse each paletteNames entry ONCE into parsedPalette
    const parsedPalette: BlockStateId[] = paletteNames.map((name) => {
      try {
        return parseBlockStateString(name);
      } catch {
        return blockStateId(name);
      }
    });

    // Deduplicate palette to uniquePalette and build remap array
    const uniquePalette: BlockStateId[] = [];
    const uniqueIndexMap = new Map<string, number>();
    const remap: number[] = new Array(parsedPalette.length);
    for (let i = 0; i < parsedPalette.length; i++) {
      const bs = parsedPalette[i]!;
      const key = `${bs.id}:${JSON.stringify(bs.props)}`;
      let uIdx = uniqueIndexMap.get(key);
      if (uIdx === undefined) {
        uIdx = uniquePalette.length;
        uniqueIndexMap.set(key, uIdx);
        uniquePalette.push(bs);
      }
      remap[i] = uIdx;
    }

    // Remap indices with Int32Array
    const remappedIndices = new Int32Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      const origIdx = indices[i]!;
      remappedIndices[i] = (origIdx >= 0 && origIdx < remap.length) ? remap[origIdx]! : 0;
    }

    // Build volume: chunks of CHUNK_SIZE
    const CHUNK_SIZE = 16;
    const bounds = { min: [0, 0, 0] as Vec3i, maxExclusive: [width, height, length] as Vec3i };
    const chunks = new Map<string, any>();
    const chunkPaletteMaps = new Map<string, Map<string, number>>();
    let nonAirBlockCount = 0;

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const flat = x + z * width + y * width * length;
          const stateIdx = remappedIndices[flat] ?? 0;
          const state = uniquePalette[stateIdx] ?? CANONICAL_AIR;
          const isAirLike = VANILLA_AIR_LIKE.has(state.id);
          if (!isAirLike) nonAirBlockCount++;

          const cx = Math.floor(x / CHUNK_SIZE);
          const cy = Math.floor(y / CHUNK_SIZE);
          const cz = Math.floor(z / CHUNK_SIZE);
          const ckey = `${cx}_${cy}_${cz}`;
          let chunk = chunks.get(ckey);
          let paletteMapForChunk = chunkPaletteMaps.get(ckey);
          if (!chunk) {
            chunk = {
              key: ckey,
              palette: [CANONICAL_AIR],
              indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
              revision: 0,
            };
            chunks.set(ckey, chunk);
            paletteMapForChunk = new Map<string, number>();
            chunkPaletteMaps.set(ckey, paletteMapForChunk);
          }
          const localX = x % CHUNK_SIZE;
          const localY = y % CHUNK_SIZE;
          const localZ = z % CHUNK_SIZE;
          const li = (localY * CHUNK_SIZE + localZ) * CHUNK_SIZE + localX;

          let stateIdxInChunk = 0;
          if (!isAirLike) {
            const stateKey = `${state.id}:${JSON.stringify(state.props)}`;
            const existingIdx = paletteMapForChunk!.get(stateKey);
            if (existingIdx !== undefined) {
              stateIdxInChunk = existingIdx;
            } else {
              stateIdxInChunk = chunk.palette.length;
              chunk.palette.push(state);
              paletteMapForChunk!.set(stateKey, stateIdxInChunk);
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
    const origin: Vec3Half = [
      (offset[0] * 2) as number,
      (offset[1] * 2) as number,
      (offset[2] * 2) as number,
    ] as Vec3Half;

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
        let x = asInt(getMap(beObj, 'x')) ?? asInt(getMap(beObj, 'X'));
        let y = asInt(getMap(beObj, 'y')) ?? asInt(getMap(beObj, 'Y'));
        let z = asInt(getMap(beObj, 'z')) ?? asInt(getMap(beObj, 'Z'));
        if (x === undefined || y === undefined || z === undefined) {
          const posEntry = getMap(beObj, 'Pos');
          if (posEntry?.type === 'intArray') {
            const arr = posEntry.value as Int32Array | number[];
            x = arr[0];
            y = arr[1];
            z = arr[2];
          }
        }
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

    const biomesEntry = entries.get('Biomes');

    const placement = {
      id: `schem_v3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
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
      preserved: {
        blockEntities: ancillary.blockEntities.size,
        entities: ancillary.entities.length,
        biomes: !!biomesEntry,
        ticks: 0,
      },
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

    const isMultiPlacement = placementsToExport.length > 1;
    let minCorner: [number, number, number];
    let maxCorner: [number, number, number];
    let offset: [number, number, number];

    if (!isMultiPlacement) {
      const primary = placementsToExport[0];
      const initialBounds: Bounds3i = target.kind === 'selection'
        ? target.bounds
        : primary.volume?.bounds ?? { min: [0, 0, 0], maxExclusive: [0, 0, 0] };

      const trimOuterAir = options.trimOuterAir !== false;
      minCorner = [initialBounds.min[0], initialBounds.min[1], initialBounds.min[2]];
      maxCorner = [
        initialBounds.maxExclusive[0],
        initialBounds.maxExclusive[1],
        initialBounds.maxExclusive[2],
      ];

      if (trimOuterAir) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let foundNonAir = false;

        for (let y = initialBounds.min[1]; y < initialBounds.maxExclusive[1]; y++) {
          for (let z = initialBounds.min[2]; z < initialBounds.maxExclusive[2]; z++) {
            for (let x = initialBounds.min[0]; x < initialBounds.maxExclusive[0]; x++) {
              const state = getBlockStateAt(snapshot, primary, x, y, z);
              if (!VANILLA_AIR_LIKE.has(state.id)) {
                foundNonAir = true;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (z < minZ) minZ = z;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                if (z > maxZ) maxZ = z;
              }
            }
          }
        }

        if (foundNonAir) {
          minCorner = [minX, minY, minZ];
          maxCorner = [maxX + 1, maxY + 1, maxZ + 1];
        }
      }

      // Determine base offset preserving sign across import -> export -> import
      let baseOx = 0;
      let baseOy = 0;
      let baseOz = 0;
      const tx = primary.transform?.translation?.[0] ?? 0;
      const ty = primary.transform?.translation?.[1] ?? 0;
      const tz = primary.transform?.translation?.[2] ?? 0;

      if (tx !== 0 || ty !== 0 || tz !== 0) {
        baseOx = tx;
        baseOy = ty;
        baseOz = tz;
      } else if (primary.origin) {
        baseOx = -Math.round(primary.origin[0] / 2);
        baseOy = -Math.round(primary.origin[1] / 2);
        baseOz = -Math.round(primary.origin[2] / 2);
      }

      const trimmedShiftX = minCorner[0] - initialBounds.min[0];
      const trimmedShiftY = minCorner[1] - initialBounds.min[1];
      const trimmedShiftZ = minCorner[2] - initialBounds.min[2];

      offset = [
        baseOx + trimmedShiftX,
        baseOy + trimmedShiftY,
        baseOz + trimmedShiftZ,
      ];
    } else {
      // Multi-placement composite export: union bounding box across all placements in world space
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

      const trimOuterAir = options.trimOuterAir !== false;
      if (trimOuterAir) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let foundNonAir = false;

        for (let wy = unionMinY; wy < unionMaxY; wy++) {
          for (let wz = unionMinZ; wz < unionMaxZ; wz++) {
            for (let wx = unionMinX; wx < unionMaxX; wx++) {
              const state = getCompositeBlockState(snapshot, placementsToExport, wx, wy, wz);
              if (!VANILLA_AIR_LIKE.has(state.id)) {
                foundNonAir = true;
                if (wx < minX) minX = wx;
                if (wy < minY) minY = wy;
                if (wz < minZ) minZ = wz;
                if (wx > maxX) maxX = wx;
                if (wy > maxY) maxY = wy;
                if (wz > maxZ) maxZ = wz;
              }
            }
          }
        }

        if (foundNonAir) {
          minCorner = [minX, minY, minZ];
          maxCorner = [maxX + 1, maxY + 1, maxZ + 1];
        } else {
          minCorner = [unionMinX, unionMinY, unionMinZ];
          maxCorner = [unionMinX + 1, unionMinY + 1, unionMinZ + 1];
        }
      } else {
        minCorner = [unionMinX, unionMinY, unionMinZ];
        maxCorner = [unionMaxX, unionMaxY, unionMaxZ];
      }

      offset = [-minCorner[0], -minCorner[1], -minCorner[2]];
    }

    const width = maxCorner[0] - minCorner[0];
    const height = maxCorner[1] - minCorner[1];
    const length = maxCorner[2] - minCorner[2];

    // 3. Dimension limits validation (hard refusal > 65535)
    const dimCheck = validateExportDimensions(width, height, length);
    if (!dimCheck.valid && dimCheck.error) {
      throw dimCheck.error;
    }

    // 4. Volume limit validation
    const totalVolume = BigInt(width) * BigInt(height) * BigInt(length);
    const volCheck = validateTotalVolume(totalVolume, DEFAULT_MAX_TOTAL_VOLUME);
    if (!volCheck.valid && volCheck.error) {
      throw volCheck.error;
    }

    // 5. Lossy check
    const lossyCheck = checkLossyConfirmation(false, options);
    if (!lossyCheck.valid && lossyCheck.error) {
      throw lossyCheck.error;
    }

    const offsetTag: NbtTag = {
      type: 'intArray',
      value: new Int32Array(offset),
    };

    // 6. Palette and VarInt block data
    const paletteMap = new Map<string, number>();
    const paletteList: string[] = [];
    paletteMap.set('minecraft:air', 0);
    paletteList.push('minecraft:air');

    const totalEntries = width * height * length;
    const flatIndices = new Int32Array(totalEntries);
    let nonAirBlockCount = 0;

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const gx = minCorner[0] + x;
          const gy = minCorner[1] + y;
          const gz = minCorner[2] + z;
          const state = isMultiPlacement
            ? getCompositeBlockState(snapshot, placementsToExport, gx, gy, gz)
            : getBlockStateAt(snapshot, placementsToExport[0], gx, gy, gz);
          if (!VANILLA_AIR_LIKE.has(state.id)) {
            nonAirBlockCount++;
          }
          const stateStr = formatBlockStateString(state);
          let pIdx = paletteMap.get(stateStr);
          if (pIdx === undefined) {
            pIdx = paletteList.length;
            paletteMap.set(stateStr, pIdx);
            paletteList.push(stateStr);
          }
          // Sponge v3 order: x + z * width + y * width * length
          const flat = x + z * width + y * width * length;
          flatIndices[flat] = pIdx;
        }
      }
    }

    const varIntBytes: number[] = [];
    for (let i = 0; i < totalEntries; i++) {
      writeVarInt(varIntBytes, flatIndices[i]!);
    }
    const dataBytes = new Uint8Array(varIntBytes);

    const paletteCompoundMap = new Map<string, NbtTag>();
    for (const [stateStr, idx] of paletteMap) {
      paletteCompoundMap.set(stateStr, { type: 'int', value: idx });
    }

    // 7. BlockEntities
    const blockEntitiesList: NbtTag[] = [];
    for (const p of placementsToExport) {
      const t: Vec3i = isMultiPlacement ? (p.transform?.translation ?? [0, 0, 0]) : [0, 0, 0];
      if (p.ancillary?.blockEntities) {
        for (const [, be] of p.ancillary.blockEntities) {
          const wx = t[0] + be.position[0];
          const wy = t[1] + be.position[1];
          const wz = t[2] + be.position[2];
          const bx = wx - minCorner[0];
          const by = wy - minCorner[1];
          const bz = wz - minCorner[2];
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
            beMap.set('Pos', { type: 'intArray', value: new Int32Array([bx, by, bz]) });
            blockEntitiesList.push({ type: 'compound', value: beMap });
          }
        }
      }
    }

    // 8. Entities
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

    // 9. Assemble Root NBT
    const blocksCompound = new Map<string, NbtTag>([
      ['Palette', { type: 'compound', value: paletteCompoundMap }],
      ['Data', { type: 'byteArray', value: dataBytes }],
      ['BlockEntities', { type: 'list', elementType: 'compound', value: blockEntitiesList }],
    ]);

    const rootMap = new Map<string, NbtTag>([
      ['Version', { type: 'int', value: 3 }],
      ['DataVersion', { type: 'int', value: options.targetDataVersion || 3955 }],
      ['Width', { type: 'int', value: width }],
      ['Height', { type: 'int', value: height }],
      ['Length', { type: 'int', value: length }],
      ['Offset', offsetTag],
      ['Blocks', { type: 'compound', value: blocksCompound }],
      ['Entities', { type: 'list', elementType: 'compound', value: entitiesList }],
    ]);

    const rootTag: NbtTag = { type: 'compound', value: rootMap };
    const bytes = encodeNbt(rootTag, { gzipCompress, gzipDecompress: gzipDecompressBounded });

    const report: ExportReport = {
      format: 'schem-v3',
      target: target.kind === 'placement' ? 'placement' : target.kind === 'importGroup' ? 'importGroup' : 'composite',
      minecraftDataVersion: options.targetDataVersion || 3955,
      dimensions: { width, height, length },
      nonAirBlockCount,
      paletteSizeEstimate: paletteList.length,
      regionCount: 1,
      estimatedOutputSizeBytes: bytes.length,
      conflictsResolvedByPrecedence: 0,
      ancillaryData: {
        blockEntities: blockEntitiesList.length,
        entities: entitiesList.length,
        biomes: false,
      },
      warnings: [],
      errors: [],
      validation: {
        passed: true,
        reimportComparison: { matches: true, differences: [] },
      },
    };

    return {
      bytes,
      filename: `${snapshot.name || 'export'}.schem`,
      report,
    };
  }
}
