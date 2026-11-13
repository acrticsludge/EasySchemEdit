// apps/web/__tests__/slice-e3-8-panels.test.ts
// Unit tests for Slice E3.8: Conflicts Panel, Bake Dialog, and Material List Panel
// View-Models and Controllers (SUBSPEC-D §§8-10, SUBSPEC-G §6.4).
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-8-panels.test.ts

import type { BlockStateId, Bounds3i, Vec3i } from '@easyschemedit/domain';
import type { ChunkedVoxelVolume, Placement, Project } from '@easyschemedit/domain';
import { setBlock } from '../../../packages/domain/volume-api.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import {
  ConflictsPanelController,
  BakeController,
  MaterialListController,
  type IEditorSessionStore,
  type ConflictEntry,
} from '../src/editor/panels/panels-controller.ts';

declare const process: any;

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
    console.error(
      `FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ============================================================================
// Fixture Helpers & Session Store
// ============================================================================

class TestSessionStore implements IEditorSessionStore {
  public readonly session: EditorSession;
  private listeners: Set<() => void> = new Set();

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    this.session.subscribe(() => {
      for (const l of this.listeners) {
        try {
          l();
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  public async execute(cmd: any, opts?: any) {
    return this.session.execute(cmd, opts);
  }

  public async query<T>(q: any): Promise<T> {
    return this.session.query<T>(q);
  }

  public async undo() {
    return this.session.undo();
  }

  public async redo() {
    return this.session.redo();
  }

  public getSnapshot() {
    return {
      revision: this.session.revision,
      project: this.session.snapshot(),
      canUndo: this.session.canUndo(),
      canRedo: this.session.canRedo(),
    };
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function createTestVolume(): ChunkedVoxelVolume {
  return {
    bounds: { min: [0, 0, 0], maxExclusive: [2, 1, 1] },
    chunkSize: 16,
    chunks: new Map(),
    nonAirCount: 0,
    paletteCardinality: 1,
  };
}

function createTestPlacement(
  id: string,
  name: string,
  blocks: Array<{ pos: Vec3i; block: BlockStateId }>
): Placement {
  const volume = createTestVolume();
  for (const b of blocks) {
    setBlock(volume, b.pos, b.block);
  }

  return {
    id,
    name,
    volume,
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
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

function createOverlappingProject(): Project {
  // Placement 1: minecraft:stone at (0,0,0) and (1,0,0)
  const p1 = createTestPlacement('p1', 'Placement 1 (Base)', [
    { pos: [0, 0, 0], block: { id: 'minecraft:stone', props: {} } },
    { pos: [1, 0, 0], block: { id: 'minecraft:stone', props: {} } },
  ]);

  // Placement 2: minecraft:dirt at (0,0,0) (conflict) and minecraft:stone at (1,0,0) (same-state)
  const p2 = createTestPlacement('p2', 'Placement 2 (Top)', [
    { pos: [0, 0, 0], block: { id: 'minecraft:dirt', props: {} } },
    { pos: [1, 0, 0], block: { id: 'minecraft:stone', props: {} } },
  ]);

  return {
    schemaVersion: 1,
    id: 'test-project-conflicts',
    name: 'Conflict Test Project',
    placements: [p1, p2],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'full',
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
  console.log('=== Running Slice E3.8: Panels & Controllers Tests ===\n');

  // ──────────────────────────────────────────────────────────────────────────
  // Test Suite 1: ConflictsPanelController
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Test Suite 1: ConflictsPanelController ---');
  {
    const store = new TestSessionStore(createOverlappingProject());
    const controller = new ConflictsPanelController(store, 'all');
    await controller.refresh();

    const stats = controller.getStats();
    assertEqual(stats.totalOverlaps, 2, 'Total overlaps should be 2 cells');
    assertEqual(stats.realConflicts, 1, 'Real conflicts (state-conflict) should be 1 cell');
    assertEqual(stats.identicalOverlaps, 1, 'Identical overlaps (same-state) should be 1 cell');

    const entries = controller.getEntries();
    assertEqual(entries.length, 2, 'Total conflict entries should be 2');

    const conflictAt000 = entries.find(
      (e) => e.position[0] === 0 && e.position[1] === 0 && e.position[2] === 0
    );
    assert(conflictAt000 !== undefined, 'Found cell at (0,0,0)');
    assertEqual(conflictAt000?.category, 'state-conflict', '(0,0,0) has state-conflict (stone vs dirt)');
    assertEqual(conflictAt000?.owners.length, 2, '(0,0,0) owned by 2 placements');

    const identicalAt100 = entries.find(
      (e) => e.position[0] === 1 && e.position[1] === 0 && e.position[2] === 0
    );
    assert(identicalAt100 !== undefined, 'Found cell at (1,0,0)');
    assertEqual(identicalAt100?.category, 'same-state', '(1,0,0) has same-state (stone vs stone)');

    // ── Overlay Mode Toggles ──
    controller.setOverlayMode('conflicts-only');
    assertEqual(controller.getOverlayMode(), 'conflicts-only', 'Overlay mode is conflicts-only');
    const conflictsOnlyList = controller.getRelevantEntries();
    assertEqual(conflictsOnlyList.length, 1, 'conflicts-only mode yields only the 1 state-conflict cell');
    assertEqual(conflictsOnlyList[0]!.category, 'state-conflict', 'Single item is state-conflict');

    controller.setOverlayMode('off');
    assertEqual(controller.getOverlayMode(), 'off', 'Overlay mode is off');
    assertEqual(controller.getRelevantEntries().length, 0, 'off mode yields 0 entries');

    controller.setOverlayMode('all');
    assertEqual(controller.getRelevantEntries().length, 2, 'all mode yields 2 entries');

    // ── Conflict Navigator (next / prev / camera fly) ──
    let cameraTarget: [number, number, number] | null = null;
    controller.onCameraFly((pos) => {
      cameraTarget = pos;
    });

    assert(controller.jumpTo(0), 'Jump to index 0 succeeded');
    assertEqual(controller.getActiveIndex(), 0, 'Active index is 0');
    assert(cameraTarget !== null, 'Camera fly callback was invoked');
    if (!cameraTarget) throw new Error('Expected cameraTarget to be set');

    const firstPos: [number, number, number] = [cameraTarget[0], cameraTarget[1], cameraTarget[2]];
    assert(controller.next(), 'next() navigation succeeded');
    assertEqual(controller.getActiveIndex(), 1, 'Active index is now 1');
    assert(cameraTarget !== null, 'Camera target is set after next()');
    const nextPos = cameraTarget as [number, number, number];
    assert(
      nextPos[0] !== firstPos[0] || nextPos[1] !== firstPos[1] || nextPos[2] !== firstPos[2],
      'Camera target flew to next cell'
    );

    assert(controller.prev(), 'prev() navigation succeeded');
    assertEqual(controller.getActiveIndex(), 0, 'Active index is back to 0');
    assert(cameraTarget !== null, 'Camera target is set after prev()');
    const prevPos = cameraTarget as [number, number, number];
    assertEqual(prevPos[0], firstPos[0], 'Camera target flew back to first cell');

    // ── Per-conflict resolution via region:delete (Keep Winner & Undo) ──
    console.log('Testing resolveKeepWinner and undo restoration...');
    assert(conflictAt000 !== undefined, 'Valid conflict cell to resolve');
    // Keep 'p2' as winner: deletes conflicting voxel from 'p1' via region:delete
    const keepResult = await controller.resolveKeepWinner(conflictAt000!, 'p2');
    assert(keepResult.ok, 'resolveKeepWinner succeeded');

    const statsAfterKeep = controller.getStats();
    assertEqual(statsAfterKeep.realConflicts, 0, 'Real conflicts reduced from 1 to 0');

    // Undo should restore the deleted voxel in p1 and restore the conflict
    const undoRes = await store.undo();
    assert(undoRes !== null && undoRes.ok, 'store.undo() succeeded');
    await controller.refresh();

    const statsAfterUndo = controller.getStats();
    assertEqual(statsAfterUndo.realConflicts, 1, 'Undo successfully restored the real conflict');

    controller.dispose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test Suite 2: BakeController
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Suite 2: BakeController ---');
  {
    const store = new TestSessionStore(createOverlappingProject());
    const bakeController = new BakeController(store, {
      overlapPolicy: 'top-wins',
    });

    const validation = bakeController.canBake();
    assert(validation.ok, 'canBake validates ok for 2 existing unlocked placements');

    const available = bakeController.getAvailablePlacements();
    assertEqual(available.length, 2, 'Available placements count is 2');

    // ── Test Bake in-place & Undo ──
    console.log('Testing Bake in-place...');
    bakeController.setCreateNewPlacement(false);
    const inPlaceResult = await bakeController.executeBake();
    assert(inPlaceResult.ok, 'Bake in-place executed successfully');
    assertEqual(store.getSnapshot().project.placements.length, 2, 'Placements count remains 2 after in-place bake');

    const undoInPlace = await store.undo();
    assert(undoInPlace !== null && undoInPlace.ok, 'Undo in-place bake succeeded');

    // ── Test Bake to New Placement & Undo ──
    console.log('Testing Bake into new placement...');
    bakeController.setCreateNewPlacement(true);
    bakeController.setNewPlacementName('Baked Composite Placement');

    const preCount = store.getSnapshot().project.placements.length;
    assertEqual(preCount, 2, 'Pre-bake placement count is 2');

    const newPlacementResult = await bakeController.executeBake();
    assert(newPlacementResult.ok, 'Bake into new placement executed successfully');

    const postCount = store.getSnapshot().project.placements.length;
    assertEqual(postCount, 3, 'Post-bake placement count increased to 3');

    const bakedPlacement = store.getSnapshot().project.placements[2]!;
    assertEqual(bakedPlacement.name, 'Baked Composite Placement', 'New placement has configured name');

    // Undo restores the project to 2 placements
    const undoNewPlacement = await store.undo();
    assert(undoNewPlacement !== null && undoNewPlacement.ok, 'Undo new placement bake succeeded');
    assertEqual(store.getSnapshot().project.placements.length, 2, 'Placement count restored to 2 after undo');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test Suite 3: MaterialListController
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Suite 3: MaterialListController ---');
  {
    const store = new TestSessionStore(createOverlappingProject());
    const matController = new MaterialListController(store);

    // ── Effective mode: overlapping voxels counted once with top-wins precedence ──
    await matController.setMode('effective');
    await matController.refresh();

    // At (0,0,0): p2 dirt overrides p1 stone -> 1 dirt
    // At (1,0,0): p2 stone overrides p1 stone -> 1 stone
    // Effective composite non-air count = 2 blocks!
    assertEqual(matController.getTotalBlocks(), 2, 'Effective composite has 2 total blocks');
    assertEqual(matController.getTotalTypes(), 2, 'Effective composite has 2 types (dirt and stone)');

    const effectiveItems = matController.getItems();
    const dirtItem = effectiveItems.find((i) => i.blockId === 'minecraft:dirt');
    const stoneItem = effectiveItems.find((i) => i.blockId === 'minecraft:stone');
    assert(dirtItem !== undefined, 'Effective list contains minecraft:dirt');
    assertEqual(dirtItem?.count, 1, 'dirt count is 1');
    assert(stoneItem !== undefined, 'Effective list contains minecraft:stone');
    assertEqual(stoneItem?.count, 1, 'stone count is 1');

    // ── Per-placement mode: counts all placements independently ──
    // p1: 2 stone; p2: 1 dirt, 1 stone -> sum = 4 blocks (3 stone, 1 dirt)
    await matController.setMode('perPlacement');
    await matController.setPlacementId(undefined); // all placements
    await matController.refresh();

    assertEqual(matController.getTotalBlocks(), 4, 'Per-placement mode sums 4 total blocks across all placements');
    const perPlacementItems = matController.getItems();
    const stoneSum = perPlacementItems.find((i) => i.blockId === 'minecraft:stone');
    assertEqual(stoneSum?.count, 3, 'Per-placement stone count is 3 (2 from p1 + 1 from p2)');
    const dirtSum = perPlacementItems.find((i) => i.blockId === 'minecraft:dirt');
    assertEqual(dirtSum?.count, 1, 'Per-placement dirt count is 1');

    // Single placement scope: 'p1' only
    await matController.setPlacementId('p1');
    await matController.refresh();
    assertEqual(matController.getTotalBlocks(), 2, 'p1 has 2 blocks');
    assertEqual(matController.getItems()[0]?.blockId, 'minecraft:stone', 'p1 blocks are all stone');

    // Reset to effective for filters & math verification
    await matController.setMode('effective');
    await matController.setPlacementId(undefined);
    await matController.refresh();

    // ── Search Filtering ──
    matController.setSearchQuery('dirt');
    const filteredDirt = matController.getFilteredItems();
    assertEqual(filteredDirt.length, 1, 'Filtering for "dirt" yields 1 item');
    assertEqual(filteredDirt[0]?.blockId, 'minecraft:dirt', 'Filtered item is minecraft:dirt');

    matController.setSearchQuery('stone');
    const filteredStone = matController.getFilteredItems();
    assertEqual(filteredStone.length, 1, 'Filtering for "stone" yields 1 item');
    assertEqual(filteredStone[0]?.blockId, 'minecraft:stone', 'Filtered item is minecraft:stone');

    matController.setSearchQuery('nonexistent');
    assertEqual(matController.getFilteredItems().length, 0, 'Nonexistent query yields 0 items');

    matController.setSearchQuery('');
    assertEqual(matController.getFilteredItems().length, 2, 'Clearing search query restores 2 items');

    // ── Sorting ──
    matController.setSortOrder('id-asc');
    const sorted = matController.getFilteredItems();
    assertEqual(sorted[0]?.blockId, 'minecraft:dirt', 'id-asc puts dirt before stone');
    assertEqual(sorted[1]?.blockId, 'minecraft:stone', 'id-asc puts stone second');

    // ── Stack & Shulker Calculations ──
    const testCount1 = 65;
    const testStacks1 = Math.floor(testCount1 / 64);
    const testRem1 = testCount1 % 64;
    const testSb1 = +(testCount1 / 1728).toFixed(2);
    assertEqual(testStacks1, 1, '65 blocks is 1 stack');
    assertEqual(testRem1, 1, '65 blocks remainder is 1');
    assertEqual(testSb1, 0.04, '65 blocks is 0.04 shulker box');

    const testCount2 = 1728;
    const testStacks2 = Math.floor(testCount2 / 64);
    const testRem2 = testCount2 % 64;
    const testSb2 = +(testCount2 / 1728).toFixed(2);
    assertEqual(testStacks2, 27, '1728 blocks is 27 stacks');
    assertEqual(testRem2, 0, '1728 blocks remainder is 0');
    assertEqual(testSb2, 1.0, '1728 blocks is exactly 1.0 shulker box');

    // ── Export to CSV & JSON ──
    const csv = matController.toCsv();
    assert(csv.startsWith('Block ID,Count,Stacks,Remainder,Shulker Boxes,Percentage'), 'CSV has correct header line');
    assert(csv.includes('minecraft:dirt,1,0,1,0'), 'CSV contains dirt row');
    assert(csv.includes('minecraft:stone,1,0,1,0'), 'CSV contains stone row');

    const json = matController.toJson();
    const parsedJson = JSON.parse(json);
    assert(Array.isArray(parsedJson), 'JSON export parses as an array');
    assertEqual(parsedJson.length, 2, 'JSON array contains 2 items');
    assert(parsedJson.some((i: any) => i.blockId === 'minecraft:dirt'), 'JSON contains dirt');
    assert(parsedJson.some((i: any) => i.blockId === 'minecraft:stone'), 'JSON contains stone');

    matController.dispose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test Suite 4: Lazy Evaluation, Dirty Tracking & UI-only Update Filtering
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Suite 4: Lazy Evaluation, Dirty Tracking & Filtering ---');
  {
    let queryCount = 0;
    class SpyingSessionStore extends TestSessionStore {
      public override async query<T>(q: any): Promise<T> {
        queryCount++;
        return super.query<T>(q);
      }
    }

    const store = new SpyingSessionStore(createOverlappingProject());

    // 1. Inactive controller does NOT query on revision change, only sets dirty
    const lazyConflicts = new ConflictsPanelController(store, 'conflicts-only', { active: false });
    assertEqual(lazyConflicts.isActive(), false, 'lazyConflicts is inactive initially');
    assertEqual(lazyConflicts.isDirty(), true, 'lazyConflicts is dirty initially');

    queryCount = 0;
    // Mutate session revision
    await store.execute({
      type: 'region:delete',
      bounds: { min: [0, 0, 0], maxExclusive: [1, 1, 1] },
      placementId: 'p2',
    });
    assertEqual(queryCount, 0, 'No query executed while controller is inactive');
    assertEqual(lazyConflicts.isDirty(), true, 'Controller marked dirty on revision change');

    // Activating triggers refresh
    lazyConflicts.setActive(true);
    await new Promise((r) => setTimeout(r, 10));
    assertEqual(queryCount, 1, 'Query executed when activated while dirty');
    assertEqual(lazyConflicts.isDirty(), false, 'Dirty flag cleared after refresh');

    // UI-only update (revision unchanged) does not query
    queryCount = 0;
    (store as any).listeners.forEach((l: () => void) => l());
    assertEqual(queryCount, 0, 'UI-only update (same revision) did not trigger query');

    lazyConflicts.dispose();

    // 2. Short-circuit in ConflictsPanelController when visible placements <= 1
    const singlePlacementProject: Project = {
      ...createOverlappingProject(),
      placements: [createTestPlacement('single', 'Single Placement', [
        { pos: [0, 0, 0], block: { id: 'minecraft:stone', props: {} } },
      ])],
    };
    const singleStore = new SpyingSessionStore(singlePlacementProject);
    const singleController = new ConflictsPanelController(singleStore, 'all');
    queryCount = 0;
    await singleController.refresh();
    assertEqual(queryCount, 0, 'Conflicts query short-circuited for <= 1 visible placement');
    assertEqual(singleController.getStats().totalOverlaps, 0, '0 total overlaps on short-circuit');
    assertEqual(singleController.getConflictList().length, 0, '0 conflicts on short-circuit');
    singleController.dispose();

    // 3. MaterialListController lazy & dirty behavior
    const lazyMat = new MaterialListController(store, { active: false });
    assertEqual(lazyMat.isActive(), false, 'lazyMat is inactive initially');
    assertEqual(lazyMat.isDirty(), true, 'lazyMat is dirty initially');

    queryCount = 0;
    // Trigger store notification with same revision
    (store as any).listeners.forEach((l: () => void) => l());
    assertEqual(queryCount, 0, 'Same revision does not query or trigger lazyMat');

    // Trigger revision change
    await store.execute({
      type: 'region:delete',
      bounds: { min: [1, 0, 0], maxExclusive: [2, 1, 1] },
      placementId: 'p2',
    });
    assertEqual(queryCount, 0, 'Inactive MaterialListController did not query on revision change');
    assertEqual(lazyMat.isDirty(), true, 'MaterialListController marked dirty');

    lazyMat.setActive(true);
    await new Promise((r) => setTimeout(r, 10));
    assertEqual(queryCount, 1, 'Activating dirty MaterialListController triggered query');
    assertEqual(lazyMat.isDirty(), false, 'lazyMat dirty flag cleared');
    lazyMat.dispose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
