// packages/operations/__tests__/slice-m1-build-generator.test.ts
// Unit tests for Slice M1: Procedural Build, Shape & Voxel Blueprint Generator.
// Pure TypeScript, runs with node --experimental-strip-types.

import type { Bounds3i, Vec3i } from '../../domain/types.ts';
import { checkInvariants } from '../../domain/placement.ts';
import { EditorSession } from '../src/session.ts';
import {
  parseVoxelBlockState,
  getVoxelBlockAt,
  inspectRegionVoxels,
  setVoxelBlockAt,
  setVoxelBlocksBatch,
  generateShape,
  generateStructure,
  executeBlueprint,
  type ShapeKind,
  type StructureKind,
  type StructureStyle,
} from '../src/build-generator.ts';

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

console.log('--- Test Suite: Slice M1 Build Generator ---');

// ============================================================================
// 1. Block State Parsing
// ============================================================================
{
  console.log('1. Block State Parser');
  const s1 = parseVoxelBlockState('stone');
  assertEqual(s1.id, 'minecraft:stone', 's1 id normalized with minecraft: namespace');
  assertEqual(Object.keys(s1.props).length, 0, 's1 has empty props');

  const s2 = parseVoxelBlockState('minecraft:oak_Planks');
  assertEqual(s2.id, 'minecraft:oak_planks', 's2 id lowercased');

  const s3 = parseVoxelBlockState('minecraft:oak_stairs[facing=north,half=bottom]');
  assertEqual(s3.id, 'minecraft:oak_stairs', 's3 id');
  assertEqual(s3.props.facing, 'north', 's3 prop facing');
  assertEqual(s3.props.half, 'bottom', 's3 prop half');

  const s4 = parseVoxelBlockState('');
  assertEqual(s4.id, 'minecraft:stone', 'empty string defaults to stone');

  const s5 = parseVoxelBlockState(undefined);
  assertEqual(s5.id, 'minecraft:stone', 'undefined defaults to stone');
}

// ============================================================================
// 2. Voxel Inspection and Editing
// ============================================================================
{
  console.log('2. Voxel Inspection & Editing');
  const session = new EditorSession();
  assertEqual(session.revision, 0, 'initial revision is 0');

  // Set single voxel at [10, 5, 20]
  const setRes = setVoxelBlockAt(session, [10, 5, 20], 'minecraft:diamond_block', {
    placementName: 'Diamond Cache',
  });
  assert(setRes.ok, 'setVoxelBlockAt succeeds');
  assertEqual(session.revision, 1, 'revision increments to 1');
  assertEqual(setRes.changedCells, 1, 'changed 1 cell');

  // Get voxel block at [10, 5, 20]
  const getRes = getVoxelBlockAt(session, [10, 5, 20]);
  assertEqual(getRes.block, 'minecraft:diamond_block', 'retrieved diamond_block');
  assertEqual(getRes.placementId, setRes.placementId, 'owning placement id matches');

  // Get voxel block at empty position [0, 0, 0]
  const emptyRes = getVoxelBlockAt(session, [0, 0, 0]);
  assertEqual(emptyRes.block, 'minecraft:air', 'empty position returns air');
  assertEqual(emptyRes.placementId, null, 'empty position has null placementId');

  // Batch set voxels
  const batchRes = setVoxelBlocksBatch(
    session,
    [
      { pos: [11, 5, 20], block: 'minecraft:gold_block' },
      { pos: [12, 5, 20], block: 'minecraft:iron_block' },
      { pos: [13, 5, 20], block: 'minecraft:emerald_block' },
    ],
    { placementName: 'Mineral Row' },
  );
  assert(batchRes.ok, 'setVoxelBlocksBatch succeeds');
  assertEqual(batchRes.changedCells, 3, 'batch changed 3 cells');

  // Inspect region
  const inspectBounds: Bounds3i = {
    min: [10, 5, 20],
    maxExclusive: [14, 6, 21],
  };
  const inspectRes = inspectRegionVoxels(session, inspectBounds);
  assertEqual(inspectRes.nonAirCount, 4, 'inspect found exactly 4 non-air blocks');
  assertEqual(inspectRes.countsByBlock['minecraft:diamond_block'], 1, '1 diamond block');
  assertEqual(inspectRes.countsByBlock['minecraft:gold_block'], 1, '1 gold block');
  assertEqual(inspectRes.countsByBlock['minecraft:iron_block'], 1, '1 iron block');
  assertEqual(inspectRes.countsByBlock['minecraft:emerald_block'], 1, '1 emerald block');
  assert(!inspectRes.truncated, 'not truncated under maxBlocks');

  // Check invariants
  const inv = checkInvariants(session.snapshot());
  assert(inv.ok, `invariants pass: ${inv.violations.join(', ')}`);
}

