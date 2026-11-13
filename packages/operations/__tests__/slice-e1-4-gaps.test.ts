// packages/operations/__tests__/slice-e1-4-gaps.test.ts
// Unit tests for Slice E1.4 gap fixes:
// 1. EditorSession placement:add -> undo() -> redo() and placement:duplicate -> undo() -> redo()
// 2. EditorSession region:fill targeting single placementId
// 3. GroupTransformEngine updates project.placements
// 4. BakeEngine with createNewPlacement: true constructs populated placement on project.placements
// 5. Scene-wide detectConflicts without proposedState distinguishes same-state vs state-conflict
// 6. BlockStateTransformRegistry transforms spruce_stairs, oak_log[axis=x], oak_fence, OAK_SIGN[rotation=4]
// 7. createManifest + verifyManifest detects tampered entry bytes in mismatched
// 8. movePlacement updates transform.translation, setPlacementOrigin updates origin
// Pure TypeScript, runs with node --experimental-strip-types.

import type { BlockStateId, Bounds3i, Vec3i } from '../../domain/types.ts';
import { CANONICAL_AIR } from '../../domain/block-state.ts';
import type { ChunkedVoxelVolume, VoxelChunk } from '../../domain/volume.ts';
import { voxelIndex } from '../../domain/volume.ts';
import type { Placement, Project } from '../../domain/placement.ts';
import { getBlock, setBlock } from '../../domain/volume-api.ts';
import { REGISTRY } from '../../domain/block-state-transforms.ts';
import { createManifest, verifyManifest, type ArchiveEntry } from '../../domain/archive.ts';

import { EditorSession } from '../src/session.ts';
import { GroupTransformEngine } from '../src/group-transforms.ts';
import { BakeEngine } from '../src/bake.ts';
import { detectConflicts } from '../src/conflict-index.ts';
import { movePlacement, setPlacementOrigin } from '../src/placement.ts';

