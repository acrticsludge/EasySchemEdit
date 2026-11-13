// packages/operations/__tests__/slice-e1-3-session.test.ts
// Unit tests for EditorSession (slice E1.3): command/query API, history atomicity,
// monotonic revision, events, locked enforcement, stale revision check, and idempotency.
// Pure TypeScript, runs with node --experimental-strip-types.

import type { BlockStateId, Bounds3i, Vec3i } from '../../domain/types.ts';
import { CANONICAL_AIR } from '../../domain/block-state.ts';
import type { ChunkedVoxelVolume, VoxelChunk } from '../../domain/volume.ts';
import { voxelIndex } from '../../domain/volume.ts';
import type { Placement, Project } from '../../domain/placement.ts';
import { getBlock } from '../../domain/volume-api.ts';
import { createCuboidSelection, createSelectionState } from '../src/selection.ts';
import { EditorSession } from '../src/session.ts';
import type { SessionChangeEvent } from '../src/session-types.ts';

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
    id: 'test-project-1',
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
    revision: 10,
  };
}

console.log('=== Running Slice E1.3 EditorSession Tests ===\n');

// ── Test 1: Initialization & Snapshot ──
console.log('--- Test 1: Initialization & Snapshot ---');
{
  const project = makeTestProject();
  const session = new EditorSession(project);

  assertEqual(session.revision, 10, 'Initial revision matches project revision');
  assertEqual(session.canUndo(), false, 'canUndo is false initially');
  assertEqual(session.canRedo(), false, 'canRedo is false initially');

  const snap = session.snapshot();
  assertEqual(snap.placements.length, 2, 'Snapshot contains 2 placements');
  assertEqual(snap.placements[0]?.id, 'p1', 'Snapshot placement 0 is p1');

  // Verify peekProject returns direct reference without clone
  const peeked1 = session.peekProject();
  const peeked2 = session.peekProject();
  assert(peeked1 === peeked2, 'peekProject returns same reference without cloning');
  assert(peeked1 !== snap, 'snapshot returns cloned object while peekProject does not');
  assertEqual(peeked1.revision, 10, 'peekProject has correct revision');

  // Verify default constructor without arguments
  const emptySession = new EditorSession();
  assertEqual(emptySession.revision, 0, 'Empty session has revision 0');
  assertEqual(emptySession.snapshot().placements.length, 0, 'Empty session has 0 placements');
}

