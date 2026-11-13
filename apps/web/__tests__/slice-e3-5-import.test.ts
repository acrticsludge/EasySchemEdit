// apps/web/__tests__/slice-e3-5-import.test.ts
// Unit and integration tests for Slice E3.5: Import-and-Place workflow.
// Tests ImportWorkflowController and format round-trip integration:
// - Sponge v3 import, ghost preview, ground snap, rotation/mirror cycling, Esc cancel
// - Placement confirmation and undo/redo on EditorSessionStore
// - Multi-region .litematic group preservation and relative offset rotation
// - Legacy .schematic error handling
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-5-import.test.ts

import type {
  Bounds3i,
  NbtTag,
  Placement,
  Transform,
  Vec3i,
} from '@easyschemedit/domain';
import {
  CANONICAL_AIR,
  parseBlockStateString,
  placementWorldBounds,
} from '@easyschemedit/domain';
import {
  exportSchematic,
  encodeNbt,
  defaultCodecServices,
} from '@easyschemedit/formats';
import {
  ImportWorkflowController,
  applyRotation,
  applyMirror,
} from '../src/editor/workflows/import-workflow.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import type { EditorSessionStore } from '../src/editor/session-store.ts';

// Test implementation of EditorSessionStore wrapping EditorSession directly
// to avoid loading packages/operations/src/index.ts barrel in test runner
class TestEditorSessionStore {
  public readonly session: EditorSession;
  private importReport: any | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(initialProject?: any) {
    this.session = new EditorSession(initialProject);
    this.session.subscribe(() => {
      for (const l of this.listeners) l();
    });
  }

  public getSnapshot() {
    return {
      revision: this.session.revision,
      importReport: this.importReport,
      canUndo: this.session.canUndo(),
      canRedo: this.session.canRedo(),
      project: this.session.snapshot(),
    };
  }

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public setImportReport(report: any | null): void {
    this.importReport = report;
    for (const l of this.listeners) l();
  }

  public async execute(cmd: any, opts?: any) {
    return this.session.execute(cmd, opts);
  }

  public async undo() {
    return this.session.undo();
  }

  public async redo() {
    return this.session.redo();
  }

  public canUndo() {
    return this.session.canUndo();
  }

  public canRedo() {
    return this.session.canRedo();
  }
}

function createEditorSessionStore(initialProject?: any): EditorSessionStore {
  return new TestEditorSessionStore(initialProject) as unknown as EditorSessionStore;
}

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ----------------------------------------------------------------------------
// NBT and Placement Test Helpers
// ----------------------------------------------------------------------------

function compound(entries: [string, NbtTag][]): NbtTag {
  const map = new Map<string, NbtTag>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map };
}

function createTestPlacement(
  id: string,
  name: string,
  width: number,
  height: number,
  length: number,
  translation: Vec3i,
  blockMap: Map<string, any>,
  sourceFormat: string = 'schem-v3',
  sourceGroupId?: string,
): Placement {
  const bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [width, height, length] };
  const CHUNK_SIZE = 16;
  const chunks = new Map<string, any>();
  let nonAirCount = 0;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const state = blockMap.get(`${x}_${y}_${z}`) ?? CANONICAL_AIR;
        if (state.id !== 'minecraft:air') nonAirCount++;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const ckey = `${cx}_${cy}_${cz}`;

        let chunk = chunks.get(ckey);
        if (!chunk) {
          chunk = {
            key: ckey,
            palette: [CANONICAL_AIR],
            indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
            revision: 0,
          };
          chunks.set(ckey, chunk);
        }

        const lx = x % CHUNK_SIZE;
        const ly = y % CHUNK_SIZE;
        const lz = z % CHUNK_SIZE;
        const li = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

        let pIdx = 0;
        if (state.id !== 'minecraft:air') {
          let found = -1;
          for (let i = 1; i < chunk.palette.length; i++) {
            if (
              chunk.palette[i].id === state.id &&
              JSON.stringify(chunk.palette[i].props) === JSON.stringify(state.props)
            ) {
              found = i;
              break;
            }
          }
          if (found >= 0) {
            pIdx = found;
          } else {
            pIdx = chunk.palette.length;
            chunk.palette.push(state);
          }
        }
        chunk.indices[li] = pIdx;
      }
    }
  }

  const transform: Transform = { translation, rotationY: 0, mirror: 'none' };

  return {
    id,
    name,
    volume: {
      bounds,
      chunkSize: CHUNK_SIZE,
      chunks,
      nonAirCount,
      paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
    },
    transform,
    origin: [0, 0, 0],
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: {
      format: sourceFormat as any,
      filename: undefined,
      regionName: name,
      dataVersion: 3955,
      formatVersion: 3,
      sourceGroupId,
      rawMetadata: undefined,
      diagnostics: [],
    },
    eraseTombstones: new Set(),
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      biomes: undefined,
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
  };
}

