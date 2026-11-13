# DOUBTS — unresolved questions (GOAL.md §PHASE 5)

Format: `D-<n>` — context, options, recommended default, evidence, severity.
Items here are unresolved; nothing here may be implemented as a guess.

## D-1: Destructive classification drift between slice f-1 and SPEC-F §6 — **RESOLVED 2026-11-13**

- **Context:** `apps/mcp-companion/src/mutation-envelope.ts` (slice f-1, commit `17fd227`) exported
  `DESTRUCTIVE_OPERATIONS` keyed by *verb*: `delete, replace, paste, cut, fill, hollow, walls, bake, stack, move, transform`.
  `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §6 classifies *tool names*, and lists
  `paste_clipboard` under "Operations executing immediately (no confirmation)".
- **Resolved by:** removing the verb-keyed set (it had no importers). `CONFIRMATION_REQUIRED_TOOLS`
  in `destructive-protocol.ts` is now the single authority, matching SPEC-F §6 tool names. A comment
  at the removal site records why.
- **Severity was:** Medium.

## D-2: Confirmation-token revocation on authority handover

- **Context:** SPEC-F §2.1.1 defines explicit browser↔companion authority handover; §4.4 says an outstanding
  confirmation token is invalidated only by TTL expiry, one-time use, or "when project changes".
- **Question:** must outstanding confirmation tokens also be invalidated when the document authority hands over
  (so a token minted under browser authority cannot be applied under companion authority)?
- **Options:** (a) yes — handover revokes all outstanding tokens; (b) no — TTL is the only time bound; handover
  is transparent because the token binds project+revision+operation+args.
- **Recommended default:** (a) yes, revoke on handover — safest reading of "single document authority",
  and cheap to implement (`revokeAll()` on the protocol).
- **Evidence:** SPEC-F §2.1.1 (handover), §4.4 (token invalidation triggers). No line in either section
  mentions handover.
- **Severity:** Low (60-second exposure window, already bounded by revision binding).

## D-3: Confirmation-required threshold for "large" `export_schematic`

- **Context:** SPEC-F §6 lists `export_schematic` as confirmation-required but qualified as "(large exports)".
- **Question:** what is the threshold that makes an export "large"?
- **Options:** (a) reuse `maxChangedCells` (250,000 blocks) as the boundary; (b) any export that writes a file is
  confirmation-required; (c) treat all exports as immediate and drop the qualification.
- **Recommended default:** (a) reuse the existing block budget so there is one numeric vocabulary.
- **Evidence:** SPEC-F §6, §4.3 (the only numeric budgets defined).
- **Severity:** Low (affects one tool's gating only).

## D-4: SPEC-F §4.2 symlink-race requirement cannot be met inside the pure-TS companion package

- **Context:** SPEC-F §4.2 requires "Symlink race protection: open file with O_NOFOLLOW; re-verify
  canonical path after open" and "resolve symlinks and canonicalize paths before checking
  (race-safe: re-check after open)".
- **Conflict:** `docs/plans/subplan-f/index.md` constrains `@easyschemedit/mcp-companion` to pure
  TypeScript with no Node imports, so it cannot open file descriptors or pass `O_NOFOLLOW`. The
  module can canonicalize and check containment (CWE-59 remediation for the static case) but cannot
  close the check-to-open window.
- **Options:** (a) keep the module pure and make the post-open re-check an explicit host-adapter
  obligation (`ExportServices.canonicalizeAfterWrite`, documented in slice f-8 plan); (b) relax the
  package constraint to allow `node:fs`; (c) move export I/O into a separate non-pure package.
- **Recommended default:** (a) — implemented in slice f-8; the requirement is surfaced, not dropped.
  (c) is the cleaner long-term split if the host adapter ever proves awkward.
- **Evidence:** SPEC-F §4.2 (both sentences); CWE-59 remediation guidance on `realpath()` ordering
  (cwe.mitre.org, accessed 2026-11-13).
- **Severity:** Medium (a TOCTOU window exists between the containment check and the rename; it is
  exploitable only by a local attacker who can create symlinks inside an approved directory).

## D-5: `MCP_LIMITS` and `LIMITS` duplicate the same six budget numbers — **RESOLVED 2026-11-13**

- **Resolved by:** `failure-handling.ts` now imports `MCP_LIMITS` from `destructive-protocol.ts` and
  re-exports it as `LIMITS`, so there is one definition. The lockstep test in f-11 still asserts the
  six values, now against the single source.
- **Severity was:** Medium.

## D-6: Package tsconfigs disagree about `.ts` import specifiers, and `build` scripts disagree with them — **RESOLVED 2026-11-13**

- **Resolved by:** one rule everywhere — `allowImportingTsExtensions: true` + `noEmit: true` in all
  seven packages and `apps/mcp-companion`; `build` and `typecheck` both run `tsc --noEmit`; package
  entrypoints point at `src/index.ts` because no consumer imports `dist/` (verified: every
  cross-package import is a relative `.ts` path). All eight packages now pass the same command.
- **Consequence:** value imports across `src/` are legal again, which is what let D-5 collapse.
- **Severity was:** Medium.

## D-7: Bridge port conflict — implementation 8765/8766 vs SPEC-F F2's 43127 — **RESOLVED 2026-11-13**

- **Resolved by:** `src/bridge.ts` and `src/health.ts` (the two Phase-2 stubs) were deleted and
  replaced by one listener on `127.0.0.1:43127` (`src/listener.ts` → `src/bridge-router.ts`), which
  serves the tool routes, `/healthz`, `/readyz`, `/metrics` and the `/ws` event channel.
  Verified live: 27/27 end-to-end checks in `apps/mcp-companion/scripts/live-e2e.sh`.
- **Severity was:** Low.

## D-8: Which spec owns the Agent Log panel's one-click undo?

- **Context:** SPEC-G §6.4 lists the bottom panels including the Agent Log; SPEC-F §8.2 defines the
  Agent Log's one-click undo and restricts it: "One-click Undo control shown only when operation has
  valid undo entry, project revision still permits it, AND the associated operation is the latest
  undoable action". SPEC-G does not restate that restriction.
- **Question:** is the button a UI concern (SPEC-G renders it) or an MCP-companion concern (SPEC-F
  decides when it is enabled), and which side enforces the rule?
- **Options:** (a) SPEC-F is authoritative: the panel asks the companion's
  `agent-log.isUndoAvailable(entryId, currentRevision)` and hides the control when false; (b) the UI
  re-derives the rule locally from the log entry and the current revision; (c) both, with the UI
  hiding it and the companion rejecting a stale undo.
- **Recommended default:** (a) plus (c)'s defence in depth — the companion is the authority, and the
  button is only rendered from its answer. Slice g-0 already exports
  `AGENT_LOG_PANEL_UNDO_SOURCE` pointing at `agent-log.isUndoAvailable`.
- **Evidence:** SPEC-G §6.4; SPEC-F §8.2 and acceptance item 23.
- **Severity:** Low (a UI-only affordance, but a wrong reading would show an undo button that fails).


