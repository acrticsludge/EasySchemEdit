// apps/web/__tests__/slice-r2-region-and-camera.test.ts
// Unit tests for Region Selection Overlay, Camera State Persistence, and Right Vertical Island tool logic.

import * as THREE from 'three';
import type { Bounds3i, Vec3i, Vec3Half, Placement } from '@easyschemedit/domain';
import { worldBlockToLocal } from '../../../packages/domain/coordinates.ts';
import {
  ViewportCameraController,
  type CameraStateSnapshot,
} from '../src/editor/viewport/camera-controller.ts';
import { buildSelectionBoxMesh } from '../src/editor/viewport/overlays-builder.ts';

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

console.log('=== Running Slice R2: Region Selection and Camera Persistence Tests ===\n');

// ---------------------------------------------------------------------------
// Test 1: ViewportCameraController.restoreSnapshot Roundtrip
// ---------------------------------------------------------------------------
console.log('--- Test 1: Camera Snapshot Roundtrip & Mode Restoration ---');
{
  const ctrl = new ViewportCameraController({
    mode: 'orbit',
    target: [10, 20, 30],
    distance: 45,
    yaw: 1.25,
    pitch: 0.45,
    flySpeed: 25,
  });

  const snap1 = ctrl.getSnapshot();
  assertEqual(snap1.mode, 'orbit', 'Snapshot mode is orbit');
  assertDeepEqual(snap1.target, [10, 20, 30], 'Snapshot target matches');
  assertEqual(snap1.distance, 45, 'Snapshot distance matches');
  assertEqual(snap1.yaw, 1.25, 'Snapshot yaw matches');
  assertEqual(snap1.pitch, 0.45, 'Snapshot pitch matches');
  assertEqual(snap1.flySpeed, 25, 'Snapshot flySpeed matches');

  // Mutate controller
  ctrl.setMode('fly');
  ctrl.setFlySpeed(60);
  ctrl.orbit(0.5, 0.2);

  // Restore previous snapshot
  ctrl.restoreSnapshot(snap1);

  const restoredSnap = ctrl.getSnapshot();
  assertEqual(restoredSnap.mode, 'orbit', 'Restored mode is orbit');
  assertDeepEqual(restoredSnap.target, [10, 20, 30], 'Restored target matches');
  assertEqual(restoredSnap.distance, 45, 'Restored distance matches');
  assertEqual(ctrl.getTargetDistance(), 45, 'targetDistance synced with distance');
  assertEqual(restoredSnap.yaw, 1.25, 'Restored yaw matches');
  assertEqual(restoredSnap.pitch, 0.45, 'Restored pitch matches');
  assertEqual(restoredSnap.flySpeed, 25, 'Restored flySpeed matches');
  console.log('  ✓ Snapshot roundtrip restores exact orbit state');
}

// ---------------------------------------------------------------------------
// Test 2: Fly Mode Snapshot Restoration
// ---------------------------------------------------------------------------
console.log('--- Test 2: Fly Mode Snapshot Restoration ---');
{
  const ctrl = new ViewportCameraController();

  const flySnap: CameraStateSnapshot = {
    mode: 'fly',
    target: [0, 0, 0],
    position: [12.5, 34.0, -56.5],
    distance: 20,
    yaw: -0.75,
    pitch: 0.3,
    flySpeed: 42,
  };

  ctrl.restoreSnapshot(flySnap);
  assertEqual(ctrl.getMode(), 'fly', 'Restored mode is fly');
  const pos = ctrl.getPosition();
  assertEqual(pos[0], 12.5, 'Fly position X restored');
  assertEqual(pos[1], 34.0, 'Fly position Y restored');
  assertEqual(pos[2], -56.5, 'Fly position Z restored');
  assertEqual(ctrl.getFlySpeed(), 42, 'Fly speed restored');
  assertEqual(ctrl.getYaw(), -0.75, 'Fly yaw restored');
  assertEqual(ctrl.getPitch(), 0.3, 'Fly pitch restored');
  console.log('  ✓ Fly mode state and position restored correctly');
}

// ---------------------------------------------------------------------------
// Test 3: Finite Number Guards and Clamping
// ---------------------------------------------------------------------------
console.log('--- Test 3: Finite Number Guards and Clamping in restoreSnapshot ---');
{
  const ctrl = new ViewportCameraController({
    target: [5, 5, 5],
    distance: 30,
    yaw: 0.5,
    pitch: 0.2,
    flySpeed: 15,
  });

  // Attempt to restore with invalid/non-finite values
  ctrl.restoreSnapshot({
    target: [NaN as any, 10, 20],
    distance: Infinity as any,
    yaw: 'invalid' as any,
    pitch: NaN as any,
    flySpeed: -100, // should clamp to minimum 2
  });

  const snap = ctrl.getSnapshot();
  assertDeepEqual(snap.target, [5, 5, 5], 'Target untouched when containing NaN');
  assertEqual(snap.distance, 30, 'Distance untouched when Infinity');
  assertEqual(snap.yaw, 0.5, 'Yaw untouched when non-number');
  assertEqual(snap.pitch, 0.2, 'Pitch untouched when NaN');
  assertEqual(snap.flySpeed, 2, 'Fly speed clamped to minimum 2');
  console.log('  ✓ Non-finite values safely ignored and bounds clamped');
}

