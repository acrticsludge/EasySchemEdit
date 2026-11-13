// apps/mcp-companion/__tests__/slice-f-7-destructive-protocol.test.ts
// Slice f-7 tests: destructive operation protocol (SUBSPEC-F §2.2.2, §4.4, §6).
// Run: node --experimental-strip-types __tests__/slice-f-7-destructive-protocol.test.ts
// Pure TypeScript, no test framework — same assert harness as slices c/d/e.

import {
  createDestructiveProtocol,
  normalizeArgs,
  CONFIRMATION_REQUIRED_TOOLS,
  IMMEDIATE_TOOLS,
  DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
  MCP_LIMITS,
  type DestructiveProtocolServices,
  type PreviewResult,
} from '../src/destructive-protocol.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Test double: injectable services (no crypto, no document) ──────────────

type Harness = {
  services: DestructiveProtocolServices;
  setRevision: (r: number) => void;
  executeCalls: Array<{ projectId: string; operation: string; args: Record<string, unknown> }>;
  previewCalls: number;
};

function makeHarness(opts?: {
  revision?: number;
  wouldChange?: number;
  executeOk?: boolean;
  executeErrorCode?: string;
}): Harness {
  let revision = opts?.revision ?? 7;
  const executeCalls: Array<{ projectId: string; operation: string; args: Record<string, unknown> }> = [];
  const h: Harness = {
    executeCalls,
    previewCalls: 0,
    setRevision: (r: number) => {
      revision = r;
    },
    services: {
      getRevision: (_projectId: string) => revision,
      preview: (
        _projectId: string,
        operation: string,
        args: Record<string, unknown>,
        _expectedRevision: number,
      ): PreviewResult => {
        h.previewCalls++;
        return {
          operation,
          affectedPlacementIds: ['pl-1'],
          affectedBounds: [{ min: [0, 0, 0], max: [3, 3, 3] }],
          candidateCells: 64,
          changedCells: opts?.wouldChange ?? 64,
          resultingNonAirCount: opts?.wouldChange ?? 64,
          conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
          estimatedUndoBytes: 1024,
          warnings: [],
        };
      },
      execute: (projectId: string, operation: string, args: Record<string, unknown>) => {
        executeCalls.push({ projectId, operation, args });
        if (opts?.executeOk === false) {
          return {
            success: false,
            revision,
            changedCells: 0,
            changedPlacements: [],
            warnings: ['command bus rejected'],
            errorCode: opts.executeErrorCode ?? 'LOCKED_PLACEMENT',
            errorMessage: 'placement is locked',
          };
        }
        revision = revision + 1;
        return {
          success: true,
          revision,
          changedCells: opts?.wouldChange ?? 64,
          changedPlacements: ['pl-1'],
          warnings: [],
        };
      },
    },
  };
  return h;
}

let clock = 1_000_000;
const now = () => clock;

function newProtocol(h: Harness, overrides?: Record<string, number>) {
  return createDestructiveProtocol({
    services: h.services,
    now,
    generateToken: (() => {
      let n = 0;
      return () => `token-${++n}`;
    })(),
    hashToken: (t: string) => `h(${t})`,
    ...overrides,
  });
}

console.log('--- Slice f-7: destructive classification (SPEC-F §6) ---');

