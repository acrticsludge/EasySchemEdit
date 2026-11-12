// Slice b-9: inspect() header-only import preview
import { inspect, type InspectResult } from '../inspect.ts';
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
function list(elems: NbtTag[]): NbtTag { return { type: 'list', value: elems, elementType: 'compound' }; }

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

function buildV3Root(width: number, height: number, length: number,
  paletteEntries: [string, number][], dataValues: number[]): Uint8Array {
  const palette = compound(paletteEntries.map(([name, idx]) => [name, int(idx)]));
  const dataBytes = new Uint8Array(dataValues);
  const offset = compound([
    ['X', int(0)],
    ['Y', int(0)],
    ['Z', int(0)],
  ]);
  const blocks = compound([
    ['Palette', palette],
    ['Data', { type: 'byteArray', value: dataBytes }],
    ['BlockEntities', compound([])],
  ]);
  const root = compound([
    ['Version', int(3)],
    ['DataVersion', int(3345)],
    ['Width', int(width)],
    ['Height', int(height)],
    ['Length', int(length)],
    ['Offset', offset],
    ['Blocks', blocks],
    ['Entities', compound([])],
    ['Biomes', compound([])],
  ]);
  return encodeNbt(root, passthrough);
}

// 1. inspect() is async and takes services
{
  const result = await inspect(new Uint8Array([1, 2, 3]), passthrough);
  check(typeof result === 'object', 'inspect() returns object');
  check('fileSizeBytes' in result, 'has fileSizeBytes');
  check('compressedSizeBytes' in result, 'has compressedSizeBytes');
  check('format' in result, 'has format');
}

// 2. nonAirBlockCount absent unless cheaply available
{
  const bytes = buildV3Root(4, 4, 4, [], []);
  const result: InspectResult = await inspect(bytes, passthrough);
  check(result.nonAirBlockCount === undefined, 'nonAirBlockCount absent (not cheaply available)');
}

// 3. Returns format from Sponge v3 structure
{
  const bytes = buildV3Root(4, 4, 4, [], []);
  const result: InspectResult = await inspect(bytes, passthrough);
  check(result.format.kind === 'schem-v3', 'detects schem-v3');
  check(result.dimensions?.width === 4, 'width=4');
  check(result.dimensions?.height === 4, 'height=4');
  check(result.dimensions?.length === 4, 'length=4');
}

// 4. fileSizeBytes and compressedSizeBytes always present
{
  const root = compound([['Foo', int(1)]]);
  const bytes = encodeNbt(root, passthrough);
  const result: InspectResult = await inspect(bytes, passthrough);
  check(result.fileSizeBytes === bytes.length, 'fileSizeBytes = bytes.length');
  check(result.compressedSizeBytes === bytes.length, 'compressedSizeBytes = bytes.length');
}

// 5. paletteSize from Palette compound
{
  const palette = compound([['minecraft:stone', int(0)], ['minecraft:dirt', int(1)]]);
  const dataBytes = new Uint8Array([0, 1]);
  const offset = compound([['X', int(0)], ['Y', int(0)], ['Z', int(0)]]);
  const blocks = compound([
    ['Palette', palette],
    ['Data', { type: 'byteArray', value: dataBytes }],
    ['BlockEntities', compound([])],
  ]);
  const root = compound([
    ['Version', int(3)],
    ['DataVersion', int(3345)],
    ['Width', int(2)],
    ['Height', int(2)],
    ['Length', int(2)],
    ['Offset', offset],
    ['Blocks', blocks],
    ['Entities', compound([])],
    ['Biomes', compound([])],
  ]);
  const bytes = encodeNbt(root, passthrough);
  const result: InspectResult = await inspect(bytes, passthrough);
  check(result.paletteSize === 2, 'paletteSize=2');
}

// 6. regionCount from Regions compound (litematic)
{
  const root = compound([
    ['Version', int(1)],
    ['SubVersion', int(1)],
    ['MinecraftDataVersion', int(3345)],
    ['Metadata', compound([])],
    ['Regions', compound([['region1', compound([])], ['region2', compound([])]])],
  ]);
  const bytes = encodeNbt(root, passthrough);
  const result: InspectResult = await inspect(bytes, passthrough);
  check(result.format.kind === 'litematic', 'detects litematic');
  check(result.regionCount === 2, 'regionCount=2');
}

console.log(failures === 0 ? 'All slice b-9 inspect() tests passed.' : failures + ' failure(s)');