// ── Test 2: Placement Commands ──
console.log('--- Test 2: Placement Commands ---');
{
  const session = new EditorSession(makeTestProject());
  let lastRev = session.revision;

  // placement:add
  const p3 = makeTestPlacement('p3', 'Placement 3', [32, 0, 0]);
  const rAdd = session.execute({ type: 'placement:add', placement: p3 });
  assert(rAdd.ok, 'placement:add succeeds');
  assert(session.revision > lastRev, 'revision incremented after add');
  lastRev = session.revision;
  assertEqual(session.snapshot().placements.length, 3, 'Project now has 3 placements');

  // placement:duplicate
  const rDup = session.execute({ type: 'placement:duplicate', placementId: 'p1', offset: [0, 5, 0] });
  assert(rDup.ok, 'placement:duplicate succeeds');
  assert(session.revision > lastRev, 'revision incremented after duplicate');
  lastRev = session.revision;
  assertEqual(session.snapshot().placements.length, 4, 'Project now has 4 placements');

  // placement:rename
  const rRen = session.execute({ type: 'placement:rename', placementId: 'p1', name: 'Renamed P1' });
  assert(rRen.ok, 'placement:rename succeeds');
  assert(session.revision > lastRev, 'revision incremented after rename');
  lastRev = session.revision;
  const p1 = session.query<{ name: string }>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1?.name, 'Renamed P1', 'Placement name updated');

  // placement:move
  const rMove = session.execute({ type: 'placement:move', placementId: 'p1', translation: [10, 20, 30] });
  assert(rMove.ok, 'placement:move succeeds');
  assert(session.revision > lastRev, 'revision incremented after move');
  lastRev = session.revision;
  const p1Moved = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Moved?.transform.translation[0], 10, 'Translation X updated');
  assertEqual(p1Moved?.transform.translation[1], 20, 'Translation Y updated');
  assertEqual(p1Moved?.transform.translation[2], 30, 'Translation Z updated');

  // placement:rotate
  const rRot = session.execute({ type: 'placement:rotate', placementId: 'p1', rotationY: 90 });
  assert(rRot.ok, 'placement:rotate succeeds');
  assert(session.revision > lastRev, 'revision incremented after rotate');
  lastRev = session.revision;
  const p1Rot = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Rot?.transform.rotationY, 90, 'rotationY updated to 90');

  // placement:mirror
  const rMir = session.execute({ type: 'placement:mirror', placementId: 'p1', mirror: 'x' });
  assert(rMir.ok, 'placement:mirror succeeds');
  assert(session.revision > lastRev, 'revision incremented after mirror');
  lastRev = session.revision;
  const p1Mir = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Mir?.transform.mirror, 'x', 'mirror updated to x');

  // placement:setOrigin
  const rOrig = session.execute({ type: 'placement:setOrigin', placementId: 'p1', origin: [2, 0, 2] });
  assert(rOrig.ok, 'placement:setOrigin succeeds');
  assert(session.revision > lastRev, 'revision incremented after setOrigin');
  lastRev = session.revision;
  const p1Orig = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Orig?.origin[0], 2, 'origin updated');

  // placement:setHidden
  const rHide = session.execute({ type: 'placement:setHidden', placementId: 'p1', hidden: true });
  assert(rHide.ok, 'placement:setHidden succeeds');
  assert(session.revision > lastRev, 'revision incremented after setHidden');
  lastRev = session.revision;
  const p1Hidden = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Hidden?.visible, false, 'visible is false');

  // placement:setLocked
  const rLock = session.execute({ type: 'placement:setLocked', placementId: 'p1', locked: true });
  assert(rLock.ok, 'placement:setLocked succeeds');
  assert(session.revision > lastRev, 'revision incremented after setLocked');
  lastRev = session.revision;
  const p1Locked = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1Locked?.locked, true, 'locked is true');

  // Unlock p1 and remove
  session.execute({ type: 'placement:setLocked', placementId: 'p1', locked: false });
  const countBeforeRem = session.snapshot().placements.length;
  const rRem = session.execute({ type: 'placement:remove', placementId: 'p1' });
  assert(rRem.ok, 'placement:remove succeeds');
  assertEqual(session.snapshot().placements.length, countBeforeRem - 1, 'Placement count reduced by 1');
}

// ── Test 3: Group Transforms ──
console.log('--- Test 3: Group Transforms ---');
{
  const session = new EditorSession(makeTestProject());
  const revBefore = session.revision;

  const rGroup = session.execute({
    type: 'group:transform',
    placementIds: ['p1', 'p2'],
    translation: [5, 0, 5],
  });
  assert(rGroup.ok, 'group:transform succeeds');
  assert(session.revision > revBefore, 'revision incremented after group:transform');

  const p1 = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  const p2 = session.query<Placement>({ type: 'getPlacement', placementId: 'p2' });
  assertEqual(p1?.transform.translation[0], 5, 'p1 translated X by 5');
  assertEqual(p2?.transform.translation[0], 21, 'p2 translated X by 5');
}

