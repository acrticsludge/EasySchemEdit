# Subspec F — Slice f-7: Destructive Protocol

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.3 (DryRunResult), §2.4 (Confirmation token), §4.3 (Block-count limits), §4.4 (Confirmation tokens), §6 (Destructive operation protocol)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Domain types imported via relative paths.
**Research:** `docs/research/subplan-f.md` decisions F-6.1 … F-6.5.

## Goal

Implement the destructive operation protocol as executable logic (not types only): the two-phase dry-run → apply flow, the one-time 60s confirmation token bound to project + revision + operation + normalized args, SPEC-F §6 tool classification, and SPEC-F §4.3 block-count budgets.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/destructive-protocol.ts` | rewrite | `createDestructiveProtocol`, `normalizeArgs`, classification sets, `MCP_LIMITS`, result types |
| `apps/mcp-companion/__tests__/slice-f-7-destructive-protocol.test.ts` | create | 89 assertions across classification, dry-run, apply, normalization, budgets |
| `apps/mcp-companion/src/index.ts` | update | re-export the protocol surface |

## Types / APIs

```ts
export type DestructiveOperation = 'delete' | 'replace' | 'paste' | 'cut' | 'fill'
  | 'hollow' | 'walls' | 'bake' | 'stack' | 'move' | 'transform';   // verb vocabulary (compat)

export const CONFIRMATION_REQUIRED_TOOLS: ReadonlySet<string>;  // SPEC-F §6, 10 tool names
export const IMMEDIATE_TOOLS: ReadonlySet<string>;              // SPEC-F §6, 15 tool names
export const CONDITIONAL_CONFIRMATION_TOOLS: ReadonlySet<string>; // export_schematic (size-gated)
export const READ_TOOLS: ReadonlySet<string>;                   // SPEC-F §5.1

export const MCP_LIMITS: {
  maxCandidateCells: 1_000_000; maxChangedCells: 250_000; maxRuntimeMs: 5_000;
  maxMemoryBytes: 268_435_456; configurableChangedLimit: 1_000_000; absoluteSafetyLimit: 5_000_000;
};

export function normalizeArgs(value: unknown): string;  // canonical JSON: keys sorted at every depth

export type DryRunConfirmResult = PreviewResult & {
  requestId: string; projectId: string;
  expectedRevision: number; revision: number;
  wouldChange: number; requiresConfirmation: boolean;
  confirmationToken?: string; issuedAt: number; expiresAt: string;
  error?: ProtocolError;
};

export type ApplyResult = {
  requestId: string; projectId: string; success: boolean; applied: boolean;
  revision: number; changedCells: number; changedPlacements: string[];
  warnings: Diagnostic[]; error?: ProtocolError;
};

export type DestructiveProtocolServices = {
  getRevision(projectId: string): number;
  preview(projectId, operation, args, expectedRevision): PreviewResult;
  execute(projectId, operation, args): ExecutionResult;   // shared command bus (SPEC-F §5.5)
};

export function createDestructiveProtocol(options: DestructiveProtocolOptions): DestructiveProtocol;
```

`DestructiveProtocol` methods: `isDestructive`, `requiresConfirmation`, `dryRun(projectId, operation, args, expectedRevision, options?, requestId?)`, `apply(projectId, requestId, confirmationToken, expectedRevision, options?)`, `outstandingTokenCount`, `revokeAll`.

Key rules:

- Dry-run never mutates. Confirmation-required operations return a one-time 60s token bound to project + revision + operation + normalized args (§4.4); immediate operations return no token.
- Apply requires the token + `expectedRevision`; the operation and args are the ones bound at dry-run time (§6 step 2). A stale revision, an expired/used/forged token, or a cross-project token is rejected with a stable error code.
- Idempotency ordering is cache check → revision check (F10); a duplicate `requestId` with identical args returns the original result, with different args it is rejected `IDEMPOTENCY_ARGS_MISMATCH`.
- A rejected command leaves the token unused so the caller can retry once the blocking condition clears.
- Clock, token minting and execution are injected; plaintext tokens are held only for their TTL so a replayed `requestId` can return the original result.

## Acceptance criteria

1. `DestructiveOperation` is the verb union (delete, replace, paste, cut, fill, hollow, walls, bake, stack, move, transform) — retained from the f-7 draft.
2. Classification is the SPEC-F §6 tool-name lists: 10 confirmation-required, 15 immediate, no overlap.
3. `DryRunConfirmResult` carries requestId, projectId, expectedRevision, revision, wouldChange, requiresConfirmation, confirmationToken?, issuedAt, expiresAt, warnings, error?.
4. `ApplyResult` carries requestId, projectId, success, applied, revision, changedCells, changedPlacements, warnings, error?.
5. `DestructiveProtocol` exposes dryRun, apply, isDestructive, requiresConfirmation, outstandingTokenCount, revokeAll.
6. Destructive operations default to dry-run and no mutation happens before a successful apply.
7. Confirmation token: 60s TTL, one-time use, bound to project + revision + operation + normalized args; duplicate requestId returns the original result.
8. `MCP_LIMITS` matches §4.3: 1,000,000 candidate / 250,000 default changed / 1,000,000 configurable / 5,000,000 absolute.
9. `export_schematic` requires confirmation only above the default changed-cell budget (§6 "large exports"; threshold question D-3).

## Tests

`apps/mcp-companion/__tests__/slice-f-7-destructive-protocol.test.ts` — in-memory service double (injected clock, counter token generator, recorded executions).

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-7-destructive-protocol.test.ts
```

Result (2026-11-13): `Passed: 89  Failed: 0`

Covers: §6 classification and set disjointness; dry-run performs no mutation; token TTL 60s; stale-revision and over-budget dry-run refusals issue no token; apply executes the bound operation/args once and increments the revision; one-time use; expiry; project/revision/operation binding; forged token; orphan apply; duplicate requestId replay (including after a revision advance); args-mismatch reuse; canonical-args normalization; explicit limit increase vs the non-overridable absolute limit; size-gated export.

## Verification

- `node <ts> --noEmit` for `apps/mcp-companion`: exit 0 (no errors)
- `node --experimental-strip-types __tests__/slice-f-7-destructive-protocol.test.ts`: exit 0

