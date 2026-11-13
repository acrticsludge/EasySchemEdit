// apps/web/__tests__/slice-e3-6-placement-ops.test.ts
// Unit tests for Slice E3.6: Placement Operations Controller and Gizmo Drag State Machine.
// Tests single placement transforms, locked enforcement, origin editing, group transforms,
// history atomicity (undo/redo), and gizmo drag snapping.
// Pure TypeScript test script, runs with `node --experimental-strip-types`.

import type { BlockStateId, Bounds3i, Vec3Half, Vec3i } from '../../../packages/domain/types.ts';
import { CANONICAL_AIR } from '../../../packages/domain/block-state.ts';
import type { ChunkedVoxelVolume, VoxelChunk } from '../../../packages/domain/volume.ts';
import { voxelIndex } from '../../../packages/domain/volume.ts';
import type { Placement, Project } from '../../../packages/domain/placement.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import {
  PlacementOperationsController,
  type IEditorSessionStore,
  type RotationY,
  type MirrorAxis,
} from '../src/editor/workflows/placement-ops.ts';

class TestEditorSessionStore implements IEditorSessionStore {
  public readonly session: EditorSession;
  private currentSnapshot: { project: Project; revision: number; [key: string]: any };

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    this.currentSnapshot = this.buildSnapshot();
    this.session.subscribe(() => {
      this.currentSnapshot = this.buildSnapshot();
    });
  }

  private buildSnapshot() {
    return {
      revision: this.session.revision,
      project: this.session.snapshot(),
      selectedTool: 'select',
      activeBottomTab: null,
      importReport: null,
      statusMessage: null,
      canUndo: this.session.canUndo(),
      canRedo: this.session.canRedo(),
    };
  }

  public getSnapshot = () => this.currentSnapshot;

  public async execute(cmd: any, opts?: any) {
    return this.session.execute(cmd, opts);
  }

  public async undo() {
    return this.session.undo();
  }

  public async redo() {
    return this.session.redo();
  }
}

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

