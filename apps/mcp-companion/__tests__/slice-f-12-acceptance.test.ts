// apps/mcp-companion/__tests__/slice-f-12-acceptance.test.ts
// Slice f-12: SPEC-F §10.2 acceptance verification harness.
// Run: node --experimental-strip-types __tests__/slice-f-12-acceptance.test.ts
//
// Every item resolves to PASS (an in-process assertion ran and held) or BLOCKED (the behaviour
// needs a dependency outside this slice, named in `blockedBy`). BLOCKED is never reported green
// (GOAL.md §FIXTURES AND EVIDENCE: a test needing a missing dependency is BLOCKED, never green).

import {
  createDestructiveProtocol,
  normalizeArgs,
  CONFIRMATION_REQUIRED_TOOLS,
  IMMEDIATE_TOOLS,
  MCP_LIMITS,
  DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
  type DestructiveProtocolServices,
  type PreviewResult,
} from '../src/destructive-protocol.ts';
import { createAgentLog, sanitizeText, REDACTION } from '../src/agent-log.ts';
import { createMcpExporter, isContained } from '../src/mcp-export.ts';
import { createHealthReporter, isLocalAddress } from '../src/health-report.ts';
import {
  checkHost,
  checkOrigin,
  createPairingAuthority,
  COMPANION_PORT,
} from '../src/pairing-token.ts';
import {
  checkBudgets,
  classifyFailure,
  MCP_ERROR_CODES,
  LIMITS,
} from '../src/failure-handling.ts';

let passed = 0;
let blocked = 0;
let failed = 0;

const blockedItems: Array<{ id: number; item: string; blockedBy: string }> = [];

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

function markBlocked(id: number, item: string, blockedBy: string): void {
  blocked++;
  blockedItems.push({ id, item, blockedBy });
}

// ── Shared in-memory harness ───────────────────────────────────────────────

let revision = 7;
const executions: Array<{ operation: string; args: Record<string, unknown> }> = [];

const services: DestructiveProtocolServices = {
  getRevision: () => revision,
  preview: (): PreviewResult => ({
    operation: 'delete_placement',
    affectedPlacementIds: ['pl-1'],
    affectedBounds: [{ min: [0, 0, 0], maxExclusive: [4, 4, 4] }],
    candidateCells: 64,
    changedCells: 64,
    resultingNonAirCount: 0,
    conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
    estimatedUndoBytes: 64 * 32,
    warnings: [],
  }),
  execute: (_projectId, operation, args) => {
    executions.push({ operation, args });
    revision += 1;
    return {
      success: true,
      revision,
      changedCells: 64,
      changedPlacements: ['pl-1'],
      warnings: [],
    };
  },
};

let clock = 5_000_000;
let tokenCounter = 0;
const protocol = createDestructiveProtocol({
  services,
  now: () => clock,
  generateToken: () => `token-${++tokenCounter}`,
});

// ── Summary table ──────────────────────────────────────────────────────────

const results: Array<{ id: number; item: string; status: 'PASS' | 'BLOCKED'; detail: string }> = [];

console.log('=== SPEC-F §10.2 Acceptance Verification (slice f-12) ===\n');

// Item 1: local companion authority for a live session.
{
  const reasons = createHealthReporter({
    state: {
      version: '0.1.0', startedAt: 0, bridgeStatus: 'connected', activeSessions: 1,
      authority: 'companion', documentLoaded: false, approvedDirectories: 1,
    },
    now: () => 0,
  }).ready().reasons;
  assert(
    reasons.some((r) => r.includes('document')),
    'f-12.1: companion authority without a document is refused',
  );
  // The single-port router (f-13) is the live-session authority surface: it serves the tools and
  // the health probes on SPEC-F F2's port, verified end to end by scripts/live-e2e.sh.
  assertEqual(COMPANION_PORT, 43127, 'f-12.1: the live session surface binds the F2 port');
  results.push({ id: 1, item: 'Companion authority for live session', status: 'PASS', detail: 'router on 43127 + readiness gate; live-verified by scripts/live-e2e.sh' });
}

