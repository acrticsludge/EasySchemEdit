// packages/formats/__tests__/slice-e1-1-api.test.ts
// Comprehensive tests for slice E1.1: Formats public API, codecs, and exports.

import {
  importSchematic,
  exportSchematic,
  gzipCompress,
  gzipDecompressBounded,
  isGzip,
  NbtSafetyError,
  ExportError,
} from '../index.ts';
import { encodeNbt } from '../nbts.ts';
import { blockStateId, CANONICAL_AIR } from '../../domain/block-state.ts';
import type { NbtTag } from '../../domain/nbt.ts';
import type { Bounds3i, Vec3i } from '../../domain/types.ts';
import type { Transform } from '../../domain/coordinates.ts';
import type { Placement } from '../../domain/placement.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('PASS:', msg);
  }
}

function compound(entries: [string, NbtTag][]): NbtTag {
  const map = new Map<string, NbtTag>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map };
}
function int(v: number): NbtTag { return { type: 'int', value: v }; }
function short(v: number): NbtTag { return { type: 'short', value: v }; }
function str(v: string): NbtTag { return { type: 'string', value: v }; }
function list(elems: NbtTag[], elemType: any = 'compound'): NbtTag {
  return { type: 'list', value: elems, elementType: elemType };
}

// Helper to create an in-memory placement
function createTestPlacement(
  id: string,
  name: string,
  width: number,
  height: number,
  length: number,
  origin: [number, number, number],
  translation: Vec3i,
  blockMap: Map<string, any>,
  blockEntitiesMap?: Map<string, { position: Vec3i; nbt: NbtTag }>,
  sourceFormat: string = 'schem-v3',
  sourceGroupId?: string,
): Placement {
  const bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [width, height, length] };
  const CHUNK_SIZE = 16;
  const chunks = new Map<string, any>();
  let nonAirCount = 0;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const state = blockMap.get(`${x}_${y}_${z}`) ?? CANONICAL_AIR;
        if (state.id !== 'minecraft:air') nonAirCount++;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const ckey = `${cx}_${cy}_${cz}`;

        let chunk = chunks.get(ckey);
        if (!chunk) {
          chunk = {
            key: ckey,
            palette: [CANONICAL_AIR],
            indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
            revision: 0,
          };
          chunks.set(ckey, chunk);
        }

        const lx = x % CHUNK_SIZE;
        const ly = y % CHUNK_SIZE;
        const lz = z % CHUNK_SIZE;
        const li = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

        let pIdx = 0;
        if (state.id !== 'minecraft:air') {
          let found = -1;
          for (let i = 1; i < chunk.palette.length; i++) {
            if (
              chunk.palette[i].id === state.id &&
              JSON.stringify(chunk.palette[i].props) === JSON.stringify(state.props)
            ) {
              found = i;
              break;
            }
          }
          if (found >= 0) {
            pIdx = found;
          } else {
            pIdx = chunk.palette.length;
            chunk.palette.push(state);
          }
        }
        chunk.indices[li] = pIdx;
      }
    }
  }

  const transform: Transform = { translation, rotationY: 0, mirror: 'none' };
  const ancillary = {
    blockEntities: blockEntitiesMap ?? new Map<string, { position: Vec3i; nbt: NbtTag }>(),
    entities: [],
    biomes: undefined,
    pendingBlockTicks: [],
    pendingFluidTicks: [],
    unknownTags: new Map<string, NbtTag>(),
  };

  return {
    id,
    name,
    volume: {
      bounds,
      chunkSize: CHUNK_SIZE,
      chunks,
      nonAirCount,
      paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
    },
    transform,
    origin,
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: {
      format: sourceFormat,
      filename: undefined,
      regionName: name,
      dataVersion: 3955,
      formatVersion: 3,
      sourceGroupId,
      rawMetadata: undefined,
      diagnostics: [],
    },
    eraseTombstones: new Set(),
    ancillary,
  } as any as Placement;
}

console.log('--- TEST SUITE: slice E1.1 API & Codecs ---');

