// apps/web/__tests__/slice-e3-9-persistence.test.ts
// Acceptance tests for Slice E3.9: Persistence Controller, IndexedDB round-trip,
// debounced autosave, crash recovery, .vxproj ZIP archive, and Build Library CRUD.
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-9-persistence.test.ts

import type { Project, Placement, ChunkedVoxelVolume, VoxelChunk } from '@easyschemedit/domain';
import { setIDBFactory, closeDB } from '@easyschemedit/persistence';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import { importSchematic } from '@easyschemedit/formats';
import {
  ProjectPersistenceController,
  type IPersistenceSessionStore,
} from '../src/editor/persistence/persistence-controller.ts';

// Resolve fake-indexeddb
let IDBFactoryClass: any;
try {
  // @ts-ignore
  const mod = await import('fake-indexeddb');
  IDBFactoryClass = mod.IDBFactory || (mod as any).default?.IDBFactory;
} catch {
  // @ts-ignore
  const mod = await import('../../../packages/persistence/node_modules/fake-indexeddb/build/esm/index.js');
  IDBFactoryClass = mod.IDBFactory;
}

if (!IDBFactoryClass) {
  throw new Error('Failed to resolve fake-indexeddb IDBFactory');
}

setIDBFactory(new IDBFactoryClass());

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
      `FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

class TestSessionStore implements IPersistenceSessionStore {
  public readonly session: EditorSession;
  private snapshot: { project: Project; revision: number; [key: string]: any };
  private listeners: Set<() => void> = new Set();

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    this.snapshot = this.buildSnapshot();
    this.session.subscribe(() => {
      this.snapshot = this.buildSnapshot();
      for (const l of this.listeners) l();
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

  public updateSnapshotAndNotify(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  public getSnapshot = () => this.snapshot;

  public async execute(cmd: any, opts?: any): Promise<any> {
    const res = this.session.execute(cmd, opts);
    this.snapshot = this.buildSnapshot();
    return res;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

function createSamplePlacement(
  id: string,
  name: string,
  offset: [number, number, number] = [0, 0, 0],
): Placement {
  const chunk: VoxelChunk = {
    key: '0_0_0',
    palette: [
      { id: 'minecraft:air', props: {} },
      { id: 'minecraft:stone', props: {} },
      { id: 'minecraft:oak_planks', props: {} },
    ],
    indices: new Uint8Array(4096),
    revision: 1,
  };
  chunk.indices[0] = 1; // stone at (0, 0, 0)
  chunk.indices[1] = 2; // oak_planks at (1, 0, 0)

  const volume: ChunkedVoxelVolume = {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    chunkSize: 16,
    chunks: new Map([['0_0_0', chunk]]),
    nonAirCount: 2,
    paletteCardinality: 3,
  };

  return {
    id,
    name,
    volume,
    transform: {
      translation: offset,
      rotationY: 0,
      mirror: 'none',
    },
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
    eraseTombstones: new Set<string>(),
    createdAt: '2026-11-13T12:00:00.000Z',
    source: { format: 'schem-v3', diagnostics: [] },
  };
}

function createSampleProject(id: string, name: string): Project {
  return {
    schemaVersion: 1,
    id,
    name,
    placements: [
      createSamplePlacement(`${id}-p1`, 'Placement 1', [0, 0, 0]),
      createSamplePlacement(`${id}-p2`, 'Placement 2', [16, 0, 0]),
    ],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: {
      createdAt: '2026-11-13T10:00:00.000Z',
      modifiedAt: '2026-11-13T12:00:00.000Z',
    },
    revision: 1,
  };
}

async function runAcceptanceTests(): Promise<void> {
  console.log('=== Running Slice E3.9 Persistence Acceptance Tests ===\n');

  // ==========================================================================
  // Test 1: Project save → listSavedProjects → loadProjectById
  // ==========================================================================
  console.log('--- Test 1: Project Save / List / Load Round-Trip ---');
  {
    const initialProj = createSampleProject('proj-roundtrip-1', 'Roundtrip Project');
    const store = new TestSessionStore(initialProj);
    const controller = new ProjectPersistenceController(store);

    assert(controller.hasUnsavedChanges() === false, 'T1: initially clean before edits');

    // Save project
    const saveResult = await controller.saveCurrentProject();
    assert(saveResult.revision >= 1, 'T1: save returns valid revision');
    assert(controller.hasUnsavedChanges() === false, 'T1: clean after saveCurrentProject');

    // List saved projects
    const list = await controller.listSavedProjects();
    assert(list.includes('proj-roundtrip-1'), 'T1: listSavedProjects includes saved project');

    const detailedList = await controller.listSavedProjectsDetailed();
    const foundSummary = detailedList.find((s) => s.id === 'proj-roundtrip-1');
    assert(foundSummary !== undefined, 'T1: listSavedProjectsDetailed contains entry');
    assertEqual(foundSummary?.name, 'Roundtrip Project', 'T1: summary contains project name');

    // Clear store or create separate store to verify load restores exact placements
    const emptyStore = new TestSessionStore();
    const loadController = new ProjectPersistenceController(emptyStore);
    const restored = await loadController.loadProjectById('proj-roundtrip-1');

    assertEqual(restored.id, 'proj-roundtrip-1', 'T1: restored project ID matches');
    assertEqual(restored.name, 'Roundtrip Project', 'T1: restored project name matches');
    assertEqual(restored.placements.length, 2, 'T1: restored placements count === 2');

    const p1 = restored.placements.find((p) => p.id === 'proj-roundtrip-1-p1');
    assert(p1 !== undefined, 'T1: placement 1 restored');
    assertEqual(p1?.volume.nonAirCount, 2, 'T1: placement 1 nonAirCount matches');
    const c0 = p1?.volume.chunks.get('0_0_0');
    assert(c0 !== undefined, 'T1: chunk 0_0_0 restored');
    assertEqual(c0?.indices[0], 1, 'T1: stone block at index 0 restored');
    assertEqual(c0?.indices[1], 2, 'T1: oak_planks block at index 1 restored');

    // Verify session store state
    assertEqual(
      emptyStore.getSnapshot().project.placements.length,
      2,
      'T1: emptyStore synchronized with 2 placements',
    );
  }

  // ==========================================================================
  // Test 2: Crash recovery
  // ==========================================================================
  console.log('--- Test 2: Crash Recovery Snapshot & Restore ---');
  {
    const proj = createSampleProject('proj-recovery-test', 'Recovery Project');
    const store = new TestSessionStore(proj);
    const controller = new ProjectPersistenceController(store);

    // Initial recovery check is false
    const initialCheck = await controller.checkCrashRecovery('proj-recovery-test');
    assert(initialCheck.hasRecovery === false, 'T2: no recovery initially');

    // Trigger autosave
    await controller.triggerAutosave();

    // Check recovery now exists
    const checkAfterAuto = await controller.checkCrashRecovery('proj-recovery-test');
    assert(checkAfterAuto.hasRecovery === true, 'T2: checkCrashRecovery returns hasRecovery: true');
    assert(checkAfterAuto.entry !== null, 'T2: recovery entry present');
    assertEqual(checkAfterAuto.entry?.projectId, 'proj-recovery-test', 'T2: entry projectId matches');

    // Mutate or empty store
    const emptyStore = new TestSessionStore();
    const restoreController = new ProjectPersistenceController(emptyStore);

    // Restore from recovery
    const restored = await restoreController.restoreFromRecovery('proj-recovery-test');
    assert(restored !== null, 'T2: restoreFromRecovery returns restored Project');
    assertEqual(restored?.name, 'Recovery Project', 'T2: restored project name matches');
    assertEqual(restored?.placements.length, 2, 'T2: restored placements count matches');

    // Discard recovery
    await controller.discardRecovery('proj-recovery-test');
    const checkAfterDiscard = await controller.checkCrashRecovery('proj-recovery-test');
    assert(checkAfterDiscard.hasRecovery === false, 'T2: discardRecovery clears recovery');
  }

  // ==========================================================================
  // Test 3: .vxproj export and import
  // ==========================================================================
  console.log('--- Test 3: .vxproj File Archive Export / Import ---');
  {
    const multiProject = createSampleProject('proj-vxproj-3', 'Multi Region Citadel');
    const store = new TestSessionStore(multiProject);
    const controller = new ProjectPersistenceController(store);

    // Export .vxproj bytes
    const { bytes, filename } = controller.exportVxprojBytes();
    assert(bytes instanceof Uint8Array, 'T3: exportVxprojBytes returns Uint8Array');
    assert(bytes.byteLength > 100, 'T3: .vxproj archive has non-trivial byte length');
    assert(filename.endsWith('.vxproj'), 'T3: filename has .vxproj extension');

    // Import into fresh store
    const newStore = new TestSessionStore();
    const newController = new ProjectPersistenceController(newStore);
    const importedProject = await newController.importVxprojBytes(bytes);

    assertEqual(importedProject.id, 'proj-vxproj-3', 'T3: imported project id matches');
    assertEqual(importedProject.name, 'Multi Region Citadel', 'T3: imported project name matches');
    assertEqual(importedProject.placements.length, 2, 'T3: imported placements count === 2');

    const p2 = importedProject.placements.find((p) => p.id === 'proj-vxproj-3-p2');
    assert(p2 !== undefined, 'T3: placement 2 preserved in archive');
    assertEqual(p2?.transform.translation[0], 16, 'T3: transform translation X === 16 preserved');
  }

  // ==========================================================================
  // Test 4: Build Library CRUD & Storage Stats
  // ==========================================================================
  console.log('--- Test 4: Build Library CRUD & Storage Stats ---');
  {
    const proj = createSampleProject('proj-library-4', 'Library Builder Project');
    const store = new TestSessionStore(proj);
    const controller = new ProjectPersistenceController(store);

    // Save placement 1 to library
    const libEntry = await controller.savePlacementToLibrary('proj-library-4-p1', {
      name: 'Watchtower Arch',
      description: 'Defensive perimeter gate archway',
      tags: ['defense', 'medieval', 'gate'],
      format: 'schem-v3',
    });

    assert(libEntry.id.startsWith('lib_'), 'T4: library entry has lib_ prefix');
    assertEqual(libEntry.name, 'Watchtower Arch', 'T4: entry name matches');
    assertEqual(libEntry.format, 'schem-v3', 'T4: format is schem-v3');
    assertEqual(libEntry.nonAirCount, 2, 'T4: nonAirCount === 2');
    assert(libEntry.sizeBytes > 50, 'T4: schematic data sizeBytes > 50');

    // Browse library with search query
    const searchMatch = await controller.browseLibrary({ search: 'arch' });
    assertEqual(searchMatch.length, 1, 'T4: search query matches entry');
    assertEqual(searchMatch[0].name, 'Watchtower Arch', 'T4: found item matches');

    const searchMiss = await controller.browseLibrary({ search: 'spaceship' });
    assertEqual(searchMiss.length, 0, 'T4: unmatched search query returns empty array');

    // Browse library with tag
    const tagMatch = await controller.browseLibrary({ tag: 'medieval' });
    assertEqual(tagMatch.length, 1, 'T4: tag filter matches entry');

    // Check stats
    const stats = await controller.getLibraryStats();
    assert(stats.entryCount >= 1, 'T4: library stats entryCount >= 1');
    assert(stats.totalBytes > 0, 'T4: library stats totalBytes > 0');

    // Place from library with offset [5, 10, 15]
    const placed = await controller.placeFromLibrary(libEntry.id, [5, 10, 15]);
    assert(placed.length > 0, 'T4: placeFromLibrary returned placed placement(s)');
    assertEqual(placed[0].origin[0], 5, 'T4: placed placement origin X offset applied');
    assertEqual(placed[0].origin[1], 10, 'T4: placed placement origin Y offset applied');
    assertEqual(placed[0].origin[2], 15, 'T4: placed placement origin Z offset applied');

    // Remove entry
    const removed = await controller.removeLibraryEntry(libEntry.id);
    assertEqual(removed, true, 'T4: removeLibraryEntry returned true');

    const afterRemove = await controller.browseLibrary({ search: 'arch' });
    assertEqual(afterRemove.length, 0, 'T4: browse after delete returns empty');
  }

  // ==========================================================================
  // Test 5: Schematic Export (.schem v3 & .litematic)
  // ==========================================================================
  console.log('--- Test 5: Schematic Export (.schem-v3 & .litematic) ---');
  {
    // Build a project with 10 non-air stone blocks
    const chunk: VoxelChunk = {
      key: '0_0_0',
      palette: [
        { id: 'minecraft:air', props: {} },
        { id: 'minecraft:stone', props: {} },
      ],
      indices: new Uint8Array(4096),
      revision: 1,
    };
    for (let i = 0; i < 10; i++) {
      chunk.indices[i] = 1;
    }

    const volume: ChunkedVoxelVolume = {
      bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
      chunkSize: 16,
      chunks: new Map([['0_0_0', chunk]]),
      nonAirCount: 10,
      paletteCardinality: 2,
    };

    const placement: Placement = {
      id: 'export-p1',
      name: 'Tower Structure',
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
      eraseTombstones: new Set<string>(),
      createdAt: '2026-11-13T12:00:00.000Z',
      source: { format: 'schem-v3', diagnostics: [] },
    };

    const exportProj: Project = {
      schemaVersion: 1,
      id: 'proj-export-5',
      name: 'Export Tower Project',
      placements: [placement],
      importGroups: [],
      overlapPolicy: 'top-wins',
      conflictOverlay: 'off',
      metadata: { createdAt: '2026-11-13T12:00:00.000Z', modifiedAt: '2026-11-13T12:00:00.000Z' },
      revision: 1,
    };

    const store = new TestSessionStore(exportProj);
    const controller = new ProjectPersistenceController(store);

    // 1. Export as Sponge v3 (.schem)
    const schemResult = await controller.exportProjectSchematic('schem-v3', { scope: 'composite' });
    assert(schemResult.filename.endsWith('.schem'), 'T5: schem-v3 filename ends with .schem');
    assert(schemResult.bytes.byteLength > 50, 'T5: schem-v3 output has valid byte length');
    assertEqual(schemResult.report.nonAirBlockCount, 10, 'T5: schem-v3 report nonAirBlockCount === 10');

    // Re-import Sponge v3 and verify non-air count
    const reImportSchem = await importSchematic(schemResult.bytes, schemResult.filename);
    assertEqual(
      reImportSchem.placements[0].volume.nonAirCount,
      10,
      'T5: re-imported Sponge v3 has exact 10 non-air blocks',
    );

    // 2. Export as Litematica (.litematic)
    const litematicResult = await controller.exportProjectSchematic('litematic', { scope: 'composite' });
    assert(litematicResult.filename.endsWith('.litematic'), 'T5: litematic filename ends with .litematic');
    assert(litematicResult.bytes.byteLength > 50, 'T5: litematic output has valid byte length');
    assertEqual(litematicResult.report.nonAirBlockCount, 10, 'T5: litematic report nonAirBlockCount === 10');

    // Re-import Litematica and verify non-air count
    const reImportLite = await importSchematic(litematicResult.bytes, litematicResult.filename);
    assertEqual(
      reImportLite.placements[0].volume.nonAirCount,
      10,
      'T5: re-imported Litematica has exact 10 non-air blocks',
    );
  }

  await closeDB();

  console.log('\n========================================');
  console.log(`Slice E3.9 Persistence Acceptance Tests: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