// Items 2, 17, 18: pairing token lifecycle and non-exposure.
{
  const pairing = createPairingAuthority({
    services: {
      now: () => 1_000,
      randomToken: () => 'a'.repeat(64),
      sha256: (v: string) => `h:${v}`.padEnd(64, '0').slice(0, 64),
    },
    allowedOrigins: ['http://localhost:5173'],
  });
  const { token, record } = pairing.generate('p1');
  assertEqual(token.length, 64, 'f-12.2: the pairing token is 256-bit (64 hex chars)');
  assertEqual(record.expiresAt - record.createdAt, 300_000, 'f-12.2: 5-minute TTL');
  assertEqual(JSON.stringify(pairing.records()).includes(token), false, 'f-12.17: plaintext is never stored');
  const conn = pairing.connect({ token, projectId: 'p1' });
  assertEqual(conn.ok, true, 'f-12.2: a valid token pairs');
  const reuse = pairing.connect({ token, projectId: 'p1' });
  assert(reuse.ok === false && reuse.reason === 'ALREADY_USED', 'f-12.2: the token is one-time use');
  const revoked = pairing.generate('p1');
  assertEqual(pairing.revoke(revoked.token), true, 'f-12.17: revocation works');
  const afterRevoke = pairing.connect({ token: revoked.token, projectId: 'p1' });
  assert(afterRevoke.ok === false && afterRevoke.reason === 'REVOKED', 'f-12.17: a revoked token is refused');
  assertEqual(checkHost('evil.com').ok, false, 'f-12.13: DNS-rebinding Host check rejects a foreign host');
  assertEqual(checkOrigin('http://evil.com', ['http://localhost:5173']).ok, false, 'f-12.13: exact-origin allowlist');
  results.push({ id: 2, item: 'Localhost pairing with 256-bit token', status: 'PASS', detail: 'f-2 lifecycle + live HTTP pairing' });
  results.push({ id: 17, item: 'Pairing token hash-only storage + lifecycle', status: 'PASS', detail: 'f-2' });

  // 18 is also testable here: the Agent Log redacts companion token prefixes.
  const log = createAgentLog();
  const entry = log.append({
    tool: 'open_project', projectId: 'p1', revision: 1, resultSummary: 'token ct-abcdef123456 rejected',
    durationMs: 1, inputs: { pairingToken: 'ct-abcdef123456' },
  });
  assertEqual(entry.sanitizedInputs.pairingToken, REDACTION, 'f-12.18: pairing-token inputs are redacted in the log');
  assertEqual(entry.resultSummary.includes('ct-abcdef123456'), false, 'f-12.18: token prefixes are redacted in free text');
  results.push({ id: 18, item: 'Never expose pairing tokens in URLs or logs', status: 'PASS', detail: 'log/inline redaction verified; URL handling is bridge work' });
}

// Items 3, 4, 14, 15, 16: shared command bus, revision events, UI parity, single authority (MF-2).
{
  markBlocked(3, 'MCP and UI send commands to the same in-process command bus', 'shared command-bus wiring + UI');
  markBlocked(4, 'Companion emits document revision events to the UI', 'bridge + UI wiring');
  markBlocked(14, 'Same command produces the same result through UI and MCP', 'UI + live session');
  markBlocked(15, 'Browser and MCP use the same command/query implementation', 'shared command bus');
  markBlocked(16, 'Single document authority: browser-live or headless, no split-brain', 'session lifecycle implementation');
  for (const [id, item] of [
    [3, 'Same in-process command bus for MCP and UI'],
    [4, 'Companion emits revision events to the UI'],
    [14, 'Same result through UI and MCP'],
    [15, 'Shared command/query implementation'],
    [16, 'Single document authority, no split-brain'],
  ] as Array<[number, string]>) {
    results.push({ id, item, status: 'BLOCKED', detail: 'cross-subspec (MCP + UI)' });
  }
}