// ── Test 4: Selection Commands ──
console.log('--- Test 4: Selection Commands ---');
{
  const session = new EditorSession(makeTestProject());
  const revBefore = session.revision;

  const rSet = session.execute({
    type: 'selection:set',
    selection: createCuboidSelection({ minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 }, { x: 0, y: 0, z: 0 }),
  });
  assert(rSet.ok, 'selection:set succeeds');
  assert(session.revision > revBefore, 'revision incremented after selection:set');

  const sel = session.query<{ type: string; selection: { kind: string } }>({ type: 'getSelection' });
  assertEqual(sel.type, 'cuboid', 'Selection type is cuboid');

  const rEdit = session.execute({
    type: 'selection:edit',
    bounds: { minX: 1, minY: 1, minZ: 1, maxX: 5, maxY: 5, maxZ: 5 },
  });
  assert(rEdit.ok, 'selection:edit succeeds');

  const rClear = session.execute({ type: 'selection:clear' });
  assert(rClear.ok, 'selection:clear succeeds');
}

// ── Test 5: Region Commands (fill, replace, hollow, walls, delete, move) ──
console.log('--- Test 5: Region Commands ---');
{
  const session = new EditorSession(makeTestProject());
  const bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [4, 4, 4] };

  // region:fill
  const rFill = session.execute({
    type: 'region:fill',
    bounds,
    block: { id: 'minecraft:gold_block', props: {} },
  });
  assert(rFill.ok, 'region:fill succeeds');
  assert(rFill.changed?.cells !== undefined && rFill.changed.cells > 0, 'cells were changed');

  const blockAfterFill = session.query<{ id: string }>({ type: 'getBlock', worldPos: [1, 1, 1] });
  assertEqual(blockAfterFill.id, 'minecraft:gold_block', 'Block at [1,1,1] is gold_block');

  // region:replace
  const rRep = session.execute({
    type: 'region:replace',
    bounds,
    matcher: { mode: 'exact', blockId: 'minecraft:gold_block' },
    replacement: { id: 'minecraft:diamond_block', props: {} },
  });
  assert(rRep.ok, 'region:replace succeeds');
  const blockAfterRep = session.query<{ id: string }>({ type: 'getBlock', worldPos: [1, 1, 1] });
  assertEqual(blockAfterRep.id, 'minecraft:diamond_block', 'Block replaced to diamond_block');

  // region:hollow
  const rHollow = session.execute({
    type: 'region:hollow',
    bounds,
    shellThickness: 1,
  });
  assert(rHollow.ok, 'region:hollow succeeds');

  // region:walls
  const rWalls = session.execute({
    type: 'region:walls',
    bounds,
    wallBlock: { id: 'minecraft:iron_block', props: {} },
    fillInterior: CANONICAL_AIR,
  });
  assert(rWalls.ok, 'region:walls succeeds');

  // region:move
  const rMove = session.execute({
    type: 'region:move',
    sourceBounds: bounds,
    offset: [0, 5, 0],
  });
  assert(rMove.ok, 'region:move succeeds');

  // region:delete
  const rDel = session.execute({
    type: 'region:delete',
    bounds: { min: [0, 5, 0], maxExclusive: [4, 9, 4] },
  });
  assert(rDel.ok, 'region:delete succeeds');
}

// ── Test 6: Clipboard Commands (copy, cut, paste) ──
console.log('--- Test 6: Clipboard Commands ---');
{
  const session = new EditorSession(makeTestProject());

  // Set stone block at [1,1,1] in p1
  const copyBounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [4, 4, 4] };

  // Copy
  const rCopy = session.execute({
    type: 'clipboard:copy',
    selection: { kind: 'cuboid', bounds: copyBounds },
  });
  assert(rCopy.ok, 'clipboard:copy succeeds');

  // Paste into p1 at [5, 5, 5]
  const rPaste = session.execute({
    type: 'clipboard:paste',
    targetPosition: [5, 5, 5],
    intoPlacementId: 'p1',
  });
  assert(rPaste.ok, 'clipboard:paste succeeds');
  assert(rPaste.changed?.cells !== undefined && rPaste.changed.cells > 0, 'paste modified cells');

  // Cut
  const rCut = session.execute({
    type: 'clipboard:cut',
    selection: { kind: 'cuboid', bounds: { min: [5, 5, 5], maxExclusive: [8, 8, 8] } },
  });
  assert(rCut.ok, 'clipboard:cut succeeds');
}