// ----------------------------------------------------------------------------
// Test Runner
// ----------------------------------------------------------------------------

async function runTests(): Promise<void> {
  console.log('=== Slice E3.5: Import-and-Place Workflow Tests ===\n');

  const stone = parseBlockStateString('minecraft:stone');
  const diamond = parseBlockStateString('minecraft:diamond_block');

  // --------------------------------------------------------------------------
  // Fixture Generation
  // --------------------------------------------------------------------------
  console.log('Building in-test fixtures (Sponge v3, multi-region Litematic, legacy)...');

  // 1. Single-region Sponge v3: 4x3x2 build with 5 non-air blocks
  const spongeMap = new Map<string, any>([
    ['0_0_0', stone],
    ['1_0_0', stone],
    ['2_0_0', diamond],
    ['0_1_0', stone],
    ['0_2_0', stone],
  ]);
  const spongePlacement = createTestPlacement(
    'p_sponge',
    'sponge_building',
    4,
    3,
    2,
    [0, 0, 0],
    spongeMap,
    'schem-v3',
  );
  const spongeSnap = {
    schemaVersion: 1,
    id: 'proj_sponge',
    name: 'test_sponge',
    placements: [spongePlacement],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };
  const exportedSponge = await exportSchematic('schem-v3', spongeSnap, { trimOuterAir: false });
  const spongeBytes = exportedSponge.bytes;
  check(spongeBytes.length > 0, 'Sponge v3 fixture successfully exported');

  // 2. Multi-region Litematic: Region 'house' at [0, 0, 0] and 'tower' at [10, 5, 0]
  const houseMap = new Map<string, any>([['0_0_0', stone], ['1_0_0', stone]]);
  const towerMap = new Map<string, any>([['0_0_0', diamond], ['0_1_0', diamond]]);
  const housePlacement = createTestPlacement(
    'p_house',
    'house',
    2,
    2,
    2,
    [0, 0, 0],
    houseMap,
    'litematic',
    'group_test',
  );
  const towerPlacement = createTestPlacement(
    'p_tower',
    'tower',
    2,
    2,
    2,
    [10, 5, 0],
    towerMap,
    'litematic',
    'group_test',
  );
  const multiSnap = {
    schemaVersion: 1,
    id: 'proj_multi',
    name: 'multi_litematic',
    placements: [housePlacement, towerPlacement],
    importGroups: [
      {
        id: 'group_test',
        name: 'group_test',
        placementIds: ['p_house', 'p_tower'],
        sourceFormat: 'litematic' as const,
        sourceFilename: 'multi.litematic',
      },
    ],
    overlapPolicy: 'top-wins' as const,
    revision: 1,
  };
  const exportedMulti = await exportSchematic('litematic', multiSnap, {
    target: { kind: 'importGroup', importGroupId: 'group_test' },
  });
  const multiBytes = exportedMulti.bytes;
  check(multiBytes.length > 0, 'Multi-region Litematic fixture successfully exported');

  // 3. Legacy .schematic fixture: gzip compressed NBT with Materials, Blocks, Data
  const legacyCompound = compound([
    ['Materials', compound([])],
    ['Blocks', compound([])],
    ['Data', compound([])],
  ]);
  const legacyBytes = encodeNbt(legacyCompound, defaultCodecServices);
  check(legacyBytes.length > 0, 'Legacy .schematic fixture successfully created');

  // --------------------------------------------------------------------------
  // Test Suite 1: Sponge v3 Import & Review Report
  // --------------------------------------------------------------------------
  console.log('\n--- Test 1: Sponge v3 Import & Report State ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);

    check(controller.getState() === 'idle', 'Initial controller state is idle');

    await controller.startFileImport(spongeBytes, 'house.schem');

    check(controller.getState() === 'review-report', 'Transitions to review-report after import');
    const report = controller.getReport();
    check(!!report, 'Import report is present on controller');
    check(report?.format.kind === 'schem-v3', 'Report format kind is schem-v3');
    check(report?.dimensions.width === 4, 'Report dimensions width is 4');
    check(report?.dimensions.height === 3, 'Report dimensions height is 3');
    check(report?.dimensions.length === 2, 'Report dimensions length is 2');
    check(report?.nonAirBlockCount === 5, 'Report nonAirBlockCount is 5');
    check(report?.regionCount === 1, 'Report region count is 1');
    check(controller.getFileName() === 'house.schem', 'File name preserved');
  }

  // --------------------------------------------------------------------------
  // Test Suite 2: Ghost Cursor Movement & Ground Snapping
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Ghost Cursor Movement & Ground Snapping ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);
    await controller.startFileImport(spongeBytes, 'house.schem');

    controller.startGhostPreview();
    check(controller.getState() === 'ghost-preview', 'Transitions to ghost-preview state');

    // Cursor movement
    controller.setCursorPosition([12, 0, -4]);
    const pos = controller.getCursorPosition();
    check(pos[0] === 12 && pos[1] === 0 && pos[2] === -4, 'Cursor position set to [12, 0, -4]');

    // Ground snap without raycast (ground plane defaultY = 64)
    controller.snapGhostToGround(null, 64);
    const groundSnapped = controller.getCursorPosition();
    check(
      groundSnapped[0] === 12 && groundSnapped[1] === 64 && groundSnapped[2] === -4,
      'snapGhostToGround(null, 64) snaps Y to ground plane Y=64',
    );

    // Ground snap with raycast hit
    controller.snapGhostToGround({
      voxelPosition: [12, 70, -4],
      adjacentPosition: [12, 71, -4],
    });
    const raycastSnapped = controller.getCursorPosition();
    check(
      raycastSnapped[0] === 12 && raycastSnapped[1] === 71 && raycastSnapped[2] === -4,
      'snapGhostToGround with raycast hit snaps to adjacentPosition [12, 71, -4]',
    );
  }

  // --------------------------------------------------------------------------
  // Test Suite 3: Rotation and Mirror Hotkeys
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Rotation & Mirror Cycling (R, M, Esc) ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);
    await controller.startFileImport(spongeBytes, 'house.schem');
    controller.startGhostPreview();

    // Rotation cycle: 0 -> 90 -> 180 -> 270 -> 0
    check(controller.getRotationY() === 0, 'Initial rotation is 0°');
    check(controller.rotateGhostClockwise() === 90, 'Rotates to 90°');
    check(controller.rotateGhostClockwise() === 180, 'Rotates to 180°');
    check(controller.rotateGhostClockwise() === 270, 'Rotates to 270°');
    check(controller.rotateGhostClockwise() === 0, 'Rotates back to 0°');

    // R key via handleKeyDown
    const handledR = controller.handleKeyDown({ key: 'r' });
    check(handledR === true, 'handleKeyDown("r") handled');
    check(controller.getRotationY() === 90, 'R key rotated to 90°');

    // Mirror cycle: none -> x -> z -> none
    check(controller.getMirror() === 'none', 'Initial mirror is none');
    check(controller.mirrorGhost() === 'x', 'Mirrors to x');
    check(controller.mirrorGhost() === 'z', 'Mirrors to z');
    check(controller.mirrorGhost() === 'none', 'Mirrors back to none');

    // M key via handleKeyDown
    const handledM = controller.handleKeyDown({ key: 'M' });
    check(handledM === true, 'handleKeyDown("M") handled');
    check(controller.getMirror() === 'x', 'M key mirrored to x');

    // Esc key via handleKeyDown cancels preview
    const handledEsc = controller.handleKeyDown({ key: 'Escape' });
    check(handledEsc === true, 'handleKeyDown("Escape") handled');
    check(controller.getState() === 'idle', 'Esc key returns controller to idle');
    check(controller.getPendingImport() === null, 'Pending import discarded on cancel');
  }

  // --------------------------------------------------------------------------
  // Test Suite 4: Confirm Placement & Undo/Redo Integration
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Placement Confirmation & Undo/Redo ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);

    await controller.startFileImport(spongeBytes, 'house.schem', { autoPreview: true });
    check(controller.getState() === 'ghost-preview', 'autoPreview imports straight to ghost-preview');

    controller.setCursorPosition([20, 64, -10]);
    controller.rotateGhostClockwise(); // 90°
    controller.mirrorGhost('x'); // mirror x

    const previewPlacements = controller.getGhostPreviewPlacements();
    check(previewPlacements.length === 1, '1 preview placement generated');
    check(
      previewPlacements[0].transform.translation[0] === 20 &&
      previewPlacements[0].transform.translation[1] === 64 &&
      previewPlacements[0].transform.translation[2] === -10,
      'Ghost preview translated to cursor position [20, 64, -10]',
    );
    check(previewPlacements[0].transform.rotationY === 90, 'Ghost preview rotation is 90°');
    check(previewPlacements[0].transform.mirror === 'x', 'Ghost preview mirror is x');

    // Confirm placement
    const placedIds = await controller.confirmPlace();
    check(placedIds.length === 1, 'Placed 1 placement on confirmation');
    check(controller.getState() === 'idle', 'Controller returns to idle after confirm');

    // Verify session store state
    const snapshotAfterPlace = store.session.snapshot();
    check(snapshotAfterPlace.placements.length === 1, 'Store contains 1 committed placement');
    const committed = snapshotAfterPlace.placements[0];
    check(
      committed.transform.translation[0] === 20 &&
      committed.transform.translation[1] === 64 &&
      committed.transform.translation[2] === -10,
      'Committed placement translation matches ghost cursor [20, 64, -10]',
    );
    check(committed.transform.rotationY === 90, 'Committed placement rotation is 90°');
    check(committed.transform.mirror === 'x', 'Committed placement mirror is x');
    check(store.getSnapshot().importReport !== null, 'store.setImportReport recorded import report');

    // Verify Undo on store restores pre-import state
    check(store.canUndo(), 'Store has undo history');
    await store.undo();
    const snapshotAfterUndo = store.session.snapshot();
    check(snapshotAfterUndo.placements.length === 0, 'store.undo() cleanly removes imported placement');

    // Verify Redo restores placement
    check(store.canRedo(), 'Store can redo');
    await store.redo();
    const snapshotAfterRedo = store.session.snapshot();
    check(snapshotAfterRedo.placements.length === 1, 'store.redo() restores imported placement');
  }

  // --------------------------------------------------------------------------
  // Test Suite 5: Multi-Region .litematic Import & Relative Offsets
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Multi-Region .litematic Group Preservation ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);

    await controller.startFileImport(multiBytes, 'multi_test.litematic');
    check(controller.getState() === 'review-report', 'Multi-region litematic parsed');
    const report = controller.getReport();
    check(report?.regionCount === 2, 'Report reflects 2 regions');

    controller.startGhostPreview();
    controller.setCursorPosition([50, 10, 50]);

    // Inspect preview placements: relative offset of tower ([10, 5, 0]) must be preserved
    const ghostPlacements0 = controller.getGhostPreviewPlacements();
    check(ghostPlacements0.length === 2, '2 ghost placements generated for multi-region litematic');

    const ghostHouse0 = ghostPlacements0.find((p) => p.name === 'house')!;
    const ghostTower0 = ghostPlacements0.find((p) => p.name === 'tower')!;
    check(
      ghostHouse0.transform.translation[0] === 50 &&
      ghostHouse0.transform.translation[1] === 10 &&
      ghostHouse0.transform.translation[2] === 50,
      'House ghost translation is at cursor [50, 10, 50]',
    );
    check(
      ghostTower0.transform.translation[0] === 60 &&
      ghostTower0.transform.translation[1] === 15 &&
      ghostTower0.transform.translation[2] === 50,
      'Tower ghost translation preserves relative offset [10, 5, 0] -> [60, 15, 50]',
    );

    // Rotate 90° clockwise: relative offset [10, 5, 0] rotated 90° is [0, 5, -10]
    controller.rotateGhostClockwise(); // 90°
    const ghostPlacements90 = controller.getGhostPreviewPlacements();
    const ghostHouse90 = ghostPlacements90.find((p) => p.name === 'house')!;
    const ghostTower90 = ghostPlacements90.find((p) => p.name === 'tower')!;
    check(
      ghostHouse90.transform.translation[0] === 50 &&
      ghostHouse90.transform.translation[1] === 10 &&
      ghostHouse90.transform.translation[2] === 50,
      'House rotated 90° stays anchored at cursor [50, 10, 50]',
    );
    check(
      ghostTower90.transform.translation[0] === 50 &&
      ghostTower90.transform.translation[1] === 15 &&
      ghostTower90.transform.translation[2] === 40,
      'Tower rotated 90° transforms relative offset to [0, 5, -10] -> [50, 15, 40]',
    );

    // Confirm placement
    const placedIds = await controller.confirmPlace();
    check(placedIds.length === 2, 'Both regions placed');
    const snapshot = store.session.snapshot();
    check(snapshot.placements.length === 2, 'Project contains 2 placements');

    // Verify groupId preserved
    const p1 = snapshot.placements[0];
    const p2 = snapshot.placements[1];
    const expectedGroupId = 'group_multi_test';
    check(
      p1.source.sourceGroupId === expectedGroupId &&
      p2.source.sourceGroupId === expectedGroupId,
      `Both placements preserve shared ${expectedGroupId} groupId in source`,
    );

    // Test undoLastImport() removes all placements in this import
    await controller.undoLastImport();
    const afterUndoLast = store.session.snapshot();
    check(afterUndoLast.placements.length === 0, 'undoLastImport() removes all placements from multi-region import');
  }

  // --------------------------------------------------------------------------
  // Test Suite 6: Legacy .schematic Structured Error Handling
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Legacy .schematic Error Handling ---');
  {
    const store = createEditorSessionStore();
    const controller = new ImportWorkflowController(store);

    // Should not crash / throw unhandled error
    let threw = false;
    try {
      await controller.startFileImport(legacyBytes, 'old_build.schematic');
    } catch {
      threw = true;
    }
    check(!threw, 'startFileImport did not throw an unhandled exception');
    check(controller.getState() === 'failed', 'Controller enters failed state');
    check(!!controller.getErrorMessage(), 'Error message populated');
    const report = controller.getReport();
    check(!!report && report.errors.length > 0, 'Structured error report exposed in failed state');
    check(
      report?.errors.some(
        (e) =>
          e.code === 'UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC' ||
          e.code.includes('LEGACY') ||
          e.code.includes('UNSUPPORTED'),
      ) ?? false,
      'Structured error code mentions legacy or unsupported format',
    );

    // Reset back to idle
    controller.reset();
    check(controller.getState() === 'idle', 'controller.reset() restores idle state');
  }

  // --------------------------------------------------------------------------
  // Test Suite 7: Mathematical Rotations & Mirrors Validation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Pure Vector Rotations & Mirrors ---');
  {
    // applyRotation: (x, y, z) -> (z, y, -x) for 90°
    const r0 = applyRotation(10, 5, 20, 0);
    check(r0[0] === 10 && r0[1] === 5 && r0[2] === 20, '0° rotation identity');

    const r90 = applyRotation(10, 5, 20, 90);
    check(r90[0] === 20 && r90[1] === 5 && r90[2] === -10, '90° rotation [z, y, -x]');

    const r180 = applyRotation(10, 5, 20, 180);
    check(r180[0] === -10 && r180[1] === 5 && r180[2] === -20, '180° rotation [-x, y, -z]');

    const r270 = applyRotation(10, 5, 20, 270);
    check(r270[0] === -20 && r270[1] === 5 && r270[2] === 10, '270° rotation [-z, y, x]');

    // applyMirror: x -> [-x, y, z], z -> [x, y, -z]
    const mx = applyMirror(10, 5, 20, 'x');
    check(mx[0] === -10 && mx[1] === 5 && mx[2] === 20, 'Mirror X');

    const mz = applyMirror(10, 5, 20, 'z');
    check(mz[0] === 10 && mz[1] === 5 && mz[2] === -20, 'Mirror Z');
  }

  // --------------------------------------------------------------------------
  // Test Suite 8: Non-Zero Origin & Negative Offset Schematic Placement
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Non-Zero Origin & Negative Offset Placement ---');
  {
    const store = createEditorSessionStore();
    const testPlacement = createTestPlacement(
      'p_offset',
      'offset_building',
      10,
      10,
      10,
      [-383, -22, -287],
      new Map([['0_0_0', stone]]),
      'schem-v3',
    );
    testPlacement.origin = [-766, -44, -574];

    // Verify fixture's world bounds min before import
    const baseBounds = placementWorldBounds(testPlacement);
    check(
      baseBounds.min[0] === 0 && baseBounds.min[1] === 0 && baseBounds.min[2] === 0,
      'Base placement with origin [-766, -44, -574] and translation [-383, -22, -287] has world bounds min at [0, 0, 0]',
    );

    const controller = new ImportWorkflowController(store, {
      parseFn: async () => ({
        placements: [testPlacement],
        group: {
          id: 'grp_offset',
          name: 'Offset Build',
          sourceFilename: 'offset.schem',
          placementIds: [testPlacement.id],
          sourceFormat: 'schem-v3',
        },
        importGroups: [],
        normalizedImport: {} as any,
        report: {
          format: { kind: 'schem-v3', confidence: 'high' } as any,
          dimensions: { width: 10, height: 10, length: 10 },
          volume: 1000n,
          nonAirBlockCount: 1,
          paletteSize: 1,
          regionCount: 1,
          fileSizeBytes: 100,
          compressedSizeBytes: 100,
          decompressedSizeBytes: 100,
          preserved: { blockEntities: 0, entities: 0, biomes: false, ticks: 0 },
          unsupported: { tags: [], blockStates: [] },
          sameStateOverlaps: 0,
          errors: [],
          warnings: [],
        },
      } as any),
    });

    await controller.startFileImport(new Uint8Array([1, 2, 3]), 'offset.schem', { autoPreview: true });
    check(controller.getState() === 'ghost-preview', 'Transitions to ghost-preview');

    // 1. When cursorPosition is [0, 0, 0] (e.g. clicking "Place at Origin")
    controller.setCursorPosition([0, 0, 0]);
    const ghostsAtOrigin = controller.getGhostPreviewPlacements();
    check(ghostsAtOrigin.length === 1, '1 ghost placement generated');
    const ghostBoundsAtOrigin = placementWorldBounds(ghostsAtOrigin[0]);
    check(
      ghostBoundsAtOrigin.min[0] === 0 &&
      ghostBoundsAtOrigin.min[1] === 0 &&
      ghostBoundsAtOrigin.min[2] === 0,
      'getGhostPreviewPlacements() places schematic at cursorPosition [0, 0, 0] (placementWorldBounds.min === [0, 0, 0])',
    );
    check(
      ghostsAtOrigin[0].transform.translation[0] === -383 &&
      ghostsAtOrigin[0].transform.translation[1] === -22 &&
      ghostsAtOrigin[0].transform.translation[2] === -287,
      'Ghost placement translation preserves [-383, -22, -287] when cursorPosition is [0, 0, 0]',
    );

    // 2. When cursorPosition is shifted, e.g. [100, 64, -50]
    controller.setCursorPosition([100, 64, -50]);
    const ghostsShifted = controller.getGhostPreviewPlacements();
    const ghostBoundsShifted = placementWorldBounds(ghostsShifted[0]);
    check(
      ghostBoundsShifted.min[0] === 100 &&
      ghostBoundsShifted.min[1] === 64 &&
      ghostBoundsShifted.min[2] === -50,
      'getGhostPreviewPlacements() places schematic at cursorPosition [100, 64, -50] (placementWorldBounds.min === [100, 64, -50])',
    );

    // 3. Confirm placement and verify committed placement world bounds
    await controller.confirmPlace();
    const snapshot = store.session.snapshot();
    const committed = snapshot.placements.find((p) => p.name === 'offset_building')!;
    check(!!committed, 'Committed placement exists in store');
    const committedBounds = placementWorldBounds(committed);
    check(
      committedBounds.min[0] === 100 &&
      committedBounds.min[1] === 64 &&
      committedBounds.min[2] === -50,
      'Committed placement world bounds min equals cursorPosition [100, 64, -50]',
    );
  }

  console.log(`\n========================================`);
  console.log(`Tests finished: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test execution failure:', err);
  process.exit(1);
});
