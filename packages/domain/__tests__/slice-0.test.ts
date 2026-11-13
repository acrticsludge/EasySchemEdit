import type { Vec3d, Vec3Half, Vec3i } from '../types.ts';
import type { Transform } from '../coordinates.ts';
import {
  localBlockToWorld,
  worldPointToLocal,
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

// Test: worldPointToLocal round-trips with localBlockToWorld when origin is non-zero
// Specifically with origin: [-766, -44, -574] and translation: [-383, -22, -287]
const origin: Vec3Half = [-766, -44, -574];
const translation: Vec3i = [-383, -22, -287];

const testConfigs: Array<{ rotationY: Transform['rotationY']; mirror: Transform['mirror'] }> = [
  { rotationY: 0, mirror: 'none' },
  { rotationY: 90, mirror: 'none' },
  { rotationY: 180, mirror: 'none' },
  { rotationY: 270, mirror: 'none' },
  { rotationY: 0, mirror: 'x' },
  { rotationY: 90, mirror: 'x' },
  { rotationY: 180, mirror: 'x' },
  { rotationY: 270, mirror: 'x' },
  { rotationY: 90, mirror: 'z' },
];

const testBlocks: Vec3i[] = [
  [0, 0, 0],
  [1, 2, 3],
  [-10, 15, -20],
  [100, -50, 200],
  [-383, -22, -287],
];

for (const cfg of testConfigs) {
  const placement = {
    transform: {
      translation,
      rotationY: cfg.rotationY,
      mirror: cfg.mirror,
    },
    origin,
  };

  for (const localBlock of testBlocks) {
    const worldBlock = localBlockToWorld(placement, localBlock);
    const worldCenter: Vec3d = [worldBlock[0] + 0.5, worldBlock[1] + 0.5, worldBlock[2] + 0.5];
    const localPoint = worldPointToLocal(placement, worldCenter);

    const roundTripBlock: Vec3i = [
      Math.round(localPoint[0]),
      Math.round(localPoint[1]),
      Math.round(localPoint[2]),
    ];

    const matches =
      roundTripBlock[0] === localBlock[0] &&
      roundTripBlock[1] === localBlock[1] &&
      roundTripBlock[2] === localBlock[2] &&
      Math.abs(localPoint[0] - localBlock[0]) < 1e-6 &&
      Math.abs(localPoint[1] - localBlock[1]) < 1e-6 &&
      Math.abs(localPoint[2] - localBlock[2]) < 1e-6;

    assert(
      matches,
      `round-trip local [${localBlock}] -> world [${worldBlock}] -> local [${localPoint.map(n => n.toFixed(2))}] (rot=${cfg.rotationY}, mirror=${cfg.mirror})`,
    );

    // Also test passing the block coordinate directly as worldPoint
    const localPointFromCorner = worldPointToLocal(placement, [worldBlock[0], worldBlock[1], worldBlock[2]]);
    const matchesCorner =
      Math.round(localPointFromCorner[0]) === localBlock[0] &&
      Math.round(localPointFromCorner[1]) === localBlock[1] &&
      Math.round(localPointFromCorner[2]) === localBlock[2];

    assert(
      matchesCorner,
      `round-trip from block corner local [${localBlock}] -> world [${worldBlock}] (rot=${cfg.rotationY}, mirror=${cfg.mirror})`,
    );
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
