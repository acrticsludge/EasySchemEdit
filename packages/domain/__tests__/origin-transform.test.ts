import type { Vec3Half, Vec3i } from '../types.ts';
import type { Transform } from '../coordinates.ts';
import {
  applyRotation,
  applyMirror,
  localBlockToWorld,
  computeOriginForWorldBlock,
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

function simulateSetOrigin(
  placement: { transform: Transform; origin: Vec3Half },
  newOrigin: Vec3Half,
  keepBlocksInPlace = true,
): { transform: Transform; origin: Vec3Half } {
  let newTranslation = [...placement.transform.translation] as Vec3i;
  if (keepBlocksInPlace) {
    const [ox, oy, oz] = placement.origin;
    const [nx, ny, nz] = newOrigin;
    const dHalfX = (nx - ox) / 2;
    const dHalfY = (ny - oy) / 2;
    const dHalfZ = (nz - oz) / 2;
    const [mx, my, mz] = applyMirror(dHalfX, dHalfY, dHalfZ, placement.transform.mirror);
    const [rx, ry, rz] = applyRotation(mx, my, mz, placement.transform.rotationY);
    newTranslation = [
      Math.round(placement.transform.translation[0] + rx),
      Math.round(placement.transform.translation[1] + ry),
      Math.round(placement.transform.translation[2] + rz),
    ];
  }
  return {
    transform: {
      ...placement.transform,
      translation: newTranslation,
    },
    origin: [...newOrigin] as Vec3Half,
  };
}

const rotations: Array<Transform['rotationY']> = [0, 90, 180, 270];
const mirrors: Array<Transform['mirror']> = ['none', 'x', 'z'];
const initialOrigins: Vec3Half[] = [
  [0, 0, 0],
  [2, 0, 2],
  [4, -6, 8],
  [-10, 14, -20],
];
const initialTranslations: Vec3i[] = [
  [0, 0, 0],
  [10, 64, -20],
  [-50, 12, 100],
];
const targetWorldBlocks: Vec3i[] = [
  [0, 0, 0],
  [15, 65, 30],
  [-25, 4, -10],
  [100, 128, 200],
];
const sampleLocalBlocks: Vec3i[] = [
  [0, 0, 0],
  [1, 2, 3],
  [-4, 7, -2],
  [16, 0, 16],
  [8, -5, 12],
];

console.log('--- Testing computeOriginForWorldBlock and placement:setOrigin ---');

for (const rot of rotations) {
  for (const mir of mirrors) {
    for (const origin of initialOrigins) {
      for (const translation of initialTranslations) {
        const placement = {
          transform: { translation, rotationY: rot, mirror: mir },
          origin,
        };

        for (const targetWorld of targetWorldBlocks) {
          const newOrigin = computeOriginForWorldBlock(placement, targetWorld);

          // Origin must be integral (even numbers in half-block space)
          assert(
            newOrigin[0] % 2 === 0 && newOrigin[1] % 2 === 0 && newOrigin[2] % 2 === 0,
            `Origin must be even half-block integers: rot=${rot}, mir=${mir}, got [${newOrigin}]`,
          );

          // Simulate placement:setOrigin with keepBlocksInPlace: true
          const updated = simulateSetOrigin(placement, newOrigin, true);

          // 1. transform.translation lands on the exact worldBlock
          assert(
            updated.transform.translation[0] === targetWorld[0] &&
              updated.transform.translation[1] === targetWorld[1] &&
              updated.transform.translation[2] === targetWorld[2],
            `Translation must equal targetWorld: expected [${targetWorld}], got [${updated.transform.translation}] for rot=${rot}, mir=${mir}, orig=[${origin}], trans=[${translation}]`,
          );

          // 2. All existing blocks maintain exact same world coordinates
          for (const localBlock of sampleLocalBlocks) {
            const worldBefore = localBlockToWorld(placement, localBlock);
            const worldAfter = localBlockToWorld(updated, localBlock);

            assert(
              worldBefore[0] === worldAfter[0] &&
                worldBefore[1] === worldAfter[1] &&
                worldBefore[2] === worldAfter[2],
              `Block position changed after setOrigin: local=[${localBlock}] was [${worldBefore}], became [${worldAfter}] (rot=${rot}, mir=${mir})`,
            );
          }
        }
      }
    }
  }
}

console.log(`\nOrigin transform tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
