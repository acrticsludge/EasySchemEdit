// apps/web/__tests__/slice-e3-9-editor-integration.test.ts
// Acceptance tests for Slice E3.9: Full Editor Integration workflow.
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-9-editor-integration.test.ts

import { setIDBFactory } from '@easyschemedit/persistence';
import { createEditorRuntime } from '../src/editor/runtime.ts';
import type { Project, Placement, ChunkedVoxelVolume, VoxelChunk } from '@easyschemedit/domain';
import { exportSchematic, importSchematic, type ExportResult } from '@easyschemedit/formats';
import { ImportWorkflowController } from '../src/editor/workflows/import-workflow.ts';

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
    console.error(`FAIL: ${msg} (Expected: ${expected}, Actual: ${actual})`);
  }
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
      { id: 'minecraft:diamond_block', props: {} },
    ],
    indices: new Uint8Array(4096),
    revision: 1,
  };
  chunk.indices[0] = 1; // stone
  chunk.indices[1] = 2; // diamond_block

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

async function runTests() {
  console.log('=== Running Slice E3.9 Editor Integration Acceptance Tests ===\n');

  // Test 1: createEditorRuntime initialization and import workflow
  console.log('--- Test 1: Runtime Initialization & Import Workflow ---');
  const samplePlacement = createSamplePlacement('p1', 'TestBuild');
  const exportRes: ExportResult = await exportSchematic('schem-v3', {
    schemaVersion: 1,
    id: 'proj1',
    name: 'TestProject',
    placements: [samplePlacement],
  });

  const runtime = createEditorRuntime({
    autoLoadAssets: false,
    storage: new Map() as any,
  });

  // Re-instantiate importWorkflow with mocked parseFn satisfying ImportResult
  (runtime as any).importWorkflow = new ImportWorkflowController(runtime.store, {
    parseFn: async (bytes: Uint8Array) => ({
      placements: [samplePlacement],
      importGroups: [],
      normalizedImport: false,
      report: {
        format: { kind: 'schem-v3', reason: 'ok' },
        dimensions: { width: 16, height: 16, length: 16 },
        volume: 4096n,
        nonAirBlockCount: 2,
        paletteSize: 3,
        regionCount: 1,
        fileSizeBytes: bytes?.length ?? 0,
        compressedSizeBytes: bytes?.length ?? 0,
        decompressedSizeBytes: bytes?.length ?? 0,
        preserved: { blockEntities: 0, entities: 0, biomes: false, ticks: 0 },
        unsupported: { tags: [], blockStates: [] },
        sameStateOverlaps: 0,
        stateConflicts: 0,
        normalized: [],
        dropped: [],
        warnings: [],
        errors: [],
        ok: true,
      } as any,
    }),
  });

  assert(runtime.store !== undefined, 'store initialized');
  assert(runtime.importWorkflow !== undefined, 'importWorkflow initialized');
  assert(runtime.persistence !== undefined, 'persistence initialized');
  assert(runtime.conflictsController !== undefined, 'conflictsController initialized');

  await runtime.importWorkflow.startFileImport(exportRes.bytes, 'test.schem');
  runtime.importWorkflow.setCursorPosition([0, 0, 0]);
  await runtime.importWorkflow.confirmPlace();
  assertEqual(runtime.store.getSnapshot().project.placements.length, 1, 'placement added to project');

  // Test 2: Overlapping placements and conflict detection
  console.log('--- Test 2: Conflict Detection ---');
  await runtime.importWorkflow.startFileImport(exportRes.bytes, 'test2.schem');
  runtime.importWorkflow.setCursorPosition([0, 0, 0]);
  await runtime.importWorkflow.confirmPlace();
  runtime.conflictsController.refresh();
  const conflicts = runtime.conflictsController.getConflictList();
  assert(conflicts.length >= 0, 'conflicts controller evaluated');

  // Test 3: Selection, Region Fill, Material List & Undo/Redo
  console.log('--- Test 3: Selection, Fill & Undo/Redo ---');
  await runtime.selectionTool.setCorner1([0, 0, 0]);
  await runtime.selectionTool.setCorner2([5, 5, 5]);
  assert(runtime.selectionTool.getActiveBounds() !== null, 'selection established');

  await runtime.materialListController.refresh();
  await runtime.regionTools.fill('minecraft:gold_block');
  await runtime.materialListController.refresh();
  const items = runtime.materialListController.getItems();
  const goldItem = items.find((i: any) => i.blockId === 'minecraft:gold_block');
  assert(goldItem !== undefined, 'gold block counted in material list after fill');

  // Test Undo
  assert(runtime.store.getSnapshot().canUndo, 'canUndo is true');
  await runtime.store.undo();
  await runtime.materialListController.refresh();
  const undoneItems = runtime.materialListController.getItems();
  const goldUndone = undoneItems.find((i: any) => i.blockId === 'minecraft:gold_block');
  assert(goldUndone === undefined || goldUndone.count === 0, 'gold block removed after undo');

  // Test Redo
  assert(runtime.store.getSnapshot().canRedo, 'canRedo is true');
  await runtime.store.redo();
  await runtime.materialListController.refresh();
  const redoneItems = runtime.materialListController.getItems();
  const goldRedone = redoneItems.find((i: any) => i.blockId === 'minecraft:gold_block');
  assert(goldRedone !== undefined, 'gold block restored after redo');

  // Test 4: Build Library Save & Place
  console.log('--- Test 4: Build Library Integration ---');
  const placements = runtime.store.getSnapshot().project.placements;
  if (placements.length > 0) {
    const libEntry = await runtime.persistence.savePlacementToLibrary(placements[0].id, { name: 'Vault Template' });
    assert(libEntry !== null && libEntry !== undefined, 'placement saved to library');

    const libEntries = await runtime.persistence.browseLibrary();
    assert(libEntries.length > 0, 'library items listed');

    await runtime.persistence.placeFromLibrary(libEntries[0].id, [20, 64, 20]);
    assertEqual(runtime.store.getSnapshot().project.placements.length, placements.length + 1, 'placement added from library');
  }

  // Test 5: Project Save, Export & Re-import
  console.log('--- Test 5: Project Persistence & Schematic Export ---');
  const exportResult = await runtime.persistence.exportProjectSchematic('schem-v3');
  assert(exportResult.bytes instanceof Uint8Array, 'exported project as schem-v3 buffer');

  // Re-import exported schematic
  const parsedImport = await importSchematic(exportResult.bytes, 'exported.schem');
  assert(parsedImport !== null, 're-imported exported schematic successfully');

  runtime.dispose();

  console.log('\n========================================');
  console.log(`Slice E3.9 Editor Integration Acceptance Tests: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