// ============================================================================
// 3. 3D Geometric Shape Generator (All 11 Kinds)
// ============================================================================
{
  console.log('3. Shape Generator (All 11 Kinds)');

  const shapeKinds: ShapeKind[] = [
    'box',
    'sphere',
    'ellipsoid',
    'cylinder',
    'pyramid',
    'cone',
    'arch',
    'line',
    'roof',
    'stairs',
    'torus',
  ];

  for (const kind of shapeKinds) {
    const session = new EditorSession();
    const result = generateShape(session, {
      kind,
      block: 'minecraft:smooth_stone',
      secondaryBlock: 'minecraft:deepslate',
      center: [0, 64, 0],
      width: 10,
      height: 8,
      depth: 10,
      radius: 6,
      radiusX: 7,
      radiusY: 5,
      radiusZ: 7,
      innerRadius: 2,
      from: [0, 64, 0],
      to: [12, 70, 12],
      hollow: false,
      placementName: `Test Shape ${kind}`,
    });

    assert(result.ok, `Shape ${kind} generated ok`);
    assert(result.changedCells > 0, `Shape ${kind} placed > 0 cells (got ${result.changedCells})`);

    const inv = checkInvariants(session.snapshot());
    assert(inv.ok, `Shape ${kind} invariant check passed: ${inv.violations.join(', ')}`);
  }

  // Test hollow box and hollow sphere
  {
    const session = new EditorSession();
    const boxRes = generateShape(session, {
      kind: 'box',
      block: 'minecraft:glass',
      center: [0, 0, 0],
      width: 8,
      height: 8,
      depth: 8,
      hollow: true,
      thickness: 1,
    });
    assert(boxRes.ok, 'Hollow box generated ok');
    const invBox = checkInvariants(session.snapshot());
    assert(invBox.ok, `Hollow box invariants: ${invBox.violations.join(', ')}`);

    const sphereRes = generateShape(session, {
      kind: 'sphere',
      block: 'minecraft:obsidian',
      center: [50, 50, 50],
      radius: 8,
      hollow: true,
      thickness: 2,
    });
    assert(sphereRes.ok, 'Hollow sphere generated ok');
    const invSphere = checkInvariants(session.snapshot());
    assert(invSphere.ok, `Hollow sphere invariants: ${invSphere.violations.join(', ')}`);
  }

  // Test cylinder axes (x, y, z)
  for (const axis of ['x', 'y', 'z'] as const) {
    const session = new EditorSession();
    const cylRes = generateShape(session, {
      kind: 'cylinder',
      block: 'minecraft:copper_block',
      center: [0, 0, 0],
      radius: 4,
      height: 12,
      axis,
    });
    assert(cylRes.ok, `Cylinder along axis ${axis} generated ok`);
    const inv = checkInvariants(session.snapshot());
    assert(inv.ok, `Cylinder axis ${axis} invariants: ${inv.violations.join(', ')}`);
  }
}

// ============================================================================
// 4. Procedural Structure Generator (All 11 Kinds across styles)
// ============================================================================
{
  console.log('4. Structure Generator (All 11 Kinds across styles)');

  const structureTestMatrix: Array<{ kind: StructureKind; style: StructureStyle }> = [
    { kind: 'house', style: 'medieval' },
    { kind: 'tower', style: 'deepslate' },
    { kind: 'castle', style: 'medieval' },
    { kind: 'temple', style: 'modern' },
    { kind: 'bridge', style: 'desert' },
    { kind: 'tree', style: 'japanese' },
    { kind: 'fountain', style: 'prismarine' },
    { kind: 'island', style: 'nether' },
    { kind: 'modern_villa', style: 'modern' },
    { kind: 'pagoda', style: 'japanese' },
    { kind: 'ship', style: 'medieval' },
  ];

  for (const { kind, style } of structureTestMatrix) {
    const session = new EditorSession();
    const res = generateStructure(session, {
      kind,
      style,
      position: [100, 64, 100],
      seed: 42,
      placementName: `Test ${kind} (${style})`,
    });

    assert(res.ok, `Structure ${kind} (${style}) generated ok`);
    assert(res.changedCells > 10, `Structure ${kind} placed cells > 10 (got ${res.changedCells})`);

    const inv = checkInvariants(session.snapshot());
    assert(inv.ok, `Structure ${kind} invariants: ${inv.violations.join(', ')}`);
  }
}

