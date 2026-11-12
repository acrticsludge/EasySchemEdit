// Slice b-4: Litematic adapter
import { LitematicAdapter } from '../litematic.ts';
import { encodeNbt } from '../nbts.ts';
import type { NbtTag } from '../../domain/nbt.ts';

const passthrough = {
  gzipCompress: (b: Uint8Array) => b,
  gzipDecompress: (b: Uint8Array) => b,
};

function compound(entries: [string, NbtTag][]): NbtTag {
  const map = new Map<string, NbtTag>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map };
}
function int(v: number): NbtTag { return { type: 'int', value: v }; }
function long(v: bigint): NbtTag { return { type: 'long', value: v }; }
function str(v: string): NbtTag { return { type: 'string', value: v }; }
function list(elems: NbtTag[]): NbtTag { return { type: 'list', value: elems, elementType: 'compound' }; }

function buildLitematic2x2x2(): Uint8Array {
  const palette = compound([
    ['minecraft:air', compound([
      ['Name', str('minecraft:air')],
      ['Properties', compound([])],
    ])],
    ['minecraft:stone', compound([
      ['Name', str('minecraft:stone')],
      ['Properties', compound([])],
    ])],
  ]);

  // BlockStates: bpe=2, 8 entries [0,1,0,1,0,1,0,1]
  // entry i at bits [i*2, i*2+1]: entry1=1→bit2, entry3=1→bit6, entry5=1→bit10, entry7=1→bit14
  // value = (1<<2)|(1<<6)|(1<<10)|(1<<14) = 0x4444
  const blockStates = { type: 'longArray', value: BigInt64Array.from([0x4444n]) };

  const region = compound([
    ['Position', list([int(0), int(0), int(0)])],
    ['Size', list([int(2), int(2), int(2)])],
    ['BlockStatePalette', palette],
    ['BlockStates', blockStates],
    ['TileEntities', list([])],
    ['Entities', list([])],
  ]);

  const regions = compound([['region1', region]]);
  const metadata = compound([
    ['Name', str('test')],
    ['Author', str('test')],
    ['Description', str('')],
  ]);

  const root = compound([
    ['Version', int(1)],
    ['SubVersion', int(1)],
    ['MinecraftDataVersion', int(3345)],
    ['Metadata', metadata],
    ['Regions', regions],
  ]);

  return encodeNbt(root, passthrough);
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

const adapter = new LitematicAdapter();

// 1. detect returns litematic kind
{
  const result = adapter.detect(new Uint8Array([1, 2, 3]));
  check(result.format.kind === 'litematic', 'detect kind=litematic');
}

// 2. import 2x2x2 litematic
{
  const bytes = buildLitematic2x2x2();
  const result = await adapter.import(bytes, {
    preserveSourceOrigin: false,
    autoArrange: false,
    strict: false,
    maxCompressedBytes: 50 * 1024 * 1024,
    maxDecompressedBytes: 200 * 1024 * 1024,
    maxTotalVolume: 65535n * 65535n * 65535n,
    maxNonAirBlocks: 10_000_000,
    maxNbtNestingDepth: 512,
    maxNbtTagCount: 1_000_000,
  });
  check(result.placements.length === 1, 'one placement');
  check(result.report.regionCount === 1, 'one region');
  check(result.normalizedImport === false, 'normalizedImport false');

  const placement = result.placements[0];
  check(placement.id === 'region1', 'placement id=region1');
  check(placement.volume.bounds.maxExclusive[0] === 2, 'width=2');
  check(placement.volume.bounds.maxExclusive[1] === 2, 'height=2');
  check(placement.volume.bounds.maxExclusive[2] === 2, 'length=2');
  check(placement.volume.nonAirCount === 4, 'nonAirCount=4 (4 stone entries)');
  check(placement.transform.translation[0] === 0 && placement.transform.translation[1] === 0 && placement.transform.translation[2] === 0, 'position [0,0,0]');
  check(placement.origin[0] === 0 && placement.origin[1] === 0 && placement.origin[2] === 0, 'origin [0,0,0]');

  // Verify block states: flat index = x + z*ax + y*ax*az, entries [0,1,0,1,0,1,0,1]
  // positions with state index 1 (dirt): i=1,3,5,7
  const chunks = placement.volume.chunks;
  const chunk = chunks.get('0_0_0');
  check(!!chunk, 'chunk 0_0_0 exists');
  if (chunk) {
    const idx1 = chunk.indices[1];
    const state1 = chunk.palette[idx1];
    check(state1.id === 'minecraft:stone', 'flat index 1 = stone');
    const idx0 = chunk.indices[0];
    const state0 = chunk.palette[idx0];
    check(state0.id === 'minecraft:air', 'flat index 0 = air');
  }
}

// 3. Negative Size reversal: ax=-2 reverses X
{
  const palette = compound([
    ['minecraft:stone', compound([['Name', str('minecraft:stone')], ['Properties', compound([])]])],
    ['minecraft:dirt', compound([['Name', str('minecraft:dirt')], ['Properties', compound([])]])],
  ]);
  // blockStates entries [0,1,0,1,...]; raw x=0 → entry 0 = stone
  // reversal ax=-2: rawToNormalizedCoord(0,0,0,{ax:-2,ay:2,az:2}) = {x: 1, y: 0, z: 0}
  // flat index = 1 → entry at flat 1 = dirt → stored at chunk position li=0
  const blockStates = { type: 'longArray', value: BigInt64Array.from([0x4444n]) };
  const region = compound([
    ['Position', list([int(0), int(0), int(0)])],
    ['Size', list([int(-2), int(2), int(2)])],
    ['BlockStatePalette', palette],
    ['BlockStates', blockStates],
    ['TileEntities', list([])],
    ['Entities', list([])],
  ]);
  const regions = compound([['region-neg', region]]);
  const metadata = compound([['Name', str('neg')], ['Author', str('neg')], ['Description', str('')]]);
  const root = compound([
    ['Version', int(1)], ['SubVersion', int(1)], ['MinecraftDataVersion', int(3345)],
    ['Metadata', metadata], ['Regions', regions],
  ]);
  const bytes = encodeNbt(root, passthrough);
  const result = await adapter.import(bytes, {
    preserveSourceOrigin: false, autoArrange: false, strict: false,
    maxCompressedBytes: 50 * 1024 * 1024, maxDecompressedBytes: 200 * 1024 * 1024,
    maxTotalVolume: 65535n * 65535n * 65535n, maxNonAirBlocks: 10_000_000,
    maxNbtNestingDepth: 512, maxNbtTagCount: 1_000_000,
  });
  const placement = result.placements[0];
  const chunk = placement.volume.chunks.get('0_0_0');
  // normalized x=1 → flat index 1 → entry 1 = dirt → stored at chunk position li=0
  if (chunk) {
    const idx0 = chunk.indices[0];
    const state0 = chunk.palette[idx0];
    check(state0.id === 'minecraft:dirt', 'negative ax reversal: chunk position 0 = dirt');
  }
}

console.log(failures === 0 ? 'All slice b-4 litematic tests passed.' : failures + ' failure(s)');
