// apps/mcp-companion/__tests__/slice-f-11-failure-handling.test.ts
// Slice f-11 tests: centralized failure handling (SUBSPEC-F §4.3, §9, §10.2 items 8/12/19).
// Run: node --experimental-strip-types __tests__/slice-f-11-failure-handling.test.ts
// Pure TypeScript, no test framework — same assert harness as slices c/d/e/f-7..f-10.

import {
  checkBudgets,
  classifyFailure,
  estimateUndoBytes,
  makeMcpError,
  MCP_ERROR_CODES,
  BYTES_PER_CHANGED_CELL,
  type FailureCondition,
} from '../src/failure-handling.ts';
import { MCP_LIMITS } from '../src/destructive-protocol.ts';

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

console.log('--- Slice f-11: error code registry (§9) ---');

{
  // One stable code per §9 row; the taxonomy is closed.
  const expectedRows: Array<[FailureCondition, string]> = [
    ['invalid_pairing_token', MCP_ERROR_CODES.INVALID_PAIRING_TOKEN],
    ['invalid_confirmation_token', MCP_ERROR_CODES.TOKEN_INVALID],
    ['confirmation_token_already_used', MCP_ERROR_CODES.TOKEN_ALREADY_USED],
    ['confirmation_token_revision_mismatch', MCP_ERROR_CODES.TOKEN_REVISION_MISMATCH],
    ['project_mismatch', MCP_ERROR_CODES.PROJECT_MISMATCH],
    ['dry_run_required', MCP_ERROR_CODES.DRY_RUN_REQUIRED],
    ['execution_failed', MCP_ERROR_CODES.EXECUTION_FAILED],
    ['stale_revision', MCP_ERROR_CODES.STALE_REVISION],
    ['expired_confirmation_token', MCP_ERROR_CODES.TOKEN_EXPIRED],
    ['duplicate_request_id_args_mismatch', MCP_ERROR_CODES.IDEMPOTENCY_ARGS_MISMATCH],
    ['over_limit', MCP_ERROR_CODES.OVER_LIMIT],
    ['locked_placement', MCP_ERROR_CODES.LOCKED_PLACEMENT],
    ['path_traversal', MCP_ERROR_CODES.PATH_TRAVERSAL],
    ['dns_rebinding', MCP_ERROR_CODES.DNS_REBINDING],
    ['worker_crash', MCP_ERROR_CODES.WORKER_CRASH],
    ['browser_disconnect', MCP_ERROR_CODES.BROWSER_DISCONNECTED],
    ['document_unavailable', MCP_ERROR_CODES.DOCUMENT_UNAVAILABLE],
    ['cancelled', MCP_ERROR_CODES.CANCELLED],
    ['malformed_input', MCP_ERROR_CODES.VALIDATION_FAILED],
  ];

  for (const [condition, code] of expectedRows) {
    const err = classifyFailure(condition);
    assertEqual(err.code, code, `f-11: §9 row "${condition}" maps to ${code}`);
    assert(err.message.length > 0, `f-11: §9 row "${condition}" carries a message`);
  }

  // Every registered code is reachable: no dead entries in the closed taxonomy.
  const reachable = new Set(expectedRows.map(([, code]) => code));
  for (const code of Object.values(MCP_ERROR_CODES)) {
    assert(reachable.has(code), `f-11: registry code ${code} is reachable from a §9 condition`);
  }

  // An unrecognised condition must not silently invent a code.
  const unknown = classifyFailure('not-a-real-condition' as FailureCondition);
  assertEqual(unknown.code, MCP_ERROR_CODES.VALIDATION_FAILED, 'f-11: unknown condition falls back to VALIDATION_FAILED');
}

console.log('--- Slice f-11: suggested actions ---');