// ============================================================================
// TEST 1: Round-trip Sponge v3
// ============================================================================
{
  console.log('\n[Test 1] Round-trip Sponge v3');
  const stone = blockStateId('minecraft:stone');
  const stairs = blockStateId('minecraft:oak_stairs', {
    facing: 'east',
    half: 'bottom',
    shape: 'straight',
    waterlogged: 'false',
  });
  const chest = blockStateId('minecraft:chest', {
    facing: 'north',
    type: 'single',
    waterlogged: 'false',
  });

  const blockMap = new Map<string, any>([
    ['0_0_0', stone],
    ['1_0_0', stairs],
    ['0_1_0', stone],
    ['1_1_0', chest],
  ]);

  const chestNbt = compound([
    ['id', str('minecraft:chest')],
    ['CustomName', str('{"text":"Secret Chest"}')],
  ]);
  const beMap = new Map<string, { position: Vec3i; nbt: NbtTag }>([
    ['1_1_0', { position: [1, 1, 0], nbt: chestNbt }],
  ]);

  // origin [4, 0, 8] -> originBlock = [2, 0, 4] -> Offset = [-2, 0, -4]
  const placement = createTestPlacement(
    'p1',
    'p1',
    2,
    2,
    2,
    [4, 0, 8],
    [0, 0, 0],
    blockMap,
    beMap,
    'schem-v3',
  );

  const snapshot = {
    schemaVersion: 1,
    id: 'proj1',
    name: 'sponge_roundtrip',
    placements: [placement],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };

  const exported = await exportSchematic('schem-v3', snapshot, { trimOuterAir: false });
  check(isGzip(exported.bytes), 'Sponge v3 output is gzip compressed');
  check(exported.filename === 'sponge_roundtrip.schem', 'export filename matches snapshot name');
  check(exported.report.format === 'schem-v3', 'export report has schem-v3 format');
  check(exported.report.dimensions.width === 2, 'export report width is 2');

  const imported = await importSchematic(exported.bytes, exported.filename);
  check(imported.placements.length === 1, 'import returns 1 placement');
  check(imported.report.format.kind === 'schem-v3', 'imported format detected as schem-v3');
  check(imported.report.dimensions.width === 2, 'imported width is 2');
  check(imported.report.dimensions.height === 2, 'imported height is 2');
  check(imported.report.dimensions.length === 2, 'imported length is 2');

  const imp = imported.placements[0];
  check(
    imp.transform.translation[0] === -2 &&
    imp.transform.translation[1] === 0 &&
    imp.transform.translation[2] === -4,
    'Offset [-2, 0, -4] preserved exactly in imported translation',
  );

  // Check block states
  const chunk = imp.volume.chunks.get('0_0_0')!;
  check(!!chunk, 'imported placement has chunk 0_0_0');

  // local (0, 0, 0): index = (0*16 + 0)*16 + 0 = 0
  const s000 = chunk.palette[chunk.indices[0]];
  check(s000?.id === 'minecraft:stone', 'block at (0,0,0) is stone');

  // local (1, 0, 0): index = (0*16 + 0)*16 + 1 = 1
  const s100 = chunk.palette[chunk.indices[1]];
  check(s100?.id === 'minecraft:oak_stairs', 'block at (1,0,0) is oak_stairs');
  check(s100?.props.facing === 'east', 'oak_stairs has facing=east');

  // local (1, 1, 0): index = (1*16 + 0)*16 + 1 = 257
  const s110 = chunk.palette[chunk.indices[257]];
  check(s110?.id === 'minecraft:chest', 'block at (1,1,0) is chest');
  check(s110?.props.facing === 'north', 'chest has facing=north');

  // Check block entity
  const be = imp.ancillary.blockEntities.get('1_1_0');
  check(!!be, 'block entity at (1,1,0) preserved');
  if (be && be.nbt.type === 'compound') {
    const customNameTag = be.nbt.value.get('CustomName');
    check(
      customNameTag?.type === 'string' && customNameTag.value === '{"text":"Secret Chest"}',
      'block entity NBT CustomName preserved',
    );
  }

  // Re-export the already-imported placement a second time and re-import:
  // Verifies Offset sign preservation across repeated import -> export -> import cycles
  const snapshot2 = {
    ...snapshot,
    placements: imported.placements,
  };
  const exported2 = await exportSchematic('schem-v3', snapshot2, { trimOuterAir: false });
  const imported2 = await importSchematic(exported2.bytes, exported2.filename);
  const imp2 = imported2.placements[0]!;
  check(
    imp2.transform.translation[0] === -2 &&
    imp2.transform.translation[1] === 0 &&
    imp2.transform.translation[2] === -4,
    'Offset [-2, 0, -4] preserved on 2nd import -> export -> import cycle',
  );
}