// ---------------------------------------------------------------------------
// Test 4: buildSelectionBoxMesh Emerald Vibrant Overlay & Dimensions
// ---------------------------------------------------------------------------
console.log('--- Test 4: buildSelectionBoxMesh Emerald Overlay & Inflation ---');
{
  // Null bounds returns empty group
  const emptyGroup = buildSelectionBoxMesh(null);
  assertEqual(emptyGroup.children.length, 0, 'Null bounds produces empty group');

  // Degenerate bounds returns empty group
  const zeroGroup = buildSelectionBoxMesh({ min: [0, 0, 0], maxExclusive: [0, 5, 5] });
  assertEqual(zeroGroup.children.length, 0, 'Zero volume produces empty group');

  // Valid 10x20x30 cuboid bounds
  const bounds: Bounds3i = {
    min: [5, 10, 15],
    maxExclusive: [15, 30, 45],
  };

  const group = buildSelectionBoxMesh(bounds);
  assertEqual(group.name, 'selection-box-overlay', 'Group name matches');
  assertEqual(group.children.length, 2, 'Has fill mesh and wireframe outline');

  const fillMesh = group.children[0] as THREE.Mesh;
  assert(fillMesh instanceof THREE.Mesh, 'First child is Mesh');
  const boxGeo = fillMesh.geometry as THREE.BoxGeometry;
  const boxMat = fillMesh.material as THREE.MeshBasicMaterial;

  // Verify dimensions: sx = 10, sy = 20, sz = 30 + 0.008 inflation
  const params = boxGeo.parameters;
  assert(Math.abs(params.width - 10.008) < 1e-5, `Width inflated by 0.008 (got ${params.width})`);
  assert(Math.abs(params.height - 20.008) < 1e-5, `Height inflated by 0.008 (got ${params.height})`);
  assert(Math.abs(params.depth - 30.008) < 1e-5, `Depth inflated by 0.008 (got ${params.depth})`);

  // Verify center position
  assertEqual(fillMesh.position.x, 10, 'Center X is 5 + 10/2');
  assertEqual(fillMesh.position.y, 20, 'Center Y is 10 + 20/2');
  assertEqual(fillMesh.position.z, 30, 'Center Z is 15 + 30/2');

  // Verify material properties: vibrant emerald #14f195, opacity 0.22, polygonOffset true
  assertEqual(boxMat.color.getHex(), 0x14f195, 'Fill color is emerald #14f195');
  assertEqual(boxMat.opacity, 0.22, 'Fill opacity is 0.22');
  assertEqual(boxMat.transparent, true, 'Fill material is transparent');
  assertEqual(boxMat.polygonOffset, true, 'Polygon offset enabled to prevent z-fighting');
  assertEqual(boxMat.polygonOffsetFactor, -1, 'Polygon offset factor is -1');
  assertEqual(boxMat.polygonOffsetUnits, -1, 'Polygon offset units is -1');

  // Verify wireframe outline: color #39ffaa, opacity 0.95
  const lineMesh = group.children[1] as THREE.LineSegments;
  assert(lineMesh instanceof THREE.LineSegments, 'Second child is LineSegments');
  const lineMat = lineMesh.material as THREE.LineBasicMaterial;
  assertEqual(lineMat.color.getHex(), 0x39ffaa, 'Wireframe color is bright emerald #39ffaa');
  assertEqual(lineMat.opacity, 0.95, 'Wireframe opacity is 0.95');
  assertEqual(lineMat.transparent, true, 'Wireframe material is transparent');
  console.log('  ✓ Selection box mesh has vibrant emerald colors, 0.008 inflation, and depth offsets');
}

// ---------------------------------------------------------------------------
// Test 5: Cuboid Selection Point Pair Math
// ---------------------------------------------------------------------------
console.log('--- Test 5: Cuboid Bounds Computation from P1 and P2 ---');
{
  const p1: Vec3i = [15, 30, 5];
  const p2: Vec3i = [5, 10, 25];

  const minX = Math.min(p1[0], p2[0]);
  const maxX = Math.max(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]);
  const maxY = Math.max(p1[1], p2[1]);
  const minZ = Math.min(p1[2], p2[2]);
  const maxZ = Math.max(p1[2], p2[2]);

  const bounds: Bounds3i = {
    min: [minX, minY, minZ],
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1],
  };

  assertDeepEqual(bounds.min, [5, 10, 5], 'Min corners inclusive');
  assertDeepEqual(bounds.maxExclusive, [16, 31, 26], 'Max corners exclusive (+1)');
  console.log('  ✓ Corner pairs correctly form discrete half-open voxel bounds');
}

// ---------------------------------------------------------------------------
// Test 6: Set Schematic Origin Math (worldBlockToLocal)
// ---------------------------------------------------------------------------
console.log('--- Test 6: Set Schematic Origin (worldBlockToLocal) ---');
{
  const mockPlacement: Placement = {
    id: 'test-p1',
    name: 'Test Placement',
    transform: {
      translation: [10, 0, 10],
      rotationY: 0,
      mirror: 'none',
    },
    origin: [0, 0, 0],
    volume: {
      bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 1,
      paletteCardinality: 2,
    },
    visible: true,
    locked: false,
    color: '#00e5ff',
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

  // Selected voxel in world space: [12, 3, 14]
  const selectedWorldPos: Vec3i = [12, 3, 14];
  const local = worldBlockToLocal(mockPlacement, selectedWorldPos);
  assertDeepEqual(local, [2, 3, 4], 'Local block coordinates match world minus translation');

  // New origin in half-block space
  const newOrigin: Vec3Half = [local[0] * 2, local[1] * 2, local[2] * 2];
  assertDeepEqual(newOrigin, [4, 6, 8], 'New origin in half-block units [local*2]');
  console.log('  ✓ Set origin maps world block to local and half-block origin coordinates');
}

console.log('\n=== All Slice R2 Tests Passed Successfully! ===');
