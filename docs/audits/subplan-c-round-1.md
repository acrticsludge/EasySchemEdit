# Phase 3 Audit Round 1 — Subplan-C (Project & Persistence)

**Source:** `docs/plans/subplan-c/index.md`, `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MC-1: No test files exist for any subplan-c slice**

- Evidence: The traceability table maps all 20 acceptance items to test files (slice-c-0 through slice-c-10 tests), but `packages/persistence/__tests__/` does not exist. No test files have been created.
- Impact: Zero test coverage for the entire persistence layer. All 20 SUBSPEC-C acceptance criteria are unverified.
- Fix: Create test files for slices c-0 through c-10 as IndexedDB browser tests become available, or mark them as "to verify" per GOAL.md rules.

### Medium

**MC-2: Slice c-8 references ambiguous package location**

- Evidence: subplan-c/index.md row 7-8 maps to `packages/formats/src/vxproj.ts (or new package)` — the "or new package" is ambiguous. The vxproj archive code could live in packages/formats or a new package, but no decision is recorded.
- Impact: Unclear where .vxproj archive code should live, creating package boundary ambiguity.
- Fix: Decide whether vxproj archive code lives in packages/formats or a new package (e.g., packages/archive), update the plan accordingly.

**MC-3: Slice c-5 references non-existent package**

- Evidence: subplan-c/index.md row 9 maps migration tests to `packages/project-schema/src/migration.ts`, but `packages/project-schema` does not exist in the monorepo layout (only packages/domain, packages/formats, packages/asset-pipeline, packages/persistence, packages/workers exist).
- Impact: Migration code has no defined home; the package must be created or the plan updated to use an existing package.
- Fix: Create packages/project-schema or re-map migration tests to an existing package (e.g., packages/persistence).

**MC-4: Slice c-10 claims acceptance verification but no tests exist**

- Evidence: subplan-c/index.md slice c-10 description says "All 20 SUBSPEC-C acceptance items" but no test file exists in packages/persistence/__tests__/.
- Impact: Acceptance criteria verification is claimed but not implemented.
- Fix: Create acceptance test file or mark as "to verify" per GOAL.md rules.

### Low

**MC-5: Slice c-0 says tests require browser environment**

- Evidence: subplan-c/slice-c-0.md says "IndexedDB requires browser environment. Verification via typecheck and logic review. Test file ... to be created when browser test harness is available."
- Impact: Acceptance item 20 (IndexedDB schema) cannot be tested until browser test harness exists. This is a known gap that should be tracked.
- Fix: Add to DOUBTS.md or mark test as "to verify" pending browser test harness.

## Traceability: SUBSPEC-C §8.2 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Browser autosave uses IndexedDB object stores | c-0, c-2 | slice-c-2-project-store.test.ts | NOT CREATED (MC-1) |
| 2 | No localStorage for schematic data | c-0 | slice-c-0-idb-store.test.ts | NOT CREATED (MC-1) |
| 3 | Autosave debounce 1500ms, command threshold 10, max interval 10s | c-3 | slice-c-3-autosave.test.ts | NOT CREATED (MC-1) |
| 4 | Autosave flushes on visibility change and beforeunload | c-3 | slice-c-3-autosave.test.ts | NOT CREATED (MC-1) |
| 5 | Dirty/saving/saved/error state visible | c-3 | slice-c-3-autosave.test.ts | NOT CREATED (MC-1) |
| 6 | Storage quota failure visible; never silently drops previous save | c-7 | slice-c-7-storage-budget.test.ts | NOT CREATED (MC-1) |
| 7 | .vxproj archive ZIP64 DEFLATE level 6 | c-8 | slice-c-8-vxproj.test.ts | NOT CREATED (MC-1, MC-2) |
| 8 | Project archive: schemaVersion, app version, asset profile, checksums | c-8 | slice-c-8-vxproj.test.ts | NOT CREATED (MC-1, MC-2) |
| 9 | Migrations deterministic, type-safe, tested | c-5, c-6 | slice-c-5-migration.test.ts, slice-c-6-recovery.test.ts | NOT CREATED (MC-1, MC-3) |
| 10 | Recovery: last 3 versions, 7-day retention | c-6 | slice-c-6-recovery.test.ts | NOT CREATED (MC-1) |
| 11 | History bounded by 200 entries or 256 MiB | c-4 | slice-c-4-history.test.ts | NOT CREATED (MC-1) |
| 12 | Command concurrency: baseRevision check | c-1 | slice-c-1-commit-protocol.test.ts | NOT CREATED (MC-1) |
| 13 | Undo restores placements, chunks, ancillary | c-4 | slice-c-4-history.test.ts | NOT CREATED (MC-1) |
| 14 | No partial commit; cancellation before commit | c-1 | slice-c-1-commit-protocol.test.ts | NOT CREATED (MC-1) |
| 15 | Revisions monotonically increasing | c-2, c-4 | slice-c-2-project-store.test.ts, slice-c-4-history.test.ts | NOT CREATED (MC-1) |
| 16 | Chunk reference counting | c-2 | slice-c-2-project-store.test.ts | NOT CREATED (MC-1) |
| 17 | Persistent storage request with denial handling | c-7 | slice-c-7-storage-budget.test.ts | NOT CREATED (MC-1) |
| 18 | No automatic cloud sync; .vxproj is cross-device transfer | c-8 | slice-c-8-vxproj.test.ts | NOT CREATED (MC-1, MC-2) |
| 19 | Crash-safe commit protocol: temp writes, checksum verification | c-1 | slice-c-1-commit-protocol.test.ts | NOT CREATED (MC-1) |
| 20 | IndexedDB schema: 10 object stores, compound keys | c-0 | slice-c-0-idb-store.test.ts | NOT CREATED (MC-1, MC-5) |

## Verdict

Subplan-C is **Red** — no test files exist for any slice, and there are package location ambiguities (MC-2, MC-3) that must be resolved before implementation can proceed correctly.

## Recommended Fixes

1. Fix MC-1: Create test files for all c-slices, or mark as "to verify" pending browser test harness
2. Fix MC-2: Decide vxproj archive package location (packages/formats or new package)
3. Fix MC-3: Create packages/project-schema or re-map migration tests to existing package
4. Fix MC-4: Create acceptance test file or mark as "to verify"
5. Fix MC-5: Track IndexedDB test gap in DOUBTS.md