// ============================================================================
// TEST 1b: Composite multi-placement export to Sponge v3
// ============================================================================
{
  console.log('\n[Test 1b] Composite multi-placement export to Sponge v3');
  const stone = blockStateId('minecraft:stone');
  const stairs = blockStateId('minecraft:oak_stairs', {
    facing: 'east',
    half: 'bottom',
    shape: 'straight',
    waterlogged: 'false',
  });

  const pA = createTestPlacement(
    'pA',
    'pA',
    2,
    1,
    2,
    [0, 0, 0],
    [0, 0, 0],
    new Map([['0_0_0', stone]]),
    undefined,
    'schem-v3',
  );
  const pB = createTestPlacement(
    'pB',
    'pB',
    2,
    1,
    2,
    [0, 0, 0],
    [2, 0, 0], // shifted in X by 2
    new Map([['0_0_0', stairs]]),
    undefined,
    'schem-v3',
  );
  const compositeSnap = {
    schemaVersion: 1,
    id: 'comp_proj',
    name: 'composite_schem',
    placements: [pA, pB],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };
  const compExported = await exportSchematic('schem-v3', compositeSnap, { trimOuterAir: false });
  const compImported = await importSchematic(compExported.bytes, compExported.filename);
  check(compImported.placements.length === 1, 'composite export flattens to 1 placement');
  const cChunk = compImported.placements[0]!.volume.chunks.get('0_0_0')!;
  check(!!cChunk, 'composite placement chunk exists');
  // pA block at (0, 0, 0): index = 0 -> stone
  const b000 = cChunk.palette[cChunk.indices[0]];
  check(b000?.id === 'minecraft:stone', 'composite includes block from placement A (stone at 0,0,0)');
  // pB block at world (2, 0, 0) -> relative to minCorner(0, 0, 0) is (2, 0, 0): index = 2 -> oak_stairs
  const b200 = cChunk.palette[cChunk.indices[2]];
  check(b200?.id === 'minecraft:oak_stairs', 'composite includes block from placement B (oak_stairs at 2,0,0)');
}

