# GOAL

Plan, audit, then implement the full schematic editor (SUBSPEC-A..H) in small verified increments with zero guessing. Deliver: slice plans for C-H, audited plans for A-H, working committed code for every slice, and a final list of open questions for me.

# PROMPT PYRAMID (apply to every plan, subagent brief and implementation task)

Check your skills first for a "prompt pyramid" skill/doc and follow it if it exists. Otherwise use: (1) GOAL in one sentence, (2) CONSTRAINTS and non-goals, (3) INPUTS (exact files/sections), (4) STEPS, (5) OUTPUT FORMAT and acceptance check, (6) background last. Never start a task without the top layers written down.

# RULES (non-negotiable)

- No hallucination. Every technical claim (format fields, APIs, library behavior, Minecraft data) needs a primary source: the spec files, official docs, source code at a pinned commit/version, or a real fixture. Record exact source URL or repo path, version/commit, access date and section/code location. If unverifiable, log it in DOUBTS.md as UNVERIFIED with your best guess; never present a guess as fact.
- Never write "verified/tested" unless you ran the check and saw it pass; paste command + result into the progress log.
- Do not silently change locked specs, package contracts, file formats or user-facing behavior. Do not overwrite an existing decision with a new one: reconcile explicitly and document.
- Do not delete or rename existing plan content as a "fix"; edit in place. Slice names describe deliverables, never fixes. No meta slices (acceptance/index/review are documents).
- If required behavior can't be established from specs, primary sources or fixtures, put it in DOUBTS.md, don't invent it.
- No force pushes, no destructive commands, no secrets in commits.

# PHASE 0: DISCOVER AND BASELINE

