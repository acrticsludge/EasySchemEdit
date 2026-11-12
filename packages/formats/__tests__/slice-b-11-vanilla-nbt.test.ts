// Slice b-11: Vanilla .nbt Convert-on-Import
import { VanillaNbtAdapter } from '../vanilla-nbt.ts';
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

function buildVanillaNbt(): Uint8Array {
  // Palette: List<Compound { Name, Properties }>
  const palette = list([
    compound([['Name', str('minecraft:air')], ['Properties', compound([])]]),
    compound([['Name', str('minecraft:stone')], ['Properties', compound([])]]),
    compound([['Name', str('minecraft:dirt')], ['Properties', compound([])]]),
  ]);

  // Blocks: List<Compound { pos: Int[3], state: Int, nbt?: Compound }>
  const blocks = list([
    compound([
      ['pos', list([int(0), int(0), int(0)])],
      ['state', int(1)], // stone
    ]),
    compound([
      ['pos', list([int(1), int(0), int(0)])],
      ['state', int(2)], // dirt
    ]),
    compound([
      ['pos', list([int(0), int(1), int(0)])],
      ['state', int(0)], // air
    ]),
  ]);

  // Size
  const size = compound([
    ['x', int(2)],
    ['y', int(1)],
    ['z', int(2)],
  ]);

  const root = compound([
    ['size', size],
    ['palette', palette],
    ['blocks', blocks],
    ['entities', list([])],
    ['DataVersion', int(3345)],
  ]);

  return encodeNbt(root, passthrough);
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

const adapter = new VanillaNbtAdapter();

// 1. detect returns vanilla-nbt kind
{
  const result = adapter.detect(new Uint8Array([1, 2, 3]));
  check(result.format.kind === 'vanilla-nbt', 'detect kind=vanilla-nbt');
}

// 2. import vanilla .nbt — normalizedImport true (palette remapping)
{
  const bytes = buildVanillaNbt();
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
  check(result.normalizedImport === true, 'normalizedImport=true (palette remapping)');

  const placement = result.placements[0];
  check(placement.volume.bounds.maxExclusive[0] === 2, 'width=2');
  check(placement.volume.bounds.maxExclusive[1] === 1, 'height=1');
  check(placement.volume.bounds.maxExclusive[2] === 2, 'length=2');
  check(placement.volume.nonAirCount === 2, 'nonAirCount=2 (stone + dirt)');
  check(placement.source.dataVersion === 3345, 'DataVersion=3345');
  check(result.report.regionCount === 1, 'one region');
}

console.log(failures === 0 ? 'All slice b-11 vanilla .nbt tests passed.' : failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