// ============================================================================
// 5. Composite Multi-Step Blueprint Builder & Undo/Redo Atomicity
// ============================================================================
{
  console.log('5. Composite Multi-Step Blueprint Builder & Undo/Redo');
  const session = new EditorSession();
  const initialRevision = session.revision;

  const blueprintRes = executeBlueprint(session, {
    name: 'Wizard Tower Citadel',
    origin: [50, 70, 50],
    steps: [
      // 1. Stone foundation box
      { kind: 'box', bounds: { min: [-5, 0, -5], maxExclusive: [6, 2, 6] }, block: 'minecraft:cobblestone' },
      // 2. Tower walls
      { kind: 'cylinder', center: [0, 2, 0], radius: 4, height: 16, block: 'minecraft:stone_bricks', hollow: true },
      // 3. Central glowing mana orb
      { kind: 'sphere', center: [0, 10, 0], radius: 2, block: 'minecraft:sea_lantern' },
      // 4. Conical roof
      { kind: 'cone', center: [0, 18, 0], radius: 5, height: 8, block: 'minecraft:dark_prismarine' },
      // 5. Spire line at top
      { kind: 'line', from: [0, 26, 0], to: [0, 32, 0], block: 'minecraft:lightning_rod' },
      // 6. Arched entrance
      { kind: 'arch', center: [0, 2, 4], width: 5, height: 4, depth: 2, block: 'minecraft:chiseled_stone_bricks' },
      // 7. Entrance stairs
      { kind: 'stairs', from: [0, 0, 7], to: [0, 2, 5], width: 3, block: 'minecraft:stone_brick_stairs' },
      // 8. Custom set_blocks for corner braziers
      {
        kind: 'set_blocks',
        voxels: [
          { pos: [-4, 2, -4], block: 'minecraft:soul_campfire' },
          { pos: [4, 2, -4], block: 'minecraft:soul_campfire' },
          { pos: [-4, 2, 4], block: 'minecraft:soul_campfire' },
          { pos: [4, 2, 4], block: 'minecraft:soul_campfire' },
        ],
      },
      // 9. Replace step: replace part of walls with cracked stone bricks
      {
        kind: 'replace',
        bounds: { min: [-5, 2, -5], maxExclusive: [6, 6, 6] },
        from: 'minecraft:stone_bricks',
        to: 'minecraft:cracked_stone_bricks',
      },
    ],
  });

  assert(blueprintRes.ok, 'executeBlueprint succeeds');
  assertEqual(session.revision, initialRevision + 1, 'revision increments by exactly 1');
  assert(blueprintRes.changedCells > 50, `blueprint placed cells > 50 (got ${blueprintRes.changedCells})`);

  // Invariant verification
  const snapshotAfterBuild = session.snapshot();
  const inv = checkInvariants(snapshotAfterBuild);
  assert(inv.ok, `blueprint snapshot passed invariants: ${inv.violations.join(', ')}`);
  assertEqual(snapshotAfterBuild.placements.length, 1, 'exactly 1 placement added');
  assertEqual(snapshotAfterBuild.placements[0].name, 'Wizard Tower Citadel', 'placement name set from blueprint');

  // Test Undo: single undo cleanly removes the entire multi-step build
  const undoRes = session.undo();
  assert(undoRes !== null && undoRes.ok, 'undo succeeds');
  const snapshotAfterUndo = session.snapshot();
  assertEqual(snapshotAfterUndo.placements.length, 0, 'undo cleanly removed the blueprint placement');
  assertEqual(snapshotAfterUndo.revision, initialRevision + 2, 'revision monotonically increments on undo');

  // Invariants after undo
  const invAfterUndo = checkInvariants(snapshotAfterUndo);
  assert(invAfterUndo.ok, `invariants pass after undo: ${invAfterUndo.violations.join(', ')}`);

  // Test Redo: single redo restores the entire build
  const redoRes = session.redo();
  assert(redoRes !== null && redoRes.ok, 'redo succeeds');
  const snapshotAfterRedo = session.snapshot();
  assertEqual(snapshotAfterRedo.placements.length, 1, 'redo restored the blueprint placement');
  assertEqual(snapshotAfterRedo.revision, initialRevision + 3, 'revision monotonically increments on redo');

  // Invariants after redo
  const invAfterRedo = checkInvariants(snapshotAfterRedo);
  assert(invAfterRedo.ok, `invariants pass after redo: ${invAfterRedo.violations.join(', ')}`);
}

console.log('----------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`Tests failed: ${failed} tests did not pass`);
}
