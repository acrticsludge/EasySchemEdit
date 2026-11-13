// packages/ui/__tests__/slice-g-4-layout-impl.test.ts
// Slice g-4 tests: layout implementation (SUBSPEC-G §3.1, §4.1, §6.1).
// Run: node --experimental-strip-types __tests__/slice-g-4-layout-impl.test.ts

import {
  createDefaultLayout,
  createLayoutController,
  panelById,
  resolveLayout,
  validateLayout,
  type WorkspaceLayout,
  type WindowSize,
} from '../src/index.ts';

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

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const WINDOW: WindowSize = { width: 1600, height: 1000 };

console.log('--- Slice g-4: resize ---');

{
  const c = createLayoutController(undefined, WINDOW);
  const before = panelById(c.state(), 'hierarchy')?.width ?? 0;
  c.resizePanel('hierarchy', { width: 20 }, WINDOW);
  assertEqual(panelById(c.state(), 'hierarchy')?.width, before + 20, 'g-4.1: resize adds to the width');

  // Floor clamp: seed a layout with a just-above-floor width, then resize below it.
  const seeded = createDefaultLayout();
  const seed = seeded.panels.find((p) => p.id === 'hierarchy');
  if (seed) seed.width = 125;
  const c3 = createLayoutController(seeded, WINDOW);
  c3.resizePanel('hierarchy', { width: -10 }, WINDOW);
  const result = panelById(c3.state(), 'hierarchy')?.width ?? 0;
  assert(result <= 125 && result >= 120, 'g-4.1: resize clamps to at least the 120 floor');

  // A resize that would starve the viewport is clamped so the viewport keeps 400px.
  const c4 = createLayoutController(undefined, WINDOW);
  c4.resizePanel('hierarchy', { width: 5000 }, WINDOW);
  const vp = c4.state().viewport;
  assert(vp.width >= 400, 'g-4.2: the viewport keeps its 400px floor under a giant resize');
  const left = panelById(c4.state(), 'hierarchy')?.width ?? 0;
  const right = panelById(c4.state(), 'inspector')?.width ?? 0;
  assert(c4.state().overflow.horizontal === true, 'g-4.2: an impossible resize reports horizontal overflow');

  // Resizing a collapsed panel is a no-op.
  const c5 = createLayoutController(undefined, WINDOW);
  c5.collapsePanel('hierarchy', WINDOW);
  const beforeCollapse = panelById(c5.state(), 'hierarchy')?.width;
  c5.resizePanel('hierarchy', { width: 50 }, WINDOW);
  assertEqual(panelById(c5.state(), 'hierarchy')?.width, beforeCollapse, 'g-4: a collapsed panel cannot be resized');
}

console.log('--- Slice g-4: collapse / expand / toggle ---');

{
  const c = createLayoutController(undefined, WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), false, 'g-4.3: starts expanded');
  c.collapsePanel('hierarchy', WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), true, 'g-4.3: collapse sets collapsed=true');
  const vpAfter = c.state().viewport.width;
  assert(vpAfter > 444, 'g-4.3: collapsing a side panel widens the viewport');

  c.expandPanel('hierarchy', WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), false, 'g-4.4: expand restores the panel');

  // toggle is a pair of opposite operations.
  c.toggleCollapse('hierarchy', WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), true, 'g-4.5: toggle collapses');
  c.toggleCollapse('hierarchy', WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), false, 'g-4.5: toggle expands');
  c.toggleCollapse('hierarchy', WINDOW);
  c.toggleCollapse('hierarchy', WINDOW);
  assertEqual(c.isCollapsed('hierarchy'), false, 'g-4.5: two toggles cancel out');

  // Collapsing an already-collapsed panel is a no-op.
  const c2 = createLayoutController(undefined, WINDOW);
  c2.collapsePanel('hierarchy', WINDOW);
  const snapshot = JSON.stringify(c2.state());
  c2.collapsePanel('hierarchy', WINDOW);
  assertEqual(JSON.stringify(c2.state()), snapshot, 'g-4.3: collapsing again is idempotent');

  // Expanding an already-expanded panel is a no-op.
  const c3 = createLayoutController(undefined, WINDOW);
  const snap3 = JSON.stringify(c3.state());
  c3.expandPanel('hierarchy', WINDOW);
  assertEqual(JSON.stringify(c3.state()), snap3, 'g-4.4: expanding an expanded panel is a no-op');
}

console.log('--- Slice g-4: dock / undock ---');

{
  const c = createLayoutController(undefined, WINDOW);
  assertEqual(panelById(c.state(), 'hierarchy')?.docked, true, 'g-4: starts docked');
  c.undockPanel('hierarchy', WINDOW);
  assertEqual(panelById(c.state(), 'hierarchy')?.docked, false, 'g-4.6: undock sets docked=false');
  c.dockPanel('hierarchy', WINDOW);
  assertEqual(panelById(c.state(), 'hierarchy')?.docked, true, 'g-4.6: dock restores docked=true');

  // Docking an already-docked panel is a no-op.
  const c2 = createLayoutController(undefined, WINDOW);
  const snap = JSON.stringify(c2.state());
  c2.dockPanel('hierarchy', WINDOW);
  assertEqual(JSON.stringify(c2.state()), snap, 'g-4.6: docking again is idempotent');
}

console.log('--- Slice g-4: reorder bottom tabs ---');