// ============================================================================
// TEST 2: Round-trip Litematic single-region & multi-region & negative Size
// ============================================================================
{
  console.log('\n[Test 2] Round-trip Litematic');

  // 2a. Single-region
  const stone = blockStateId('minecraft:stone');
  const diamond = blockStateId('minecraft:diamond_block');
  const singleMap = new Map<string, any>([
    ['0_0_0', stone],
    ['1_0_0', diamond],
    ['0_1_1', diamond],
  ]);
  const pSingle = createTestPlacement(
    'reg1',
    'MainRegion',
    2,
    2,
    2,
    [0, 0, 0],
    [5, 10, 15],
    singleMap,
    undefined,
    'litematic',
  );
  const snapSingle = {
    schemaVersion: 1,
    id: 'single_proj',
    name: 'single_test',
    placements: [pSingle],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };

  const expSingle = await exportSchematic('litematic', snapSingle);
  check(isGzip(expSingle.bytes), 'Litematic output is gzip compressed');
  check(expSingle.report.format === 'litematic', 'export report has litematic format');

  const impSingle = await importSchematic(expSingle.bytes, 'single_test.litematic');
  check(impSingle.placements.length === 1, 'single-region import returns 1 placement');
  check(impSingle.placements[0].name === 'MainRegion', 'region name MainRegion preserved');
  check(
    impSingle.placements[0].transform.translation[0] === 5 &&
    impSingle.placements[0].transform.translation[1] === 10 &&
    impSingle.placements[0].transform.translation[2] === 15,
    'single-region position [5, 10, 15] preserved',
  );

  const cSingle = impSingle.placements[0]!.volume.chunks.get('0_0_0')!;
  check(cSingle.palette[cSingle.indices[0]]?.id === 'minecraft:stone', 'single-region (0,0,0) is stone');
  check(cSingle.palette[cSingle.indices[1]]?.id === 'minecraft:diamond_block', 'single-region (1,0,0) is diamond_block');

  // 2b. Multi-region round-trip
  const map1 = new Map<string, any>([['0_0_0', stone]]);
  const map2 = new Map<string, any>([['0_0_0', diamond]]);

  const pMulti1 = createTestPlacement('p1', 'house', 2, 2, 2, [0, 0, 0], [0, 0, 0], map1, undefined, 'litematic', 'group_1');
  const pMulti2 = createTestPlacement('p2', 'tower', 2, 2, 2, [0, 0, 0], [20, 5, 0], map2, undefined, 'litematic', 'group_1');

  const snapMulti = {
    schemaVersion: 1,
    id: 'multi_proj',
    name: 'multi_test',
    placements: [pMulti1, pMulti2],
    importGroups: [{
      id: 'group_1',
      name: 'group_1',
      placementIds: ['p1', 'p2'],
      regionPositions: [[0, 0, 0], [20, 5, 0]],
      sourceFormat: 'litematic',
    }],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };

  const expMulti = await exportSchematic('litematic', snapMulti, {
    target: { kind: 'importGroup', importGroupId: 'group_1' },
  });
  check(expMulti.report.regionCount === 2, 'multi-region export report has 2 regions');

  const impMulti = await importSchematic(expMulti.bytes, 'multi_test.litematic');
  check(impMulti.placements.length === 2, 'multi-region import returns 2 placements');

  const importedHouse = impMulti.placements.find((p) => p.name === 'house');
  const importedTower = impMulti.placements.find((p) => p.name === 'tower');
  check(!!importedHouse && !!importedTower, 'both house and tower regions restored by name');
  check(
    importedHouse?.transform.translation[0] === 0 &&
    importedHouse?.transform.translation[1] === 0 &&
    importedHouse?.transform.translation[2] === 0,
    'house position [0, 0, 0] preserved',
  );
  check(
    importedTower?.transform.translation[0] === 20 &&
    importedTower?.transform.translation[1] === 5 &&
    importedTower?.transform.translation[2] === 0,
    'tower position [20, 5, 0] preserved',
  );

  // 2c. Negative-size region import normalization
  // Litematica with Size = [-2, 2, 2]
  const negPalette = compound([
    ['minecraft:stone', compound([['Name', str('minecraft:stone')], ['Properties', compound([])]])],
    ['minecraft:dirt', compound([['Name', str('minecraft:dirt')], ['Properties', compound([])]])],
  ]);
  const blockStates = { type: 'longArray', value: BigInt64Array.from([0x4444n]) } as NbtTag;
  const negRegion = compound([
    ['Position', compound([['x', int(0)], ['y', int(0)], ['z', int(0)]])],
    ['Size', compound([['x', int(-2)], ['y', int(2)], ['z', int(2)]])],
    ['BlockStatePalette', negPalette],
    ['BlockStates', blockStates],
    ['TileEntities', list([])],
    ['Entities', list([])],
  ]);
  const negRoot = compound([
    ['Version', int(1)],
    ['SubVersion', int(1)],
    ['MinecraftDataVersion', int(3955)],
    ['Metadata', compound([['Name', str('neg')], ['Author', str('')], ['Description', str('')]])],
    ['Regions', compound([['neg_region', negRegion]])],
  ]);
  const negBytes = encodeNbt(negRoot, { gzipCompress, gzipDecompress: gzipDecompressBounded });

  const impNeg = await importSchematic(negBytes, 'neg.litematic');
  check(impNeg.placements.length === 1, 'negative-size region imported');
  const negP = impNeg.placements[0];
  check(
    negP.volume.bounds.maxExclusive[0] === 2 &&
    negP.volume.bounds.maxExclusive[1] === 2 &&
    negP.volume.bounds.maxExclusive[2] === 2,
    'negative Size [-2, 2, 2] normalized to bounds width=2, height=2, length=2',
  );
  const negChunk = negP.volume.chunks.get('0_0_0')!;
  check(negChunk.palette[negChunk.indices[0]]?.id === 'minecraft:dirt', 'negative ax reversal places dirt at local x=0');

  // 2d. Multi-placement flattening to Litematica
  console.log('\n[Test 2d] Multi-placement flattening to Litematica');
  const pFlat1 = createTestPlacement('f1', 'part1', 2, 1, 2, [0, 0, 0], [0, 0, 0], new Map([['0_0_0', stone]]), undefined, 'schem-v3');
  const pFlat2 = createTestPlacement('f2', 'part2', 2, 1, 2, [0, 0, 0], [2, 0, 0], new Map([['0_0_0', diamond]]), undefined, 'schem-v2');
  const snapFlat = {
    schemaVersion: 1,
    id: 'flat_proj',
    name: 'flat_test',
    placements: [pFlat1, pFlat2],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };
  const expFlat = await exportSchematic('litematic', snapFlat);
  check(expFlat.report.regionCount === 1, 'flattened export report has 1 region');
  check(
    expFlat.report.warnings.some((w) => w.code === 'EXPORT_REGION_GROUPING_LOST'),
    'flattened export emits EXPORT_REGION_GROUPING_LOST warning',
  );
  const impFlat = await importSchematic(expFlat.bytes, 'flat_test.litematic');
  check(impFlat.placements.length === 1, 'flattened import returns 1 placement');
  const flatChunk = impFlat.placements[0]!.volume.chunks.get('0_0_0')!;
  check(flatChunk.palette[flatChunk.indices[0]]?.id === 'minecraft:stone', 'flattened includes stone from placement 1');
  check(flatChunk.palette[flatChunk.indices[2]]?.id === 'minecraft:diamond_block', 'flattened includes diamond_block from placement 2');
}