{
  const stale = classifyFailure('stale_revision', { currentRevision: 9 });
  assertEqual(stale.code, MCP_ERROR_CODES.STALE_REVISION, 'f-11.9: stale revision code');
  assertEqual(stale.currentRevision, 9, 'f-11.9: stale revision reports the current revision');
  assert(typeof stale.suggestedAction === 'string' && stale.suggestedAction.length > 0, 'f-11.9: stale revision suggests an action');

  const expired = classifyFailure('expired_confirmation_token');
  assert(expired.suggestedAction?.toLowerCase().includes('dry-run'), 'f-11.9: expiry suggests a new dry-run');

  const mismatch = classifyFailure('duplicate_request_id_args_mismatch');
  assertEqual(mismatch.code, MCP_ERROR_CODES.IDEMPOTENCY_ARGS_MISMATCH, 'f-11.9: args mismatch code');
  assert(mismatch.suggestedAction?.toLowerCase().includes('requestid'), 'f-11.9: args mismatch suggests a new requestId');

  const locked = classifyFailure('locked_placement', { lockedPlacements: ['pl-1', 'pl-2'] });
  assertEqual(locked.code, MCP_ERROR_CODES.LOCKED_PLACEMENT, 'f-11.9: locked placement code');
  assertEqual(locked.details?.lockedCount, 2, 'f-11.9: locked placement reports the count');
  assertEqual(
    JSON.stringify(locked.details?.lockedPlacements),
    JSON.stringify(['pl-1', 'pl-2']),
    'f-11.9: locked placement lists the offending ids',
  );

  const traversal = classifyFailure('path_traversal');
  assertEqual(traversal.code, MCP_ERROR_CODES.PATH_TRAVERSAL, 'f-11.9: traversal code');
  const rebinding = classifyFailure('dns_rebinding');
  assertEqual(rebinding.code, MCP_ERROR_CODES.DNS_REBINDING, 'f-11.9: DNS rebinding code');

  const crash = classifyFailure('worker_crash');
  assertEqual(crash.code, MCP_ERROR_CODES.WORKER_CRASH, 'f-11.9: worker crash code');
  assertEqual(crash.currentRevision, undefined, 'f-11.9: a worker crash reports no revision change');
  assert(
    (crash.message + (crash.suggestedAction ?? '')).toLowerCase().includes('discard') ||
      (crash.message + (crash.suggestedAction ?? '')).toLowerCase().includes('retry'),
    'f-11.9: a worker crash says the partial result is discarded or retryable',
  );

  const disconnect = classifyFailure('browser_disconnect', {});
  assertEqual(disconnect.code, MCP_ERROR_CODES.BROWSER_DISCONNECTED, 'f-11.9: browser disconnect code');

  // makeMcpError keeps caller-supplied extras without dropping the registry message.
  const custom = makeMcpError(MCP_ERROR_CODES.OVER_LIMIT, 'custom message', { currentRevision: 3 });
  assertEqual(custom.message, 'custom message', 'f-11.13: makeMcpError honours the supplied message');
  assertEqual(custom.currentRevision, 3, 'f-11.13: makeMcpError keeps extras');
}

console.log('--- Slice f-11: §4.3 budget arithmetic ---');