// ── Test 7: Bake Command ──
console.log('--- Test 7: Bake Command ---');
{
  const session = new EditorSession(makeTestProject());
  const initialCount = session.snapshot().placements.length;

  const rBake = session.execute({
    type: 'bake',
    placementIds: ['p1', 'p2'],
    createNewPlacement: true,
    newPlacementName: 'Baked Composite',
  });
  assert(rBake.ok, 'bake into new placement succeeds');
  assertEqual(session.snapshot().placements.length, initialCount + 1, 'New baked placement was added');
}

// ── Test 8: Queries ──
console.log('--- Test 8: Queries ---');
{
  const session = new EditorSession(makeTestProject());

  const proj = session.query<Project>({ type: 'getProject' });
  assertEqual(proj.id, 'test-project-1', 'getProject returns current project');

  const list = session.query<Placement[]>({ type: 'listPlacements' });
  assertEqual(list.length, 2, 'listPlacements returns 2 placements');

  const p1 = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1?.id, 'p1', 'getPlacement returns p1');

  const blk = session.query<{ id: string }>({ type: 'getBlock', worldPos: [1, 1, 1] });
  assertEqual(blk.id, 'minecraft:stone', 'getBlock returns stone at [1,1,1]');

  const sel = session.query<{ type: string }>({ type: 'getSelection' });
  assertEqual(sel.type, 'cuboid', 'getSelection returns selection');

  const effMat = session.query<{ totalBlocks: number }>({ type: 'materialList', mode: 'effective' });
  assert(effMat.totalBlocks >= 2, 'effective materialList counts non-air blocks');

  const perPlMat = session.query<Record<string, { totalBlocks: number }>>({ type: 'materialList', mode: 'perPlacement' });
  assert(perPlMat['p1'] !== undefined && perPlMat['p1'].totalBlocks >= 1, 'perPlacement materialList returns p1 count');

  const conflicts = session.query<{ hasConflicts: boolean }>({ type: 'detectConflicts' });
  assert(conflicts !== undefined, 'detectConflicts returns ConflictResult');

  const hist = session.query<{ undoCount: number }>({ type: 'getHistory' });
  assertEqual(hist.undoCount, 0, 'getHistory returns 0 undo entries initially');
}

// ── Test 9: Undo/Redo Restores Exact State Across Multi-Placement Edits ──
console.log('--- Test 9: Undo/Redo Exact Multi-Placement State Restoration ---');
{
  const session = new EditorSession(makeTestProject());

  // Verify initial block contents
  const blkP1_0 = session.query<{ id: string }>({ type: 'getBlock', worldPos: [1, 1, 1] });
  const blkP2_0 = session.query<{ id: string }>({ type: 'getBlock', worldPos: [17, 1, 1] });
  assertEqual(blkP1_0.id, 'minecraft:stone', 'Initial p1 block is stone');
  assertEqual(blkP2_0.id, 'minecraft:dirt', 'Initial p2 block is dirt');

  const p1Transform_0 = { ...session.query<Placement>({ type: 'getPlacement', placementId: 'p1' })!.transform };
  const p2Transform_0 = { ...session.query<Placement>({ type: 'getPlacement', placementId: 'p2' })!.transform };

  // Perform multi-placement edit: group transform
  session.execute({
    type: 'group:transform',
    placementIds: ['p1', 'p2'],
    translation: [10, 10, 10],
  });

  // Perform multi-placement region fill spanning both placements
  session.execute({
    type: 'region:fill',
    bounds: { min: [0, 0, 0], maxExclusive: [40, 20, 20] },
    block: { id: 'minecraft:obsidian', props: {} },
  });

  // Verify state changed
  assert(session.canUndo(), 'canUndo is true after edits');

  // Undo region fill
  const undoFillRes = session.undo();
  assert(undoFillRes !== null && undoFillRes.ok, 'undo region fill succeeds');

  // Undo group transform
  const undoGroupRes = session.undo();
  assert(undoGroupRes !== null && undoGroupRes.ok, 'undo group transform succeeds');

  // Verify exact state restored
  const blkP1_restored = session.query<{ id: string }>({ type: 'getBlock', worldPos: [1, 1, 1] });
  const blkP2_restored = session.query<{ id: string }>({ type: 'getBlock', worldPos: [17, 1, 1] });
  assertEqual(blkP1_restored.id, 'minecraft:stone', 'After undo: p1 block restored to stone');
  assertEqual(blkP2_restored.id, 'minecraft:dirt', 'After undo: p2 block restored to dirt');

  const p1Transform_restored = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' })!.transform;
  const p2Transform_restored = session.query<Placement>({ type: 'getPlacement', placementId: 'p2' })!.transform;
  assertEqual(p1Transform_restored.translation[0], p1Transform_0.translation[0], 'p1 translation X restored');
  assertEqual(p1Transform_restored.translation[1], p1Transform_0.translation[1], 'p1 translation Y restored');
  assertEqual(p2Transform_restored.translation[0], p2Transform_0.translation[0], 'p2 translation X restored');

  // Redo both edits
  assert(session.canRedo(), 'canRedo is true after undos');
  const redoGroupRes = session.redo();
  assert(redoGroupRes !== null && redoGroupRes.ok, 'redo group transform succeeds');
  const redoFillRes = session.redo();
  assert(redoFillRes !== null && redoFillRes.ok, 'redo fill succeeds');

  // Verify redone state
  const p1Transform_redone = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' })!.transform;
  assertEqual(p1Transform_redone.translation[0], p1Transform_0.translation[0] + 10, 'Redo restored transformed translation');
}