// ============================================================================
// TEST 3: Oversized gzip bomb rejected by gzipDecompressBounded
// ============================================================================
{
  console.log('\n[Test 3] Oversized gzip bomb rejected');
  // Create 1 MB of zeros compressed into a tiny payload
  const rawZeros = new Uint8Array(1024 * 1024);
  const compressedBomb = gzipCompress(rawZeros);

  let caught = false;
  try {
    // Limit to 50 KB decompressed output
    gzipDecompressBounded(compressedBomb, 50 * 1024);
  } catch (err: any) {
    caught = true;
    check(err instanceof NbtSafetyError, 'error is instance of NbtSafetyError');
    check(err.code === 'DECOMPRESSION_LIMIT_EXCEEDED', 'error code is DECOMPRESSION_LIMIT_EXCEEDED');
  }
  check(caught, 'gzip bomb was rejected before accumulating unbounded output');
}

// ============================================================================
// TEST 4: Legacy .schematic bytes rejected with stable error code
// ============================================================================
{
  console.log('\n[Test 4] Legacy .schematic bytes rejected');
  const legacyRoot = compound([
    ['Materials', str('Alpha')],
    ['Blocks', { type: 'byteArray', value: new Uint8Array([1, 2, 3, 4]) }],
    ['Data', { type: 'byteArray', value: new Uint8Array([0, 0, 0, 0]) }],
    ['Width', short(2)],
    ['Height', short(2)],
    ['Length', short(1)],
  ]);
  const legacyBytes = encodeNbt(legacyRoot, { gzipCompress, gzipDecompress: gzipDecompressBounded });

  let legacyCaught = false;
  try {
    await importSchematic(legacyBytes, 'building.schematic');
  } catch (err: any) {
    legacyCaught = true;
    check(err instanceof NbtSafetyError, 'legacy error is NbtSafetyError');
    check(
      err.code === 'UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC',
      'legacy error code is UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC',
    );
  }
  check(legacyCaught, 'legacy .schematic rejected by importSchematic');
}

// ============================================================================
// TEST 5: Dimension > 65535 rejected on Sponge v3 export
// ============================================================================
{
  console.log('\n[Test 5] Dimension > 65535 rejected on Sponge v3 export');
  const stone = blockStateId('minecraft:stone');
  const oversizedBounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [70000, 10, 10] };

  const oversizedPlacement = {
    id: 'oversized_p',
    name: 'oversized_p',
    volume: {
      bounds: oversizedBounds,
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: { translation: [0, 0, 0] as Vec3i, rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0] as [number, number, number],
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'schem-v3', diagnostics: [] },
    eraseTombstones: new Set(),
    ancillary: { blockEntities: new Map(), entities: [] },
  };

  const snapOversized = {
    schemaVersion: 1,
    id: 'oversized_proj',
    name: 'oversized_proj',
    placements: [oversizedPlacement],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };

  let dimCaught = false;
  try {
    await exportSchematic('schem-v3', snapOversized, { trimOuterAir: false });
  } catch (err: any) {
    dimCaught = true;
    check(err instanceof ExportError, 'oversized error is ExportError');
    check(err.code === 'EXPORT_DIMENSION_LIMIT', 'oversized error code is EXPORT_DIMENSION_LIMIT');
  }
  check(dimCaught, 'dimension > 65535 rejected on Sponge v3 export');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n----------------------------------------');
if (failures === 0) {
  console.log('ALL SLICE E1.1 API TESTS PASSED!');
} else {
  console.error(`${failures} failure(s) in slice E1.1 test suite`);
  process.exit(1);
}
