// apps/web/__tests__/region-undo-redo.test.ts
// Unit tests for EditorSessionStore unified undo/redo timeline with custom entries (region selection/crud).
// Run with: node --experimental-strip-types apps/web/__tests__/region-undo-redo.test.ts

import type { Vec3i, Placement, Project } from '@easyschemedit/domain';
import { CANONICAL_AIR } from '../../../packages/domain/block-state.ts';
import { voxelIndex, type ChunkedVoxelVolume, type VoxelChunk } from '../../../packages/domain/volume.ts';
import {
  createEditorSessionStore,
  type CustomUndoEntry,
} from '../src/editor/session-store.ts';

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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} (Expected: ${String(expected)}, Actual: ${String(actual)})`);
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
    id: 'test-undo-redo-proj',
    name: 'Undo Redo Test Project',
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
    revision: 0,
  };
}

async function runTests() {
  console.log('=== Running Region Undo/Redo & Unified Timeline Tests ===\n');

  // Test 1: pushCustomUndo -> canUndo() -> undo() -> canRedo() -> redo()
  console.log('--- Test 1: pushCustomUndo -> canUndo() -> undo() -> canRedo() -> redo() ---');
  {
    const store = createEditorSessionStore(makeTestProject());
    assertEqual(store.canUndo(), false, 'T1.1: initially cannot undo');
    assertEqual(store.canRedo(), false, 'T1.2: initially cannot redo');
    assertEqual(store.getSnapshot().canUndo, false, 'T1.3: snapshot initially cannot undo');

    let currentRegion = 'none';
    const customEntry: CustomUndoEntry = {
      label: 'Select Region R1',
      undo: () => {
        currentRegion = 'none';
      },
      redo: () => {
        currentRegion = 'r1';
      },
    };

    currentRegion = 'r1';
    store.pushCustomUndo(customEntry);

    assertEqual(store.canUndo(), true, 'T1.4: canUndo true after pushCustomUndo');
    assertEqual(store.canRedo(), false, 'T1.5: canRedo false after pushCustomUndo');
    assertEqual(store.getSnapshot().canUndo, true, 'T1.6: snapshot reflects canUndo=true');
    assertEqual(currentRegion, 'r1', 'T1.7: currentRegion is r1');

    const undoRes = await store.undo();
    assert(Boolean(undoRes && undoRes.ok), 'T1.8: store.undo() succeeds');
    assertEqual(currentRegion, 'none', 'T1.9: custom undo callback was executed');
    assertEqual(store.canUndo(), false, 'T1.10: canUndo is false after undoing sole custom entry');
    assertEqual(store.canRedo(), true, 'T1.11: canRedo is true after undo');
    assertEqual(store.getSnapshot().canRedo, true, 'T1.12: snapshot reflects canRedo=true');

    const redoRes = await store.redo();
    assert(Boolean(redoRes && redoRes.ok), 'T1.13: store.redo() succeeds');
    assertEqual(currentRegion, 'r1', 'T1.14: custom redo callback was executed');
    assertEqual(store.canUndo(), true, 'T1.15: canUndo is true after redo');
    assertEqual(store.canRedo(), false, 'T1.16: canRedo is false after redo');
    assertEqual(store.getSnapshot().canUndo, true, 'T1.17: snapshot reflects canUndo=true');
    assertEqual(store.getSnapshot().canRedo, false, 'T1.18: snapshot reflects canRedo=false');
  }

  // Test 2: Interleaving session.execute with pushCustomUndo in exact LIFO order
  console.log('\n--- Test 2: Interleaving session.execute with pushCustomUndo in LIFO order ---');
  {
    const store = createEditorSessionStore(makeTestProject());
    const actionLog: string[] = [];

    // Step 1: Session move (+10 on X)
    const exec1 = await store.execute({
      type: 'placement:move',
      placementId: 'p1',
      offset: [10, 0, 0],
    });
    assert(exec1.ok, 'T2.1: Session command 1 executed');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 10, 'T2.2: Placement X is 10');

    // Step 2: Custom region 1
    store.pushCustomUndo({
      label: 'Region R1',
      undo: () => actionLog.push('undo-r1'),
      redo: () => actionLog.push('redo-r1'),
    });

    // Step 3: Session move (+20 on Y)
    const exec2 = await store.execute({
      type: 'placement:move',
      placementId: 'p1',
      offset: [0, 20, 0],
    });
    assert(exec2.ok, 'T2.3: Session command 2 executed');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 20, 'T2.4: Placement Y is 20');

    // Step 4: Custom region 2
    store.pushCustomUndo({
      label: 'Region R2',
      undo: () => actionLog.push('undo-r2'),
      redo: () => actionLog.push('redo-r2'),
    });

    assertEqual(store.canUndo(), true, 'T2.5: canUndo is true');
    assertEqual(store.canRedo(), false, 'T2.6: canRedo is false');

    // Undo 1: should undo Custom region 2
    await store.undo();
    assertEqual(actionLog.length, 1, 'T2.7: 1 custom action logged');
    assertEqual(actionLog[0], 'undo-r2', 'T2.8: Region R2 undone first (LIFO)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 20, 'T2.9: Placement Y untouched by custom undo');

    // Undo 2: should undo Session move 2
    await store.undo();
    assertEqual(actionLog.length, 1, 'T2.10: No new custom action on session undo');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 0, 'T2.11: Session move 2 undone (Y reverted to 0)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 10, 'T2.12: Placement X still 10');

    // Undo 3: should undo Custom region 1
    await store.undo();
    assertEqual(actionLog.length, 2, 'T2.13: 2nd custom action logged');
    assertEqual(actionLog[1], 'undo-r1', 'T2.14: Region R1 undone next (LIFO)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 10, 'T2.15: Placement X untouched by custom undo');

    // Undo 4: should undo Session move 1
    await store.undo();
    assertEqual(actionLog.length, 2, 'T2.16: No new custom action on session undo');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 0, 'T2.17: Session move 1 undone (X reverted to 0)');

    assertEqual(store.canUndo(), false, 'T2.18: All actions undone, canUndo=false');
    assertEqual(store.canRedo(), true, 'T2.19: canRedo=true');

    // Redo 1: should redo Session move 1
    await store.redo();
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 10, 'T2.20: Session move 1 redone (X is 10)');
    assertEqual(actionLog.length, 2, 'T2.21: No custom redo called during session redo');

    // Redo 2: should redo Custom region 1
    await store.redo();
    assertEqual(actionLog.length, 3, 'T2.22: Custom redo called');
    assertEqual(actionLog[2], 'redo-r1', 'T2.23: Region R1 redone (LIFO)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 0, 'T2.24: Placement Y still 0');

    // Redo 3: should redo Session move 2
    await store.redo();
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 20, 'T2.25: Session move 2 redone (Y is 20)');
    assertEqual(actionLog.length, 3, 'T2.26: No custom redo called during session redo');

    // Redo 4: should redo Custom region 2
    await store.redo();
    assertEqual(actionLog.length, 4, 'T2.27: Custom redo called');
    assertEqual(actionLog[3], 'redo-r2', 'T2.28: Region R2 redone (LIFO)');

    assertEqual(store.canUndo(), true, 'T2.29: canUndo=true');
    assertEqual(store.canRedo(), false, 'T2.30: canRedo=false');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 10, 'T2.31: Final X is 10');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 20, 'T2.32: Final Y is 20');
  }

  // Test 3: clearCustomUndoHistory() clears custom entries while keeping session undo entries
  console.log('\n--- Test 3: clearCustomUndoHistory() preserves session history ---');
  {
    const store = createEditorSessionStore(makeTestProject());
    const customLog: string[] = [];

    // Session 1
    await store.execute({
      type: 'placement:move',
      placementId: 'p1',
      offset: [5, 0, 0],
    });

    // Custom 1
    store.pushCustomUndo({
      label: 'R1',
      undo: () => customLog.push('undo-r1'),
      redo: () => customLog.push('redo-r1'),
    });

    // Session 2
    await store.execute({
      type: 'placement:move',
      placementId: 'p1',
      offset: [0, 5, 0],
    });

    // Custom 2
    store.pushCustomUndo({
      label: 'R2',
      undo: () => customLog.push('undo-r2'),
      redo: () => customLog.push('redo-r2'),
    });

    assertEqual(store.canUndo(), true, 'T3.1: canUndo is true');

    // Clear custom undo entries
    store.clearCustomUndoHistory();

    assertEqual(store.canUndo(), true, 'T3.2: canUndo remains true because session history exists');

    // Undo 1: should be Session 2, NOT Custom 2
    await store.undo();
    assertEqual(customLog.length, 0, 'T3.3: Custom 2 was not executed (filtered out)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 0, 'T3.4: Session 2 undone (Y back to 0)');

    // Undo 2: should be Session 1, NOT Custom 1
    await store.undo();
    assertEqual(customLog.length, 0, 'T3.5: Custom 1 was not executed (filtered out)');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 0, 'T3.6: Session 1 undone (X back to 0)');

    assertEqual(store.canUndo(), false, 'T3.7: canUndo is now false');
  }

  // Test 4: Executing a new session.execute after undoing a custom entry clears redo
  console.log('\n--- Test 4: Executing a new session.execute after undoing custom entry clears redo ---');
  {
    const store = createEditorSessionStore(makeTestProject());
    const customLog: string[] = [];

    store.pushCustomUndo({
      label: 'Region R1',
      undo: () => customLog.push('undo-r1'),
      redo: () => customLog.push('redo-r1'),
    });

    assertEqual(store.canUndo(), true, 'T4.1: canUndo=true');
    assertEqual(store.canRedo(), false, 'T4.2: canRedo=false');

    await store.undo();
    assertEqual(customLog.length, 1, 'T4.3: Custom undo executed');
    assertEqual(customLog[0], 'undo-r1', 'T4.4: undo-r1 logged');
    assertEqual(store.canUndo(), false, 'T4.5: canUndo=false');
    assertEqual(store.canRedo(), true, 'T4.6: canRedo=true');
    assertEqual(store.getSnapshot().canRedo, true, 'T4.7: snapshot canRedo=true');

    // Execute new session command
    const res = await store.execute({
      type: 'placement:move',
      placementId: 'p1',
      offset: [1, 2, 3],
    });
    assert(res.ok, 'T4.8: new session command executed');

    // Redo MUST now be cleared
    assertEqual(store.canRedo(), false, 'T4.9: canRedo is false after new session command');
    assertEqual(store.getSnapshot().canRedo, false, 'T4.10: snapshot canRedo is false');
    assertEqual(store.canUndo(), true, 'T4.11: canUndo is true for newly executed command');

    // Attempting redo should do nothing
    const redoAttempt = await store.redo();
    assert(!redoAttempt || !redoAttempt.ok || (redoAttempt as any).changed?.cells === 0, 'T4.12: redo is ineffective');
    assertEqual(customLog.length, 1, 'T4.13: custom redo was not called');

    // Undoing should undo the newly executed session command
    await store.undo();
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[0], 0, 'T4.14: new session command undone');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[1], 0, 'T4.15: Y back to 0');
    assertEqual(store.session.peekProject().placements[0]?.transform.translation[2], 0, 'T4.16: Z back to 0');
  }

  // Test 5: Reactive listeners and snapshot consistency
  console.log('\n--- Test 5: Reactive listeners and snapshot consistency ---');
  {
    const store = createEditorSessionStore(makeTestProject());
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount++;
    });

    store.pushCustomUndo({
      label: 'R1',
      undo: () => {},
      redo: () => {},
    });
    assertEqual(notifyCount, 1, 'T5.1: listener notified on pushCustomUndo');
    assertEqual(store.getSnapshot().canUndo, true, 'T5.2: snapshot canUndo updated');

    await store.undo();
    assertEqual(notifyCount, 2, 'T5.3: listener notified on undo');
    assertEqual(store.getSnapshot().canUndo, false, 'T5.4: snapshot canUndo=false');
    assertEqual(store.getSnapshot().canRedo, true, 'T5.5: snapshot canRedo=true');

    await store.redo();
    assertEqual(notifyCount, 3, 'T5.6: listener notified on redo');
    assertEqual(store.getSnapshot().canUndo, true, 'T5.7: snapshot canUndo=true');
    assertEqual(store.getSnapshot().canRedo, false, 'T5.8: snapshot canRedo=false');

    store.clearCustomUndoHistory();
    assertEqual(notifyCount, 4, 'T5.9: listener notified on clearCustomUndoHistory');
    assertEqual(store.getSnapshot().canUndo, false, 'T5.10: snapshot canUndo=false after clear');

    unsubscribe();
  }

  console.log(`\n========================================`);
  console.log(`Region Undo/Redo Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
