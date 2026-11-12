// Slice b-1.5: format detection
import {
  detectFormat,
  type FormatDetectionResult,
} from '../format-detection.ts';
import {
  encodeNbt,
  type NbtServices,
} from '../nbts.ts';

const passthrough: NbtServices = {
  gzipCompress: (b: Uint8Array) => b,
  gzipDecompress: (b: Uint8Array) => b,
};

function compound(entries: [string, { type: string; value: unknown }][]): {
  type: 'compound';
  value: Map<string, { type: string; value: unknown }>;
} {
  const map = new Map<string, { type: string; value: unknown }>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map } as unknown as {
    type: 'compound';
    value: Map<string, { type: string; value: unknown }>;
  };
}

function int(v: number) { return { type: 'int', value: v }; }
function str(v: string) { return { type: 'string', value: v }; }
function byteArr(v: Uint8Array) { return { type: 'byteArray', value: v }; }

function buildV3(): Uint8Array {
  const blockEntities = compound([]);
  const palette = compound([['minecraft:stone', int(0)]]);
  const blocks = compound([
    ['Palette', palette],
    ['Data', byteArr(new Uint8Array([0]))],
    ['BlockEntities', blockEntities],
  ]);
  const offset = compound([
    ['X', int(0)],
    ['Y', int(0)],
    ['Z', int(0)],
  ]);
  const entities = compound([]);
  const biomes = compound([]);
  const root = compound([
    ['Version', int(3)],
    ['DataVersion', int(3345)],
    ['Width', int(4)],
    ['Height', int(4)],
    ['Length', int(4)],
    ['Offset', offset],
    ['Blocks', blocks],
    ['Entities', entities],
    ['Biomes', biomes],
  ]);
  return encodeNbt(root, passthrough);
}

// Build a Sponge v2 NBT: root compound with Palette (compound) + BlockData (byteArray)
function buildV2(): Uint8Array {
  const palette = compound([
    ['minecraft:stone', int(0)],
    ['minecraft:dirt', int(1)],
  ]);
  const offset = compound([
    ['X', int(0)],
    ['Y', int(0)],
    ['Z', int(0)],
  ]);
  const root = compound([
    ['Palette', palette],
    ['BlockData', byteArr(new Uint8Array([0, 1]))],
    ['Width', int(2)],
    ['Height', int(2)],
    ['Length', int(2)],
    ['Offset', offset],
  ]);
  return encodeNbt(root, passthrough);
}

// Build a legacy .schematic NBT: root Materials + Blocks + Data
function buildLegacy(): Uint8Array {
  const root = compound([
    ['Materials', compound([])],
    ['Blocks', compound([])],
    ['Data', compound([])],
  ]);
  return encodeNbt(root, passthrough);
}

// Build a vanilla .nbt: root size + palette + blocks + DataVersion
function buildVanilla(): Uint8Array {
  const size = compound([
    ['x', int(2)],
    ['y', int(2)],
    ['z', int(2)],
  ]);
  const palette = compound([['minecraft:stone', int(0)]]);
  const root = compound([
    ['size', size],
    ['palette', palette],
    ['blocks', compound([])],
    ['DataVersion', int(3345)],
  ]);
  return encodeNbt(root, passthrough);
}

function assertDetect(
  bytes: Uint8Array,
  ext: string,
  expectedKind: string,
  expectedDecompressed: boolean,
  label: string,
): void {
  const result: FormatDetectionResult = detectFormat(bytes, ext, passthrough);
  console.assert(
    result.format.kind === expectedKind,
    `${label}: expected kind ${expectedKind}, got ${result.format.kind}`,
  );
  console.assert(
    result.decompressionRequired === expectedDecompressed,
    `${label}: expected decompressionRequired ${expectedDecompressed}, got ${result.decompressionRequired}`,
  );
  console.assert(
    typeof result.filenameExtension === 'string',
    `${label}: filenameExtension present`,
  );
  console.log(`${label}: kind=${result.format.kind} decompressed=${result.decompressionRequired} extMatch=${result.extensionMatches}`);
}

// 1. Gzip magic detected → decompressionRequired = true (no services → cannot inspect)
{
  const gzipBytes = new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0, 0, 0]);
  const result = detectFormat(gzipBytes, '.nbt');
  console.assert(result.decompressionRequired === true, 'gzip magic → decompressionRequired');
  console.assert(result.format.kind === 'unknown', 'gzip without decompressor → unknown');
  console.log('gzip magic: decompressionRequired=' + result.decompressionRequired + ' kind=' + result.format.kind);
}

// 2. Sponge v3 detected
assertDetect(buildV3(), '.schem', 'schem-v3', false, 'Sponge v3');

// 3. Sponge v2 detected
assertDetect(buildV2(), '.litematic', 'schem-v2', false, 'Sponge v2');

// 4. Legacy .schematic detected
assertDetect(buildLegacy(), '.schematic', 'schematic-legacy', false, 'legacy .schematic');

// 5. Vanilla .nbt detected
assertDetect(buildVanilla(), '.nbt', 'vanilla-nbt', false, 'vanilla .nbt');

// 6. Extension mismatch → warning, import proceeds using detected format
{
  // v3 structure but .nbt extension → mismatch, still schem-v3
  const result = detectFormat(buildV3(), '.nbt', passthrough);
  console.assert(result.format.kind === 'schem-v3', 'extension mismatch → still detects v3');
  console.assert(result.extensionMatches === false, 'extensionMatches=false on mismatch');
  console.log('extension mismatch: kind=' + result.format.kind + ' extMatch=' + result.extensionMatches);
}

// 7. Unknown structure
{
  const root = compound([['Foo', int(1)]]);
  const bytes = encodeNbt(root, passthrough);
  const result = detectFormat(bytes, '.nbt', passthrough);
  console.assert(result.format.kind === 'unknown', 'unknown structure → unknown');
  console.log('unknown: kind=' + result.format.kind);
}

console.log('All slice b-1.5 format detection tests passed.');
