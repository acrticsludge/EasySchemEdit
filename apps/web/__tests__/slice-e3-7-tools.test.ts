// apps/web/__tests__/slice-e3-7-tools.test.ts
// Unit tests for Slice E3.7: Selection Tool, Region Tools, and 1.21.11 Block State Picker.

import type { Bounds3i, Placement, Vec3i } from '@easyschemedit/domain';
import { getBlock } from '../../../packages/domain/volume-api.ts';
import { blockStateId } from '../../../packages/domain/block-state.ts';

import { EditorSession } from '../../../packages/operations/src/session.ts';
import type { Command, CommandExecutionOptions, Query, Result } from '../../../packages/operations/src/session-types.ts';
import {
  SelectionToolController,
} from '../src/editor/tools/selection-tool.ts';
import {
  RegionToolsController,
  DEFAULT_1_21_11_BLOCKS,
  formatBlockStateString,
  parseBlockStateString,
  toBlockStateId,
  parseMatcher,
} from '../src/editor/tools/region-tools.ts';

// Test session store wrapping EditorSession with identical API to EditorSessionStore
class TestEditorSessionStore {
  public readonly session: EditorSession;
  constructor() {
    this.session = new EditorSession();
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
}

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
    throw new Error(`Assertion failed: ${message}.\nExpected: ${expectedStr}\nGot:      ${actualStr}`);
  }
}

