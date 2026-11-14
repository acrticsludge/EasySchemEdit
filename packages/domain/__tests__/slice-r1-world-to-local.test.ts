import type { Vec3Half, Vec3i } from '../types.ts';
import type { Transform } from '../coordinates.ts';
import {
  localBlockToWorld,
  worldBlockToLocal,
} from '../coordinates.ts';

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

const rotations: Array<Transform['rotationY']> = [0, 90, 180, 270];
const mirrors: Array<Transform['mirror']> = ['none', 'x', 'z'];
const origins: Vec3Half[] = [
  [0, 0, 0],
  [2, 0, 2],
  [4, -6, 8],
  [-10, 14, -20],
];
const translations: Vec3i[] = [
  [0, 0, 0],
  [10, 64, -20],
  [-50, 12, 100],
];
const testCells: Vec3i[] = [
  [0, 0, 0],
  [1, 2, 3],
  [-5, 10, -3],
  [15, 0, 15],
  [100, -64, 200],
];

// Test suite 1: Full combinatorial roundtrip localBlockToWorld -> worldBlockToLocal
for (const rot of rotations) {
  for (const mir of mirrors) {
    for (const origin of origins) {
      for (const translation of translations) {
        const placement = {
          transform: { translation, rotationY: rot, mirror: mir },
          origin,
        };

        for (const cell of testCells) {
          const world = localBlockToWorld(placement, cell);
          const local = worldBlockToLocal(placement, world);

          assert(
            local[0] === cell[0] && local[1] === cell[1] && local[2] === cell[2],
            `Roundtrip failed for rot=${rot}, mirror=${mir}, origin=[${origin}], trans=[${translation}], cell=[${cell}] => got [${local}]`,
          );

          // Reverse roundtrip: world -> local -> world
          const reWorld = localBlockToWorld(placement, local);
          assert(
            reWorld[0] === world[0] && reWorld[1] === world[1] && reWorld[2] === world[2],
            `Reverse roundtrip failed for world=[${world}] => got reWorld=[${reWorld}]`,
          );
        }
      }
    }
  }
}

// Test suite 2: Error handling for off-grid configurations
// Non-integral origin (odd numbers in doubled half-block units) creates off-grid points
const offGridPlacement = {
  transform: { translation: [0, 0, 0] as Vec3i, rotationY: 0 as const, mirror: 'none' as const },
  origin: [1, 0, 0] as Vec3Half,
};

let threw = false;
try {
  worldBlockToLocal(offGridPlacement, [0, 0, 0] as Vec3i);
} catch (e) {
  threw = true;
  assert(
    (e as Error).message.includes('off-grid under inverse transform'),
    'Expected off-grid error message',
  );
}
assert(threw, 'worldBlockToLocal must throw for off-grid placement');

console.log(`\nSlice R-1 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
