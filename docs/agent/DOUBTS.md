# DOUBTS — unresolved questions (GOAL.md §PHASE 5)

Format: `D-<n>` — context, options, recommended default, evidence, severity.
Items here are unresolved; nothing here may be implemented as a guess.

## D-1: Destructive classification drift between slice f-1 and SPEC-F §6

- **Context:** `apps/mcp-companion/src/mutation-envelope.ts` (slice f-1, commit `17fd227`) exports
  `DESTRUCTIVE_OPERATIONS` keyed by *verb*: `delete, replace, paste, cut, fill, hollow, walls, bake, stack, move, transform`.
  `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §6 classifies *tool names*, and lists
  `paste_clipboard` under "Operations executing immediately (no confirmation)".
- **Conflict:** the verb set gates `paste`; §6 says `paste_clipboard` needs no confirmation.
- **Options:** (a) leave both, with `destructive-protocol.ts` (SPEC §6 tool names) authoritative — current
  state, drift documented here; (b) delete the verb set from `mutation-envelope.ts` and re-export the
  tool-name set; (c) keep verb set as a lowercase alias view of the tool set.
- **Recommended default:** (b) after the user confirms — one name space only. Not applied unilaterally
  because GOAL.md forbids silently changing an existing decision.
- **Evidence:** SPEC-F §6 (both lists, quoted in `docs/research/subplan-f.md` decision F-6.1); `mutation-envelope.ts` lines 87-101.
- **Severity:** Medium (misclassifies exactly one tool: `paste_clipboard`).

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