// Criterion 22 + F-6.1: classification is the SPEC-F §6 tool-name lists, verbatim.
{
  const required = [
    'delete_placement',
    'bake_placements',
    'fill_selection',
    'replace_selection',
    'delete_selection',
    'cut_selection',
    'hollow_selection',
    'walls_selection',
    'move_selection',
    'export_schematic',
  ];
  const immediate = [
    'transform_placement',
    'transform_placements',
    'set_placement_visibility',
    'set_placement_lock',
    'rename_placement',
    'duplicate_placement',
    'set_origin',
    'create_selection',
    'clear_selection',
    'select_placements',
    'copy_selection',
    'paste_clipboard',
    'undo',
    'redo',
    'set_color_mode',
  ];
  assertEqual(CONFIRMATION_REQUIRED_TOOLS.size, required.length, 'f-7.22: 10 confirmation-required tools');
  assertEqual(IMMEDIATE_TOOLS.size, immediate.length, 'f-7.22: 15 immediate tools');
  assert(
    required.every((t) => CONFIRMATION_REQUIRED_TOOLS.has(t)),
    'f-7.22: confirmation-required set contains every SPEC-F §6 tool',
  );
  assert(
    immediate.every((t) => IMMEDIATE_TOOLS.has(t)),
    'f-7.22: immediate set contains every SPEC-F §6 tool',
  );
  assert(
    required.every((t) => !IMMEDIATE_TOOLS.has(t)),
    'f-7.22: no tool appears in both sets',
  );

  const h = makeHarness();
  const p = newProtocol(h);
  assert(p.isDestructive('delete_placement') === true, 'f-7.22: delete_placement is destructive');
  assert(p.isDestructive('fill_selection') === true, 'f-7.22: fill_selection is destructive');
  assert(
    p.isDestructive('paste_clipboard') === false,
    'f-7.22: paste_clipboard is NOT destructive (SPEC-F §6 immediate)',
  );
  assert(p.isDestructive('transform_placement') === false, 'f-7.22: transform_placement is immediate');
  assert(p.isDestructive('undo') === false, 'f-7.22: undo is immediate');
  assert(p.isDestructive('no_such_tool') === false, 'f-7.22: unknown tool is not destructive');
}

console.log('--- Slice f-7: dry-run first (no mutation) ---');

// Criterion 5: destructive operations default to dry-run and never execute.
{
  const h = makeHarness({ revision: 7 });
  const p = newProtocol(h);
  const r = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 7);

  assertEqual(r.projectId, 'proj-1', 'f-7.6: dry-run echoes projectId');
  assertEqual(r.revision, 7, 'f-7.6: dry-run echoes expected revision');
  assertEqual(r.wouldChange, 64, 'f-7.6: dry-run reports wouldChange cells');
  assert(r.confirmationToken !== undefined && r.confirmationToken !== '', 'f-7.6: destructive dry-run returns a confirmation token');
  assert(r.requiresConfirmation === true, 'f-7.6: dry-run flags confirmation required (destructive)');
  assertEqual(h.executeCalls.length, 0, 'f-7.6: dry-run performs no mutation');
  assertEqual(h.previewCalls, 1, 'f-7.6: dry-run computes the preview exactly once');

  // Criterion 7 / F-5: 60-second TTL, exposed as an absolute expiry.
  assertEqual(
    Date.parse(r.expiresAt) - r.issuedAt,
    DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
    'f-7.7: confirmation token TTL is 60000ms',
  );
  assertEqual(DEFAULT_CONFIRMATION_TOKEN_TTL_MS, 60000, 'f-7.7: TTL constant is 60s');
  assert(
    r.affectedBounds.length === 1 && r.affectedBounds[0].min[0] === 0,
    'f-7.6: dry-run reports affected bounds',
  );
}

// Non-destructive operations do not require confirmation (still dry-runnable).
{
  const h = makeHarness({ revision: 3 });
  const p = newProtocol(h);
  const r = p.dryRun('proj-1', 'transform_placement', { placementId: 'pl-1' }, 3);

  assert(r.requiresConfirmation === false, 'f-7.22: immediate op needs no confirmation');
  assertEqual(r.confirmationToken, undefined, 'f-7.22: immediate op gets no confirmation token');
  assertEqual(h.executeCalls.length, 0, 'f-7.22: non-destructive dry-run also does not mutate');
}

// Stale revision on dry-run is rejected and never previewed.
{
  const h = makeHarness({ revision: 9 });
  const p = newProtocol(h);
  const r = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 7);

  assertEqual(r.requiresConfirmation, false, 'f-7: stale dry-run is refused');
  assertEqual(r.error?.code, 'STALE_REVISION', 'f-7: stale dry-run returns STALE_REVISION');
  assertEqual(r.error?.currentRevision, 9, 'f-7: stale dry-run reports current revision');
  assertEqual(h.previewCalls, 0, 'f-7: stale dry-run does not compute a preview');
  assertEqual(r.confirmationToken, undefined, 'f-7: stale dry-run issues no token');
}

