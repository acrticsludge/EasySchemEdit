// apps/web/__tests__/slice-r3-region-crud.test.ts
// Unit tests for Region CRUD context menu ray-hit math, block normalization,
// and EditorSession region CRUD operations (fill, replace, hollow, walls, delete, copy, paste, deselect).

import type { Bounds3i, Vec3i, BlockStateId, Placement, Project } from '@easyschemedit/domain';
import { CANONICAL_AIR } from '../../../packages/domain/block-state.ts';
import { voxelIndex, type ChunkedVoxelVolume, type VoxelChunk } from '../../../packages/domain/volume.ts';
import { getBlock } from '../../../packages/domain/volume-api.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import {
  isPointInBounds3i,
  intersectRayAABB,
  isRayHoveringRegion,
  normalizeBlockId,
  toBlockStateId,
} from '../src/editor/viewport/region-hit.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function makeTestPlacement(id: string, name: string, translation: Vec3i = [0, 0, 0], blockId = 'minecraft:stone'): Placement {
  const indices = new Uint8Array(4096);
  indices[voxelIndex(1, 1, 1)] = 1;

  const chunk: VoxelChunk = {
    key: '0_0_0',
    palette: [CANONICAL_AIR, { id: blockId, props: {} }],
    indices,
    revision: 0,
  };

  const volume: ChunkedVoxelVolume = {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    chunkSize: 16,
    chunks: new Map([['0_0_0', chunk]]),
    nonAirCount: 1,
    paletteCardinality: 2,
  };

  return {
    id,
    name,
    volume,
    transform: { translation: [...translation], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'generated', filename: `${id}.schem`, diagnostics: [] },
    eraseTombstones: new Set(),
  };
}

