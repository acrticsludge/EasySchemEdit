# Phase 3 Audit Round 1 — Subplan-G (UI & Interaction)

**Source:** `docs/plans/subplan-g/index.md`, `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MG-1: No test files exist for any subplan-g slice**

- Evidence: The traceability table maps all 21 acceptance items to test files (slice-g-0 through slice-g-16 tests), but `packages/ui/__tests__/` does not exist. No test files have been created.
- Impact: Zero test coverage for the UI layer. All 21 SUBSPEC-G acceptance criteria are unverified.
- Fix: Create test files for slices g-0 through g-16, or mark as "to verify" per GOAL.md rules.

### Medium

**MG-2: Slice count mismatch — plan says 16 slices but lists 17**

- Evidence: subplan-g/index.md verification checklist says "One consistent slice list (16 slices, no duplicates)" but the slice table lists g-0 through g-16, which is 17 slices (g-0, g-1, g-2, g-3, g-4, g-5, g-6, g-7, g-8, g-9, g-10, g-11, g-12, g-13, g-14, g-15, g-16).
- Impact: Inconsistent slice count could cause confusion about plan completeness.
- Fix: Update verification checklist to say "17 slices".

**MG-3: Slice g-13 (Asset load panel) overlaps with subplan-b slice b-13 (Asset pipeline)**

- Evidence: subplan-g/index.md slice g-13 covers "Asset load panel: first-run, manual JAR, progress, cancel, checksum". subplan-b/index.md slice b-13 covers "Asset Pipeline (packages/assets): client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB". Both cover asset loading UI/pipeline.
- Impact: Unclear which subplan owns asset load UI — subplan-b (data pipeline) or subplan-g (UI panel).
- Fix: Clarify ownership — subplan-b handles the data pipeline (version manifest, JAR download, SHA-1 verification, extraction), subplan-g handles the UI panel (auto-download button, drag-drop zone, progress bar, cancel button, checksum display).

**MG-4: Slice g-14 (Viewport overlays) overlaps with subplan-e slice e-10 (Chunk borders & block borders overlay)**

- Evidence: subplan-g/index.md slice g-14 covers "Viewport overlays: chunk borders, section borders, block borders". subplan-e/index.md slice e-10 covers "Chunk borders & block borders overlay". Both cover chunk/block border overlay implementation.
- Impact: Unclear which subplan owns viewport overlay rendering — subplan-e (renderer) or subplan-g (UI).
- Fix: Clarify ownership — subplan-e handles the Three.js overlay geometry rendering, subplan-g handles the UI controls (toggle buttons, persistence of visibility preferences).

**MG-5: Acceptance item 19 maps to g-12 (Bottom panels) but covers "Loading, confirmation, progress, cancellation"**

- Evidence: subplan-g/index.md row 19 maps acceptance item 19 ("Loading, confirmation, progress, cancellation, hover, selection, context-menu interactions defined") to slice g-12. Some of these (confirm destructive ops, progress/cancellation) relate to editing operations that belong to subplan-d, not UI panels.
- Impact: Cross-subspec boundary ambiguity — editing engine concerns mapped to UI panels slice.
- Fix: Re-map acceptance item 19 to subplan-d (editing engine) for the operation logic, and subplan-g (UI panels) for the UI display of loading/cancellation state.

### Low

**MG-6: No test files exist — verification checklist item cannot be satisfied**

- Evidence: subplan-g/index.md verification checklist says "No claims of verification without running tests" but no tests exist.
- Impact: The plan's own verification requirement is unmet.
- Fix: Create test files or mark all as "to verify".

## Traceability: SUBSPEC-G §8.2 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Three-panel layout: Outliner (left 260px), Viewport, Inspector (right 320px), Bottom dock (220px) | g-4 | slice-g-4-layout.test.ts | NOT CREATED (MG-1) |
| 2 | Panels resizable, collapsible, dockable; layout persisted | g-4 | slice-g-4-layout.test.ts | NOT CREATED (MG-1) |
| 3 | Outliner: import groups expand/collapse, placement rows, drag reorder | g-5 | slice-g-5-outliner.test.ts | NOT CREATED (MG-1) |
| 4 | Inspector: contextual, origin/transform visible, numeric + stepper | g-6 | slice-g-6-inspector.test.ts | NOT CREATED (MG-1) |
| 5 | Conflict panel: navigate with smooth camera fly; hover doesn't move camera | g-8 | slice-g-8-conflict-nav.test.ts | NOT CREATED (MG-1) |
| 6 | Status bar: world coords, selection dimensions, block count, save status | g-7 | slice-g-7-status-bar.test.ts | NOT CREATED (MG-1) |
| 7 | Tooltips: 500ms delay, shortcut in tooltip, ? reference | g-10 | slice-g-10-tooltips.test.ts | NOT CREATED (MG-1) |
| 8 | Shortcuts: W=move, E=rotate, Bake shortcut removed, no fire during text input | g-9 | slice-g-9-shortcuts.test.ts | NOT CREATED (MG-1) |
| 9 | UX safeguards: confirm destructive ops, progress/cancellation, resource pack warnings | g-12 | slice-g-12-bottom-panels.test.ts | NOT CREATED (MG-1, MG-5) |
| 10 | Formal design contract: typography, spacing, borders, panel states | g-3 | slice-g-3-design-tokens.test.ts | NOT CREATED (MG-1) |
| 11 | Reference screenshots and visual acceptance criteria documented | g-3 | slice-g-3-design-tokens.test.ts | NOT CREATED (MG-1) |
| 12 | Assets bottom-dock tab: resource-pack browser, texture/model inspector | g-12 | slice-g-12-bottom-panels.test.ts | NOT CREATED (MG-1) |
| 13 | Desktop-first responsive: panel collapsing; minimum 1024×768 | g-4 | slice-g-4-layout.test.ts | NOT CREATED (MG-1) |
| 14 | Touch camera and gizmo: single-finger orbit, two-finger pinch/pan | g-4 | slice-g-4-layout.test.ts | NOT CREATED (MG-1) |
| 15 | Shortcut conflict detection; platform-aware; browser-reserved | g-9 | slice-g-9-shortcuts.test.ts | NOT CREATED (MG-1) |
| 16 | W/E transform shortcuts coexist with viewport camera navigation | g-9 | slice-g-9-shortcuts.test.ts | NOT CREATED (MG-1) |
| 17 | WCAG 2.2 AA: keyboard navigation, visible focus, reduced motion | g-15 | slice-g-15-accessibility.test.ts | NOT CREATED (MG-1) |
| 18 | Workspace layout versioning and validation | g-4 | slice-g-4-layout.test.ts | NOT CREATED (MG-1) |
| 19 | Loading, confirmation, progress, cancellation, hover, selection | g-12 | slice-g-12-bottom-panels.test.ts | NOT CREATED (MG-1, MG-5) |
| 20 | Asset load panel: auto-download, manual JAR, progress, cancel, checksum | g-13 | slice-g-13-asset-load-panel.test.ts | NOT CREATED (MG-1, MG-3) |
| 21 | Asset load status in status bar and Assets tab; warning banner | g-7, g-13 | slice-g-7-status-bar.test.ts, slice-g-13-asset-load-panel.test.ts | NOT CREATED (MG-1, MG-3) |

## Verdict

Subplan-G is **Red** — no test files exist for any slice, and there are cross-subspec boundary ambiguities (MG-2, MG-3, MG-4, MG-5) plus a slice count mismatch (MG-2).

## Recommended Fixes

1. Fix MG-1: Create test files for all g-slices, or mark as "to verify" pending test harness
2. Fix MG-2: Update verification checklist to "17 slices"
3. Fix MG-3: Clarify asset load panel ownership — subplan-b (data pipeline) vs subplan-g (UI panel)
4. Fix MG-4: Clarify viewport overlay ownership — subplan-e (Three.js geometry) vs subplan-g (UI controls)
5. Fix MG-5: Re-map acceptance item 19 to subplan-d (operation logic) and subplan-g (UI display)
6. Fix MG-6: Create test files or mark all as "to verify"