// Over-budget dry-run is refused without a token.
{
  const h = makeHarness({ revision: 1, wouldChange: MCP_LIMITS.maxChangedCells + 1 });
  const p = newProtocol(h);
  const r = p.dryRun('proj-1', 'fill_selection', { state: 'minecraft:stone' }, 1);

  assertEqual(r.error?.code, 'OVER_LIMIT', 'f-7: over-budget dry-run returns OVER_LIMIT');
  assertEqual(r.confirmationToken, undefined, 'f-7: over-budget dry-run issues no token');
}

console.log('--- Slice f-7: apply ---');

// Criterion 6: apply requires the confirmation token + expectedRevision.
{
  const h = makeHarness({ revision: 7 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 7);
  const applied = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 7);

  assertEqual(applied.applied, true, 'f-7.6: valid token applies');
  assertEqual(applied.success, true, 'f-7.6: apply reports success');
  assertEqual(applied.revision, 8, 'f-7.6: apply increments the revision');
  assertEqual(applied.changedCells, 64, 'f-7.6: apply reports changed cells');
  assertEqual(applied.changedPlacements.length, 1, 'f-7.6: apply reports changed placements');
  assertEqual(h.executeCalls.length, 1, 'f-7.6: apply executes the operation once');
  assertEqual(h.executeCalls[0]?.operation, 'delete_placement', 'f-7.6: apply executes the bound operation');
  assertEqual(
    (h.executeCalls[0]?.args as { placementId?: string })?.placementId,
    'pl-1',
    'f-7.6: apply executes the bound args',
  );
}

// Criterion 7: token is one-time use.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'fill_selection', { state: 'minecraft:stone' }, 1);
  const token = dry.confirmationToken as string;
  const first = p.apply('proj-1', dry.requestId, token, 1);
  const second = p.apply('proj-1', 'other-request', token, 1);

  assertEqual(first.applied, true, 'f-7.7: first apply succeeds');
  assertEqual(second.applied, false, 'f-7.7: reused token is refused');
  assertEqual(second.error?.code, 'TOKEN_ALREADY_USED', 'f-7.7: reused token returns TOKEN_ALREADY_USED');
  assertEqual(h.executeCalls.length, 1, 'f-7.7: reused token does not execute twice');
}

// Criterion 7: token expires after 60s of virtual time.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_selection', {}, 1);
  clock += DEFAULT_CONFIRMATION_TOKEN_TTL_MS + 1;
  const late = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 1);

  assertEqual(late.applied, false, 'f-7.7: expired token is refused');
  assertEqual(late.error?.code, 'TOKEN_EXPIRED', 'f-7.7: expired token returns TOKEN_EXPIRED');
  assertEqual(late.error?.suggestedAction !== undefined, true, 'f-7.7: expiry suggests a new dry-run');
  assertEqual(h.executeCalls.length, 0, 'f-7.7: expired token does not execute');
}

// Bound to project: a token minted for one project cannot be applied to another.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const wrong = p.apply('proj-2', dry.requestId, dry.confirmationToken as string, 1);

  assertEqual(wrong.applied, false, 'f-7.7: token is bound to the project');
  assertEqual(wrong.error?.code, 'PROJECT_MISMATCH', 'f-7.7: cross-project apply returns PROJECT_MISMATCH');
  assertEqual(h.executeCalls.length, 0, 'f-7.7: cross-project apply does not execute');
}

// Wrong token value is refused.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const bad = p.apply('proj-1', dry.requestId, 'not-the-token', 1);

  assertEqual(bad.applied, false, 'f-7.7: forged token is refused');
  assertEqual(bad.error?.code, 'TOKEN_INVALID', 'f-7.7: forged token returns TOKEN_INVALID');
}

// Bound to revision: the document must not move between dry-run and apply.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  h.setRevision(2);
  const stale = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 2);

  assertEqual(stale.applied, false, 'f-7.7: token is bound to the revision');
  assertEqual(stale.error?.code, 'TOKEN_REVISION_MISMATCH', 'f-7.7: moved revision returns TOKEN_REVISION_MISMATCH');
  assertEqual(stale.error?.currentRevision, 2, 'f-7.7: token revision mismatch reports current revision');
}