1. Discover the actual repository root and spec paths (don't assume /specs or docs/specs). Read all eight SUBSPEC files plus CROSS_DOCUMENT_CONSISTENCY.md (nine core docs), then the existing A/B slice plans and their naming conventions.
2. Before any change record: git branch, current commit, `git status --short`, existing uncommitted changes, and baseline build/test results in docs/agent/baseline.md. Never stage or commit pre-existing user changes (stage only your own files by explicit path).
3. List ALL available skills/tools/MCPs and subagent models; write docs/agent/skills-inventory.md (name, what it does, when to use). Read relevant skills fully before using them.
4. Confirm exact cheap-model IDs from the OpenCode Go provider list (target beam-free and iceman-contributor-free); don't assume names. Record IDs or "not found".
5. Write docs/agent/repo-state.md: what exists, actual package names (e.g. check packages/asset-pipeline vs packages/assets), what doesn't.

# SUBAGENT POLICY

Cheap high-throughput models ONLY for: gathering links/docs, extracting acceptance criteria into tables, drafting boilerplate docs, formatting, file listing, summarizing sources with quotes. NEVER for format/math correctness, architecture, audits, security or final review. Every brief follows the prompt pyramid, requires quoted evidence with source location, and allows "unknown". You re-check output before it enters a plan or commit (spot-check at least 30% of claims against the source).

# PHASE 1: RECONCILE KNOWN CONFLICTS (before planning dependent work)

Resolve and document each (decision + evidence, or DOUBTS.md entry). Unresolved high-severity correctness issues BLOCK dependent implementation.

1. SUBSPEC-A A2 and Placement.origin allow Vec3Half, while §3.4 rejects half-integer origins for valid block-grid transforms. Decide: type-model issue or validation-only restriction. Document the invariant and tests. (Proposal to evaluate: integer-only origin for transforms.)
2. Define rotateAboutPoint precisely, distinguishing rotation about a placement's own origin from rotation about an arbitrary world-space pivot.
3. Single-entry Litematica palette: SUBSPEC-B says zero bits. Verify the proposed minimum-2-bit rule against Litematica source at a pinned commit and real files.
4. Verify independently, per property: stair shape, door hinge, every directional block-state transform, mirror handedness. Don't generalize from one property to all. Define rotation direction and mirror axes; rotation must map block centers (not corners) with hand-computed expected-output tests.
5. One canonical assets package and one canonical spec path. Reconcile with the existing architecture and update SUBSPEC-H, dependency checks and plans so names agree.
6. Decompression limits enforced inside streaming decompression and parsing, before unbounded allocations (no 100:1 ratio; absolute caps from maxDecompressedBytes).
7. Other proposals to verify, not assume: no auto-split (refuse dimension >65,535); Sponge v3 root "Schematic" with Blocks{Palette,Data}; Litematic real structure (Metadata, Regions{Position, Size, BlockStatePalette, BlockStates,...}), signed-Size normalization with per-axis dimensions; stair/hinge change on mirror only; chunk view keys include placementId; ancillary data per placement; Offset semantics checked against a WorldEdit fixture.

# PHASE 2: PLAN SUBSPEC-C..H

Order: H architecture/build-system foundation FIRST (it precedes A in implementation; release/deployment deliverables come after the app is integrated), then C, D, E, F, G. For each: research gate -> docs/research/<subspec></subspec>.md -> slice plan in the A/B format (index.md + slice files: goal, files, types/APIs, acceptance criteria, tests, verification) with thin vertical slices -> traceability table mapping every acceptance criterion to slice(s) and test file(s); unmapped criteria are plan bugs.

Required additional workflow slices (each must state: owning package + spec, data-model changes, commands/queries, persistence implications, UI interactions, acceptance criteria, automated tests, performance and failure behavior):

- Import-and-place: drag/drop, import diagnostics, ghost preview, cursor placement, ground snapping, alignment, rotation, mirror, cancellation, undoable placement.
- Persistent build library: saved reusable builds, browse/search, thumbnails/previews, import/place from library, persistence, deletion, storage management.
- Per-conflict resolution: select one conflict, inspect contributing placements, choose a resolution through a documented command. Don't invent resolution semantics; collect questions.
- Viewport debug overlays: Chunk Borders, Chunk Section Borders, Block Borders. Independent, off by default, stored as viewport preferences (not schematic document data).
  Explicitly distinguish and never conflate: 16x16 Minecraft world chunk columns; 16-block-high chunk sections; 16^3 domain/storage chunks; placement-local RenderChunk identities; world-space spatial indexing. Renderer chunk sizing changes must not change the visible Minecraft world grid.

Architecture/cost constraints: zero-cost static Cloudflare Workers deployment on free workers.dev; no mandatory hosted DB, login, paid API, paid GPU or cloud storage. Browser assets, IndexedDB, fetch and worker extraction stay out of the pure domain and format-adapter packages; enforce boundaries with automated lint (dependency-cruiser or similar) and keep package names consistent across repo, SUBSPEC-H, lint config and plans. SHA-1 verification of Mojang assets is an integrity check against trusted version metadata, not a security/authentication primitive.

# RESEARCH GATE (before writing any plan or implementing any slice)

Search the web for the current best way to do the task, by type: backend/logic (libraries, algorithms, format specs), frontend/UI (framework patterns, accessibility, voxel-rendering performance, state management), visual design (color schemes, WCAG contrast, dark/light, how comparable editors present similar tools). Prefer primary sources over blogs. Pin dependency versions from the registry and check licenses. Save question, sources (URL/commit/version, access date, section), decision and rejected options in docs/research/<slice></slice>.md. Source conflicts go to DOUBTS.md.

# FIXTURES AND EVIDENCE

Create a fixture manifest (docs/fixtures/manifest.md or json): filename, format, provenance, size, checksum, expected properties, test coverage. Never generate synthetic files and label them real. Required user-provided fixtures: Sponge v3 schematic; multi-region Litematica file; legacy .schematic; vanilla Minecraft structure NBT. Clarify the exact intended vanilla .nbt structure format before writing its acceptance tests. Tests needing missing fixtures are marked BLOCKED (awaiting fixture), never green.

# PHASE 3: AUDIT ALL PLANS (A-H)

Fresh-context audit per plan using your strongest model, never cheap models. Output docs/audits/<subspec></subspec>-round-N.md: severity-ranked (High/Med/Low) findings with evidence. Checklist: cross-spec contradictions; duplicate or undefined types; package boundary violations; acceptance criteria with no slice/test; wrong dependency order; math/format correctness vs primary sources; performance at 1M+ blocks, memory copies, worker transfer, security limits, determinism; UX gaps in the core workflow (import -> place -> combine -> resolve conflicts -> export, library, first-run asset load). Fix in place, re-audit; repeat until no High/Medium remain (max 3 rounds; leftovers to DOUBTS.md).

# PHASE 4: IMPLEMENT INCREMENTALLY

Order: H foundation, then A, B, C, D, E, F, G, then H release/deployment. For each slice: research gate -> failing tests first -> implement -> typecheck, lint, boundary check, all tests -> self-review diff against slice acceptance -> commit (one slice per commit: "feat(<pkg></pkg>): <deliverable></deliverable> [slice <id></id>]", test results in the log) -> update docs/agent/progress.md. Stage only files you authored.
After each SUBSPEC run a full audit: integration tests, acceptance traceability (green/red/BLOCKED with evidence), dependency boundaries, performance sanity; fix before moving on. A slice failing after 3 honest attempts is logged BLOCKED with evidence, a question goes to DOUBTS.md, and you continue with independent slices.

# PHASE 5: QUESTIONS, THEN FINAL FIX

When everything is implemented or blocked, STOP and give me: grouped numbered questions from DOUBTS.md (context, options, recommended default, evidence), the traceability table with red/BLOCKED items, and the audit summary. Wait for my answers. Then run the final fix pass, rerun full audit and tests, update docs, commit, and report what changed, test results and remaining risks.

# OUTPUT HABITS

Keep progress.md current (done, next, blockers). Short status updates, no padding. When unsure, add to DOUBTS.md instead of guessing.

# STATUS
- Phase 0 baseline: complete (baseline.md, skills-inventory.md, repo-state.md, progress.md all written and verified)
- Subplan-A: complete — 22 slices planned, implemented in packages/domain/, 21 tests pass, tsc clean
- Subplan-B: complete — 15 slices planned, implemented in packages/formats/, 14 tests pass, tsc clean
- Phase 1 conflicts: complete — all 7 known conflicts resolved and documented in docs/agent/phase1-conflicts.md
- Coordinate transform fixes: origin now used in localBlockToWorld/placementWorldBounds/localPointToLocal; rotateAboutPoint math corrected; all tests pass
- Phase 2 (H foundation): slice h-0 complete (pnpm workspaces), slice h-1 complete (Astro shell + React island), slice h-2 complete (Cloudflare Workers), slice h-3 complete (MCP companion, tsc clean); slices h-4 through h-7 pending (asset pipeline, IndexedDB, Web Workers, CI)
- Git: master @ 58f3fec, pushed to origin/master, working tree clean