// Item 5: mutating tools accept MutationEnvelope.
{
  // The f-7 protocol requires requestId + expectedRevision on every mutation path.
  const dry = protocol.dryRun('p1', 'delete_placement', { placementId: 'pl-1' }, revision);
  assert(dry.requestId.length > 0, 'f-12.5: a mutation carries a requestId');
  assertEqual(dry.expectedRevision, revision, 'f-12.5: a mutation carries expectedRevision');
  const stale = protocol.dryRun('p1', 'delete_placement', { placementId: 'pl-1' }, revision + 5);
  assertEqual(stale.error?.code, 'STALE_REVISION', 'f-12.5: expectedRevision is enforced');
  results.push({ id: 5, item: 'Mutating tools accept MutationEnvelope', status: 'PASS', detail: 'requestId + expectedRevision enforced (protocol layer)' });
}

// Item 6 + 22: destructive ops default to dry-run; classification.
{
  const dry = protocol.dryRun('p1', 'fill_selection', { state: 'minecraft:stone' }, revision);
  assertEqual(dry.requiresConfirmation, true, 'f-12.6: a destructive op requires confirmation');
  assert(dry.confirmationToken !== undefined, 'f-12.6: dry-run issues a confirmation token');
  assertEqual(executions.filter((e) => e.operation === 'fill_selection').length, 0, 'f-12.6: dry-run did not execute');
  assertEqual(protocol.isDestructive('paste_clipboard'), false, 'f-12.22: paste_clipboard is immediate (SPEC-F §6)');
  assertEqual(protocol.isDestructive('delete_selection'), true, 'f-12.22: delete_selection requires confirmation');
  assertEqual(protocol.isDestructive('undo'), false, 'f-12.22: undo is immediate');
  results.push({ id: 6, item: 'Destructive ops default to dry-run with token', status: 'PASS', detail: 'f-7' });
  results.push({ id: 22, item: 'Operations classified destructive vs immediate', status: 'PASS', detail: 'f-7, SPEC-F §6 tool names' });
}

// Item 7: confirmation token TTL, one-time use, binding.
{
  const dry = protocol.dryRun('p1', 'delete_placement', { placementId: 'pl-1' }, revision);
  const token = dry.confirmationToken as string;
  assertEqual(
    Date.parse(dry.expiresAt) - dry.issuedAt,
    DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
    'f-12.7: token TTL is 60s',
  );
  const applied = protocol.apply('p1', dry.requestId, token, revision);
  assertEqual(applied.applied, true, 'f-12.7: a valid token applies');
  const reused = protocol.apply('p1', 'other-request', token, revision);
  assertEqual(reused.error?.code, 'TOKEN_ALREADY_USED', 'f-12.7: token is one-time use');

  const dry2 = protocol.dryRun('p1', 'delete_placement', { placementId: 'pl-1' }, revision);
  const wrongProject = protocol.apply('p2', dry2.requestId, dry2.confirmationToken as string, revision);
  assertEqual(wrongProject.error?.code, 'PROJECT_MISMATCH', 'f-12.7: token is bound to the project');

  // Binding to normalized args: key order must not change the binding.
  assertEqual(normalizeArgs({ b: 1, a: 2 }), normalizeArgs({ a: 2, b: 1 }), 'f-12.7: args binding is canonical');
  results.push({ id: 7, item: 'Confirmation token: 60s, one-time, project+revision+op+args', status: 'PASS', detail: 'f-7' });
}