// Apply without a prior dry-run is refused.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const orphan = p.apply('proj-1', 'never-dry-run', 'token-1', 1);

  assertEqual(orphan.applied, false, 'f-7.6: apply without dry-run is refused');
  assertEqual(orphan.error?.code, 'DRY_RUN_REQUIRED', 'f-7.6: orphan apply returns DRY_RUN_REQUIRED');
  assertEqual(h.executeCalls.length, 0, 'f-7.6: orphan apply does not execute');
}

// Criterion 7: apply with a stale expectedRevision vs the document is refused.
{
  const h = makeHarness({ revision: 5 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 5);
  h.setRevision(6);
  const res = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 5);

  assertEqual(res.applied, false, 'f-7.7: stale expectedRevision is refused');
  assertEqual(res.error?.code, 'STALE_REVISION', 'f-7.7: stale expectedRevision returns STALE_REVISION');
  assertEqual(res.error?.currentRevision, 6, 'f-7.7: stale expectedRevision reports the current revision');
}

// Criterion 7 / F-10: duplicate requestId replays the original result, no re-execution.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const token = dry.confirmationToken as string;
  const first = p.apply('proj-1', dry.requestId, token, 1);
  const replay = p.apply('proj-1', dry.requestId, token, 1);

  assertEqual(replay.applied, true, 'f-7.9: duplicate requestId replays the original result');
  assertEqual(replay.revision, first.revision, 'f-7.9: replay returns the original revision');
  assertEqual(replay.changedCells, first.changedCells, 'f-7.9: replay returns the original changed cells');
  assertEqual(h.executeCalls.length, 1, 'f-7.9: duplicate requestId does not re-execute');
}

// F-10: replay wins even after the revision advanced (cache check before revision check).
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const first = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 1);
  h.setRevision(first.revision + 3);
  const replay = p.apply('proj-1', dry.requestId, 'ignored-on-replay', 99);

  assertEqual(replay.applied, true, 'f-7.9: replay is served from the idempotency cache after revision advance');
  assertEqual(replay.revision, first.revision, 'f-7.9: late replay returns the original revision');
  assertEqual(h.executeCalls.length, 1, 'f-7.9: late replay does not re-execute');
}

// §9: requestId reused with different args is rejected (checked at the dry-run step, before the
// revision guard, per F10 ordering).
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 1);
  const reuse = p.dryRun(
    'proj-1',
    'delete_placement',
    { placementId: 'pl-2' },
    h.services.getRevision('proj-1'),
    undefined,
    dry.requestId,
  );

  assertEqual(reuse.error?.code, 'IDEMPOTENCY_ARGS_MISMATCH', 'f-7.9: requestId reuse with different args is rejected');
  assertEqual(h.executeCalls.length, 1, 'f-7.9: args-mismatch reuse does not execute');
}

// Idempotent dry-run: same requestId + same args returns the same token.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const a = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const b = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1, undefined, a.requestId);

  assertEqual(b.confirmationToken, a.confirmationToken, 'f-7.9: idempotent dry-run returns the same token');
  assertEqual(b.requestId, a.requestId, 'f-7.9: idempotent dry-run keeps the requestId');
}

// Command-bus failure surfaces as a failed apply with the bus error code.
{
  const h = makeHarness({ revision: 1, executeOk: false, executeErrorCode: 'LOCKED_PLACEMENT' });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  const res = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 1);

  assertEqual(res.applied, false, 'f-7: rejected command reports applied=false');
  assertEqual(res.success, false, 'f-7: rejected command reports success=false');
  assertEqual(res.error?.code, 'LOCKED_PLACEMENT', 'f-7: rejected command surfaces the bus error code');
  assertEqual(res.revision, 1, 'f-7: rejected command leaves the revision unchanged');
}

console.log('--- Slice f-7: argument normalization ---');

