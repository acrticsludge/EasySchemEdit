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

## D-5: `MCP_LIMITS` and `LIMITS` duplicate the same six budget numbers

- **Context:** `destructive-protocol.ts` exports `MCP_LIMITS`; `failure-handling.ts` exports `LIMITS`
  with identical values, because a value import between the two files fails TS5097 (see D-6).
  Slice f-11's test asserts them in lockstep, which catches drift only when the test runs.
- **Options:** (a) move the constants into a module both re-export through `index.ts`; (b) set
  `allowImportingTsExtensions` + `noEmit` in the package tsconfig so f-11 can import f-7's values;
  (c) leave the duplication and rely on the lockstep test.
- **Recommended default:** (b) — it also removes the constraint that forced injection in slice f-10.
  (a) is the workaround if the tsconfig change is undesirable.
- **Evidence:** `docs/audits/subplan-f-round-2.md` PF-4.
- **Severity:** Medium (silent divergence in budget enforcement is a correctness risk, not a crash).

## D-6: Package tsconfigs disagree about `.ts` import specifiers, and `build` scripts disagree with them

- **Context:** `apps/mcp-companion/tsconfig.json` does NOT set `allowImportingTsExtensions`, so
  type-only `.ts` imports compile (elided) while value imports fail TS5097 — this forced the
  injected-sanitizer design in slice f-10. `packages/domain` and `packages/formats` DO set the flag,
  but the flag is only legal with `noEmit`/`emitDeclarationOnly`, and their `build: tsc` scripts pass
  neither, so a plain package build fails TS5096 while `tsc --noEmit` passes.
- **Options:** (a) set `allowImportingTsExtensions` + `noEmit` (or `emitDeclarationOnly`) everywhere
  and make the build scripts emit declarations only, bundling separately; (b) drop the flag
  everywhere and write extensionless imports; (c) leave as-is and keep injecting collaborators.
- **Recommended default:** (a) — one rule for all packages, and it matches how the tests already run
  (`node --experimental-strip-types` consumes `.ts` directly, so no emit is needed for tests).
- **Evidence:** `docs/audits/subplan-f-round-2.md` PF-5; `packages/domain/tsconfig.json` line 21 and
  `packages/domain/package.json` `build: tsc`.
- **Severity:** Medium (the current state means `pnpm build` is broken for two packages while
  `tsc --noEmit` is green — a confusing signal for anyone picking the repo up).

## D-7: Bridge port conflict — implementation 8765/8766 vs SPEC-F F2's 43127

- **Context:** SPEC-F F2 fixes the browser bridge at `127.0.0.1:43127` (configurable).
  `src/bridge.ts` listens on 8765 and `src/health.ts` on 8766, both written in Phase 2 before SPEC-F
  was reconciled.
- **Options:** (a) move both to 43127 (one port, `/healthz` served by the bridge); (b) bridge on
  43127 and health on 43128; (c) keep the current ports and amend SPEC-F F2.
- **Recommended default:** (a) — SPEC-F F2 is a locked decision; one port keeps CORS/origin policy
  in one place.
- **Evidence:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` F2 and §3.1; `src/bridge.ts:7`,
  `src/health.ts:7`; `docs/audits/subplan-f-round-2.md` PF-2.
- **Severity:** Low (nothing depends on the ports yet; both listeners are stubs).


