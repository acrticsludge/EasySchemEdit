// packages/ui/__tests__/slice-g-0-layout.test.ts
// Slice g-0 tests: workspace layout model — panels, clamping, validation, versioned persistence.
// (SUBSPEC-G §2.1, §4.1; research decisions G-6.1..G-6.4)
// Run: node --experimental-strip-types __tests__/slice-g-0-layout.test.ts

import {
  DEFAULT_LAYOUT,
  DEFAULT_PANEL_PROPORTIONS,
  MIN_PANEL_WIDTH,
  MIN_PANEL_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  MIN_VIEWPORT_HEIGHT,
  LAYOUT_SCHEMA_VERSION,
  PANEL_IDS,
  clampPanelSize,
  createDefaultLayout,
  validateLayout,
  resolveLayout,
  saveLayout,
  loadLayout,
  restoreDefaultLayout,
  panelById,
  MIN_POINTER_TARGET_PX,
  type PanelConfig,
  type WorkspaceLayout,
} from '../src/layout-types.ts';

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

const panel = (over: Partial<PanelConfig> & { id: string }): PanelConfig => ({
  position: 'left',
  collapsed: false,
  docked: true,
  order: 0,
  ...over,
});

console.log('--- Slice g-0: constants and default proportions (G1) ---');

{
  assertEqual(MIN_PANEL_WIDTH, 120, 'g-0.5: minimum panel width is 120px');
  assertEqual(MIN_PANEL_HEIGHT, 80, 'g-0.5: minimum panel height is 80px');
  assertEqual(MIN_VIEWPORT_WIDTH, 400, 'g-0.6: viewport minimum width is 400px');
  assertEqual(MIN_VIEWPORT_HEIGHT, 300, 'g-0.6: viewport minimum height is 300px');
  assertEqual(MIN_POINTER_TARGET_PX, 24, 'g-0: pointer targets are at least 24px (WCAG 2.2 SC 2.5.8)');
  assertEqual(LAYOUT_SCHEMA_VERSION, 1, 'g-0.8: layout schema starts at version 1');

  // G1 locked proportions.
  assertEqual(DEFAULT_PANEL_PROPORTIONS.hierarchy, 260, 'g-0.1: outliner is 260px (G1)');
  assertEqual(DEFAULT_PANEL_PROPORTIONS.inspector, 320, 'g-0.1: inspector is 320px (G1)');
  assertEqual(DEFAULT_PANEL_PROPORTIONS['bottom-dock'], 220, 'g-0.1: bottom dock is 220px (G1)');
  assertEqual(DEFAULT_PANEL_PROPORTIONS.viewport, 'dominant', 'g-0.1: viewport is dominant (G1)');

  assertEqual(PANEL_IDS.length, 5, 'g-0.3: five panel ids (G1 set)');
  assert(PANEL_IDS.includes('hierarchy'), 'g-0.3: hierarchy is a panel id');
  assert(PANEL_IDS.includes('viewport'), 'g-0.3: viewport is a panel id');
}

console.log('--- Slice g-0: default layout ---');

{
  const layout = createDefaultLayout();
  assertEqual(layout.viewportDominant, true, 'g-0.2: the viewport is dominant');
  assertEqual(layout.panels.length, 4, 'g-0.2: four positioned panels (toolbar is not positioned)');
  assertEqual(layout.activeLayout, 'default', 'g-0.2: the default layout is active');
  assertEqual(layout.savedLayouts.default !== undefined, true, 'g-0.2: the default layout is saved');

  const hierarchy = panelById(layout, 'hierarchy');
  assertEqual(hierarchy?.position, 'left', 'g-0.1: hierarchy is on the left');
  assertEqual(hierarchy?.width, 260, 'g-0.1: hierarchy width is 260');
  const inspector = panelById(layout, 'inspector');
  assertEqual(inspector?.position, 'right', 'g-0.1: inspector is on the right');
  assertEqual(inspector?.width, 320, 'g-0.1: inspector width is 320');
  const dock = panelById(layout, 'bottom-dock');
  assertEqual(dock?.position, 'bottom', 'g-0.1: bottom dock is at the bottom');
  assertEqual(dock?.height, 220, 'g-0.1: bottom dock height is 220');
  // The viewport is not given a size: it fills the remainder.
  assertEqual(panelById(layout, 'viewport')?.width, undefined, 'g-0.2: the viewport has no fixed width');

  // Independent copies: mutating one layout must not touch another.
  const a = createDefaultLayout();
  const b = createDefaultLayout();
  a.panels[0].width = 999;
  assert(b.panels[0].width !== 999, 'g-0.2: createDefaultLayout returns independent copies');
}

console.log('--- Slice g-0: panel size validation (G-6.4) ---');