// §4.4: binding uses canonicalized args, so key order cannot change the binding.
{
  assertEqual(
    normalizeArgs({ b: 1, a: 2 }),
    normalizeArgs({ a: 2, b: 1 }),
    'f-7.7: normalized args are key-order independent',
  );
  assertEqual(
    normalizeArgs({ outer: { z: 1, a: [3, { y: 1, x: 2 }] } }),
    '{"outer":{"a":[3,{"x":2,"y":1}],"z":1}}',
    'f-7.7: normalized args sort nested keys deterministically',
  );
}

// A token minted for one arg set must not authorize a different arg set on the same requestId.
{
  const h = makeHarness({ revision: 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-1' }, 1);
  // Same requestId, different args → mismatch, and the original token is not returned.
  const other = p.dryRun('proj-1', 'delete_placement', { placementId: 'pl-9' }, 1, undefined, dry.requestId);
  assertEqual(other.error?.code, 'IDEMPOTENCY_ARGS_MISMATCH', 'f-7.7: token cannot be re-bound to different args');
  assertEqual(
    other.confirmationToken === undefined || other.confirmationToken === dry.confirmationToken,
    true,
    'f-7.3: rejected dry-run never mints a second token for the same requestId',
  );

  // A different operation on the same requestId is also a mismatch.
  const otherOp = p.dryRun('proj-1', 'bake_placements', { placementId: 'pl-1' }, 1, undefined, dry.requestId);
  assertEqual(otherOp.error?.code, 'IDEMPOTENCY_ARGS_MISMATCH', 'f-7.7: operation is part of the binding');
}

console.log('--- Slice f-7: confirmation-required overrides ---');

// §4.3: an explicit limit increase is the only way past the default changed-cell budget.
{
  const h = makeHarness({ revision: 1, wouldChange: MCP_LIMITS.maxChangedCells + 1 });
  const p = newProtocol(h);
  const dry = p.dryRun(
    'proj-1',
    'fill_selection',
    { state: 'minecraft:stone' },
    1,
    { allowLimitIncrease: true },
  );

  assertEqual(dry.error, undefined, 'f-7: explicit limit increase permits an over-default dry-run');
  assert(dry.confirmationToken !== undefined, 'f-7: over-default dry-run issues a token when allowed');
  assert(
    dry.warnings.some((w) => w.message.includes('limit')),
    'f-7: over-default dry-run warns about the increased limit',
  );

  const applied = p.apply('proj-1', dry.requestId, dry.confirmationToken as string, 1, {
    allowLimitIncrease: true,
  });
  assertEqual(applied.applied, true, 'f-7: apply honours the explicit limit increase');
}

// Absolute safety limit is never overridable.
{
  const h = makeHarness({ revision: 1, wouldChange: MCP_LIMITS.absoluteSafetyLimit + 1 });
  const p = newProtocol(h);
  const dry = p.dryRun('proj-1', 'fill_selection', { state: 'minecraft:stone' }, 1, {
    allowLimitIncrease: true,
  });
  assertEqual(dry.error?.code, 'OVER_LIMIT', 'f-7: absolute safety limit is not overridable');
  assertEqual(
    MCP_LIMITS.absoluteSafetyLimit,
    5_000_000,
    'f-7.8: absolute safety limit is 5,000,000 (SPEC-F §4.3)',
  );
}

// "Large export" gating (D-3): export_schematic is confirmation-required only above the block budget.
{
  const small = makeHarness({ revision: 1, wouldChange: 100 });
  const pSmall = newProtocol(small);
  const rSmall = pSmall.dryRun('proj-1', 'export_schematic', { format: '.litematic' }, 1);
  assertEqual(rSmall.requiresConfirmation, false, 'f-7.22: small export needs no confirmation');

  const big = makeHarness({ revision: 1, wouldChange: MCP_LIMITS.maxChangedCells + 5 });
  const pBig = newProtocol(big);
  const rBig = pBig.dryRun('proj-1', 'export_schematic', { format: '.litematic' }, 1, {
    allowLimitIncrease: true,
  });
  assertEqual(rBig.requiresConfirmation, true, 'f-7.22: large export requires confirmation');
}

console.log('\n=== Slice f-7 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