{
  const c = createLayoutController(undefined, WINDOW);
  assertEqual(c.bottomTabs()[0], 'bottom-dock', 'g-4.7: the default has one bottom tab');
  assertEqual(c.bottomTabs().length, 1, 'g-4.7: exactly one bottom tab by default');
  // Add a second bottom panel by seeding a layout with two bottom tabs.
  const seeded = createDefaultLayout();
  seeded.panels.push({ id: 'toolbar', position: 'bottom', height: 40, collapsed: false, docked: true, order: 1 });
  const c2 = createLayoutController(seeded, WINDOW);
  assertEqual(c2.bottomTabs().length, 2, 'g-4.7: two bottom tabs exist');

  c2.reorderTabs(['toolbar', 'bottom-dock']);
  assertEqual(c2.bottomTabs()[0], 'toolbar', 'g-4.7: reorder changes the tab order (first)');
  assertEqual(c2.bottomTabs()[1], 'bottom-dock', 'g-4.7: reorder changes the tab order (second)');
  assertEqual(c2.bottomTabs().length, 2, 'g-4.7: reorder keeps both tabs');

  // Unknown ids are dropped, not inserted.
  c2.reorderTabs(['nope', 'bottom-dock']);
  const afterUnknown = c2.bottomTabs();
  assertEqual(afterUnknown.length, 2, 'g-4.7: unknown ids do not remove existing tabs');
  assertEqual(afterUnknown[0], 'bottom-dock', 'g-4.7: the known id is reordered first');

  // Reordering with no bottom dock does nothing.
  const noDock = createDefaultLayout();
  noDock.panels = noDock.panels.filter((p) => p.position !== 'bottom');
  const c3 = createLayoutController(noDock, WINDOW);
  const before = JSON.stringify(c3.state());
  c3.reorderTabs(['hierarchy', 'inspector']);
  assertEqual(JSON.stringify(c3.state()), before, 'g-4.7: reorder with no bottom dock is a no-op');
}

console.log('--- Slice g-4: named layouts ---');

{
  const c = createLayoutController(undefined, WINDOW);
  const envelope = c.saveNamedLayout('compact');
  assertEqual(envelope.version, 1, 'g-4.8: a saved layout carries its schema version');
  assertEqual(c.state().activeLayout, 'compact', 'g-4.8: save activates the named layout');

  // Mutate, then reload the saved layout.
  c.resizePanel('hierarchy', { width: 50 }, WINDOW);
  assertEqual(c.loadNamedLayout('compact'), true, 'g-4.8: loadNamedLayout succeeds for a known name');
  assertEqual(panelById(c.state(), 'hierarchy')?.width, 260, 'g-4.8: reload restores the saved width');

  assertEqual(c.loadNamedLayout('nope'), false, 'g-4.8: loadNamedLayout returns false for an unknown name');

  // Delete: refuses the active layout and the default layout.
  c.saveNamedLayout('scratch');
  c.loadNamedLayout('compact');
  assertEqual(c.deleteNamedLayout('compact'), false, 'g-4.9: the active layout cannot be deleted');
  assertEqual(c.deleteNamedLayout('default'), false, 'g-4.9: the default layout cannot be deleted');
  assertEqual(c.deleteNamedLayout('scratch'), true, 'g-4.9: a non-active named layout can be deleted');
  assertEqual(c.deleteNamedLayout('scratch'), false, 'g-4.9: deleting twice returns false');

  // Rename refuses to clobber an existing name.
  c.saveNamedLayout('a');
  c.saveNamedLayout('b');
  assertEqual(c.renameLayout('a', 'b'), false, 'g-4.10: rename refuses to clobber');
  assertEqual(c.renameLayout('a', 'c'), true, 'g-4.10: rename to a free name succeeds');
  assertEqual(c.state().savedLayouts.c !== undefined, true, 'g-4.10: the renamed layout exists');
  assertEqual(c.state().savedLayouts.a, undefined, 'g-4.10: the old name is gone');
}

console.log('--- Slice g-4: reset and input immutability ---');

{
  const input = createDefaultLayout();
  const inputCopy = JSON.stringify(input);
  const c = createLayoutController(input, WINDOW);
  // Mutate heavily.
  c.resizePanel('hierarchy', { width: 200 }, WINDOW);
  c.collapsePanel('inspector', WINDOW);
  assertEqual(inputCopy, JSON.stringify(input), 'g-4.12: the input layout is never mutated');

  const beforeSaved = Object.keys(c.state().savedLayouts).length;
  c.resetLayout();
  assertEqual(panelById(c.state(), 'hierarchy')?.width, 260, 'g-4.11: reset restores the G1 width');
  assertEqual(panelById(c.state(), 'inspector')?.collapsed, false, 'g-4.11: reset un-collapses');
  assertEqual(Object.keys(c.state().savedLayouts).length, beforeSaved, 'g-4.11: reset keeps saved layouts');

  // Every state the controller ever produces must pass validateLayout.
  const states: WorkspaceLayout[] = [c.state()];
  c.resizePanel('bottom-dock', { height: 50 }, WINDOW);
  states.push(c.state());
  c.collapsePanel('hierarchy', WINDOW);
  states.push(c.state());
  c.resetLayout();
  states.push(c.state());
  for (const s of states) {
    assertEqual(validateLayout(s).ok, true, 'g-4.13: every produced layout validates');
  }
}

console.log('\n=== Slice g-4 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}