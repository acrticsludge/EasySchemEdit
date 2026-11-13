// packages/ui/__tests__/slice-g-5-outliner.test.ts
// Slice g-5 tests: outliner (SUBSPEC-G §6.2).
// Run: node --experimental-strip-types __tests__/slice-g-5-outliner.test.ts

import {
  createOutliner,
  type PlacementRow,
  type ImportGroup,
} from '../src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

console.log('--- Slice g-5: groups expand/collapse ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['p1', 'p2'] }],
    placements: [
      { id: 'p1', groupId: 'g1', name: 'Stone', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'p2', groupId: 'g1', name: 'Dirt', width: 2, height: 1, depth: 2, visible: true, locked: false, conflict: 'none' },
    ],
  });
  assertEqual(o.flatList().length, 2, 'g-5.1: expanded group shows its placements');
  o.toggleGroup('g1');
  assertEqual(o.flatList().length, 0, 'g-5.8: collapsed group hides placements from the flat list');
  assertEqual(o.state().placements.p1 !== undefined, true, 'g-5.8: collapsed group keeps placements in the model');
  o.setGroupExpanded('g1', true);
  assertEqual(o.flatList().length, 2, 'g-5.1: re-expanding restores the flat list');
}

console.log('--- Slice g-5: placement rows ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['p1'] }],
    placements: [
      { id: 'p1', groupId: 'g1', name: 'Stone', width: 3, height: 2, depth: 1, visible: false, locked: true, conflict: 'state' },
    ],
  });
  const row = o.placements()[0];
  assertEqual(row.visible, false, 'g-5.2: row exposes visibility');
  assertEqual(row.locked, true, 'g-5.2: row exposes lock');
  assertEqual(row.name, 'Stone', 'g-5.2: row exposes name');
  assertEqual(row.width, 3, 'g-5.2: row exposes dimensions (w)');
  assertEqual(row.height, 2, 'g-5.2: row exposes dimensions (h)');
  assertEqual(row.depth, 1, 'g-5.2: row exposes dimensions (d)');
  assertEqual(o.conflictOf('p1'), 'state', 'g-5.2: row exposes conflict indicator');
  assertEqual(o.isLocked('p1'), true, 'g-5.2: isLocked reflects the row');
}

console.log('--- Slice g-5: precedence reorder ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['a', 'b', 'c'] }],
    placements: [
      { id: 'a', groupId: 'g1', name: 'A', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'b', groupId: 'g1', name: 'B', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'c', groupId: 'g1', name: 'C', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
    ],
    precedence: ['a', 'b', 'c'],
  });
  assertEqual(o.precedenceOrder()[0], 'a', 'g-5.3: index 0 is highest priority by default');
  o.movePlacement('c', 0);
  const afterMove = o.precedenceOrder();
  assertEqual(afterMove.length, 3, 'g-5.3: drag reorder keeps all placements');
  assertEqual(afterMove[0], 'c', 'g-5.3: drag reorder changes precedence (top wins)');
  // Keyboard reorder: Alt+Down moves the selection down (lower priority).
  o.select('c', 'replace');
  o.moveSelectionDown();
  assertEqual(o.precedenceOrder()[1], 'c', 'g-5.4: Alt+Down moves the selection down');
  // Alt+Up moves it back up.
  o.moveSelectionUp();
  assertEqual(o.precedenceOrder()[0], 'c', 'g-5.4: Alt+Up moves the selection up');
}

console.log('--- Slice g-5: multi-select ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['a', 'b', 'c', 'd'] }],
    placements: [
      { id: 'a', groupId: 'g1', name: 'A', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'b', groupId: 'g1', name: 'B', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'c', groupId: 'g1', name: 'C', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'd', groupId: 'g1', name: 'D', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
    ],
    precedence: ['a', 'b', 'c', 'd'],
  });
  o.select('a', 'replace');
  o.select('c', 'toggle');
  assertEqual(o.selectedIds().length, 2, 'g-5.5: ctrl-toggle adds to the selection');
  o.select('b', 'range');
  const sel = o.selectedIds();
  assertEqual(sel.length, 2, 'g-5.5: shift-range selects the inclusive range (anchor + target)');
  o.clearSelection();
  assertEqual(o.selectedIds().length, 0, 'g-5.5: clearSelection empties the selection');
}

