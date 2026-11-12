# Subspec G — UI & Interaction: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` (locked decisions G1–G7)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports in UI type definitions. ASTRO + React island for implementation (SUBSPEC-H H1).

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-g-0.md` | Layout types: PanelConfig, WorkspaceLayout, PanelId | `packages/ui/src/layout-types.ts` | Type definitions, panel config validation |
| `slice-g-1.md` | Shortcut types: ShortcutBinding, ShortcutRegistry | `packages/ui/src/shortcut-types.ts` | Shortcut validation, conflict detection |
| `slice-g-2.md` | Tooltip + onboarding types: TooltipConfig, OnboardingState | `packages/ui/src/tooltip-types.ts` | Delay validation, onboarding state |
| `slice-g-3.md` | Design tokens: CSS custom properties, contrast verification | `packages/ui/src/design-tokens.ts` | Color contrast ratios, spacing scale |
| `slice-g-4.md` | Layout implementation: resizable, collapsible, dockable panels | `packages/ui/src/layout.ts` | Panel resize, collapse, initial proportions |
| `slice-g-5.md` | Outliner implementation: import groups, placement rows, drag reorder | `packages/ui/src/outliner.ts` | Drag reorder, multi-select, context menu |
| `slice-g-6.md` | Inspector implementation: contextual, origin/transform, numeric+stepper | `packages/ui/src/inspector.ts` | Numeric inputs, stepper validation |
| `slice-g-7.md` | Status bar implementation: world coords, selection dimensions, block count, save status | `packages/ui/src/status-bar.ts` | Status bar fields, asset load status |
| `slice-g-8.md` | Conflict navigation: smooth camera fly | `packages/ui/src/conflict-nav.ts` | Camera fly animation, no camera jump on hover |
| `slice-g-9.md` | Shortcut implementation: keyboard handling, typingGuard, conflict detection | `packages/ui/src/shortcuts.ts` | Keydown handling, no fire during text input |
| `slice-g-10.md` | Tooltip implementation: 500ms delay, shortcut display, ? reference | `packages/ui/src/tooltips.ts` | Tooltip timing, shortcut display |
| `slice-g-11.md` | Onboarding implementation: dismissible, replayable | `packages/ui/src/onboarding.ts` | Dismissal, replay from settings |
| `slice-g-12.md` | Bottom panels implementation: Materials, Conflicts, History, Diagnostics, Agent Log, Assets | `packages/ui/src/bottom-panels.ts` | Tab switching, panel content |
| `slice-g-13.md` | Asset load panel: first-run, manual JAR, progress, cancel, checksum | `packages/ui/src/asset-load-panel.ts` | Auto-download, manual JAR, failure fallback |
| `slice-g-14.md` | Viewport overlays: chunk borders, section borders, block borders | `packages/ui/src/viewport-overlays.ts` | Overlay toggle, persistence, no data change |
| `slice-g-15.md` | Accessibility: WCAG 2.2 AA, keyboard nav, focus, reduced motion | `packages/ui/src/accessibility.ts` | Keyboard nav, focus indicators, contrast |
| `slice-g-16.md` | Acceptance criteria verification | `packages/ui/__tests__/` | All 21 SUBSPEC-G acceptance items |

## Acceptance Criteria (from SUBSPEC-G §8.2, revised)

| # | Acceptance Item | Slice | Test File |
|---|-----------------|-------|-----------|
| 1 | Three-panel layout: Outliner (left 260px), Viewport (center, dominant), Inspector (right 320px), Bottom dock (220px) | g-4 | slice-g-4-layout.test.ts |
| 2 | Panels resizable, collapsible, dockable; layout persisted | g-4 | slice-g-4-layout.test.ts |
| 3 | Outliner: import groups expand/collapse, placement rows show visibility/lock/name/dimensions/conflict, drag reorder affects precedence | g-5 | slice-g-5-outliner.test.ts |
| 4 | Inspector: contextual, origin/transform always visible for selected placement, numeric + stepper inputs, direct typing | g-6 | slice-g-6-inspector.test.ts |
| 5 | Conflict panel: navigate to conflict with smooth camera fly; hover doesn't move camera | g-8 | slice-g-8-conflict-nav.test.ts |
| 6 | Status bar: world coords, selection dimensions, block count, save status, job status always visible | g-7 | slice-g-7-status-bar.test.ts |
| 7 | Tooltips: 500ms delay, shortcut in tooltip, ? opens reference, dismissible onboarding | g-10 | slice-g-10-tooltips.test.ts |
| 8 | Shortcuts: changed scheme (W=move, E=rotate), Bake shortcut removed (Chrome conflict), no fire during text input | g-9 | slice-g-9-shortcuts.test.ts |
| 9 | UX safeguards: confirm destructive ops, progress/cancellation, resource pack warnings, lock targets shown, color not only signal | g-12 | slice-g-12-bottom-panels.test.ts |
| 10 | Formal design contract: typography, spacing, borders, panel states, menus, tooltips, dialogs, empty states, error states | g-3 | slice-g-3-design-tokens.test.ts |
| 11 | Reference screenshots and visual acceptance criteria documented | g-3 | slice-g-3-design-tokens.test.ts |
| 12 | Assets bottom-dock tab: resource-pack browser, texture/model inspector, asset diagnostics | g-12 | slice-g-12-bottom-panels.test.ts |
| 13 | Desktop-first responsive: panel collapsing at smaller viewports; minimum 1024×768 | g-4 | slice-g-4-layout.test.ts |
| 14 | Touch camera and gizmo: separate from outliner touch; single-finger orbit, two-finger pinch zoom, two-finger pan | g-4 | slice-g-4-layout.test.ts |
| 15 | Shortcut conflict detection across different actions; platform-aware; browser-reserved; key-repeat; context scoping | g-9 | slice-g-9-shortcuts.test.ts |
| 16 | W/E transform shortcuts coexist with viewport camera navigation (no conflict) | g-9 | slice-g-9-shortcuts.test.ts |
| 17 | WCAG 2.2 AA: keyboard navigation, visible focus, reduced motion, non-color indicators, contrast, touch targets | g-15 | slice-g-15-accessibility.test.ts |
| 18 | Workspace layout versioning and validation | g-4 | slice-g-4-layout.test.ts |
| 19 | Loading, confirmation, progress, cancellation, hover, selection, context-menu interactions defined | g-12 | slice-g-12-bottom-panels.test.ts |
| 20 | Asset load panel: first-run auto-download and manual JAR import; progress bar, cancel, checksum verification; auto-download failure surfaces manual JAR zone (never a dead end) | g-13 | slice-g-13-asset-load-panel.test.ts |
| 21 | Asset load status in status bar and Assets tab; persistent warning banner with "Load assets" action until assets load; missing-model fallback until ready | g-7, g-13 | slice-g-7-status-bar.test.ts, slice-g-13-asset-load-panel.test.ts |

## Research gate → docs/research/subplan-g.md

Research questions G-1 through G-5 documented there.

## Traceability

All 21 SUBSPEC-G §8.2 acceptance items mapped to slices and test files above. Unmapped criteria = plan bug.

## Verification checklist

- [ ] One consistent slice list (17 slices, no duplicates)
- [ ] Traceability table maps all 21 SUBSPEC-G §8.2 items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