function createEmptyPlacement(id: string, bounds: Bounds3i): Placement {
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
      bounds: {
        min: [...bounds.min] as Vec3i,
        maxExclusive: [...bounds.maxExclusive] as Vec3i,
      },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
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

async function runTests() {
  console.log('=== Running Slice E3.7 Tools & Block Picker Tests ===\n');

  // ==========================================================================
  // Test 1: formatBlockStateString & parseBlockStateString Round-Trip
  // ==========================================================================
  console.log('--- Test 1: formatBlockStateString & parseBlockStateString ---');
  {
    // Simple block without properties
    const s1 = 'minecraft:stone';
    const parsed1 = parseBlockStateString(s1);
    assertEqual(parsed1.baseId, 'minecraft:stone', 'parsed baseId for stone');
    assertEqual(Object.keys(parsed1.properties).length, 0, 'stone has no properties');
    const formatted1 = formatBlockStateString(parsed1.baseId, parsed1.properties);
    assertEqual(formatted1, 'minecraft:stone', 'format stone round-trips');

    // Block without namespace prefix defaults to minecraft:
    const parsedRaw = parseBlockStateString('dirt');
    assertEqual(parsedRaw.baseId, 'minecraft:dirt', 'missing namespace defaults to minecraft:');

    // Block with multiple properties (unsorted in input)
    const s2 = 'minecraft:oak_stairs[half=bottom,facing=north,shape=straight]';
    const parsed2 = parseBlockStateString(s2);
    assertEqual(parsed2.baseId, 'minecraft:oak_stairs', 'parsed baseId for oak stairs');
    assertEqual(parsed2.properties.half, 'bottom', 'parsed property half');
    assertEqual(parsed2.properties.facing, 'north', 'parsed property facing');
    assertEqual(parsed2.properties.shape, 'straight', 'parsed property shape');

    // Formatted string has keys sorted alphabetically: facing, half, shape
    const formatted2 = formatBlockStateString(parsed2.baseId, parsed2.properties);
    assertEqual(
      formatted2,
      'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]',
      'properties are canonically sorted alphabetically'
    );

    // Round-trip from formatted canonical string
    const parsed3 = parseBlockStateString(formatted2);
    const formatted3 = formatBlockStateString(parsed3.baseId, parsed3.properties);
    assertEqual(formatted2, formatted3, 'canonical string round-trips identically');

    // formatBlockStateString accepting BlockStateId object
    const bsObject = blockStateId('minecraft:chest', { facing: 'east', waterlogged: 'false' });
    const formattedFromObj = formatBlockStateString(bsObject);
    assertEqual(
      formattedFromObj,
      'minecraft:chest[facing=east,waterlogged=false]',
      'formatBlockStateString handles BlockStateId object'
    );

    // toBlockStateId
    const converted = toBlockStateId('minecraft:oak_planks[axis=y]');
    assertEqual(converted.id, 'minecraft:oak_planks', 'toBlockStateId id');
    assertEqual(converted.props.axis, 'y', 'toBlockStateId props');

    // parseMatcher
    const matcher1 = parseMatcher('minecraft:stone');
    assertEqual(matcher1.mode, 'block-id-only', 'plain block is block-id-only matcher');
    assertEqual(matcher1.blockId, 'minecraft:stone', 'plain block matcher blockId');

    const matcher2 = parseMatcher('minecraft:oak_log[axis=y]');
    assertEqual(matcher2.mode, 'block-id-and-properties', 'propertied block is block-id-and-properties matcher');
    assertEqual(matcher2.properties?.axis, 'y', 'matcher properties preserved');

    // DEFAULT_1_21_11_BLOCKS contains common blocks and 1.21 copper/tuff additions
    assert(DEFAULT_1_21_11_BLOCKS.includes('minecraft:stone'), 'registry includes stone');
    assert(DEFAULT_1_21_11_BLOCKS.includes('minecraft:chiseled_copper'), 'registry includes 1.21 chiseled copper');
    assert(DEFAULT_1_21_11_BLOCKS.includes('minecraft:crafter'), 'registry includes 1.21 crafter');

    console.log('✓ Test 1 passed: block state string formatting, parsing, and matcher conversion works.');
  }

  // ==========================================================================
  // Test 2: SelectionToolController Two-Corner Selection & Inversion
  // ==========================================================================
  console.log('\n--- Test 2: SelectionToolController Two-Corner Selection ---');
  {
    const store = new TestEditorSessionStore() as any;
    const selectionTool = new SelectionToolController(store);

    // Initial state: no corners, no bounds
    assertEqual(selectionTool.getCorner1(), null, 'initial corner1 is null');
    assertEqual(selectionTool.getActiveBounds(), null, 'initial bounds is null');

    // Set first corner
    selectionTool.setCorner1([10, 5, 8]);
    assertDeepEqual(selectionTool.getCorner1(), [10, 5, 8], 'corner1 stored');

    // Set second corner with inverted coordinates (corner2 < corner1)
    const result = await selectionTool.setCorner2([0, 0, 0]);
    assert(result.ok, 'setCorner2 execution succeeded');

    // Bounds must be normalized: min = [0, 0, 0], maxExclusive = [11, 6, 9]
    const bounds = selectionTool.getActiveBounds();
    assert(bounds !== null, 'active bounds exists');
    assertDeepEqual(bounds!.min, [0, 0, 0], 'normalized min bound');
    assertDeepEqual(bounds!.maxExclusive, [11, 6, 9], 'normalized maxExclusive bound (inclusive + 1)');

    // getDimensions
    const dims = selectionTool.getDimensions(bounds!);
    assertEqual(dims.width, 11, 'dimension width = 11');
    assertEqual(dims.height, 6, 'dimension height = 6');
    assertEqual(dims.length, 9, 'dimension length = 9');
    assertEqual(dims.volume, 11 * 6 * 9, 'dimension volume = 594');

    // EditorSession document selection updated
    const sessionSel = (store.session as any).selection;
    assertEqual(sessionSel.type, 'cuboid', 'session selection type is cuboid');
    assertEqual(sessionSel.selection.bounds.minX, 0, 'session minX');
    assertEqual(sessionSel.selection.bounds.maxX, 11, 'session maxX');

    // clearSelection
    const clearResult = await selectionTool.clearSelection();
    assert(clearResult.ok, 'clearSelection succeeded');
    assertEqual(selectionTool.getCorner1(), null, 'corner1 cleared');
    const sessionSelAfter = (store.session as any).selection;
    assertEqual(sessionSelAfter.selection.bounds.maxX, 0, 'session selection cleared');

    console.log('✓ Test 2 passed: SelectionToolController sets corners, normalizes inverted bounds, and updates session.');
  }

  // ==========================================================================
  // Test 3: selectPlacementBounds
  // ==========================================================================
  console.log('\n--- Test 3: selectPlacementBounds ---');
  {
    const store = new TestEditorSessionStore() as any;
    const selectionTool = new SelectionToolController(store);

    const placement = createEmptyPlacement('p-select', {
      min: [5, 10, 15],
      maxExclusive: [21, 26, 31],
    });
    await store.execute({ type: 'placement:add', placement });

    const result = await selectionTool.selectPlacementBounds('p-select');
    assert(result.ok, 'selectPlacementBounds succeeded');

    const bounds = selectionTool.getActiveBounds();
    assert(bounds !== null, 'active bounds exists');
    assertDeepEqual(bounds!.min, [5, 10, 15], 'placement min bounds matched');
    assertDeepEqual(bounds!.maxExclusive, [21, 26, 31], 'placement maxExclusive bounds matched');

    const dims = selectionTool.getDimensions(bounds!);
    assertEqual(dims.width, 16, 'width = 16');
    assertEqual(dims.height, 16, 'height = 16');
    assertEqual(dims.length, 16, 'length = 16');
    assertEqual(dims.volume, 4096, 'volume = 4096');

    // Selecting non-existent placement returns error
    const notFound = await selectionTool.selectPlacementBounds('non-existent');
    assert(!notFound.ok, 'non-existent placement fails gracefully');

    console.log('✓ Test 3 passed: selectPlacementBounds selects exact placement AABB.');
  }

  // ==========================================================================
  // Test 4: RegionToolsController Fill, Replace, and Undo/Redo
  // ==========================================================================
  console.log('\n--- Test 4: RegionTools Fill & Replace with Undo/Redo ---');
  {
    const store = new TestEditorSessionStore() as any;
    const selectionTool = new SelectionToolController(store);
    const regionTools = new RegionToolsController(store, selectionTool);

    // Create 16x16x16 placement
    const placement = createEmptyPlacement('p-region', {
      min: [0, 0, 0],
      maxExclusive: [16, 16, 16],
    });
    await store.execute({ type: 'placement:add', placement });

    // Select 4x4x4 region (64 cells)
    await selectionTool.setNumericBounds({
      min: [0, 0, 0],
      maxExclusive: [4, 4, 4],
    });

    const activePlacement = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    assertEqual(activePlacement.volume.nonAirCount, 0, 'initial nonAirCount is 0');

    // 1. Fill region with minecraft:stone
    const fillRes = await regionTools.fill('minecraft:stone', { placementId: 'p-region' });
    assert(fillRes.ok, 'fill succeeded');

    const afterFillPlacement = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    assertEqual(afterFillPlacement.volume.nonAirCount, 64, 'filled exactly 64 cells with stone');

    const sampleBlock = getBlock(afterFillPlacement.volume, [2, 2, 2]);
    assertEqual(sampleBlock.id, 'minecraft:stone', 'sample block at [2,2,2] is stone');

    // 2. Undo restores exact block count!
    assert(store.canUndo(), 'can undo after fill');
    const undoRes = await store.undo();
    assert(undoRes.ok, 'undo fill succeeded');

    const afterUndoPlacement = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    assertEqual(afterUndoPlacement.volume.nonAirCount, 0, 'undo restored nonAirCount to exactly 0');
    const blockAfterUndo = getBlock(afterUndoPlacement.volume, [2, 2, 2]);
    assertEqual(blockAfterUndo.id, 'minecraft:air', 'sample block restored to air');

    // 3. Redo restores the fill
    assert(store.canRedo(), 'can redo fill');
    await store.redo();
    const afterRedoPlacement = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    assertEqual(afterRedoPlacement.volume.nonAirCount, 64, 'redo restored 64 stone blocks');

    // 4. Replace minecraft:stone with minecraft:oak_planks[axis=y]
    const replaceRes = await regionTools.replace(
      'minecraft:stone',
      'minecraft:oak_planks[axis=y]',
      { placementId: 'p-region' }
    );
    assert(replaceRes.ok, 'replace succeeded');

    const afterReplacePlacement = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    assertEqual(afterReplacePlacement.volume.nonAirCount, 64, 'replaced 64 stone blocks with oak planks');
    const replacedBlock = getBlock(afterReplacePlacement.volume, [2, 2, 2]);
    assertEqual(replacedBlock.id, 'minecraft:oak_planks', 'block id is oak_planks');
    assertEqual(replacedBlock.props.axis, 'y', 'block prop axis=y');

    // Undo replace
    await store.undo();
    const afterUndoReplace = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-region')!;
    const restoredStone = getBlock(afterUndoReplace.volume, [2, 2, 2]);
    assertEqual(restoredStone.id, 'minecraft:stone', 'undo restored stone');

    console.log('✓ Test 4 passed: Fill & Replace work on placement and undo/redo restore exact block counts.');
  }

  // ==========================================================================
  // Test 5: Walls and Hollow with Undo
  // ==========================================================================
  console.log('\n--- Test 5: Walls and Hollow with Undo ---');
  {
    const store = new TestEditorSessionStore() as any;
    const selectionTool = new SelectionToolController(store);
    const regionTools = new RegionToolsController(store, selectionTool);

    const placement = createEmptyPlacement('p-walls', {
      min: [0, 0, 0],
      maxExclusive: [16, 16, 16],
    });
    await store.execute({ type: 'placement:add', placement });

    // Set 4x4x4 bounds: volume = 64.
    // For 4x4x4, outer shell is 64 - (2x2x2) = 56 blocks. Interior is 8 blocks.
    const regionBounds: Bounds3i = {
      min: [0, 0, 0],
      maxExclusive: [4, 4, 4],
    };

    // 1. Walls
    const wallsRes = await regionTools.walls('minecraft:obsidian', {
      bounds: regionBounds,
      placementId: 'p-walls',
      includeTop: true,
      includeBottom: true,
    });
    assert(wallsRes.ok, 'walls succeeded');

    const pAfterWalls = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-walls')!;
    assertEqual(pAfterWalls.volume.nonAirCount, 56, 'walls produced exactly 56 shell blocks');

    const cornerBlock = getBlock(pAfterWalls.volume, [0, 0, 0]);
    assertEqual(cornerBlock.id, 'minecraft:obsidian', 'corner is obsidian');
    const centerBlock = getBlock(pAfterWalls.volume, [1, 1, 1]);
    assertEqual(centerBlock.id, 'minecraft:air', 'interior [1,1,1] remains air');

    // Undo walls
    await store.undo();
    const pAfterUndoWalls = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-walls')!;
    assertEqual(pAfterUndoWalls.volume.nonAirCount, 0, 'undo walls restored nonAirCount to 0');

    // 2. Hollow
    // First fill with diamond blocks (64 blocks)
    await regionTools.fill('minecraft:diamond_block', {
      bounds: regionBounds,
      placementId: 'p-walls',
    });
    const pFilled = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-walls')!;
    assertEqual(pFilled.volume.nonAirCount, 64, 'filled 64 diamond blocks');

    // Now hollow (thickness = 1) -> 8 interior blocks should become air, leaving 56 diamond blocks
    const hollowRes = await regionTools.hollow({
      bounds: regionBounds,
      placementId: 'p-walls',
      shellThickness: 1,
    });
    assert(hollowRes.ok, 'hollow succeeded');

    const pHollowed = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-walls')!;
    assertEqual(pHollowed.volume.nonAirCount, 56, 'hollow produced exactly 56 diamond shell blocks');
    const hollowCenter = getBlock(pHollowed.volume, [1, 1, 1]);
    assertEqual(hollowCenter.id, 'minecraft:air', 'interior [1,1,1] hollowed to air');

    // Undo hollow restores 64 diamond blocks
    await store.undo();
    const pAfterUndoHollow = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-walls')!;
    assertEqual(pAfterUndoHollow.volume.nonAirCount, 64, 'undo hollow restored all 64 diamond blocks');
    const restoredCenter = getBlock(pAfterUndoHollow.volume, [1, 1, 1]);
    assertEqual(restoredCenter.id, 'minecraft:diamond_block', 'interior restored to diamond block');

    console.log('✓ Test 5 passed: Walls and Hollow compute exact shell/interior counts and undo cleanly.');
  }

  // ==========================================================================
  // Test 6: Copy, Cut, Paste, and MoveRegion with Undo
  // ==========================================================================
  console.log('\n--- Test 6: Copy, Cut, Paste, and MoveRegion ---');
  {
    const store = new TestEditorSessionStore() as any;
    const selectionTool = new SelectionToolController(store);
    const regionTools = new RegionToolsController(store, selectionTool);

    const placement = createEmptyPlacement('p-clipboard', {
      min: [0, 0, 0],
      maxExclusive: [16, 16, 16],
    });
    await store.execute({ type: 'placement:add', placement });

    // Fill 2x2x2 cube at [0, 0, 0] with gold blocks (8 blocks)
    await regionTools.fill('minecraft:gold_block', {
      bounds: { min: [0, 0, 0], maxExclusive: [2, 2, 2] },
      placementId: 'p-clipboard',
    });

    const pInitial = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pInitial.volume.nonAirCount, 8, '8 gold blocks placed');

    // 1. Copy [0,0,0]..[2,2,2]
    const copyRes = await regionTools.copy({
      bounds: { min: [0, 0, 0], maxExclusive: [2, 2, 2] },
    });
    assert(copyRes.ok, 'copy succeeded');

    // 2. Paste at [6, 0, 0]
    const pasteRes = await regionTools.paste([6, 0, 0], {
      intoPlacementId: 'p-clipboard',
    });
    assert(pasteRes.ok, 'paste succeeded');

    const pAfterPaste = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pAfterPaste.volume.nonAirCount, 16, 'paste added 8 gold blocks (total 16)');
    const pastedBlock = getBlock(pAfterPaste.volume, [6, 0, 0]);
    assertEqual(pastedBlock.id, 'minecraft:gold_block', 'pasted gold block at [6,0,0]');

    // Undo paste
    await store.undo();
    const pAfterUndoPaste = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pAfterUndoPaste.volume.nonAirCount, 8, 'undo paste removed pasted blocks');

    // 3. Cut [0,0,0]..[2,2,2]
    const cutRes = await regionTools.cut({
      bounds: { min: [0, 0, 0], maxExclusive: [2, 2, 2] },
    });
    assert(cutRes.ok, 'cut succeeded');

    const pAfterCut = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pAfterCut.volume.nonAirCount, 0, 'cut cleared source blocks to 0');

    // Undo cut
    await store.undo();
    const pAfterUndoCut = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pAfterUndoCut.volume.nonAirCount, 8, 'undo cut restored 8 gold blocks');

    // 4. MoveRegion: translate [0,0,0]..[2,2,2] by offset [4, 0, 0]
    const moveRes = await regionTools.moveRegion([4, 0, 0], {
      sourceBounds: { min: [0, 0, 0], maxExclusive: [2, 2, 2] },
      affectedPlacements: ['p-clipboard'],
    });
    assert(moveRes.ok, 'moveRegion succeeded');

    const pAfterMove = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(pAfterMove.volume.nonAirCount, 8, 'move kept exactly 8 blocks');
    assertEqual(getBlock(pAfterMove.volume, [0, 0, 0]).id, 'minecraft:air', 'old position is air');
    assertEqual(getBlock(pAfterMove.volume, [4, 0, 0]).id, 'minecraft:gold_block', 'new position is gold');

    // Undo move
    await store.undo();
    const pAfterUndoMove = store.session.snapshot().placements.find((p: Placement) => p.id === 'p-clipboard')!;
    assertEqual(getBlock(pAfterUndoMove.volume, [0, 0, 0]).id, 'minecraft:gold_block', 'undo move restored gold at [0,0,0]');
    assertEqual(getBlock(pAfterUndoMove.volume, [4, 0, 0]).id, 'minecraft:air', 'undo move cleared [4,0,0]');

    console.log('✓ Test 6 passed: Copy, Cut, Paste, and MoveRegion execute and undo cleanly.');
  }

  console.log('\n======================================================');
  console.log('All Slice E3.7 Tools & Block Picker tests passed!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('\nTest failed with error:', err);
  process.exit(1);
});