declare const process: { exit(code?: number): void };

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeTestPlacement(
  id: string,
  name: string,
  translation: Vec3i = [0, 0, 0],
  blocks?: Array<{ pos: Vec3i; state: string }>,
): Placement {
  const indices = new Uint8Array(4096);
  const palette: BlockStateId[] = [CANONICAL_AIR];

  if (blocks && blocks.length > 0) {
    for (const b of blocks) {
      const idx = palette.length;
      palette.push({ id: b.state, props: {} });
      indices[voxelIndex(b.pos[0], b.pos[1], b.pos[2])] = idx;
    }
  }

  const chunk: VoxelChunk = {
    key: '0_0_0',
    palette,
    indices,
    revision: 0,
  };

  const volume: ChunkedVoxelVolume = {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    chunkSize: 16,
    chunks: new Map([['0_0_0', chunk]]),
    nonAirCount: blocks ? blocks.length : 0,
    paletteCardinality: palette.length,
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
    id: 'test-project-e1-4',
    name: 'E1.4 Test Project',
    placements: [
      makeTestPlacement('p1', 'Placement 1', [0, 0, 0], [{ pos: [1, 1, 1], state: 'minecraft:stone' }]),
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

console.log('=== Running Slice E1.4 Gap Fix Tests ===\n');

// ── Test 1: EditorSession placement:add -> undo() -> redo() ──
console.log('--- Test 1: EditorSession placement:add undo/redo ---');
{
  const session = new EditorSession(makeTestProject());
  const newP = makeTestPlacement('p_new', 'New Added Placement', [16, 0, 0], [
    { pos: [2, 2, 2], state: 'minecraft:diamond_block' },
  ]);

  const addRes = session.execute({
    type: 'placement:add',
    placement: newP,
  });
  assert(addRes.ok, 'placement:add succeeded');
  assertEqual(session.snapshot().placements.length, 2, 'Project has 2 placements after add');

  // Verify undo removes placement
  const undoRes = session.undo();
  assert(undoRes !== null && undoRes.ok, 'undo() succeeded');
  assertEqual(session.snapshot().placements.length, 1, 'Project has 1 placement after undo');
  assert(!session.snapshot().placements.some((p) => p.id === 'p_new'), 'p_new was removed on undo');

  // Verify redo restores placement with volume & block contents intact
  const redoRes = session.redo();
  assert(redoRes !== null && redoRes.ok, 'redo() succeeded');
  const restoredPlacements = session.snapshot().placements;
  assertEqual(restoredPlacements.length, 2, 'Project has 2 placements after redo');
  const restoredP = restoredPlacements.find((p) => p.id === 'p_new');
  assert(restoredP !== undefined, 'p_new is present after redo');
  if (restoredP) {
    const block = getBlock(restoredP.volume, [2, 2, 2]);
    assertEqual(block.id, 'minecraft:diamond_block', 'diamond_block preserved after redo');
  }
}

// ── Test 2: EditorSession placement:duplicate -> undo() -> redo() ──
console.log('--- Test 2: EditorSession placement:duplicate undo/redo ---');
{
  const session = new EditorSession(makeTestProject());
  const dupRes = session.execute({
    type: 'placement:duplicate',
    placementId: 'p1',
    offset: [16, 0, 0],
  });
  assert(dupRes.ok, 'placement:duplicate succeeded');
  assertEqual(session.snapshot().placements.length, 2, 'Project has 2 placements after duplicate');

  // Undo duplicate
  session.undo();
  assertEqual(session.snapshot().placements.length, 1, 'Project has 1 placement after undo duplicate');

  // Redo duplicate
  session.redo();
  assertEqual(session.snapshot().placements.length, 2, 'Project has 2 placements after redo duplicate');
}

// ── Test 3: EditorSession region:fill targeting single placementId ──
console.log('--- Test 3: region:fill targeting single placementId ---');
{
  const p1 = makeTestPlacement('p1', 'P1', [0, 0, 0], [{ pos: [3, 3, 3], state: 'minecraft:stone' }]);
  const p2 = makeTestPlacement('p2', 'P2', [0, 0, 0], [{ pos: [3, 3, 3], state: 'minecraft:dirt' }]);
  const proj: Project = {
    schemaVersion: 1,
    id: 'test-proj-fill-target',
    name: 'Fill Target Test',
    placements: [p1, p2],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: 1,
  };
  const session = new EditorSession(proj);

  // Fill targeting p1 only
  const fillBounds: Bounds3i = { min: [3, 3, 3], maxExclusive: [4, 4, 4] };
  const fillRes = session.execute({
    type: 'region:fill',
    bounds: fillBounds,
    block: { id: 'minecraft:gold_block', props: {} },
    placementId: 'p1',
  });
  assert(fillRes.ok, 'region:fill with placementId succeeded');

  const snapshot = session.snapshot();
  const snapP1 = snapshot.placements.find((p) => p.id === 'p1')!;
  const snapP2 = snapshot.placements.find((p) => p.id === 'p2')!;

  const b1 = getBlock(snapP1.volume, [3, 3, 3]);
  const b2 = getBlock(snapP2.volume, [3, 3, 3]);

  assertEqual(b1.id, 'minecraft:gold_block', 'p1 block at [3,3,3] was filled with gold_block');
  assertEqual(b2.id, 'minecraft:dirt', 'p2 block at [3,3,3] was untouched and remains dirt');
}

// ── Test 4: GroupTransformEngine updates project.placements ──
console.log('--- Test 4: GroupTransformEngine updates project.placements ---');
{
  const p1 = makeTestPlacement('p1', 'P1', [0, 0, 0]);
  const p2 = makeTestPlacement('p2', 'P2', [16, 0, 0]);
  const proj: Project = {
    schemaVersion: 1,
    id: 'group-proj',
    name: 'Group Proj',
    placements: [p1, p2],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: 1,
  };

  const engine = new GroupTransformEngine();
  const res = engine.rotateGroup(proj, {
    placementIds: ['p1', 'p2'],
    pivot: [0, 0, 0],
    rotationY: 90,
    mirror: 'none',
    transformAncillary: false,
  });

  assert(res.success, 'rotateGroup returned success');
  assertEqual(res.placements.length, 2, 'res.placements returned 2 placements');
  assertEqual(proj.placements[0]!.transform.rotationY, 90, 'proj.placements[0] rotationY was updated to 90');
  assertEqual(proj.placements[1]!.transform.rotationY, 90, 'proj.placements[1] rotationY was updated to 90');
}

// ── Test 5: BakeEngine createNewPlacement: true creates real populated placement ──
console.log('--- Test 5: BakeEngine createNewPlacement ---');
{
  const p1 = makeTestPlacement('p1', 'P1', [0, 0, 0], [{ pos: [1, 1, 1], state: 'minecraft:dirt' }]);
  const p2 = makeTestPlacement('p2', 'P2', [0, 0, 0], [{ pos: [1, 1, 1], state: 'minecraft:stone' }]);
  const proj: Project = {
    schemaVersion: 1,
    id: 'bake-proj',
    name: 'Bake Proj',
    placements: [p1, p2],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: 1,
  };

  const engine = new BakeEngine({
    overlapPolicy: 'top-wins',
    affectedPlacements: ['p1', 'p2'],
    createNewPlacement: true,
    newPlacementName: 'Baked Composite',
  });

  const res = engine.bake(proj);
  assert(res.success, 'bake succeeded');
  assertEqual(proj.placements.length, 3, 'project.placements has 3 placements after bake');
  const baked = proj.placements[2]!;
  assertEqual(baked.name, 'Baked Composite', 'Baked placement has requested name');
  assert(baked.volume.nonAirCount > 0, 'Baked placement has nonAirCount > 0');
  const block = getBlock(baked.volume, [1, 1, 1]);
  assertEqual(block.id, 'minecraft:stone', 'Top-wins effective block is minecraft:stone');
}

// ── Test 6: Scene-wide detectConflicts without proposedState ──
console.log('--- Test 6: Scene-wide detectConflicts without proposedState ---');
{
  // Same state at [1,1,1]: both stone
  // Differing state at [2,2,2]: stone vs dirt
  // Single-placement at [3,3,3]: only p1 has stone
  const p1 = makeTestPlacement('p1', 'P1', [0, 0, 0], [
    { pos: [1, 1, 1], state: 'minecraft:stone' },
    { pos: [2, 2, 2], state: 'minecraft:stone' },
    { pos: [3, 3, 3], state: 'minecraft:stone' },
  ]);
  const p2 = makeTestPlacement('p2', 'P2', [0, 0, 0], [
    { pos: [1, 1, 1], state: 'minecraft:stone' },
    { pos: [2, 2, 2], state: 'minecraft:dirt' },
  ]);

  const proj: Project = {
    schemaVersion: 1,
    id: 'conflicts-proj',
    name: 'Conflicts Proj',
    placements: [p1, p2],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
    revision: 1,
  };

  const res = detectConflicts(proj);
  assert(res.hasConflicts, 'Scene-wide detectConflicts detected conflicts');
  assertEqual(res.category, 'state-conflict', 'Overall category is state-conflict');
  assert(
    res.sameStatePositions.some((pos) => pos[0] === 1 && pos[1] === 1 && pos[2] === 1),
    'sameStatePositions contains [1,1,1]',
  );
  assert(
    res.stateConflictPositions.some((pos) => pos[0] === 2 && pos[1] === 2 && pos[2] === 2),
    'stateConflictPositions contains [2,2,2]',
  );
  assert(
    res.cleanPositions.some((pos) => pos[0] === 3 && pos[1] === 3 && pos[2] === 3),
    'cleanPositions contains [3,3,3]',
  );
}

// ── Test 7: REGISTRY rotates/mirrors standard blocks ──
console.log('--- Test 7: REGISTRY orientation transforms ---');
{
  // 1. spruce_stairs
  const spruceStairs = { id: 'minecraft:spruce_stairs', props: { facing: 'north', shape: 'straight' } };
  const rStairs = REGISTRY.transformRotate(spruceStairs, 90).result;
  assertEqual(rStairs.props.facing, 'west', 'spruce_stairs north -> 90° -> west');
  const mStairs = REGISTRY.transformMirror(spruceStairs, 'x').result;
  assertEqual(mStairs.props.facing, 'north', 'spruce_stairs north -> mirror X -> north');

  // 2. oak_log[axis=x]
  const oakLog = { id: 'minecraft:oak_log', props: { axis: 'x' } };
  const rLog90 = REGISTRY.transformRotate(oakLog, 90).result;
  assertEqual(rLog90.props.axis, 'z', 'oak_log axis: x -> 90° -> z');
  const rLog180 = REGISTRY.transformRotate(oakLog, 180).result;
  assertEqual(rLog180.props.axis, 'x', 'oak_log axis: x -> 180° -> x');
  const mLog = REGISTRY.transformMirror(oakLog, 'x').result;
  assertEqual(mLog.props.axis, 'x', 'oak_log axis: x -> mirror X -> x');

  // 3. oak_fence[north=true,east=false,south=false,west=false]
  const oakFence = {
    id: 'minecraft:oak_fence',
    props: { north: 'true', east: 'false', south: 'false', west: 'false' },
  };
  const rFence90 = REGISTRY.transformRotate(oakFence, 90).result;
  assertEqual(rFence90.props.west, 'true', 'oak_fence north=true -> 90° -> west=true');
  assertEqual(rFence90.props.north, 'false', 'oak_fence north -> 90° -> north=false');

  // 4. OAK_SIGN[rotation=4] (4 is West; 90° clockwise -> South which is 0)
  const oakSign = { id: 'minecraft:OAK_SIGN', props: { rotation: '4' } };
  const rSign90 = REGISTRY.transformRotate(oakSign, 90).result;
  assertEqual(rSign90.props.rotation, '0', 'OAK_SIGN rotation: 4 -> 90° -> 0');
  const mSignX = REGISTRY.transformMirror(oakSign, 'x').result;
  assertEqual(mSignX.props.rotation, '12', 'OAK_SIGN rotation: 4 -> mirror X -> 12');
  const mSignZ = REGISTRY.transformMirror(oakSign, 'z').result;
  assertEqual(mSignZ.props.rotation, '4', 'OAK_SIGN rotation: 4 -> mirror Z -> 4');
}

// ── Test 8: createManifest + verifyManifest detects tampered entry bytes ──
console.log('--- Test 8: createManifest and verifyManifest checksums ---');
{
  const entries: ArchiveEntry[] = [
    { path: 'manifest.json', data: new Uint8Array([1, 2, 3, 4, 5]) },
    { path: 'chunks/c_0_0_0.bin', data: new Uint8Array([10, 20, 30, 40, 50, 60]) },
  ];

  const manifest = createManifest(entries, '1.0.0', '1.21.11');
  assert(manifest.checksums['manifest.json']!.startsWith('sha256:'), 'manifest checksum starts with sha256:');
  assertEqual(manifest.checksums['manifest.json']!.length, 7 + 64, 'checksum is 64 hex characters');

  // Valid verification
  const validCheck = verifyManifest(manifest, entries);
  assert(validCheck.valid, 'unmodified entries verify as valid');
  assertEqual(validCheck.mismatched.length, 0, 'no mismatched entries on valid archive');

  // Tamper with bytes of chunks/c_0_0_0.bin without changing length
  const tamperedEntries: ArchiveEntry[] = [
    { path: 'manifest.json', data: new Uint8Array([1, 2, 3, 4, 5]) },
    { path: 'chunks/c_0_0_0.bin', data: new Uint8Array([10, 20, 30, 40, 50, 99]) },
  ];
  const tamperedCheck = verifyManifest(manifest, tamperedEntries);
  assert(!tamperedCheck.valid, 'tampered entries fail verification');
  assertEqual(tamperedCheck.mismatched.length, 1, 'exactly 1 mismatched entry detected');
  assertEqual(tamperedCheck.mismatched[0], 'chunks/c_0_0_0.bin', 'tampered chunk path correctly identified');
}

// ── Test 9: movePlacement updates transform.translation; setPlacementOrigin updates origin ──
console.log('--- Test 9: movePlacement and setPlacementOrigin ---');
{
  const proj = makeTestProject();
  const moved = movePlacement(proj, 'p1', [10, 5, -2]);
  assertEqual(moved.placements[0]!.transform.translation[0], 10, 'translation X updated to 10');
  assertEqual(moved.placements[0]!.transform.translation[1], 5, 'translation Y updated to 5');
  assertEqual(moved.placements[0]!.transform.translation[2], -2, 'translation Z updated to -2');
  assertEqual(moved.placements[0]!.origin[0], 0, 'origin X remains 0 after movePlacement');

  const originChanged = setPlacementOrigin(proj, 'p1', [2, 4, 6]);
  assertEqual(originChanged.placements[0]!.origin[0], 2, 'origin X updated to 2');
  assertEqual(originChanged.placements[0]!.origin[1], 4, 'origin Y updated to 4');
  assertEqual(originChanged.placements[0]!.origin[2], 6, 'origin Z updated to 6');
  assertEqual(originChanged.placements[0]!.transform.translation[0], 0, 'translation remains untouched by setPlacementOrigin');
}

console.log(`\n=== All Gap Tests Finished: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
