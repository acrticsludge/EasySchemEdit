// apps/web/__tests__/slice-e3-4-layout.test.ts
// Unit tests for Slice E3.4: S&box-style workspace layout and panels wired to @easyschemedit/ui controllers.
// Pure TS tests running in Node without DOM.
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-4-layout.test.ts

import { EditorSession } from '../../../packages/operations/src/session.ts';
import type {
  Command,
  CommandExecutionOptions,
  Query,
  Result,
  SessionChangeEvent,
} from '../../../packages/operations/src/session-types.ts';
import type { Project, Placement, ChunkedVoxelVolume } from '@easyschemedit/domain';

import {
  createWorkspaceControllers,
  MemoryStorage,
  DEFAULT_LAYOUT_STORAGE_KEY,
} from '../src/editor/layout/layout-bridge.ts';

// ============================================================================
// EditorSessionStore (matching apps/web/src/editor/session-store.ts, bypassing
// packages/operations/src/index.ts import-place syntax issue in Node ESM)
// ============================================================================

export interface EditorStoreState {
  readonly revision: number;
  readonly selectedTool: string;
  readonly activeBottomTab: string | null;
  readonly importReport: any | null;
  readonly statusMessage: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly project: Project;
}

export class EditorSessionStore {
  public readonly session: EditorSession;
  private selectedTool: string = 'select';
  private activeBottomTab: string | null = null;
  private importReport: any | null = null;
  private statusMessage: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentSnapshot: EditorStoreState;
  private unsubscribeSession: () => void;

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    this.currentSnapshot = this.buildSnapshot();

    this.unsubscribeSession = this.session.subscribe((_event: SessionChangeEvent) => {
      this.updateSnapshotAndNotify();
    });
  }

  private buildSnapshot(): EditorStoreState {
    return {
      revision: this.session.revision,
      selectedTool: this.selectedTool,
      activeBottomTab: this.activeBottomTab,
      importReport: this.importReport,
      statusMessage: this.statusMessage,
      canUndo: this.session.canUndo(),
      canRedo: this.session.canRedo(),
      project: this.session.snapshot(),
    };
  }

  private updateSnapshotAndNotify(): void {
    this.currentSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('EditorSessionStore listener error:', err);
      }
    }
  }

  public getSnapshot = (): EditorStoreState => {
    return this.currentSnapshot;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public setSelectedTool(tool: string): void {
    if (this.selectedTool !== tool) {
      this.selectedTool = tool;
      this.updateSnapshotAndNotify();
    }
  }

  public setActiveBottomTab(tab: string | null): void {
    if (this.activeBottomTab !== tab) {
      this.activeBottomTab = tab;
      this.updateSnapshotAndNotify();
    }
  }

  public setImportReport(report: any | null): void {
    this.importReport = report;
    this.updateSnapshotAndNotify();
  }

  public setStatusMessage(message: string | null): void {
    if (this.statusMessage !== message) {
      this.statusMessage = message;
      this.updateSnapshotAndNotify();
    }
  }

  public async execute(cmd: Command, opts?: CommandExecutionOptions): Promise<Result<any>> {
    return this.session.execute(cmd, opts);
  }

  public async query<T>(q: Query): Promise<T> {
    return this.session.query<T>(q);
  }

  public async undo(): Promise<Result<any>> {
    return this.session.undo();
  }

  public async redo(): Promise<Result<any>> {
    return this.session.redo();
  }

  public canUndo(): boolean {
    return this.session.canUndo();
  }

  public canRedo(): boolean {
    return this.session.canRedo();
  }

  public dispose(): void {
    this.unsubscribeSession();
    this.listeners.clear();
  }
}

// ============================================================================
// Test Suite
// ============================================================================

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

function createTestPlacement(id: string, name = `Placement-${id}`): Placement {
  const volume: ChunkedVoxelVolume = {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 32, 16] },
    chunkSize: 16,
    chunks: new Map(),
    nonAirCount: 120,
    paletteCardinality: 4,
  };

  return {
    id,
    name,
    transform: {
      translation: [0, 0, 0],
      rotationY: 0,
      mirror: 'none',
    },
    origin: [0, 0, 0],
    volume,
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
    source: { format: 'schem-v3', diagnostics: [] },
    eraseTombstones: new Set(),
  };
}