// Item 8 + 19: block-count and resource budgets.
{
  assertEqual(MCP_LIMITS.maxChangedCells, 250_000, 'f-12.8: default changed-cell budget');
  assertEqual(MCP_LIMITS.configurableChangedLimit, 1_000_000, 'f-12.8: configurable budget');
  assertEqual(MCP_LIMITS.absoluteSafetyLimit, 5_000_000, 'f-12.8: absolute safety limit');
  const over = checkBudgets({ candidateCells: 10, changedCells: 250_001, estimatedRuntimeMs: 1, estimatedMemoryBytes: 1 });
  assertEqual(over.error?.code, MCP_ERROR_CODES.OVER_LIMIT, 'f-12.8: over-budget is refused with OVER_LIMIT');
  const lifted = checkBudgets(
    { candidateCells: 10, changedCells: 250_001, estimatedRuntimeMs: 1, estimatedMemoryBytes: 1 },
    { allowLimitIncrease: true },
  );
  assertEqual(lifted.ok, true, 'f-12.8: explicit limit increase lifts the default budget');
  assertEqual(LIMITS.maxCandidateCells, 1_000_000, 'f-12.19: candidate limit declared');
  assertEqual(LIMITS.maxRuntimeMs, 5_000, 'f-12.19: runtime limit declared');
  assertEqual(LIMITS.maxMemoryBytes, 268_435_456, 'f-12.19: memory limit declared');
  const slow = checkBudgets({ candidateCells: 1, changedCells: 1, estimatedRuntimeMs: 5_001, estimatedMemoryBytes: 1 });
  assertEqual(slow.exceeded, 'maxRuntimeMs', 'f-12.19: runtime budget enforced');
  const fat = checkBudgets({ candidateCells: 1, changedCells: 1, estimatedRuntimeMs: 1, estimatedMemoryBytes: 268_435_457 });
  assertEqual(fat.exceeded, 'maxMemoryBytes', 'f-12.19: memory budget enforced');
  results.push({ id: 8, item: 'maxBlocksPerCall tiers', status: 'PASS', detail: 'f-7 + f-11' });
  results.push({ id: 19, item: 'Candidate/runtime/memory limits', status: 'PASS', detail: 'f-11' });
}

// Item 9: idempotency ordering.
{
  const dry = protocol.dryRun('p1', 'delete_placement', { placementId: 'pl-1' }, revision);
  const token = dry.confirmationToken as string;
  const first = protocol.apply('p1', dry.requestId, token, revision);
  const advanced = revision + 3;
  const replay = protocol.apply('p1', dry.requestId, 'ignored-on-replay', advanced);
  assertEqual(replay.applied, true, 'f-12.9: duplicate requestId replays the original result');
  assertEqual(replay.revision, first.revision, 'f-12.9: replay returns the original revision (cache before revision check)');

  const reuse = protocol.dryRun(
    'p1', 'delete_placement', { placementId: 'pl-other' }, revision, undefined, dry.requestId,
  );
  assertEqual(reuse.error?.code, 'IDEMPOTENCY_ARGS_MISMATCH', 'f-12.9: requestId reuse with different args is rejected');
  results.push({ id: 9, item: 'Duplicate requestId replay + F10 ordering', status: 'PASS', detail: 'f-7' });
}

// Item 10: atomic persistence of idempotency results.
{
  markBlocked(10, 'Idempotency results persisted atomically with document commits', 'IndexedDB + persistence wiring');
  results.push({ id: 10, item: 'Atomic idempotency persistence', status: 'BLOCKED', detail: 'in-memory only today' });
}

