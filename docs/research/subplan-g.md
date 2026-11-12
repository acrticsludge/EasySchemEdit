# Research Gate: Subplan-G (UI & Interaction)

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` (locked decisions G1–G7)
**Goal:** Desktop UI: three-panel layout, outliner, inspector, status bar, shortcuts, tooltips, onboarding, accessibility, viewport overlays, asset load panel.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| G-1 | Three.js OrbitControls vs custom camera controller for viewport | Three.js docs | Pending |
| G-2 | Panel resizing/dragging: native CSS resize vs custom drag handlers | CSS resize, Pointer Events | Pending |
| G-3 | Keyboard shortcut handling: global keydown listener vs focused-element only | DOM Events spec | Pending |
| G-4 | WCAG 2.2 AA contrast verification against #0d0d0d background | WCAG 2.2 spec | Pending |
| G-5 | Touch camera gestures: single-finger orbit, two-finger pinch/pan | Touch Events spec | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| G-1 | Layout: left 260px outliner, center viewport dominant, right 320px inspector, bottom 220px dock | SUBSPEC-G G1 | Different proportions (rejected: G1 locked) |
| G-2 | Shortcut scheme: W=move, E=rotate, Bake shortcut removed (Chrome bookmark conflict) | SUBSPEC-G G5 | Ctrl+Shift+B for bake (rejected: G5 locked) |
| G-3 | Tooltip delay: 500ms | SUBSPEC-G G7 | Different delay (rejected: G7 locked) |
| G-4 | Minimum viewport: 1024×768 | SUBSPEC-G §6.0 | Smaller minimum (rejected: G1-G7 locked) |
| G-5 | Design tokens: #0d0d0d bg-primary, #eaeaea text-primary, WCAG 2.2 AA verified | SUBSPEC-G §1.5 | Different color scheme (rejected: G1-G7 locked) |

## Open questions → DOUBTS.md

None yet.