{
  assertEqual(MCP_LIMITS.maxChangedCells, 250_000, 'f-11.8: default changed-cell budget is 250,000');
  assertEqual(MCP_LIMITS.configurableChangedLimit, 1_000_000, 'f-11.8: configurable limit is 1,000,000');
  assertEqual(MCP_LIMITS.absoluteSafetyLimit, 5_000_000, 'f-11.8: absolute safety limit is 5,000,000');
  assertEqual(MCP_LIMITS.maxCandidateCells, 1_000_000, 'f-11.19: candidate-cell limit is 1,000,000');
  assertEqual(MCP_LIMITS.maxRuntimeMs, 5_000, 'f-11.19: runtime limit is 5,000 ms');
  assertEqual(MCP_LIMITS.maxMemoryBytes, 268_435_456, 'f-11.19: memory limit is 256 MiB');

  const under = checkBudgets({
    candidateCells: 100, changedCells: 50, estimatedRuntimeMs: 10, estimatedMemoryBytes: 1024,
  });
  assertEqual(under.ok, true, 'f-11.8: a small operation passes every budget');
  assertEqual(under.error, undefined, 'f-11.8: a passing operation carries no error');
  assertEqual(under.overridable, false, 'f-11.8: a passing operation is not "overridable"');

  const atDefault = checkBudgets({
    candidateCells: 250_000, changedCells: 250_000, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024,
  });
  assertEqual(atDefault.ok, true, 'f-11.8: exactly at the default budget passes');

  const overDefault = checkBudgets({
    candidateCells: 300_000, changedCells: 250_001, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024,
  });
  assertEqual(overDefault.ok, false, 'f-11.8: above the default budget is refused');
  assertEqual(overDefault.exceeded, 'maxChangedCells', 'f-11.8: the exceeded budget is named');
  assertEqual(overDefault.overridable, true, 'f-11.8: the default budget is overridable');
  assert(overDefault.error?.message.includes('250001'), 'f-11.8: the message quotes the actual count');
  assert(overDefault.error?.message.includes('250000'), 'f-11.8: the message quotes the budget');

  const overDefaultWithIncrease = checkBudgets(
    { candidateCells: 300_000, changedCells: 250_001, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024 },
    { allowLimitIncrease: true },
  );
  assertEqual(overDefaultWithIncrease.ok, true, 'f-11.8: an explicit limit increase lifts the default budget');

  const overConfigurable = checkBudgets(
    { candidateCells: 2_000_000, changedCells: 1_000_001, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024 },
    { allowLimitIncrease: true },
  );
  assertEqual(overConfigurable.ok, false, 'f-11.8: above the configurable limit is still refused');
  assertEqual(overConfigurable.exceeded, 'maxCandidateCells', 'f-11.19: the candidate limit is checked first');
  assertEqual(overConfigurable.overridable, false, 'f-11.19: the candidate limit is not overridable');

  const overConfigurableCellsOnly = checkBudgets(
    { candidateCells: 900_000, changedCells: 1_000_001, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024 },
    { allowLimitIncrease: true },
  );
  assertEqual(overConfigurableCellsOnly.ok, false, 'f-11.8: configurable cell limit still binds');
  assertEqual(overConfigurableCellsOnly.exceeded, 'configurableChangedLimit', 'f-11.8: exceeded budget is the configurable one');
  assertEqual(overConfigurableCellsOnly.overridable, false, 'f-11.8: the configurable limit needs splitting, not an override');

  const overAbsolute = checkBudgets(
    { candidateCells: 900_000, changedCells: 5_000_001, estimatedRuntimeMs: 100, estimatedMemoryBytes: 1024 },
    { allowLimitIncrease: true },
  );
  assertEqual(overAbsolute.ok, false, 'f-11.8: the absolute safety limit is never lifted');
  assertEqual(overAbsolute.exceeded, 'absoluteSafetyLimit', 'f-11.8: absolute limit is named');
  assertEqual(overAbsolute.overridable, false, 'f-11.8: the absolute limit is not overridable');

  const slow = checkBudgets({
    candidateCells: 100, changedCells: 10, estimatedRuntimeMs: 5_001, estimatedMemoryBytes: 1024,
  });
  assertEqual(slow.ok, false, 'f-11.19: runtime budget is enforced');
  assertEqual(slow.exceeded, 'maxRuntimeMs', 'f-11.19: runtime budget is named');
  assertEqual(slow.overridable, false, 'f-11.19: runtime is not overridable');

  const fat = checkBudgets({
    candidateCells: 100, changedCells: 10, estimatedRuntimeMs: 10, estimatedMemoryBytes: 268_435_457,
  });
  assertEqual(fat.ok, false, 'f-11.19: memory budget is enforced');
  assertEqual(fat.exceeded, 'maxMemoryBytes', 'f-11.19: memory budget is named');
  assertEqual(fat.overridable, false, 'f-11.19: memory is not overridable');

  // Ordering: the most fundamental refusal is reported first.
  const manyTrips = checkBudgets({
    candidateCells: 2_000_000, changedCells: 6_000_000, estimatedRuntimeMs: 9_999, estimatedMemoryBytes: 1 << 30,
  });
  assertEqual(manyTrips.exceeded, 'maxCandidateCells', 'f-11.19: budgets are checked in severity order');
}

console.log('--- Slice f-11: undo size estimation (§2.3) ---');

{
  assertEqual(estimateUndoBytes(0), 0, 'f-11: zero changed cells need zero undo bytes');
  assertEqual(
    estimateUndoBytes(100),
    100 * BYTES_PER_CHANGED_CELL,
    'f-11: undo bytes scale with changed cells at the documented factor',
  );
  assert(estimateUndoBytes(200) > estimateUndoBytes(100), 'f-11: undo bytes are monotonic');
  assertEqual(
    estimateUndoBytes(10, 64),
    640,
    'f-11: a caller can supply a different per-cell factor',
  );
  assertEqual(
    estimateUndoBytes(250_000),
    250_000 * BYTES_PER_CHANGED_CELL,
    'f-11: the default budget maps to a deterministic undo size',
  );
}

console.log('\n=== Slice f-11 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
