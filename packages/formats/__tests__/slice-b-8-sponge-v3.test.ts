// Slice b-8: Sponge v3 Adapter
import { SpongeV3Adapter } from '../sponge-v3.ts';
import { encodeNbt } from '../nbts.ts';

const passthrough = {
  gzipCompress: (b: Uint8Array) => b,
  gzipDecompress: (b: Uint8Array) => b,
};

function compound(entries: [string, { type: string; value: unknown }][]) {
  const map = new Map<string, { type: string; value: unknown }>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map };
}
function int(v: number) { return { type: 'int', value: v }; }
function str(v: string) { return { type: 'string', value: v }; }
function list(elems: { type: string; value: unknown }[]) { return { type: 'list', value: elems }; }

function buildSpongeV3(): Uint8Array {
  // Palette: List<String> = ["minecraft:air", "minecraft:stone"]
  const palette = list([str('minecraft:air'), str('minecraft:stone')]);

  // Data: VarInt array [0, 1, 0, 1, 0, 1, 0, 1] (8 entries for 2x2x2)
  const dataBytes = new Uint8Array([0, 1, 0, 1, 0, 1, 0, 1]);

  // Offset: int[3] = [0, 0, 0]
  const offset = compound([
    ['X', int(0)],
    ['Y', int(0)],
    ['Z', int(0)],
  ]);

  const blocks = compound([
    ['Palette', palette],
    ['Data', { type: 'byteArray', value: dataBytes }],
    ['BlockEntities', list([])],
  ]);

  const root = compound([
    ['Version', int(3)],
    ['DataVersion', int(3345)],
    ['Width', int(2)],
    ['Height', int(2)],
    ['Length', int(2)],
    ['Offset', offset],
    ['Blocks', blocks],
    ['Entities', list([])],
    ['Biomes', compound([])],
  ]);

  return encodeNbt(root, passthrough);
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

const adapter = new SpongeV3Adapter();

// 1. detect returns schem-v3 kind
{
  const result = adapter.detect(new Uint8Array([1, 2, 3]));
  check(result.format.kind === 'schem-v3', 'detect kind=schem-v3');
}

// 2. import Sponge v3 — Version=3 required
{
  const bytes = buildSpongeV3();
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
  check(result.normalizedImport === false, 'normalizedImport false');

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
  const idx0 = chunk.indices[0];
  const state0 = chunk.palette[idx0];
  check(state0.id === 'minecraft:air', 'flat index 0 = air');
  const idx1 = chunk.indices[1];
  const state1 = chunk.palette[idx1];
  check(state1.id === 'minecraft:stone', 'flat index 1 = stone');
}

// 3. Offset is int[3], relative to paste point (pasteTarget + Offset = min corner)
{
  const offset = compound([
    ['X', int(-5)],
    ['Y', int(10)],
    ['Z', int(-3)],
  ]);
  const palette = list([str('minecraft:stone')]);
  const dataBytes = new Uint8Array([0]);
  const blocks = compound([
    ['Palette', palette],
    ['Data', { type: 'byteArray', value: dataBytes }],
    ['BlockEntities', list([])],
  ]);
  const root = compound([
    ['Version', int(3)],
    ['DataVersion', int(3345)],
    ['Width', int(1)],
    ['Height', int(1)],
    ['Length', int(1)],
    ['Offset', offset],
    ['Blocks', blocks],
    ['Entities', list([])],
  ]);
  const bytes = encodeNbt(root, passthrough);
  const result = await adapter.import(bytes, {
    preserveSourceOrigin: false, autoArrange: false, strict: false,
    maxCompressedBytes: 50 * 1024 * 1024, maxDecompressedBytes: 200 * 1024 * 1024,
    maxTotalVolume: 65535n * 65535n * 65535n, maxNonAirBlocks: 10_000_000,
    maxNbtNestingDepth: 512, maxNbtTagCount: 1_000_000,
  });
  const placement = result.placements[0];
  check(placement.transform.translation[0] === -5, 'Offset X=-5 → translation X=-5');
  check(placement.transform.translation[1] === 10, 'Offset Y=10 → translation Y=10');
  check(placement.transform.translation[2] === -3, 'Offset Z=-3 → translation Z=-3');

  // Worked example: pasteTarget + Offset = min corner (relative coordinates only)
  // pasteTarget at local (100, 64, 100), Offset = [-5, 10, -3]
  // min corner = (100 + -5, 64 + 10, 100 + -3) = (95, 74, 97) — relative, no world coords
  check(placement.origin[0] === -10, 'origin X = 2 * -5 = -10');
  check(placement.origin[1] === 20, 'origin Y = 2 * 10 = 20');
  check(placement.origin[2] === -6, 'origin Z = 2 * -3 = -6');
}

console.log(failures === 0 ? 'All slice b-8 sponge v3 tests passed.' : failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