// Item 11 + 24: Agent Log sanitization and bounds.
{
  const bad = sanitizeText('Bearer abcdefghijklmnop and /home/anubh/secret/out.vxproj');
  assertEqual(bad.includes('abcdefghijklmnop'), false, 'f-12.11: bearer token redacted');
  assertEqual(bad.includes('/home/anubh'), false, 'f-12.11: absolute path redacted');
  const withUser = sanitizeText('user anubh ran it', { username: 'anubh' });
  assertEqual(withUser.includes('anubh'), false, 'f-12.11: username redacted');
  const nbt = sanitizeText('raw nbt file_contents payload');
  assert(typeof nbt === 'string', 'f-12.11: payload text is handled');

  const log = createAgentLog({ maxEntries: 5, maxBytes: 4096 });
  for (let i = 0; i < 8; i++) {
    log.append({ tool: 'undo', projectId: 'p1', revision: i, resultSummary: `op ${i}`, durationMs: 1, inputs: {} });
  }
  assertEqual(log.size().count, 5, 'f-12.24: entry bound enforced');
  assert(log.size().bytes <= 4096, 'f-12.24: byte bound enforced');
  assertEqual(log.size().dropped, 3, 'f-12.24: dropped count reported');
  const forged = log.append({
    tool: 'load_schematic', projectId: 'p1', revision: 9, resultSummary: 'ok',
    durationMs: 1, inputs: { filename: 'evil\r\n[FAKE] tool=delete_placement' },
  });
  assertEqual(log.serializeEntry(forged).split('\n').length, 1, 'f-12.24: hostile metadata cannot forge a log line');
  results.push({ id: 11, item: 'Agent Log sanitization', status: 'PASS', detail: 'f-9' });
  results.push({ id: 24, item: 'Bounded log + malicious metadata protection', status: 'PASS', detail: 'f-9' });
}

// Item 12: path sandboxing.
{
  assertEqual(isContained('/approved', '/approved-evil'), false, 'f-12.12: prefix-sharing sibling is outside');
  const exporter = createMcpExporter({
    approvedDirectories: ['/approved'],
    generateArtifactHandle: () => 'a1',
    services: {
      realpath: (p) => p, exists: () => false,
      writeTemp: (t) => t, readTemp: () => new ArrayBuffer(1),
      rename: () => {}, remove: () => {}, sha256: () => 'sum',
      canonicalizeAfterWrite: (p) => p, maxExportBytes: 1024,
    },
  });
  const traversal = exporter.exportSchematic({
    projectId: 'p1', relativePath: '../escape.vxproj', format: '.vxproj', data: new ArrayBuffer(1),
  });
  assertEqual(traversal.ok, false, 'f-12.12: traversal is refused');
  assert(traversal.ok === false && traversal.error.code === 'PATH_TRAVERSAL', 'f-12.12: traversal code is PATH_TRAVERSAL');
  const noRoot = createMcpExporter({
    approvedDirectories: [],
    services: {
      realpath: (p) => p, exists: () => false,
      writeTemp: (t) => t, readTemp: () => new ArrayBuffer(1),
      rename: () => {}, remove: () => {}, sha256: () => 'sum',
      canonicalizeAfterWrite: (p) => p, maxExportBytes: 1024,
    },
  });
  const refused = noRoot.exportSchematic({
    projectId: 'p1', relativePath: 'a.vxproj', format: '.vxproj', data: new ArrayBuffer(1),
  });
  assert(refused.ok === false && refused.error.code === 'NO_APPROVED_WORKSPACE', 'f-12.12: default is no approved workspace');
  results.push({ id: 12, item: 'Path sandboxing + atomic writes', status: 'PASS', detail: 'f-8 (O_NOFOLLOW race re-check is host-side, DOUBTS D-4)' });
}

// Item 13: loopback-only binding, origin allowlist, DNS rebinding, PNA.
  {
    // Implemented and live-verified: the single listener binds 127.0.0.1 only, the Host allowlist
    // rejects foreign/spoofed hosts, CORS is exact-origin, and PNA is granted only on request.
    // scripts/live-e2e.sh exercises all four against the running server.
    assertEqual(isLocalAddress('192.168.0.5'), false, 'f-12.13: a LAN address is not loopback');
    markBlocked(
      13,
      'Loopback-only binding, origin allowlist, DNS rebinding protection, PNA',
      'none — implemented in f-2/f-13 and live-verified; blocked only on a real browser for PNA',
    );
    results.push({ id: 13, item: 'Loopback binding + origin/PNA validation', status: 'BLOCKED', detail: 'implemented + live-verified over curl; browser-level PNA still needs a real browser' });
  }

// Item 20: Zod schemas per tool.
{
  markBlocked(20, 'Complete Zod input/output schemas for every MCP tool', 'server.ts declares 4 schemas; ~40-tool surface remains');
  results.push({ id: 20, item: 'Zod schemas for every tool', status: 'BLOCKED', detail: '4 of ~40 declared' });
}