{
  // Positive integers only.
  assertEqual(validateLayout({ panels: [panel({ id: 'hierarchy', width: 0 })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x' }).ok, false, 'g-0.4: width 0 is invalid');
  assertEqual(validateLayout({ panels: [panel({ id: 'hierarchy', width: -5 })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x' }).ok, false, 'g-0.4: negative width is invalid');
  assertEqual(validateLayout({ panels: [panel({ id: 'hierarchy', width: 12.5 })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x' }).ok, false, 'g-0.4: fractional width is invalid');
  assertEqual(validateLayout({ panels: [panel({ id: 'hierarchy', width: 260.0 })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x' }).ok, true, 'g-0.4: an integral float is a valid integer');

  // Below the minimum.
  const tooNarrow = validateLayout({
    panels: [panel({ id: 'hierarchy', width: 50 })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x',
  });
  assertEqual(tooNarrow.ok, false, 'g-0.5: width below 120 is invalid');
  assert(
    tooNarrow.ok === false && tooNarrow.reasons.some((r) => r.includes('120')),
    'g-0.5: the reason names the 120px minimum',
  );
  const tooShort = validateLayout({
    panels: [panel({ id: 'bottom-dock', position: 'bottom', height: 40 })],
    viewportDominant: true, savedLayouts: {}, activeLayout: 'x',
  });
  assertEqual(tooShort.ok, false, 'g-0.5: height below 80 is invalid');

  // Duplicate ids.
  const dupes = validateLayout({
    panels: [panel({ id: 'hierarchy' }), panel({ id: 'hierarchy' })],
    viewportDominant: true, savedLayouts: {}, activeLayout: 'x',
  });
  assertEqual(dupes.ok, false, 'g-0: duplicate panel ids are invalid');

  // Unknown panel id.
  const unknown = validateLayout({
    panels: [panel({ id: 'not-a-panel' })], viewportDominant: true, savedLayouts: {}, activeLayout: 'x',
  });
  assertEqual(unknown.ok, false, 'g-0.3: a panel id outside the G1 set is invalid');

  // Viewport not dominant is invalid (G1: viewport always dominant).
  const notDominant = validateLayout({
    panels: createDefaultLayout().panels, viewportDominant: false, savedLayouts: {}, activeLayout: 'default',
  });
  assertEqual(notDominant.ok, false, 'g-0.2: viewportDominant=false is invalid');

  // A valid default layout passes.
  assertEqual(validateLayout(createDefaultLayout()).ok, true, 'g-0: the default layout is valid');
}

console.log('--- Slice g-0: clamping ---');

{
  assertEqual(clampPanelSize('width', 50), 120, 'g-0.5: width clamps up to 120');
  assertEqual(clampPanelSize('height', 10), 80, 'g-0.5: height clamps up to 80');
  assertEqual(clampPanelSize('width', 260), 260, 'g-0.5: a valid width passes through');
  assertEqual(clampPanelSize('width', 12.7), 120, 'g-0.4: a fractional width clamps to the minimum');
  assertEqual(clampPanelSize('width', -40), 120, 'g-0.4: a negative width clamps to the minimum');
  assertEqual(clampPanelSize('width', 99999), 99999, 'g-0.5: there is no artificial maximum for a docked panel');
}

console.log('--- Slice g-0: resolveLayout repairs or resets (G-6.4) ---');

{
  // An invalid panel size is clamped, not discarded.
  const repaired = resolveLayout({
    panels: [panel({ id: 'hierarchy', position: 'left', width: 30 }), panel({ id: 'inspector', position: 'right', width: 320 })],
    viewportDominant: true,
    savedLayouts: {},
    activeLayout: 'custom',
  });
  assertEqual(panelById(repaired, 'hierarchy')?.width, 120, 'g-0.5: an undersized panel is clamped to 120');
  assertEqual(panelById(repaired, 'inspector')?.width, 320, 'g-0.5: a valid panel is untouched');

  // A structurally broken layout resets to the default rather than half-applying.
  const reset = resolveLayout({
    panels: [panel({ id: 'not-a-panel' })],
    viewportDominant: true,
    savedLayouts: {},
    activeLayout: 'broken',
  });
  assertEqual(reset.activeLayout, 'default', 'g-0: an unrecognised layout resets to the default');
  assertEqual(panelById(reset, 'hierarchy')?.width, 260, 'g-0: the reset layout has the G1 proportions');

  // A missing required panel is restored from the default.
  const missing = resolveLayout({
    panels: [panel({ id: 'hierarchy', position: 'left', width: 260 })],
    viewportDominant: true,
    savedLayouts: {},
    activeLayout: 'partial',
  });
  assert(missing.panels.length >= 2, 'g-0: a layout missing panels regains the default panels');
  assert(panelById(missing, 'inspector') !== undefined, 'g-0: the inspector panel is restored');

  // The viewport keeps its 400×300 floor when the window is too small.
  const squeezed = resolveLayout(
    {
      panels: [
        panel({ id: 'hierarchy', position: 'left', width: 600 }),
        panel({ id: 'inspector', position: 'right', width: 600 }),
        panel({ id: 'bottom-dock', position: 'bottom', height: 220 }),
      ],
      viewportDominant: true,
      savedLayouts: {},
      activeLayout: 'wide',
    },
    { width: 1000, height: 700 },
  );
  assertEqual(squeezed.viewport.width >= MIN_VIEWPORT_WIDTH, true, 'g-0.6: the viewport keeps its 400px minimum');
  assertEqual(squeezed.viewport.height >= MIN_VIEWPORT_HEIGHT, true, 'g-0.6: the viewport keeps its 300px minimum');
  const left = panelById(squeezed, 'hierarchy')?.width ?? 0;
  const right = panelById(squeezed, 'inspector')?.width ?? 0;
  assert(
    left + right + squeezed.viewport.width <= 1000,
    'g-0.6: panels never overrun the window width',
  );

  // No window size: the viewport is reported as dominant with no forced dimensions.
  const unsized = resolveLayout(createDefaultLayout());
  assertEqual(unsized.viewport.width, 0, 'g-0.2: without a window size, no viewport size is claimed');
  assertEqual(unsized.overflow.horizontal, false, 'g-0: no window size means no overflow claim');

  // A comfortable window leaves the viewport dominant (larger than either side panel).
  const roomy = resolveLayout(createDefaultLayout(), { width: 1600, height: 1000 });
  assert(roomy.viewport.width > 320, 'g-0: the viewport is the dominant column at 1600px wide');
  assert(roomy.viewport.width > (panelById(roomy, 'hierarchy')?.width ?? 0), 'g-0: viewport wider than the outliner');
  assertEqual(roomy.overflow.horizontal, false, 'g-0: 1600px has no horizontal overflow');
  assertEqual(roomy.overflow.vertical, false, 'g-0: 1000px has no vertical overflow');

  // Below the G-4 minimum (1024×768) the floors cannot fit: report overflow rather than pretend.
  const tiny = resolveLayout(createDefaultLayout(), { width: 500, height: 400 });
  assertEqual(tiny.overflow.horizontal, true, 'g-0: a sub-contract window reports horizontal overflow');
  assertEqual(tiny.viewport.width >= MIN_VIEWPORT_WIDTH, true, 'g-0.6: the viewport floor still wins over overflow');
}

console.log('--- Slice g-0: versioned persistence (G-6.2) ---');

{
  const layout = createDefaultLayout();
  const saved = saveLayout(layout);
  assertEqual(saved.version, LAYOUT_SCHEMA_VERSION, 'g-0.8: a saved layout carries its schema version');
  assertEqual(typeof saved.serialized, 'string', 'g-0.8: a saved layout serializes to a string');

  // Round-trip.
  const loaded = loadLayout(saved.serialized);
  assertEqual(loaded.activeLayout, 'default', 'g-0.8: a round-trip preserves the active layout');
  assertEqual(panelById(loaded, 'hierarchy')?.width, 260, 'g-0.8: a round-trip preserves panel sizes');

  // Unknown version resets to default instead of half-applying.
  const futureVersion = JSON.stringify({ version: LAYOUT_SCHEMA_VERSION + 99, panels: [{ id: 'hierarchy', width: 1 }] });
  const fromFuture = loadLayout(futureVersion);
  assertEqual(fromFuture.activeLayout, 'default', 'g-0.8: an unknown schema version resets to default');
  assertEqual(panelById(fromFuture, 'hierarchy')?.width, 260, 'g-0.8: the reset has the G1 proportions');

  // Corrupt JSON resets rather than throwing.
  const corrupt = loadLayout('{not json at all');
  assertEqual(corrupt.activeLayout, 'default', 'g-0.8: corrupt persisted state resets to default');

  // Nothing persisted resets.
  assertEqual(loadLayout(null).activeLayout, 'default', 'g-0.8: absent persisted state yields the default');
  assertEqual(loadLayout(undefined).activeLayout, 'default', 'g-0.8: undefined persisted state yields the default');

  // Named layouts are stored side by side, each independent.
  const compact = createDefaultLayout();
  const docked = panelById(compact, 'bottom-dock');
  if (docked) docked.collapsed = true;
  const withSecond = saveLayout(compact, 'compact');
  const reloaded = loadLayout(withSecond.serialized, 'compact');
  assertEqual(reloaded.activeLayout, 'compact', 'g-0: a named layout is restored by name');
  assertEqual(panelById(reloaded, 'bottom-dock')?.collapsed, true, 'g-0: the named layout keeps its collapsed dock');
}

console.log('--- Slice g-0: restore default (G1) ---');

{
  const custom = createDefaultLayout();
  const hierarchy = panelById(custom, 'hierarchy');
  if (hierarchy) {
    hierarchy.width = 480;
    hierarchy.collapsed = true;
  }
  const restored = restoreDefaultLayout(custom);
  assertEqual(panelById(restored, 'hierarchy')?.width, 260, 'g-0: restore resets the outliner to 260');
  assertEqual(panelById(restored, 'hierarchy')?.collapsed, false, 'g-0: restore un-collapses panels');
  assertEqual(restored.activeLayout, 'default', 'g-0: restore re-activates the default layout');

  // The input layout is not mutated.
  assertEqual(panelById(custom, 'hierarchy')?.width, 480, 'g-0: restore does not mutate its input');
}

console.log('\n=== Slice g-0 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}