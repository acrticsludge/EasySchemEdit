# Research Gate: Subplan-F (MCP Adapter)

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` (locked decisions F1–F15)
**Goal:** Local MCP companion server, stdio + localhost bridge, pairing token security, mutation envelope, dry-run/confirmation, idempotency, agent log, health endpoints.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| F-1 | @modelcontextprotocol/sdk: stdio server API, tool registration, input schemas with Zod | MCP SDK docs | Pending (not needed for f-0..f-7: type/logic slices) |
| F-2 | Chrome Private Network Access: PNA preflight, Access-Control-Request-Private-Network | Chrome PNA docs | Pending (f-2 / f-11 scope) |
| F-3 | WebSocket over localhost: origin validation, upgrade handshake | WebSocket spec | Pending (bridge hardening scope) |
| F-4 | Zod input/output schemas for every MCP tool | Zod docs | Pending (acceptance item 20) |
| F-5 | 256-bit pairing token: crypto.randomBytes(32), SHA-256 hash storage | Node crypto API | Pending (implementation wiring of f-2) |
| F-6 | Two-phase destructive protocol: preview/confirm, token binding, replay rules | MCP tool design practice + IETF idempotency draft | **Researched 2026-11-13** — decisions F-6.1..F-6.5 |
| F-7 | Idempotency semantics: duplicate requestId replayed; key reuse with a different payload | IETF `draft-ietf-httpapi-idempotency-key-header` | **Researched 2026-11-13** — decisions F-6.4 |
| F-8 | Approved-workspace export: traversal blocking, symlink resolution, overwrite protection, atomic writes | CWE-59 / CWE-22 canonicalization guidance; Node `path` semantics | **Researched 2026-11-13** — decisions F-8.1..F-8.5 |

## Decisions

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| F-1 | Companion binds to 127.0.0.1:43127 (loopback only) | SUBSPEC-F F2 | All interfaces (rejected: security) |
| F-2 | Pairing token: 256-bit, 5-minute TTL, one-time use, SHA-256 hash stored | SUBSPEC-F F1 | Plaintext storage (rejected: F12, F14) |
| F-3 | Confirmation token: 60-second TTL, one-time use, bound to project+revision+operation+args | SUBSPEC-F F5 | No confirmation (rejected: destructive ops need safety) |
| F-4 | Idempotency: 15-minute retention, 1,000 entries, 50 MiB, same DB transaction as document commit | SUBSPEC-F F6, §2.3.8 | Separate idempotency store (rejected: atomic commit) |
| F-5 | Single document authority: browser-live or headless local-file | SUBSPEC-F F9 | Shared authority (rejected: no split-brain) |
| F-6.1 | Destructive classification is taken from SUBSPEC-F §6 **tool names**, not verbs. Canonical destructive set: `delete_placement`, `bake_placements`, `fill_selection`, `replace_selection`, `delete_selection`, `cut_selection`, `hollow_selection`, `walls_selection`, `move_selection`, `export_schematic` (large exports only). Immediate set = §6 second list (`transform_placement`, `transform_placements`, `set_placement_visibility`, `set_placement_lock`, `rename_placement`, `duplicate_placement`, `set_origin`, `create_selection`, `clear_selection`, `select_placements`, `copy_selection`, `paste_clipboard`, `undo`, `redo`, `set_color_mode`) | SUBSPEC-F §6 "Operations requiring confirmation" / "Operations executing immediately" | The verb-name set drafted in slice f-1 `mutation-envelope.ts` (rejected as the authority: §6 classifies tools, and its `paste` entry would wrongly gate `paste_clipboard`) |
| F-6.2 | Confirmation token plaintext is returned to the caller once and only its hash is retained: the protocol stores `sha256(token)` plus the binding tuple (projectId, revision, operation, normalizedArgs). Hashing is injected (`hash(token): string`) so the package keeps zero Node/crypto imports | SUBSPEC-F §2.4, F12, F14; existing `ConfirmationToken.tokenHash` precedent in `src/mutation-envelope.ts` | Storing plaintext confirmation tokens (rejected: contradicts F12/F14 posture); importing `node:crypto` (rejected: package constraint) |
| F-6.3 | Apply does not re-transmit destructive arguments. `apply(projectId, requestId, confirmationToken, expectedRevision)` binds by `requestId`: the protocol stores the dry-run's operation + normalized args + bounds under `requestId`, and `apply` re-validates token hash, project, revision, operation and args against that stored binding before executing | SUBSPEC-F §6 step 2 ("submit the `confirmationToken` + `expectedRevision`"), §4.4 ("A confirmation must never authorize a different operation even with similar args") | Re-sending args on apply (rejected: apply signature is fixed by SPEC-F §6 step 2 and acceptance item 6); token + revision only (rejected: §4.4 forbids it) |
| F-6.4 | Idempotency ordering is auth → identity → **cache check → revision check** (F10). Reusing a `requestId` with a different normalized payload is rejected `IDEMPOTENCY_ARGS_MISMATCH`; replaying it with an identical payload returns the original committed result even after the revision has advanced | SUBSPEC-F F10, §3.3, §9; IETF: "If there is an attempt to reuse an idempotency key with a different request payload, the resource SHOULD reply with an HTTP 422 status code" (draft-ietf-httpapi-idempotency-key-header, accessed 2026-11-13) | Revision-check-before-cache (rejected: explicitly contradicted by F10); payload fingerprints as the *only* identity (rejected: `requestId` is the cache key per §2.5) |
| F-6.5 | Limits are data, not literals at call sites: `maxCandidateCells 1_000_000`, `maxChangedCells 250_000`, `configurableChangedLimit 1_000_000`, `absoluteSafetyLimit 5_000_000`, `maxRuntimeMs 5_000`, `maxMemoryBytes 256 MiB` | SUBSPEC-F §4.3, F4, F15 | Per-call literals (rejected: untestable drift) |
| F-8.1 | Path containment is decided by segment-wise comparison of the *canonicalized* candidate against the approved root, not by `startsWith(root)` on a joined string. A raw `startsWith` accepts `/approved-evil` for root `/approved`; segment comparison also removes the need to special-case a trailing separator | Owasp guidance: resolve then verify the result "stays within a permitted base directory using a `startsWith` check that includes `path.sep`" (blog.openreplay.com/prevent-path-traversal-nodejs, accessed 2026-11-13); CWE-22 remediation | `startsWith(root)` on the raw string (rejected: sibling-directory escape); pure normalization without containment re-check (rejected: `..` normalization alone does not bind to a root) |
| F-8.2 | Symlink escapes are caught by canonicalizing with `realpath` and re-verifying containment against the canonical approved root. Because `realpath` on the *target* resolves symlinks but the final component may not exist yet, the parent directory is canonicalized for new files | CWE-59 remediation: "Use a built-in path canonicalization function (such as realpath() in C) that produces the canonical version of the pathname, which effectively removes '..' sequences and symbolic links" (cwe.mitre.org CWE-59, accessed 2026-11-13); SPEC-F §4.2 "Resolve symlinks and canonicalize paths before checking" | String-only checks (rejected: CWE-59); canonicalizing only the root (rejected: an intermediate symlink inside the root still escapes) |
| F-8.3 | **Deviation from one sentence of SPEC-F §4.2.** §4.2 asks for canonicalization "race-safe: re-check after open" (`O_NOFOLLOW` where available). The pure-TS companion package cannot open file descriptors, so the race-free re-check is a *documented obligation on the host adapter*, surfaced as `canonicalizeAfterWrite` in the injected services; this module does not claim race-safety on its own | SPEC-F §4.2 (original requirement); package constraint "pure TypeScript, zero Node imports" | Importing `node:fs` here (rejected: breaks the package boundary); silently dropping the requirement (rejected: §4.2 is explicit) — tracked as DOUBTS.md D-4 |
| F-8.4 | Atomic write = write to a temp sibling, verify, then rename (SPEC-F §4.2). Ordering is enforced by the module: `writeTemp` → `sha256` verify → `rename` → `canonicalizeAfterWrite`. A verification failure never reaches rename, so a torn file can never replace a good one | SPEC-F §4.2 "Atomic writes: write to temp file, verify, then rename"; SPEC-F §7 "Report export validation and fidelity diagnostics" | Write-in-place (rejected: §4.2) |
| F-8.5 | Large exports: never inline in a tool result; return an artifact handle + safe relative path, and refuse when the configured bound is exceeded without dropping the export silently | SPEC-F §7 bullets 1-3; §6 gates `export_schematic` on size | Returning base64 blobs in results (rejected: §7 bullet 1 explicitly forbids it) |
| F-8.6 | The per-project list in §4.2 is a *restriction* on the global approved set, so the effective roots are the intersection of the two lists, not the project list alone. A project entry can therefore never grant access to a directory the user has not approved globally | SPEC-F §4.2 "Persisted in companion's per-user config file. Optional per-project restrictions." + §4.1 "No unauthenticated arbitrary filesystem access" | Project list replaces the global list (rejected: a project-level entry would silently widen file access) |

## Note: draft vs spec reconciliation (slice f-1 vs SUBSPEC-F §6)

`apps/mcp-companion/src/mutation-envelope.ts` (slice f-1, committed `17fd227`) declares
`DESTRUCTIVE_OPERATIONS = {delete, replace, paste, cut, fill, hollow, walls, bake, stack, move, transform}`.
SPEC-F §6 lists `paste_clipboard` as immediate. Reconciliation applied in slice f-7: the
authoritative classification lives in one place (`destructive-protocol.ts`, spec §6 tool
names) and the draft's verb-name set stays as-is to avoid silently rewriting an existing
decision. The discrepancy is logged as D-1 in `docs/agent/DOUBTS.md` for the Phase 5 question list.

## Open questions → DOUBTS.md

- D-1: `mutation-envelope.ts` verb-name destructive set vs SUBSPEC-F §6 tool-name classification (`paste` / `paste_clipboard`).
- D-2: SUBSPEC-F is silent on whether outstanding confirmation tokens must be revoked on authority handover.
- D-3: the "large" threshold that makes `export_schematic` confirmation-required.
- D-4: SPEC-F §4.2 asks for symlink-race safety via `O_NOFOLLOW`; the pure-TS companion package cannot open file descriptors, so race-freedom depends on the host adapter (see D-4 in DOUBTS.md).