function assertDeepEqual<T>(actual: T, expected: T, msg: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg} — expected ${expectedStr}, got ${actualStr}`);
  }
}

function makeTestPlacement(
  id: string,
  name: string,
  translation: Vec3i = [0, 0, 0],
  blockId = 'minecraft:stone'
): Placement {
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
    id: 'test-project-placement-ops',
    name: 'Test Project',
    placements: [
      makeTestPlacement('p1', 'Placement 1', [0, 0, 0], 'minecraft:stone'),
      makeTestPlacement('p2', 'Placement 2', [16, 0, 0], 'minecraft:dirt'),
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

// ============================================================================
// Test Suite
// ============================================================================

async function runTests() {
  console.log('--- Test 1: Single Placement Move & Nudge ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    const moveRes = await controller.movePlacement('p1', [10, 5, -2]);
    assert(moveRes.ok === true, 'movePlacement returns ok: true');
    const p1AfterMove = store.getSnapshot().project.placements.find((p) => p.id === 'p1')!;
    assertDeepEqual(p1AfterMove.transform.translation, [10, 5, -2], 'p1 translation set to [10, 5, -2]');

    const nudgeRes = await controller.nudgePlacement('p1', [1, -2, 3]);
    assert(nudgeRes.ok === true, 'nudgePlacement returns ok: true');
    const p1AfterNudge = store.getSnapshot().project.placements.find((p) => p.id === 'p1')!;
    assertDeepEqual(p1AfterNudge.transform.translation, [11, 3, 1], 'p1 translation nudged to [11, 3, 1]');

    // Undo nudge
    await store.undo();
    const p1Undo1 = store.getSnapshot().project.placements.find((p) => p.id === 'p1')!;
    assertDeepEqual(p1Undo1.transform.translation, [10, 5, -2], 'undo restores translation to [10, 5, -2]');

    // Undo move
    await store.undo();
    const p1Undo2 = store.getSnapshot().project.placements.find((p) => p.id === 'p1')!;
    assertDeepEqual(p1Undo2.transform.translation, [0, 0, 0], 'undo restores translation to [0, 0, 0]');
  }

  console.log('--- Test 2: Rotate (Absolute & Steps) & Mirror ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Absolute rotate
    const rotRes = await controller.rotatePlacement('p1', 90);
    assert(rotRes.ok === true, 'rotatePlacement 90 ok');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 90, 'p1 rotationY is 90');

    // Rotate CW steps: 90 -> 180 -> 270 -> 0
    await controller.rotatePlacementStep('p1', 'cw');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 180, 'p1 rotationY CW is 180');
    await controller.rotatePlacementStep('p1', 'cw');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 270, 'p1 rotationY CW is 270');
    await controller.rotatePlacementStep('p1', 'cw');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 0, 'p1 rotationY CW wraps to 0');

    // Rotate CCW steps: 0 -> 270 -> 180
    await controller.rotatePlacementStep('p1', 'ccw');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 270, 'p1 rotationY CCW wraps to 270');
    await controller.rotatePlacementStep('p1', 'ccw');
    assertEqual(controller.getPlacement('p1')!.transform.rotationY, 180, 'p1 rotationY CCW is 180');

    // Mirror
    await controller.mirrorPlacement('p1', 'x');
    assertEqual(controller.getPlacement('p1')!.transform.mirror, 'x', 'mirror set to x');
    await controller.mirrorPlacement('p1', 'z');
    assertEqual(controller.getPlacement('p1')!.transform.mirror, 'z', 'mirror set to z');
    await controller.mirrorPlacement('p1', 'none');
    assertEqual(controller.getPlacement('p1')!.transform.mirror, 'none', 'mirror set to none');
  }

  console.log('--- Test 3: Rename, Duplicate, Hide/Show, Delete ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Rename
    const renameRes = await controller.renamePlacement('p1', 'Castle Keep');
    assert(renameRes.ok === true, 'renamePlacement ok');
    assertEqual(controller.getPlacement('p1')!.name, 'Castle Keep', 'p1 renamed to Castle Keep');

    // Duplicate
    assertEqual(store.getSnapshot().project.placements.length, 2, 'initially 2 placements');
    const dupRes = await controller.duplicatePlacement('p1', [5, 0, 5]);
    assert(dupRes.ok === true, 'duplicatePlacement ok');
    assertEqual(store.getSnapshot().project.placements.length, 3, 'now 3 placements after duplicate');
    const dupPlacement = store.getSnapshot().project.placements.find((p) => p.id !== 'p1' && p.id !== 'p2')!;
    const dupId = dupPlacement.id;
    assertDeepEqual(dupPlacement.transform.translation, [5, 0, 5], 'duplicate has offset applied');

    // Hide / Show
    await controller.setPlacementHidden('p1', true);
    assertEqual(controller.getPlacement('p1')!.visible, false, 'p1 is hidden');
    await controller.setPlacementHidden('p1', false);
    assertEqual(controller.getPlacement('p1')!.visible, true, 'p1 is visible');

    // Delete
    const delRes = await controller.deletePlacement(dupId);
    assert(delRes.ok === true, 'deletePlacement ok');
    assertEqual(store.getSnapshot().project.placements.length, 2, 'back to 2 placements after delete');
    assertEqual(controller.getPlacement(dupId), undefined, 'deleted placement no longer exists');
  }

  console.log('--- Test 4: Locked Placement Enforcement ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Lock p1
    await controller.setPlacementLocked('p1', true);
    assertEqual(controller.getPlacement('p1')!.locked, true, 'p1 is locked');

    // Move rejected
    const moveRes = await controller.movePlacement('p1', [100, 100, 100]);
    assert(moveRes.ok === false, 'movePlacement rejected on locked placement');
    assertEqual(moveRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');
    assertDeepEqual(controller.getPlacement('p1')!.transform.translation, [0, 0, 0], 'translation untouched');

    // Nudge rejected
    const nudgeRes = await controller.nudgePlacement('p1', [1, 1, 1]);
    assert(nudgeRes.ok === false, 'nudgePlacement rejected on locked placement');
    assertEqual(nudgeRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');

    // Rotate rejected
    const rotRes = await controller.rotatePlacement('p1', 90);
    assert(rotRes.ok === false, 'rotatePlacement rejected on locked placement');
    assertEqual(rotRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');

    // Rotate step rejected
    const rotStepRes = await controller.rotatePlacementStep('p1', 'cw');
    assert(rotStepRes.ok === false, 'rotatePlacementStep rejected on locked placement');
    assertEqual(rotStepRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');

    // Mirror rejected
    const mirrorRes = await controller.mirrorPlacement('p1', 'x');
    assert(mirrorRes.ok === false, 'mirrorPlacement rejected on locked placement');
    assertEqual(mirrorRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');

    // Delete rejected
    const delRes = await controller.deletePlacement('p1');
    assert(delRes.ok === false, 'deletePlacement rejected on locked placement');
    assertEqual(delRes.error?.code, 'LOCKED_PLACEMENT', 'error code is LOCKED_PLACEMENT');
    assertEqual(store.getSnapshot().project.placements.length, 2, 'locked placement not deleted');

    // Visibility toggle is allowed while locked (SUBSPEC-D §2.1)
    const hideRes = await controller.setPlacementHidden('p1', true);
    assert(hideRes.ok === true, 'setPlacementHidden allowed while locked');
    assertEqual(controller.getPlacement('p1')!.visible, false, 'p1 hidden while locked');
    await controller.setPlacementHidden('p1', false);
    assertEqual(controller.getPlacement('p1')!.visible, true, 'p1 shown while locked');

    // Unlock p1 and verify operations succeed again
    await controller.setPlacementLocked('p1', false);
    assertEqual(controller.getPlacement('p1')!.locked, false, 'p1 is unlocked');

    const moveUnlocked = await controller.movePlacement('p1', [5, 5, 5]);
    assert(moveUnlocked.ok === true, 'movePlacement succeeds after unlock');
    assertDeepEqual(controller.getPlacement('p1')!.transform.translation, [5, 5, 5], 'translation updated after unlock');
  }

  console.log('--- Test 5: Origin Editing with keepBlocksInPlace ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Initial state: translation [0, 0, 0], origin [0, 0, 0]
    // Move p1 to [10, 0, 10]
    await controller.movePlacement('p1', [10, 0, 10]);

    // setPlacementOrigin with keepBlocksInPlace: true (default)
    // Local origin changed to [4, 4, 4] in Vec3Half (which is local block [2, 2, 2])
    const originVec: Vec3Half = [4, 4, 4];
    const originRes = await controller.setPlacementOrigin('p1', originVec, true);
    assert(originRes.ok === true, 'setPlacementOrigin keepBlocksInPlace: true ok');

    const p1AfterOrigin = controller.getPlacement('p1')!;
    assertDeepEqual(p1AfterOrigin.origin, [4, 4, 4], 'origin updated to [4, 4, 4]');
    // Since origin shifted by +2 blocks, translation must increase by +2 so world blocks do not jump
    assertDeepEqual(p1AfterOrigin.transform.translation, [12, 2, 12], 'translation adjusted to keep blocks in place');

    // setPlacementOrigin with keepBlocksInPlace: false
    // Local origin changed back to [0, 0, 0], translation should NOT change
    await controller.setPlacementOrigin('p1', [0, 0, 0], false);
    const p1NoKeep = controller.getPlacement('p1')!;
    assertDeepEqual(p1NoKeep.origin, [0, 0, 0], 'origin restored to [0, 0, 0]');
    assertDeepEqual(p1NoKeep.transform.translation, [12, 2, 12], 'translation remained fixed when keepBlocksInPlace: false');

    // Center origin helper
    const centerRes = await controller.centerPlacementOrigin('p1', true);
    assert(centerRes.ok === true, 'centerPlacementOrigin ok');
    const p1Centered = controller.getPlacement('p1')!;
    // Volume bounds is [0, 0, 0] to [16, 16, 16], center is (8, 8, 8) -> doubled Vec3Half is [16, 16, 16]
    assertDeepEqual(p1Centered.origin, [16, 16, 16], 'centered origin is [16, 16, 16]');
  }

  console.log('--- Test 6: Group Transform Across 2 Placements + Undo ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Group consists of p1 at [0, 0, 0] and p2 at [16, 0, 0]
    const p1Before = { ...controller.getPlacement('p1')!.transform };
    const p2Before = { ...controller.getPlacement('p2')!.transform };

    // Group transform: rotate 90 and translate [5, 0, 5]
    const groupRes = await controller.transformGroup(['p1', 'p2'], {
      rotationY: 90,
      translation: [5, 0, 5],
    });
    assert(groupRes.ok === true, 'transformGroup ok');

    const p1After = controller.getPlacement('p1')!;
    const p2After = controller.getPlacement('p2')!;

    assertEqual(p1After.transform.rotationY, 90, 'p1 rotated to 90');
    assertEqual(p2After.transform.rotationY, 90, 'p2 rotated to 90');
    assert(p1After.transform.translation[0] !== p1Before.translation[0], 'p1 translated');
    assert(p2After.transform.translation[0] !== p2Before.translation[0], 'p2 translated');

    // Undo should restore BOTH placements' exact transforms in a single transaction
    await store.undo();
    const p1Restored = controller.getPlacement('p1')!;
    const p2Restored = controller.getPlacement('p2')!;

    assertDeepEqual(p1Restored.transform, p1Before, 'undo restored p1 exact transform');
    assertDeepEqual(p2Restored.transform, p2Before, 'undo restored p2 exact transform');

    // Group transform fails if ANY placement is locked
    await controller.setPlacementLocked('p2', true);
    const lockedGroupRes = await controller.transformGroup(['p1', 'p2'], {
      translation: [1, 1, 1],
    });
    assert(lockedGroupRes.ok === false, 'group transform rejected when a placement is locked');
    assertEqual(lockedGroupRes.error?.code, 'LOCKED_PLACEMENT', 'group error code is LOCKED_PLACEMENT');
    assertDeepEqual(controller.getPlacement('p1')!.transform, p1Before, 'p1 untouched after locked group attempt');
    assertDeepEqual(controller.getPlacement('p2')!.transform, p2Before, 'p2 untouched after locked group attempt');
  }

  console.log('--- Test 7: Gizmo Drag State Machine ---');
  {
    const store = new TestEditorSessionStore(makeTestProject());
    const controller = new PlacementOperationsController(store);

    // Initial translation: [0, 0, 0]
    await controller.movePlacement('p1', [10, 20, 30]);
    assertEqual(controller.isDragging(), false, 'not dragging initially');

    // Begin drag along X axis at world coord 100.2
    controller.beginGizmoDrag('p1', 'x', 100.2);
    assertEqual(controller.isDragging(), true, 'isDragging is true');
    assertEqual(controller.activeGizmoDrag?.axis, 'x', 'drag axis is x');
    assertDeepEqual(controller.activeGizmoDrag?.initialTranslation, [10, 20, 30], 'initial translation recorded');

    // Update drag to 103.4 (delta = 3.2, snapped to 3)
    const pos1 = controller.updateGizmoDrag(103.4);
    assertDeepEqual(pos1, [13, 20, 30], 'updateGizmoDrag snapped to [13, 20, 30]');
    assertDeepEqual(controller.activeGizmoDrag?.currentDelta, [3, 0, 0], 'activeGizmoDrag currentDelta is [3, 0, 0]');

    // Update drag to 105.8 (delta = 5.6, snapped to 6)
    const pos2 = controller.updateGizmoDrag(105.8);
    assertDeepEqual(pos2, [16, 20, 30], 'updateGizmoDrag snapped to [16, 20, 30]');
    assertDeepEqual(controller.activeGizmoDrag?.currentDelta, [6, 0, 0], 'activeGizmoDrag currentDelta is [6, 0, 0]');

    // Commit drag: executes a single undoable placement:move command
    const commitRes = await controller.commitGizmoDrag();
    assert(commitRes.ok === true, 'commitGizmoDrag ok');
    assertEqual(controller.isDragging(), false, 'isDragging is false after commit');

    const p1Committed = controller.getPlacement('p1')!;
    assertDeepEqual(p1Committed.transform.translation, [16, 20, 30], 'committed translation is [16, 20, 30]');

    // Undo restores the pre-drag translation in a single step
    await store.undo();
    const p1Undone = controller.getPlacement('p1')!;
    assertDeepEqual(p1Undone.transform.translation, [10, 20, 30], 'single undo restores pre-drag translation');

    // Cancel drag test
    controller.beginGizmoDrag('p1', 'y', 50.0);
    controller.updateGizmoDrag(59.0);
    assertEqual(controller.isDragging(), true, 'is dragging before cancel');
    controller.cancelGizmoDrag();
    assertEqual(controller.isDragging(), false, 'isDragging is false after cancel');
    assertDeepEqual(controller.getPlacement('p1')!.transform.translation, [10, 20, 30], 'translation unchanged after cancel');
  }

  console.log(`\n========================================`);
  console.log(`Slice E3.6 Placement Ops Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test exception:', err);
  process.exit(1);
});