function makeTestProject(): Project {
  return {
    schemaVersion: 1,
    id: 'test-region-crud-proj',
    name: 'Region CRUD Test Project',
    placements: [
      makeTestPlacement('p1', 'Placement 1', [0, 0, 0], 'minecraft:stone'),
    ],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: {
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    revision: 1,
  };
}

console.log('=== Running Slice R3: Region Hit Math & Region CRUD Tests ===\n');

// ---------------------------------------------------------------------------
// Test 1: isPointInBounds3i
// ---------------------------------------------------------------------------
console.log('--- Test 1: isPointInBounds3i Point Containment ---');
{
  const bounds: Bounds3i = {
    min: [0, 0, 0],
    maxExclusive: [4, 4, 4],
  };

  assertEqual(isPointInBounds3i([1, 2, 3], bounds), true, 'Inside point is contained');
  assertEqual(isPointInBounds3i([0, 0, 0], bounds), true, 'Min edge point is contained');
  assertEqual(isPointInBounds3i([3, 3, 3], bounds), true, 'Last included cell is contained');
  assertEqual(isPointInBounds3i([4, 0, 0], bounds), false, 'MaxExclusive X boundary is not contained');
  assertEqual(isPointInBounds3i([0, 4, 0], bounds), false, 'MaxExclusive Y boundary is not contained');
  assertEqual(isPointInBounds3i([0, 0, 4], bounds), false, 'MaxExclusive Z boundary is not contained');
  assertEqual(isPointInBounds3i([-1, 2, 2], bounds), false, 'Negative coordinate outside bounds is not contained');
  assertEqual(isPointInBounds3i([10, 10, 10], bounds), false, 'Far point outside bounds is not contained');
  console.log('  ✓ isPointInBounds3i boundary checks passed');
}

// ---------------------------------------------------------------------------
// Test 2: intersectRayAABB
// ---------------------------------------------------------------------------
console.log('--- Test 2: intersectRayAABB Slab Intersection ---');
{
  const bounds: Bounds3i = {
    min: [0, 0, 0],
    maxExclusive: [4, 4, 4],
  };

  // Ray entering from Z=-10 towards +Z
  const hit = intersectRayAABB([2, 2, -10], [0, 0, 1], bounds);
  assert(hit !== null, 'Ray hitting box returns hit');
  assertEqual(hit?.minT, 10, 'Ray enters at t=10');
  assertEqual(hit?.maxT, 14, 'Ray exits at t=14');

  // Ray starting inside box
  const insideHit = intersectRayAABB([2, 2, 2], [0, 0, 1], bounds);
  assert(insideHit !== null, 'Inside ray returns hit');
  assertEqual(insideHit?.minT, 0, 'Inside ray minT is clamped to 0');
  assertEqual(insideHit?.maxT, 2, 'Inside ray exits at t=2');

  // Ray completely missing box
  const missHit = intersectRayAABB([10, 10, -10], [0, 0, 1], bounds);
  assertEqual(missHit, null, 'Ray missing box returns null');

  // Ray pointing backwards away from box
  const backHit = intersectRayAABB([2, 2, -10], [0, 0, -1], bounds);
  assertEqual(backHit, null, 'Ray pointing away returns null');
  console.log('  ✓ intersectRayAABB slab tests passed');
}

// ---------------------------------------------------------------------------
// Test 3: isRayHoveringRegion
// ---------------------------------------------------------------------------
console.log('--- Test 3: isRayHoveringRegion Solid Occlusion & Region Hover ---');
{
  const bounds: Bounds3i = {
    min: [0, 0, 0],
    maxExclusive: [4, 4, 4],
  };

  const rayOrigin: [number, number, number] = [2, 2, -10];
  const rayDir: [number, number, number] = [0, 0, 1];

  // Case A: Solid hit is inside region
  const hitInside = isRayHoveringRegion(rayOrigin, rayDir, bounds, 12, [2, 2, 2]);
  assertEqual(hitInside, true, 'Hovering when solid hit is inside region');

  // Case B: No solid hit at all (pointing at empty region air / wireframe)
  const hitEmpty = isRayHoveringRegion(rayOrigin, rayDir, bounds, null, null);
  assertEqual(hitEmpty, true, 'Hovering when ray intersects region box with no solid obstacle');

  // Case C: Solid hit is behind region (region is in front)
  const hitBehind = isRayHoveringRegion(rayOrigin, rayDir, bounds, 20, [2, 2, 10]);
  assertEqual(hitBehind, true, 'Hovering when solid hit is behind region');

  // Case D: Solid hit is closer in front of region (blocking it)
  const hitBlocked = isRayHoveringRegion(rayOrigin, rayDir, bounds, 5, [2, 2, -5]);
  assertEqual(hitBlocked, false, 'Not hovering when solid hit occludes the region');

  // Case E: Ray misses region completely
  const hitMiss = isRayHoveringRegion([20, 20, -10], rayDir, bounds, null, null);
  assertEqual(hitMiss, false, 'Not hovering when ray misses region box');
  console.log('  ✓ isRayHoveringRegion occlusion logic passed');
}

// ---------------------------------------------------------------------------
// Test 4: normalizeBlockId and toBlockStateId
// ---------------------------------------------------------------------------
console.log('--- Test 4: normalizeBlockId & toBlockStateId ---');
{
  assertEqual(normalizeBlockId('stone'), 'minecraft:stone', 'Prefixes stone');
  assertEqual(normalizeBlockId('minecraft:stone'), 'minecraft:stone', 'Preserves namespaced stone');
  assertEqual(normalizeBlockId('oak_stairs[facing=north]'), 'minecraft:oak_stairs[facing=north]', 'Prefixes block with properties');
  assertEqual(normalizeBlockId('custom:special_block'), 'custom:special_block', 'Preserves non-minecraft namespace');
  assertEqual(normalizeBlockId(''), 'minecraft:air', 'Empty string returns air');

  const state1 = toBlockStateId('stone');
  assertEqual(state1.id, 'minecraft:stone', 'Parsed ID is minecraft:stone');
  assertEqual(Object.keys(state1.props).length, 0, 'No properties');

  const state2 = toBlockStateId('oak_stairs[facing=north,waterlogged=false]');
  assertEqual(state2.id, 'minecraft:oak_stairs', 'Parsed ID is minecraft:oak_stairs');
  assertEqual(state2.props.facing, 'north', 'Property facing=north');
  assertEqual(state2.props.waterlogged, 'false', 'Property waterlogged=false');
  console.log('  ✓ normalizeBlockId and toBlockStateId passed');
}

// ---------------------------------------------------------------------------
// Test 5: EditorSession Region CRUD Commands
// ---------------------------------------------------------------------------
console.log('--- Test 5: EditorSession Region Operations (Fill, Replace, Hollow, Walls, Delete) ---');
{
  const session = new EditorSession(makeTestProject());
  const regionBounds: Bounds3i = {
    min: [0, 0, 0],
    maxExclusive: [4, 4, 4],
  };

  // 1. Region Fill with iron block
  const fillRes = session.execute({
    type: 'region:fill',
    bounds: regionBounds,
    block: toBlockStateId('minecraft:iron_block'),
  });
  assert(fillRes.ok, 'region:fill executed successfully');
  const projectAfterFill = session.peekProject();
  const placementAfterFill = projectAfterFill.placements[0];
  const filledBlock = getBlock(placementAfterFill.volume, [2, 2, 2]);
  assertEqual(filledBlock?.id, 'minecraft:iron_block', 'Voxel filled with minecraft:iron_block');

  // 2. Region Replace iron block with gold block
  const replaceRes = session.execute({
    type: 'region:replace',
    bounds: regionBounds,
    matcher: { mode: 'block-id-only', blockId: 'minecraft:iron_block' },
    replacement: toBlockStateId('minecraft:gold_block'),
    preserveProperties: false,
  });
  assert(replaceRes.ok, 'region:replace executed successfully');
  const projectAfterReplace = session.peekProject();
  const placementAfterReplace = projectAfterReplace.placements[0];
  const replacedBlock = getBlock(placementAfterReplace.volume, [2, 2, 2]);
  assertEqual(replacedBlock?.id, 'minecraft:gold_block', 'Voxel replaced with minecraft:gold_block');

  // 3. Region Hollow
  const hollowRes = session.execute({
    type: 'region:hollow',
    bounds: regionBounds,
    shellThickness: 1,
  });
  assert(hollowRes.ok, 'region:hollow executed successfully');
  const projectAfterHollow = session.peekProject();
  const placementAfterHollow = projectAfterHollow.placements[0];
  const shellBlock = getBlock(placementAfterHollow.volume, [0, 0, 0]);
  const interiorBlock = getBlock(placementAfterHollow.volume, [2, 2, 2]);
  assertEqual(shellBlock?.id, 'minecraft:gold_block', 'Shell block retained');
  assertEqual(interiorBlock?.id, 'minecraft:air', 'Interior block cleared to air');

  // 4. Region Walls with brick
  const wallsRes = session.execute({
    type: 'region:walls',
    bounds: regionBounds,
    wallBlock: toBlockStateId('minecraft:bricks'),
    fillInterior: null,
    includeTop: true,
    includeBottom: true,
  });
  assert(wallsRes.ok, 'region:walls executed successfully');
  const projectAfterWalls = session.peekProject();
  const placementAfterWalls = projectAfterWalls.placements[0];
  const wallVoxel = getBlock(placementAfterWalls.volume, [0, 2, 2]);
  assertEqual(wallVoxel?.id, 'minecraft:bricks', 'Wall voxel set to minecraft:bricks');

  // 5. Clipboard Copy
  const copyRes = session.execute({
    type: 'clipboard:copy',
    selection: {
      kind: 'cuboid',
      bounds: regionBounds,
    },
    scope: 'effective-composite',
  });
  assert(copyRes.ok, 'clipboard:copy executed successfully');

  // 6. Clipboard Paste at [0, 0, 0]
  const pasteRes = session.execute({
    type: 'clipboard:paste',
    targetPosition: regionBounds.min,
  });
  assert(pasteRes.ok, 'clipboard:paste executed successfully');

  // 7. Region Delete
  const deleteRes = session.execute({
    type: 'region:delete',
    bounds: regionBounds,
  });
  assert(deleteRes.ok, 'region:delete executed successfully');
  const projectAfterDelete = session.peekProject();
  const placementAfterDelete = projectAfterDelete.placements[0];
  const deletedVoxel = getBlock(placementAfterDelete.volume, [0, 2, 2]);
  assertEqual(deletedVoxel?.id, 'minecraft:air', 'Deleted voxel reverted to air');

  // 8. Selection Clear
  const clearRes = session.execute({
    type: 'selection:clear',
  });
  assert(clearRes.ok, 'selection:clear executed successfully');
  const selState = session.query<any>({ type: 'selection:get' });
  assertEqual(selState.type, 'cuboid', 'Selection reset');

  console.log('  ✓ All EditorSession region CRUD operations executed successfully');
}

console.log('\nAll Slice R3 Region Hit and CRUD tests passed successfully!');