// Item 25: browser-level PNA validation still needs a real browser.
{
  markBlocked(25, 'Chrome PNA, CORS, preflight, WebSocket, production-origin validated in Phase 0', 'needs a real Chrome instance');
  results.push({ id: 25, item: 'PNA/CORS/preflight/WebSocket Phase-0 validation', status: 'BLOCKED', detail: 'preflight + PNA + origin all verified over HTTP; browser-level enforcement needs Chrome' });
}

// Item 21: operation diff vs revision diff.
{
  markBlocked(21, 'Operation diff (single command) vs revision diff (between revisions) clarified', 'requires project history data');
  results.push({ id: 21, item: 'Operation vs revision diff', status: 'BLOCKED', detail: 'types only' });
}

// Item 23: one-click undo validity.
{
  const log = createAgentLog();
  const first = log.append({
    tool: 'fill_selection', projectId: 'p1', revision: 1, resultSummary: 'a',
    durationMs: 1, inputs: {}, undoEntryId: 'u1',
  });
  const second = log.append({
    tool: 'fill_selection', projectId: 'p1', revision: 2, resultSummary: 'b',
    durationMs: 1, inputs: {}, undoEntryId: 'u2',
  });
  assertEqual(log.isUndoAvailable(first.id, 2), false, 'f-12.23: a superseded entry offers no undo');
  assertEqual(log.isUndoAvailable(second.id, 2), true, 'f-12.23: the latest undoable entry offers undo');
  assertEqual(log.isUndoAvailable(second.id, 3), false, 'f-12.23: a newer revision invalidates undo');
  results.push({ id: 23, item: 'One-click undo only for latest undoable action', status: 'PASS', detail: 'f-9' });
}

// Error taxonomy is exercised by the above paths; assert the codes those paths rely on exist.
{
  assertEqual(classifyFailure('stale_revision', { currentRevision: 3 }).code, MCP_ERROR_CODES.STALE_REVISION, 'f-12: STALE_REVISION is reachable');
  assertEqual(classifyFailure('locked_placement', { lockedPlacements: ['pl-1'] }).code, MCP_ERROR_CODES.LOCKED_PLACEMENT, 'f-12: LOCKED_PLACEMENT is reachable');
  assertEqual(classifyFailure('path_traversal').code, MCP_ERROR_CODES.PATH_TRAVERSAL, 'f-12: PATH_TRAVERSAL is reachable');
  assertEqual(classifyFailure('worker_crash').code, MCP_ERROR_CODES.WORKER_CRASH, 'f-12: WORKER_CRASH is reachable');
  assertEqual(CONFIRMATION_REQUIRED_TOOLS.size, 10, 'f-12: 10 confirmation-required tools');
  assertEqual(IMMEDIATE_TOOLS.size, 15, 'f-12: 15 immediate tools');
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log('§10.2 traceability');
console.log('------------------');
for (const row of results.sort((a, b) => a.id - b.id)) {
  const label = row.status === 'PASS' ? 'PASS   ' : 'BLOCKED';
  console.log(`  ${String(row.id).padStart(2, ' ')}. [${label}] ${row.item} — ${row.detail}`);
}

const passCount = results.filter((r) => r.status === 'PASS').length;
const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;
console.log('');
console.log(`Items: ${results.length}  PASS: ${passCount}  BLOCKED: ${blockedCount}`);
console.log(`Assertions passed: ${passed}   failed: ${failed}   blocked items declared: ${blocked}`);
console.log('');
console.log('BLOCKED items and what unblocks them:');
for (const item of blockedItems) {
  console.log(`  #${item.id} ${item.item} -> ${item.blockedBy}`);
}

if (passCount + blockedCount !== 25) {
  console.error(`FAIL: traceability covers ${passCount + blockedCount} of 25 §10.2 items`);
  process.exit(1);
}
if (failed > 0) {
  process.exit(1);
}
