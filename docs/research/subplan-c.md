# Research Gate: Subplan-C (Project & Persistence)

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` (locked decisions C1–C8)
**Goal:** IndexedDB persistence, crash-safe commit, autosave, history, migration, recovery, storage budget, .vxproj archive.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| C-1 | IndexedDB API: `navigator.storage.estimate()` for quota, `IDBDatabase.transaction()` for atomic commits | MDN IndexedDB | Pending |
| C-2 | ZIP64 in browser: JSZip vs native, streaming writer, DEFLATE level 6 | JSZip docs, ZIP64 spec | Pending |
| C-3 | IndexedDB compound keys: `[placementId, chunkKey]` multiEntry, index on `placementId` | MDN IDBIndex | Pending |
| C-4 | IndexedDB persistence: `navigator.storage.persisted()` and `requestPersistent()` | MDN Storage API | Pending |
| C-5 | SHA-256 in browser: `crypto.subtle.digest()` | Web Crypto API | Pending |
| C-6 | Migration determinism: pure functions, input/output schema validation | SUBSPEC-C §2.3.4 | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| C-1 | IndexedDB database `schematic-editor-db` version 1 | SUBSPEC-C §2.3.1 | localStorage (rejected: C2 says no localStorage for schematic data) |
| C-2 | 8 object stores: projects, chunks, ancillary, history, recovery, assets, settings, idempotency, commitRecords, autosaveJournal | SUBSPEC-C §2.3.1 table | Fewer stores (rejected: spec defines 10) |
| C-3 | Crash-safe commit: pending → writing → verifying → committed → failed with temp keys | SUBSPEC-C §2.3.2 | Simple put() (rejected: not crash-safe) |
| C-4 | Autosave: 1500ms debounce, 10 command threshold, 10s max interval | SUBSPEC-C C3 | Different intervals (rejected: C3 locked) |
| C-5 | History: 200 entries or 256 MiB, whichever first | SUBSPEC-C C4 | Different limits (rejected: C4 locked) |
| C-6 | Storage budget: warning 512 MiB/70%, hard stop 1.5 GiB/85% | SUBSPEC-C C1 | Different thresholds (rejected: C1 locked) |
| C-7 | .vxproj: ZIP64, DEFLATE level 6, manifest.checksums single source | SUBSPEC-C C2, §2.3.3 | separate checksums.json (rejected: manifest.checksums is authoritative) |
| C-8 | Idempotency in same IndexedDB transaction as document commit | SUBSPEC-C §2.3.8 | Separate database (rejected: atomic commit requirement) |

## Open questions → DOUBTS.md

None yet.