console.log('--- Slice g-5: bulk operations ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['a', 'b', 'c'] }],
    placements: [
      { id: 'a', groupId: 'g1', name: 'A', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'b', groupId: 'g1', name: 'B', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'c', groupId: 'g1', name: 'C', width: 1, height: 1, depth: 1, visible: true, locked: true, conflict: 'none' },
    ],
  });
  o.bulkVisibility(['a', 'b'], false);
  assertEqual(o.placements().find((p) => p.id === 'a')?.visible, false, 'g-5.6: bulk visibility applies to the selected set');
  assertEqual(o.placements().find((p) => p.id === 'b')?.visible, false, 'g-5.6: bulk visibility applies to the selected set');
  o.bulkLock(['a', 'b'], true);
  assertEqual(o.placements().find((p) => p.id === 'a')?.locked, true, 'g-5.6: bulk lock applies to the selected set');
  // bulkDelete refuses to delete locked placements.
  // Unlock 'a' first so it can be deleted.
  o.toggleLock('a');
  o.bulkDelete(['a', 'b', 'c']);
  assertEqual(o.placements().find((p) => p.id === 'a'), undefined, 'g-5.6: bulk delete removes unlocked placements');
  assertEqual(o.placements().find((p) => p.id === 'c') !== undefined, true, 'g-5.6: bulk delete refuses locked placements');
}

console.log('--- Slice g-5: context menu gating by lock state ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['u', 'l'] }],
    placements: [
      { id: 'u', groupId: 'g1', name: 'Unlocked', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'l', groupId: 'g1', name: 'Locked', width: 1, height: 1, depth: 1, visible: true, locked: true, conflict: 'none' },
    ],
  });
  const unlockedActions = o.contextMenuActions('u');
  const lockedActions = o.contextMenuActions('l');
  const byName = (list: { action: string; enabled: boolean }[], name: string) =>
    list.find((a) => a.action === name)?.enabled ?? false;

  // Locked placements block transform/edit/delete/duplicate/bake/origin/group/ungroup.
  for (const action of ['duplicate', 'delete', 'bake', 'set-origin', 'group', 'ungroup']) {
    assertEqual(byName(lockedActions, action), false, `g-5.7: locked placement blocks ${action}`);
    assertEqual(byName(unlockedActions, action), true, `g-5.7: unlocked placement allows ${action}`);
  }
  // Read/export/focus are allowed regardless of lock.
  for (const action of ['export', 'focus']) {
    assertEqual(byName(lockedActions, action), true, `g-5.7: locked placement still allows ${action}`);
  }
  // hide/show are always allowed.
  assertEqual(byName(lockedActions, 'hide'), true, 'g-5.7: hide is always allowed');
  assertEqual(byName(lockedActions, 'show'), true, 'g-5.7: show is always allowed');
  // lock/unlock toggle correctly.
  assertEqual(byName(unlockedActions, 'lock'), true, 'g-5.7: an unlocked placement can be locked');
  assertEqual(byName(unlockedActions, 'unlock'), false, 'g-5.7: an unlocked placement cannot be unlocked');
  assertEqual(byName(lockedActions, 'lock'), false, 'g-5.7: a locked placement cannot be locked again');
  assertEqual(byName(lockedActions, 'unlock'), true, 'g-5.7: a locked placement can be unlocked');

  // The full action set matches the spec's list.
  const expected = ['duplicate', 'delete', 'bake', 'export', 'set-origin', 'focus', 'group', 'ungroup', 'hide', 'show', 'lock', 'unlock'];
  assertEqual(unlockedActions.map((a) => a.action).join(','), expected.join(','), 'g-5.7: context menu lists every spec action');
}

console.log('--- Slice g-5: precedence stability ---');

{
  const o = createOutliner({
    groups: [{ id: 'g1', label: 'Import 1', expanded: true, placementIds: ['a', 'b'] }],
    placements: [
      { id: 'a', groupId: 'g1', name: 'A', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
      { id: 'b', groupId: 'g1', name: 'B', width: 1, height: 1, depth: 1, visible: true, locked: false, conflict: 'none' },
    ],
    precedence: ['a', 'b'],
  });
  const before = o.precedenceOrder().join(',');
  o.movePlacement('zzz', 0); // unknown id is a no-op
  assertEqual(o.precedenceOrder().join(','), before, 'g-5.9: moving an unknown id is a no-op');
  // State round-trips.
  const snap = JSON.stringify(o.state());
  o.toggleGroup('g1');
  o.toggleGroup('g1');
  const afterSnap = JSON.stringify(o.state().precedence);
  assertEqual(afterSnap, JSON.stringify(JSON.parse(snap).precedence), 'g-5.9: precedence is stable across unrelated mutations');
}

console.log('\n=== Slice g-5 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