// ── Test 10: Revision Monotonicity ──
console.log('--- Test 10: Revision Monotonicity ---');
{
  const session = new EditorSession(makeTestProject());
  const revisions: number[] = [session.revision];

  // Command 1
  session.execute({ type: 'placement:rename', placementId: 'p1', name: 'P1 New' });
  revisions.push(session.revision);

  // Command 2
  session.execute({ type: 'placement:move', placementId: 'p1', translation: [1, 2, 3] });
  revisions.push(session.revision);

  // Undo 1
  session.undo();
  revisions.push(session.revision);

  // Redo 1
  session.redo();
  revisions.push(session.revision);

  // Verify strictly monotonic
  for (let i = 1; i < revisions.length; i++) {
    assert(revisions[i]! > revisions[i - 1]!, `Revision monotonically increasing: rev[${i}] (${revisions[i]}) > rev[${i - 1}] (${revisions[i - 1]})`);
  }
}

// ── Test 11: Document Change Events ──
console.log('--- Test 11: Change Events & Subscriptions ---');
{
  const session = new EditorSession(makeTestProject());
  const events: SessionChangeEvent[] = [];

  const unsubscribe = session.subscribe((ev) => {
    events.push(ev);
  });

  session.execute({ type: 'placement:rename', placementId: 'p1', name: 'Event Test' });
  assertEqual(events.length, 1, '1 event received on execute');
  assertEqual(events[0]?.kind, 'placement:rename', 'Event kind is placement:rename');
  assert(events[0]!.placementIds.includes('p1'), 'Event includes affected placementId p1');

  session.undo();
  assertEqual(events.length, 2, '2nd event received on undo');
  assertEqual(events[1]?.kind, 'undo', 'Event kind is undo');

  session.redo();
  assertEqual(events.length, 3, '3rd event received on redo');
  assertEqual(events[2]?.kind, 'redo', 'Event kind is redo');

  // Test unsubscribe
  unsubscribe();
  session.execute({ type: 'placement:rename', placementId: 'p1', name: 'After Unsub' });
  assertEqual(events.length, 3, 'No events received after unsubscribe');
}

