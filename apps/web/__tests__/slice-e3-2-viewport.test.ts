// apps/web/__tests__/slice-e3-2-viewport.test.ts
// Unit tests for Slice E3.2: Three.js chunked viewport, DDA raycaster, camera controller, and overlays.

import * as THREE from 'three';
import type { Bounds3i, Placement, Project, VoxelChunk } from '@easyschemedit/domain';

import {
  ChunkSceneManager,
  buildBufferGeometryFromPass,
} from '../src/editor/viewport/chunk-mesh-builder.ts';
import {
  raycastVoxels,
  createProjectBlockLookup,
} from '../src/editor/viewport/voxel-raycast.ts';
import {
  ViewportCameraController,
} from '../src/editor/viewport/camera-controller.ts';
import {
  buildGridBordersGroup,
  buildPlacementBoundsGroup,
  buildOriginMarkersGroup,
  buildSelectionBoxMesh,
} from '../src/editor/viewport/overlays-builder.ts';

// Test assertions
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

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}. Expected ${expectedStr}, got ${actualStr}`);
  }
}

function createPlacement(id: string, chunks: Map<string, VoxelChunk>): Placement {
  return {
    id,
    name: `Placement-${id}`,
    transform: {
      translation: [0, 0, 0],
      rotationY: 0,
      mirror: 'none',
    },
    origin: [0, 0, 0],
    volume: {
      bounds: { min: [0, 0, 0], maxExclusive: [32, 32, 32] },
      chunkSize: 16,
      chunks,
      nonAirCount: 100,
      paletteCardinality: 2,
    },
    visible: true,
    locked: false,
    lockReason: undefined,
    color: '#00ff88',
    createdAt: new Date().toISOString(),
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: new Set(),
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
  };
}

function createProject(id: string, name: string, placements: Placement[]): Project {
  return {
    schemaVersion: 1,
    id,
    name,
    placements,
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'conflicts',
    metadata: {
      author: 'Tester',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    revision: 1,
  };
}

// ============================================================================
// Test 1: ChunkSceneManager Mesh Consolidation
// ============================================================================
console.log('--- Test 1: ChunkSceneManager Mesh Consolidation ---');
{
  const manager = new ChunkSceneManager();

  // Part A: 1 chunk with 500 stone blocks
  const chunk0Indices = new Uint8Array(4096);
  for (let i = 0; i < 500; i++) {
    chunk0Indices[i] = 1; // 1 = stone
  }

  const chunk0: VoxelChunk = {
    key: '0_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
    ],
    indices: chunk0Indices,
    revision: 1,
  };

  const chunksMapA = new Map<string, VoxelChunk>();
  chunksMapA.set('0_0_0', chunk0);
  const placementA = createPlacement('p1', chunksMapA);

  manager.rebuildPlacementChunks(placementA);
  const statsA = manager.getStats();

  assertEqual(
    statsA.meshCount,
    1,
    '500 stone blocks in 1 chunk must produce exactly 1 THREE.Mesh (not 500 block meshes)'
  );
  assertEqual(statsA.chunkCount, 1, 'Chunk count must be 1');
  assert(statsA.triangleCount > 0, 'Triangle count must be positive');

  // Part B: 2 chunks with both opaque (stone) and translucent (water) blocks
  // Water is classified into translucent pass per render-pass rules.
  manager.clear();

  const chunk1Indices = new Uint8Array(4096);
  chunk1Indices[0] = 1; // stone (opaque)
  chunk1Indices[1] = 2; // water (translucent)

  const chunk1: VoxelChunk = {
    key: '0_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
      { id: 'minecraft:water', props: {} },
    ],
    indices: chunk1Indices,
    revision: 1,
  };

  const chunk2Indices = new Uint8Array(4096);
  chunk2Indices[0] = 1; // stone (opaque)
  chunk2Indices[1] = 2; // water (translucent)

  const chunk2: VoxelChunk = {
    key: '1_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
      { id: 'minecraft:water', props: {} },
    ],
    indices: chunk2Indices,
    revision: 1,
  };

  const chunksMapB = new Map<string, VoxelChunk>();
  chunksMapB.set('0_0_0', chunk1);
  chunksMapB.set('1_0_0', chunk2);
  const placementB = createPlacement('p2', chunksMapB);

  manager.rebuildPlacementChunks(placementB);
  const statsB = manager.getStats();

  // 2 chunks with 2 passes each = at most 2 * 2 = 4 meshes
  assert(
    statsB.meshCount <= 4 && statsB.meshCount >= 2,
    `2 chunks with opaque + translucent blocks must produce at most 4 meshes (got ${statsB.meshCount})`
  );
  assertEqual(statsB.chunkCount, 2, 'Chunk count must be 2');

  manager.dispose();
  console.log('✓ Test 1 passed: meshCount is chunk-level (not block-level), multi-pass produces <= 4 meshes.');
}

// ============================================================================
// Test 2: 3D Amanatides & Woo Voxel DDA Raycast
// ============================================================================
console.log('--- Test 2: 3D Amanatides & Woo Voxel DDA Raycast ---');
{
  // Ray origin at (5.5, 10, 5.5) looking straight down [0, -1, 0]
  // Block at (5, 2, 5)
  const origin: [number, number, number] = [5.5, 10, 5.5];
  const direction: [number, number, number] = [0, -1, 0];

  const getBlockAt = (x: number, y: number, z: number) => {
    if (x === 5 && y === 2 && z === 5) {
      return {
        state: { id: 'minecraft:stone', props: {} },
        placementId: 'test-placement',
      };
    }
    return null;
  };

  const hit = raycastVoxels(origin, direction, 20, getBlockAt);
  assert(hit !== null, 'Raycast must hit the voxel at (5, 2, 5)');

  assertDeepEqual(hit!.position, [5, 2, 5], 'hit.position must be [5, 2, 5]');
  assertDeepEqual(hit!.normal, [0, 1, 0], 'hit.normal must be [0, 1, 0] (top face normal)');
  assertDeepEqual(
    hit!.adjacentPosition,
    [5, 3, 5],
    'hit.adjacentPosition must be [5, 3, 5] (empty voxel right before entry)'
  );
  assertEqual(hit!.distance, 7, 'hit.distance must be 7 (10 - 3)');
  assertEqual(hit!.state.id, 'minecraft:stone', 'hit.state.id must be stone');
  assertEqual(hit!.placementId, 'test-placement', 'hit.placementId must match');

  // Test raycast missing
  const missHit = raycastVoxels(origin, [1, 0, 0], 20, getBlockAt);
  assertEqual(missHit, null, 'Raycast pointing away must return null');

  console.log('✓ Test 2 passed: DDA hits (5, 2, 5) with normal [0, 1, 0] and adjacentPosition [5, 3, 5].');
}

// ============================================================================
// Test 3: ViewportCameraController
// ============================================================================
console.log('--- Test 3: ViewportCameraController ---');
{
  const controller = new ViewportCameraController({
    mode: 'orbit',
    target: [0, 0, 0],
    distance: 20,
    yaw: 0,
    pitch: 0,
  });

  assertEqual(controller.getMode(), 'orbit', 'Initial mode should be orbit');

  // Orbit rotation
  controller.orbit(Math.PI / 4, Math.PI / 6);
  assert(Math.abs(controller.getYaw() - Math.PI / 4) < 1e-5, 'Yaw should update');
  assert(Math.abs(controller.getPitch() - Math.PI / 6) < 1e-5, 'Pitch should update');

  // Pan
  controller.pan(5, 0);
  assert(controller.getTarget()[0] !== 0 || controller.getTarget()[2] !== 0, 'Target should shift on pan');

  // Zoom
  const distBefore = controller.getDistance();
  controller.zoom(100);
  assert(controller.getDistance() < distBefore, 'Zoom in should reduce distance');

  // Fly mode
  controller.setMode('fly');
  assertEqual(controller.getMode(), 'fly', 'Mode should transition to fly');
  const flyPosBefore = [...controller.getPosition()];
  controller.moveFly(1, 0, 0, 1.0); // Move forward 1 second
  const flyPosAfter = controller.getPosition();
  assert(
    flyPosBefore[0] !== flyPosAfter[0] ||
    flyPosBefore[1] !== flyPosAfter[1] ||
    flyPosBefore[2] !== flyPosAfter[2],
    'Fly position should change on moveFly'
  );

  // frameBounds
  const bounds: Bounds3i = {
    min: [10, 0, 20],
    maxExclusive: [30, 20, 40],
  };
  controller.frameBounds(bounds);
  assertDeepEqual(controller.getTarget(), [20, 10, 30], 'Target should center on bounds');

  // applyPreset
  controller.applyPreset('isometric');
  assert(Math.abs(controller.getYaw() - Math.PI / 4) < 1e-4, 'Isometric preset yaw should be 45 deg');
  assert(Math.abs(controller.getPitch() - Math.atan(1 / Math.SQRT2)) < 1e-4, 'Isometric preset pitch should match ~35.26 deg');

  controller.applyPreset('top');
  assert(Math.abs(controller.getYaw()) < 1e-4, 'Top preset yaw should be 0');
  assert(controller.getPitch() > 1.5, 'Top preset pitch should be near 90 deg');

  controller.applyPreset('front');
  assertEqual(controller.getYaw(), 0, 'Front preset yaw should be 0');
  assertEqual(controller.getPitch(), 0, 'Front preset pitch should be 0');

  controller.applyPreset('right');
  assert(Math.abs(controller.getYaw() - Math.PI / 2) < 1e-4, 'Right preset yaw should be 90 deg');
  assertEqual(controller.getPitch(), 0, 'Right preset pitch should be 0');

  // Sync to Three camera
  const threeCam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  controller.setMode('orbit');
  controller.syncToThreeCamera(threeCam);
  assert(Number.isFinite(threeCam.position.x), 'Camera position X must be finite');
  assert(Number.isFinite(threeCam.position.y), 'Camera position Y must be finite');
  assert(Number.isFinite(threeCam.position.z), 'Camera position Z must be finite');

  console.log('✓ Test 3 passed: orbit, fly, framing, presets, and Three camera sync work as expected.');
}

// ============================================================================
// Test 4: Viewport Overlays Default-Off and Enabled States
// ============================================================================
console.log('--- Test 4: Viewport Overlays ---');
{
  const bounds: Bounds3i = {
    min: [0, 0, 0],
    maxExclusive: [32, 16, 32],
  };

  // 1. Off by default per spec -> 0 children
  const offGroup = buildGridBordersGroup(bounds, {
    chunkBorders: false,
    sectionBorders: false,
    blockBorders: false,
  });
  assertEqual(
    offGroup.children.length,
    0,
    'Grid borders overlay with all options false must produce an empty group (0 children)'
  );

  // 2. Chunk borders enabled -> non-empty line segments
  const chunkGroup = buildGridBordersGroup(bounds, {
    chunkBorders: true,
    sectionBorders: false,
    blockBorders: false,
  });
  assert(
    chunkGroup.children.length > 0,
    'Enabling chunkBorders must produce at least 1 child line segment'
  );

  // 3. Section and block borders enabled
  const fullGroup = buildGridBordersGroup(bounds, {
    chunkBorders: true,
    sectionBorders: true,
    blockBorders: true,
  });
  assertEqual(
    fullGroup.children.length,
    3,
    'Enabling chunk, section, and block borders must produce 3 line segment groups'
  );

  // 4. Selection box overlay
  const emptySel = buildSelectionBoxMesh(null);
  assertEqual(emptySel.children.length, 0, 'Null selection bounds must produce empty group');

  const selGroup = buildSelectionBoxMesh(bounds);
  assert(selGroup.children.length === 2, 'Selection box should contain 1 fill mesh + 1 line segments outline');

  console.log('✓ Test 4 passed: overlays respect default-off flags and generate line segments when enabled.');
}

// ============================================================================
// Test 5: O(1) Transform Updates & Revision Cache
// ============================================================================
console.log('--- Test 5: O(1) Transform Updates & Revision Cache ---');
{
  const manager = new ChunkSceneManager();

  const chunk0Indices = new Uint8Array(4096);
  chunk0Indices[0] = 1;
  const chunk0: VoxelChunk = {
    key: '0_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
    ],
    indices: chunk0Indices,
    revision: 1,
  };

  const chunksMap = new Map<string, VoxelChunk>();
  chunksMap.set('0_0_0', chunk0);
  const placement = createPlacement('p-transform', chunksMap);
  const project = createProject('proj-trans', 'TransProject', [placement]);

  manager.syncProject(project);
  assertEqual(manager.getStats().meshCount, 1, 'Initial mesh count must be 1');

  // Grab the Three.js mesh instance
  const group = manager.rootGroup.getObjectByName('placement-p-transform') as THREE.Group;
  assert(group !== undefined, 'Placement root group must exist');
  const innerGroup = group.getObjectByName('placement-p-transform-inner') as THREE.Group;
  const initialMesh = innerGroup.children[0];
  assert(initialMesh !== undefined, 'Mesh must exist in inner group');

  // 1. Update transforms on placement in O(1)
  placement.transform.translation = [15, 25, 35];
  placement.transform.rotationY = 90;
  placement.transform.mirror = 'x';
  manager.updatePlacementTransforms(project);

  assertDeepEqual(
    [group.position.x, group.position.y, group.position.z],
    [15, 25, 35],
    'Group position must match updated translation'
  );
  assert(Math.abs(group.rotation.y - Math.PI / 2) < 1e-5, 'Group rotationY must match 90 deg');
  assertEqual(group.scale.x, -1, 'Group scale.x must be -1 for mirror x');
  assert(innerGroup.children[0] === initialMesh, 'Mesh must not be recreated during transform update');

  // 2. Calling rebuildPlacementChunks without revision changes skips re-meshing
  manager.rebuildPlacementChunks(placement);
  assert(
    innerGroup.children[0] === initialMesh,
    'Mesh must not be recreated when chunk revision and assetEpoch match cache'
  );

  // 3. Changing revision triggers re-mesh
  chunk0.revision = 2;
  manager.rebuildPlacementChunks(placement);
  const updatedMesh = innerGroup.children[0];
  assert(
    updatedMesh !== initialMesh,
    'Mesh must be recreated when chunk revision changes'
  );

  manager.dispose();
  console.log('✓ Test 5 passed: O(1) transform updates modify groups without re-meshing, revision cache prevents redundant builds.');
}

// ============================================================================
// Test 6: Incremental Time-Sliced Chunk Queue
// ============================================================================
console.log('--- Test 6: Incremental Time-Sliced Chunk Queue ---');
{
  const manager = new ChunkSceneManager();

  const chunksMap = new Map<string, VoxelChunk>();
  for (let i = 0; i < 5; i++) {
    const indices = new Uint8Array(4096);
    indices[0] = 1;
    chunksMap.set(`${i}_0_0`, {
      key: `${i}_0_0`,
      palette: [
        { id: 'minecraft:air', props: {} },
        { id: 'minecraft:stone', props: {} },
      ],
      indices,
      revision: 1,
    });
  }

  const placement = createPlacement('p-queue', chunksMap);
  const project = createProject('proj-queue', 'QueueProject', [placement]);

  // Queue sync
  manager.queueProjectSync(project);
  assertEqual(manager.getPendingChunkCount(), 5, 'Pending chunk count must initially be 5');

  // Process first slice with 0ms budget -> should process at least 1 chunk
  const hasMore1 = manager.processChunkQueue(0);
  assert(hasMore1, 'processChunkQueue should return true when chunks remain');
  assert(manager.getPendingChunkCount() < 5, 'Pending count should decrease after slice');

  // Process remaining chunks until done
  let iterations = 0;
  while (manager.processChunkQueue(10)) {
    iterations++;
    assert(iterations < 100, 'Queue processing should not loop indefinitely');
  }

  assertEqual(manager.getPendingChunkCount(), 0, 'Pending count must be 0 when finished');
  assertEqual(manager.getStats().chunkCount, 5, 'All 5 chunks should now be meshed in the scene');

  manager.dispose();
  console.log('✓ Test 6 passed: queueProjectSync and processChunkQueue time-slice meshing correctly.');
}

// ============================================================================
// Test 7: Placement Transform Preview & Session Transform Execution
// ============================================================================
console.log('--- Test 7: Placement Transform Preview & Session Execution ---');
{
  const manager = new ChunkSceneManager();

  const chunk0Indices = new Uint8Array(4096);
  chunk0Indices[0] = 1;
  const chunk0: VoxelChunk = {
    key: '0_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
    ],
    indices: chunk0Indices,
    revision: 1,
  };

  const chunksMap = new Map<string, VoxelChunk>();
  chunksMap.set('0_0_0', chunk0);
  const placement = createPlacement('p-preview', chunksMap);
  const project = createProject('proj-prev', 'PreviewProject', [placement]);

  manager.syncProject(project);
  const group = manager.rootGroup.getObjectByName('placement-p-preview') as THREE.Group;
  assert(group !== undefined, 'Placement root group must exist');

  // 1. previewPlacementTransform updates group without altering placement data or rebuilding chunks
  manager.previewPlacementTransform('p-preview', [10, 20, 30], 90);
  assertDeepEqual(
    [group.position.x, group.position.y, group.position.z],
    [10, 20, 30],
    'previewPlacementTransform must live-update root group position'
  );
  assert(
    Math.abs(group.rotation.y - Math.PI / 2) < 1e-5,
    'previewPlacementTransform must live-update root group rotationY'
  );

  // 2. placement data was untouched during preview
  assertDeepEqual(placement.transform.translation, [0, 0, 0], 'Placement data translation remains unchanged during preview');

  manager.dispose();
  console.log('✓ Test 7 passed: previewPlacementTransform live-updates position and rotation without chunk rebuilds.');
}

console.log('\nAll Slice E3.2 Viewport tests passed successfully!');
