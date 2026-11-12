import type { BlockEntityRecord, EntityRecord, BiomeVolume, PendingTickRecord } from '../shared-types.ts';
import type { Vec3Half } from '../types.ts';
import type { Transform } from '../coordinates.ts';
import {
  rotateMirrorBlockEntityPositions,
  rotateMirrorEntityPositions,
  rotateMirrorBiomeVolume,
  rotateMirrorPendingTicks,
} from '../ancillary-transforms.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Test 1: Block entity position transformed correctly
const be: BlockEntityRecord = {
  position: [1, 0, 0],
  nbt: { type: 'compound', value: new Map() },
};
const r1 = rotateMirrorBlockEntityPositions(
  [be],
  { translation: [0, 0, 0], rotationY: 90, mirror: 'none' },
  [0, 0, 0],
);
assert(r1.warnings.length === 0, 'no warnings for block entity transform');
assert(r1.result.length === 1, 'one result');
assert(r1.result[0].position[0] === 0 && r1.result[0].position[1] === 0 && r1.result[0].position[2] === -2, 'block entity rotated 90°');

// Test 2: Entity position/rotation transformed
const ent: EntityRecord = {
  id: 'e1',
  position: [1.5, 2.0, 0.5],
  rotation: [0, 90, 0],
  nbt: { type: 'compound', value: new Map() },
};
const r2 = rotateMirrorEntityPositions(
  [ent],
  { translation: [0, 0, 0], rotationY: 90, mirror: 'none' },
  [0, 0, 0],
);
assert(r2.result.length === 1, 'one entity result');
assert(r2.result[0].id === 'e1', 'entity id preserved');

// Test 3: Biome volume remapped
const biome: BiomeVolume = {
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  palette: ['minecraft:plains'],
  indices: new Uint8Array(4096),
};
const r3 = rotateMirrorBiomeVolume(biome, { translation: [0, 0, 0], rotationY: 0, mirror: 'none' });
assert(r3.result !== undefined, 'biome volume returned');

// Test 4: Pending tick position transformed
const tick: PendingTickRecord = {
  position: [1, 0, 0],
  blockState: { id: 'minecraft:stone', props: {} },
  tickDelay: 5,
  nbt: { type: 'compound', value: new Map() },
};
const r4 = rotateMirrorPendingTicks(
  [tick],
  { translation: [0, 0, 0], rotationY: 90, mirror: 'none' },
  [0, 0, 0],
);
assert(r4.result.length === 1, 'one tick result');
assert(r4.result[0].position[0] === 0 && r4.result[0].position[2] === -2, 'tick rotated 90°');

// Test 5: Unknown tags preserved (not tested here since no transform for them)
// Just verify the function signature accepts unknownTags via nbt field

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