// ── Test 12: Stale Revision Rejection ──
console.log('--- Test 12: Stale Revision Rejection ---');
{
  const session = new EditorSession(makeTestProject());
  const currentRev = session.revision;

  const res = session.execute(
    { type: 'placement:rename', placementId: 'p1', name: 'Stale Edit' },
    { expectedRevision: currentRev + 99 },
  );

  assert(!res.ok, 'Command rejected with stale revision');
  assertEqual(res.error?.code, 'STALE_REVISION', 'Error code is STALE_REVISION');
  assertEqual(session.revision, currentRev, 'Revision remained unchanged');

  // Verify placement name did NOT change
  const p1 = session.query<Placement>({ type: 'getPlacement', placementId: 'p1' });
  assertEqual(p1?.name, 'Placement 1', 'Placement name untouched');
}

// ── Test 13: Locked Placement Rejection ──
console.log('--- Test 13: Locked Placement Rejection ---');
{
  const session = new EditorSession(makeTestProject());

  // Lock placement p1
  session.execute({ type: 'placement:setLocked', placementId: 'p1', locked: true });

  // Attempt move on locked placement
  const resMove = session.execute({ type: 'placement:move', placementId: 'p1', translation: [100, 100, 100] });
  assert(!resMove.ok, 'Move on locked placement rejected');
  assert(
    resMove.error?.code === 'LOCKED_PLACEMENT' || resMove.error?.code === 'ENGINE_INVARIANT_VIOLATION',
    'Locked error code returned',
  );

  // Attempt delete on locked placement
  const resDel = session.execute({ type: 'placement:remove', placementId: 'p1' });
  assert(!resDel.ok, 'Delete on locked placement rejected');

  // Attempt region fill on locked placement
  const resFill = session.execute({
    type: 'region:fill',
    bounds: { min: [0, 0, 0], maxExclusive: [4, 4, 4] },
    block: { id: 'minecraft:gold_block', props: {} },
    placementId: 'p1',
  });
  assert(!resFill.ok, 'Region fill on locked placement rejected');

  // Attempt duplicate on locked placement
  const resDup = session.execute({ type: 'placement:duplicate', placementId: 'p1' });
  assert(!resDup.ok, 'Duplicate on locked placement rejected');

  // Visibility toggle remains allowed while locked (SUBSPEC-D §2.1)
  const resVis = session.execute({ type: 'placement:setHidden', placementId: 'p1', hidden: true });
  assert(resVis.ok, 'Visibility change allowed while locked');
}

// ── Test 14: Idempotency with requestId ──
console.log('--- Test 14: Idempotent RequestId ---');
{
  const session = new EditorSession(makeTestProject());
  const reqId = 'client-req-abc-123';

  // First execution
  const res1 = session.execute(
    { type: 'placement:rename', placementId: 'p1', name: 'Idempotent Name' },
    { requestId: reqId },
  );
  assert(res1.ok, 'First execution with requestId succeeds');
  const revAfter1 = session.revision;

  // Duplicate execution with identical requestId
  const res2 = session.execute(
    { type: 'placement:rename', placementId: 'p1', name: 'Idempotent Name' },
    { requestId: reqId },
  );
  assert(res2.ok, 'Duplicate execution returns ok');
  assertEqual(res2.revision, revAfter1, 'Duplicate returns exact same revision');
  assertEqual(session.revision, revAfter1, 'Revision not incremented a second time');
}

// ── Test 15: Failure is Atomic ──
console.log('--- Test 15: Failure is Atomic ---');
{
  const session = new EditorSession(makeTestProject());
  const revBefore = session.revision;
  const snapshotBefore = JSON.stringify(session.snapshot());

  // Execute a command that targets non-existent placement
  const res = session.execute({
    type: 'placement:move',
    placementId: 'does-not-exist',
    translation: [100, 100, 100],
  });

  assert(!res.ok, 'Invalid placement command failed');
  assertEqual(session.revision, revBefore, 'Revision is completely unchanged');
  assertEqual(JSON.stringify(session.snapshot()), snapshotBefore, 'Document state is byte-for-byte identical');
}

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  throw new Error(`Tests failed: ${failed} tests did not pass`);
}
