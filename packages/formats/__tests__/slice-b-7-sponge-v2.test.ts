// Slice b-7: Sponge v2 Reader
import { SpongeV2Adapter } from '../sponge-v2.ts';
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
function str(v: string): NbtTag { return { type: 'string', value: v }; }

function buildSpongeV2(): Uint8Array {
  // Palette: compound { "minecraft:air": 0, "minecraft:stone": 1 }
  const palette = compound([
    ['minecraft:air', int(0)],
    ['minecraft:stone', int(1)],
  ]);

  // BlockData: VarInt bytes [0, 1, 0, 1, 0, 1, 0, 1]
  const blockData = new Uint8Array([0, 1, 0, 1, 0, 1, 0, 1]);

  // Offset: int[3] = [0, 0, 0]
  const offset = compound([
    ['X', int(0)],
    ['Y', int(0)],
    ['Z', int(0)],
  ]);

  const root = compound([
    ['Palette', palette],
    ['BlockData', { type: 'byteArray', value: blockData }],
    ['Offset', offset],
    ['Width', int(2)],
    ['Height', int(2)],
    ['Length', int(2)],
  ]);

  return encodeNbt(root, passthrough);
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

const adapter = new SpongeV2Adapter();

// 1. detect returns schem-v2 kind
{
  const result = adapter.detect(new Uint8Array([1, 2, 3]));
  check(result.format.kind === 'schem-v2', 'detect kind=schem-v2');
}

// 2. import Sponge v2 — lossless, no warning, normalizedImport false
{
  const bytes = buildSpongeV2();
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
  check(result.normalizedImport === false, 'normalizedImport false (lossless)');
  check(result.report.warnings.length === 0, 'no warnings (lossless)');

  const placement = result.placements[0];
  check(placement.volume.bounds.maxExclusive[0] === 2, 'width=2');
  check(placement.volume.bounds.maxExclusive[1] === 2, 'height=2');
  check(placement.volume.bounds.maxExclusive[2] === 2, 'length=2');
  check(placement.volume.nonAirCount === 4, 'nonAirCount=4 (4 stone entries)');

  // Offset = [0,0,0] → translation [0,0,0]
  check(placement.transform.translation[0] === 0 && placement.transform.translation[1] === 0 && placement.transform.translation[2] === 0, 'translation [0,0,0]');

  // Verify block states: flat index = x + z*width + y*width*length
  // entries [0,1,0,1,0,1,0,1] → air at 0,2,4,6; stone at 1,3,5,7
  const chunks = placement.volume.chunks;
  const chunk = chunks.get('0_0_0');
  check(!!chunk, 'chunk 0_0_0 exists');
  if (chunk) {
    const idx0 = chunk.indices[0];
    const state0 = chunk.palette[idx0];
    check(state0.id === 'minecraft:air', 'flat index 0 = air (palette[0])');
    const idx1 = chunk.indices[1];
    const state1 = chunk.palette[idx1];
    check(state1.id === 'minecraft:stone', 'flat index 1 = stone (palette[1])');
  }
}

// 3. Offset is int[3]
{
  const offset = compound([
    ['X', int(5)],
    ['Y', int(-3)],
    ['Z', int(10)],
  ]);
  const palette = compound([['minecraft:stone', int(0)]]);
  const blockData = new Uint8Array([0]);
  const root = compound([
    ['Palette', palette],
    ['BlockData', { type: 'byteArray', value: blockData }],
    ['Offset', offset],
    ['Width', int(1)],
    ['Height', int(1)],
    ['Length', int(1)],
  ]);
  const bytes = encodeNbt(root, passthrough);
  const result = await adapter.import(bytes, {
    preserveSourceOrigin: false, autoArrange: false, strict: false,
    maxCompressedBytes: 50 * 1024 * 1024, maxDecompressedBytes: 200 * 1024 * 1024,
    maxTotalVolume: 65535n * 65535n * 65535n, maxNonAirBlocks: 10_000_000,
    maxNbtNestingDepth: 512, maxNbtTagCount: 1_000_000,
  });
  const placement = result.placements[0];
  check(placement.transform.translation[0] === 5, 'Offset X=5 → translation X=5');
  check(placement.transform.translation[1] === -3, 'Offset Y=-3 → translation Y=-3');
  check(placement.transform.translation[2] === 10, 'Offset Z=10 → translation Z=10');
}

console.log(failures === 0 ? 'All slice b-7 sponge v2 tests passed.' : failures + ' failure(s)');