async function runTests() {
  console.log('--- Test 1: Layout Controller & Persistence ---');
  {
    const storage = new MemoryStorage();
    const store = new EditorSessionStore();
    const controllers1 = createWorkspaceControllers(store, storage);

    const initialLeft = controllers1.layout.state().panels.find((p) => p.id === 'hierarchy');
    assert(initialLeft !== undefined, 'Hierarchy panel must exist in initial layout');
    const initialWidth = initialLeft?.width ?? 260;

    // Resize hierarchy panel by +50px
    const windowSize = { width: 1920, height: 1080 };
    controllers1.layout.resizePanel('hierarchy', { width: 50 }, windowSize);

    const updatedLeft = controllers1.layout.state().panels.find((p) => p.id === 'hierarchy');
    assertEqual(updatedLeft?.width, initialWidth + 50, 'Hierarchy panel width should be resized by +50px');

    // Verify written to storage
    const storedJson = storage.getItem(DEFAULT_LAYOUT_STORAGE_KEY);
    assert(storedJson !== null, 'Layout state should be persisted into storage');

    // Recreate controllers with the same storage
    const controllers2 = createWorkspaceControllers(store, storage);
    const restoredLeft = controllers2.layout.state().panels.find((p) => p.id === 'hierarchy');
    assertEqual(
      restoredLeft?.width,
      initialWidth + 50,
      'Hierarchy panel width should be reloaded across controller recreation',
    );

    controllers1.dispose();
    controllers2.dispose();
    store.dispose();
    console.log('✓ Test 1 passed: panel resize persists to storage and reloads cleanly');
  }

  console.log('--- Test 2: Outliner & Placement Sync, Visibility & Lock Toggles ---');
  {
    const store = new EditorSessionStore();
    const controllers = createWorkspaceControllers(store);

    assertEqual(controllers.outliner.placements().length, 0, 'Outliner should initially be empty');

    const p1 = createTestPlacement('p1', 'Medieval Tower');
    const addResult = await store.execute({ type: 'placement:add', placement: p1 });
    assert(addResult.ok, 'Adding placement to store should succeed');

    // Outliner should now have 1 placement row with matching properties
    const rows = controllers.outliner.placements();
    assertEqual(rows.length, 1, 'Outliner should now have 1 placement');
    assertEqual(rows[0].id, 'p1', 'Outliner row id matches');
    assertEqual(rows[0].name, 'Medieval Tower', 'Outliner row name matches');
    assertEqual(rows[0].width, 16, 'Outliner row width matches bounds');
    assertEqual(rows[0].height, 32, 'Outliner row height matches bounds');
    assertEqual(rows[0].depth, 16, 'Outliner row depth matches bounds');
    assertEqual(rows[0].visible, true, 'Outliner row should initially be visible');
    assertEqual(rows[0].locked, false, 'Outliner row should initially be unlocked');

    const revBeforeVis = store.getSnapshot().revision;

    // Toggle visibility through bridge
    const visOk = await controllers.togglePlacementVisibility('p1');
    assert(visOk, 'Toggling visibility should return true');
    assertEqual(store.getSnapshot().project.placements[0].visible, false, 'Placement in store is now hidden');
    assert(store.getSnapshot().revision > revBeforeVis, 'Revision should increment on visibility toggle');
    assertEqual(controllers.outliner.placements()[0].visible, false, 'Outliner reflects hidden visibility');

    // Toggle visibility back to visible
    await controllers.togglePlacementVisibility('p1');
    assertEqual(store.getSnapshot().project.placements[0].visible, true, 'Placement in store is visible again');

    const revBeforeLock = store.getSnapshot().revision;

    // Toggle lock through bridge
    const lockOk = await controllers.togglePlacementLock('p1');
    assert(lockOk, 'Toggling lock should return true');
    assertEqual(store.getSnapshot().project.placements[0].locked, true, 'Placement in store is now locked');
    assert(store.getSnapshot().revision > revBeforeLock, 'Revision should increment on lock toggle');
    assertEqual(controllers.outliner.placements()[0].locked, true, 'Outliner reflects locked status');

    // Toggle lock back to unlocked
    await controllers.togglePlacementLock('p1');
    assertEqual(store.getSnapshot().project.placements[0].locked, false, 'Placement in store is unlocked again');

    controllers.dispose();
    store.dispose();
    console.log('✓ Test 2 passed: outliner sync, visibility and lock toggles update store and increment revision');
  }

  console.log('--- Test 3: Inspector Transform Edits ---');
  {
    const store = new EditorSessionStore();
    const controllers = createWorkspaceControllers(store);

    const p1 = createTestPlacement('p1', 'House');
    await store.execute({ type: 'placement:add', placement: p1 });

    // Select placement
    controllers.selectPlacement('p1');
    assertEqual(controllers.inspector.context().selectedPlacementId, 'p1', 'Inspector selected placement id matches');

    // 1. Move placement
    const revBeforeMove = store.getSnapshot().revision;
    const moveOk = await controllers.movePlacement('p1', [12, 64, -8]);
    assert(moveOk, 'movePlacement should succeed');
    const movedPlacement = store.getSnapshot().project.placements[0];
    assertEqual(movedPlacement.transform.translation[0], 12, 'Translation X updated');
    assertEqual(movedPlacement.transform.translation[1], 64, 'Translation Y updated');
    assertEqual(movedPlacement.transform.translation[2], -8, 'Translation Z updated');
    assert(store.getSnapshot().revision > revBeforeMove, 'Revision incremented after move');

    // 2. Rotate placement
    const revBeforeRot = store.getSnapshot().revision;
    const rotOk = await controllers.rotatePlacement('p1', 90);
    assert(rotOk, 'rotatePlacement should succeed');
    assertEqual(store.getSnapshot().project.placements[0].transform.rotationY, 90, 'Rotation Y updated to 90');
    assert(store.getSnapshot().revision > revBeforeRot, 'Revision incremented after rotate');

    // 3. Mirror placement
    const revBeforeMirror = store.getSnapshot().revision;
    const mirrorOk = await controllers.mirrorPlacement('p1', 'x');
    assert(mirrorOk, 'mirrorPlacement should succeed');
    assertEqual(store.getSnapshot().project.placements[0].transform.mirror, 'x', 'Mirror updated to x');
    assert(store.getSnapshot().revision > revBeforeMirror, 'Revision incremented after mirror');

    // 4. Set origin (even half-block coords required by domain)
    const originOk = await controllers.setPlacementOrigin('p1', [4, 0, 4]);
    assert(originOk, 'setPlacementOrigin should succeed');
    assertEqual(store.getSnapshot().project.placements[0].origin[0], 4, 'Origin X updated');

    // 5. Rename placement
    const renameOk = await controllers.renamePlacement('p1', 'Manor');
    assert(renameOk, 'renamePlacement should succeed');
    assertEqual(store.getSnapshot().project.placements[0].name, 'Manor', 'Name updated to Manor');

    controllers.dispose();
    store.dispose();
    console.log('✓ Test 3 passed: inspector transform edits execute move, rotate, mirror, origin and rename');
  }

  console.log('--- Test 4: Shortcut Handler Dispatches Undo/Redo and Panel Toggles ---');
  {
    const store = new EditorSessionStore();
    const controllers = createWorkspaceControllers(store);

    const p1 = createTestPlacement('p1', 'Barn');
    await store.execute({ type: 'placement:add', placement: p1 });

    // Make an edit that can be undone
    await controllers.movePlacement('p1', [10, 0, 10]);
    assertEqual(store.canUndo(), true, 'Store should report canUndo = true');

    // Dispatch Undo via Ctrl+Z shortcut
    const undoAction = controllers.shortcuts.handleKeydown({
      key: 'z',
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    });
    assertEqual(undoAction, 'undo', 'Shortcut should resolve to undo action');
    assertEqual(store.canRedo(), true, 'Store should report canRedo = true after undo');

    // Dispatch Redo via Ctrl+Y shortcut
    const redoAction = controllers.shortcuts.handleKeydown({
      key: 'y',
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    });
    assertEqual(redoAction, 'redo', 'Shortcut should resolve to redo action');
    assertEqual(store.canUndo(), true, 'Store canUndo should be true after redo');

    // Panel collapse toggles via Alt+1, Alt+2, Alt+3
    assertEqual(controllers.layout.isCollapsed('hierarchy'), false, 'Hierarchy not collapsed initially');

    // Toggle hierarchy collapse
    const toggleHierarchy = controllers.shortcuts.handleKeydown({
      key: '1',
      ctrl: false,
      meta: false,
      shift: false,
      alt: true,
    });
    assertEqual(toggleHierarchy, 'toggle-hierarchy', 'Shortcut should resolve to toggle-hierarchy');
    assertEqual(controllers.layout.isCollapsed('hierarchy'), true, 'Hierarchy should now be collapsed');

    // Toggle hierarchy expand
    controllers.shortcuts.handleKeydown({
      key: '1',
      ctrl: false,
      meta: false,
      shift: false,
      alt: true,
    });
    assertEqual(controllers.layout.isCollapsed('hierarchy'), false, 'Hierarchy should now be expanded');

    controllers.dispose();
    store.dispose();
    console.log('✓ Test 4 passed: shortcut handler dispatches undo/redo and panel collapse toggles');
  }

  console.log('--- Test 5: Bottom Dock Tab Switching ---');
  {
    const store = new EditorSessionStore();
    const controllers = createWorkspaceControllers(store);

    // Initial tab
    assertEqual(controllers.bottomPanels.activeTab(), 'assets', 'Initial bottom dock tab should be assets');

    // Switch tab through controllers.bottomPanels
    controllers.bottomPanels.setActiveTab('conflicts');
    assertEqual(controllers.bottomPanels.activeTab(), 'conflicts', 'Active tab in bottomPanels is conflicts');
    assertEqual(store.getSnapshot().activeBottomTab, 'conflicts', 'Active tab in store is conflicts');

    // Switch tab through store.setActiveBottomTab
    store.setActiveBottomTab('history');
    assertEqual(store.getSnapshot().activeBottomTab, 'history', 'Active tab in store is history');
    assertEqual(controllers.bottomPanels.activeTab(), 'history', 'Active tab in bottomPanels synced to history');

    // Switch to materials
    controllers.bottomPanels.setActiveTab('materials');
    assertEqual(controllers.bottomPanels.activeTab(), 'materials', 'Active tab in bottomPanels is materials');
    assertEqual(store.getSnapshot().activeBottomTab, 'materials', 'Active tab in store is materials');

    controllers.dispose();
    store.dispose();
    console.log('✓ Test 5 passed: bottom dock tab switching stays synchronized with store');
  }

  console.log('\n===========================================');
  console.log(`Slice E3.4 Layout Tests: ${passed} passed, ${failed} failed`);
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
