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

## D-2: Confirmation-token revocation on authority handover — **RESOLVED 2026-11-13**

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

## D-3: Confirmation-required threshold for "large" `export_schematic` — **RESOLVED 2026-11-13**

- **Context:** SPEC-F §6 lists `export_schematic` as confirmation-required but qualified as "(large exports)".
- **Question:** what is the threshold that makes an export "large"?
- **Options:** (a) reuse `maxChangedCells` (250,000 blocks) as the boundary; (b) any export that writes a file is
  confirmation-required; (c) treat all exports as immediate and drop the qualification.
- **Recommended default:** (a) reuse the existing block budget so there is one numeric vocabulary.
- **Evidence:** SPEC-F §6, §4.3 (the only numeric budgets defined).
- **Severity:** Low (affects one tool's gating only).

## D-4: SPEC-F §4.2 symlink-race requirement — **RESOLVED 2026-11-13**

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

## D-8: Agent Log panel one-click undo ownership — **RESOLVED 2026-11-13**

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

## D-9: SPEC-G §1.5 contrast ratios misstated + token fails AA on raised surface — **RESOLVED 2026-11-13**

- **Context:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §1.5 gives a design-token table with a
  claimed contrast ratio per token, "verified against `--color-bg-primary`". Computing them with the
  WCAG 2.2 relative-luminance formula (the implementation in `packages/ui/src/design-tokens.ts`)
  disagrees with **every** stated figure:
  text-primary claimed ~14:1 → **16.16:1**; text-secondary ~5.6 → **8.17**; border ~4.6 → **6.82**;
  border-hover ~5.8 → **9.27**; accent ~4.7 → **7.06**; error ~7.4 → **5.16**; warning ~10.7 → **10.13**;
  success ~10.2 → **8.53**. The stated bg-primary luminance (~0.018) measures **0.004**.
  No token fails because of this — the errors are conservative in direction — but the table cannot be
  trusted as a verification record.
- **Second, material:** §1.5 verifies only against `--color-bg-primary`, yet the UI has three
  surfaces. `--color-error` (`#ef4444`) used as **text** on `--color-bg-tertiary` (`#252525`, the
  hovered/active surface) measures **4.07:1**, below the 4.5:1 normal-text requirement. This is a real
  AA failure in a common state (error text on a hovered row).
- **Question for the spec owner:** (a) correct the §1.5 ratio column to the computed values and add
  the missing surface pairs; (b) additionally adopt a text-safe error token for raised surfaces.
- **What was implemented without waiting:** (b) only, additively. `--color-error` keeps its locked
  value and its 3:1 component use; the slice adds `--color-error-text: #f94e4e` (minimal lightening of
  the same hue, **4.55:1** on bg-tertiary, 5.76:1 on bg-primary) for error text. The spec table itself
  is untouched, and the failing pair is asserted as failing so it stays visible.
- **Evidence:** SPEC-G §1.5 (token table and its ratio column); computed with
  `relativeLuminance`/`contrastRatio` in `packages/ui/src/design-tokens.ts`; test
  `slice-g-3-design-tokens.test.ts` pins every measured value.
- **Severity:** Medium (a genuine AA failure in a normal interaction state).


