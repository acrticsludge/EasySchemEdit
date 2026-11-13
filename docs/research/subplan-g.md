# Research Gate: Subplan-G (UI & Interaction)

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` (locked decisions G1–G7)
**Goal:** Desktop UI: three-panel layout, outliner, inspector, status bar, shortcuts, tooltips, onboarding, accessibility, viewport overlays, asset load panel.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| G-1 | Three.js OrbitControls vs custom camera controller for viewport | Three.js docs | Pending |
| G-2 | Panel resizing/dragging: native CSS resize vs custom drag handlers | CSS resize, Pointer Events | Pending |
| G-3 | Keyboard shortcut handling: global keydown listener vs focused-element only | DOM Events spec | Pending |
| G-4 | WCAG 2.2 AA contrast verification against #0d0d0d background | WCAG 2.2 spec | **Researched 2026-11-13** — G-2.1 (target size), G-6.1 below |
| G-5 | Touch camera gestures: single-finger orbit, two-finger pinch/pan | Touch Events spec | Pending (slice g-4/g-8 implementation) |
| G-6 | Panel layout persistence: how to version and migrate a saved layout schema | localStorage has no schema; version envelope + migrate-or-reset | **Researched 2026-11-13** — G-6.2, G-6.3 |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| G-1 | Layout: left 260px outliner, center viewport dominant, right 320px inspector, bottom 220px dock | SUBSPEC-G G1 | Different proportions (rejected: G1 locked) |
| G-2 | Shortcut scheme: W=move, E=rotate, Bake shortcut removed (Chrome bookmark conflict) | SUBSPEC-G G5 | Ctrl+Shift+B for bake (rejected: G5 locked) |
| G-3 | Tooltip delay: 500ms | SUBSPEC-G G7 | Different delay (rejected: G7 locked) |
| G-4 | Minimum viewport: 1024×768 | SUBSPEC-G §6.0 | Smaller minimum (rejected: G1-G7 locked) |
| G-5 | Design tokens: #0d0d0d bg-primary, #eaeaea text-primary, WCAG 2.2 AA verified | SUBSPEC-G §1.5 | Different color scheme (rejected: G1-G7 locked) |
| G-6.1 | Pointer targets are at least **24×24 CSS px** (WCAG 2.2 SC 2.5.8, Level AA), which governs the controls *inside* panels and is independent of the 120px panel minimum | "The size of the target for pointer inputs is at least 24 by 24 CSS pixels" (w3.org/TR/WCAG22 SC 2.5.8, accessed 2026-11-13) | Treating the 120px panel minimum as the accessibility floor (rejected: it says nothing about a toolbar button) |
| G-6.2 | A saved layout is an **envelope** `{ version, panels }`. Loading an unknown version resets to the default layout rather than half-applying it; a registered migration step runs in order when one exists | "localStorage has no schema. The moment you change the shape of a persisted value … you need migration" (hedgeui.com/blog/persisting-ui-state-localstorage, accessed 2026-11-13); g-0 plan: "on version mismatch, migrate or reset to default" | Applying an unrecognised shape with per-field fallbacks (rejected: produces a half-laid-out workspace that looks broken) |
| G-6.3 | Layout state is **viewport preference**, never schematic document data: it is keyed independently of any project and never enters a `.vxproj` | SPEC-G §3.1, GOAL.md §PHASE 2 ("stored as viewport preferences (not schematic document data)") | Storing layout in the project (rejected: opening a second project would reflow the workspace) |
| G-6.4 | Panel sizing clamps live in **one resolver** (`resolveLayout`): min 120×80 per panel, viewport needs 400×300, width/height must be positive integers. An invalid persisted layout resolves to the default layout rather than being repaired field by field | SPEC-G §4.1 (layout validation); g-0 plan ("panel sizes clamped to min/max; invalid layouts reset to default") | Per-panel clamping at render time (rejected: the invalid state stays persisted and reappears on reload) |

## Open questions → DOUBTS.md

- D-8: SPEC-G §6.4 shows a one-click undo in the Agent Log panel, while SPEC-F §8.2 restricts one-click
  undo to the latest undoable action. Which spec owns the affordance?
