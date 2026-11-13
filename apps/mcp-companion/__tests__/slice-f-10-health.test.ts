// apps/mcp-companion/__tests__/slice-f-10-health.test.ts
// Slice f-10 tests: health/readiness/metrics payloads (SUBSPEC-F §2.8, §4.7, §10.1).
// Run: node --experimental-strip-types __tests__/slice-f-10-health.test.ts
// Pure TypeScript, no test framework — same assert harness as slices c/d/e/f-7..f-9.

import {
  createHealthReporter,
  isLocalAddress,
  HEALTH_PATHS,
  type CompanionState,
} from '../src/health-report.ts';
import { sanitizeText } from '../src/agent-log.ts';

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

let clock = 2_000_000;
const now = () => clock;

function baseState(overrides?: Partial<CompanionState>): CompanionState {
  return {
    version: '0.1.0',
    startedAt: 1_000_000,
    bridgeStatus: 'connected',
    activeSessions: 1,
    authority: 'browser',
    documentLoaded: true,
    approvedDirectories: 1,
    ...overrides,
  };
}

function makeReporter(overrides?: Partial<CompanionState>) {
  return createHealthReporter({
    state: baseState(overrides),
    now,
    sanitize: (text) => sanitizeText(text),
  });
}

console.log('--- Slice f-10: paths and loopback helper ---');

{
  assertEqual(HEALTH_PATHS.healthz, '/healthz', 'f-10.25: healthz path is /healthz');
  assertEqual(HEALTH_PATHS.readyz, '/readyz', 'f-10.25: readyz path is /readyz');
  assertEqual(HEALTH_PATHS.metrics, '/metrics', 'f-10.25: metrics path is /metrics');

  assert(isLocalAddress('127.0.0.1') === true, 'f-10.13: 127.0.0.1 is local');
  assert(isLocalAddress('::1') === true, 'f-10.13: ::1 is local');
  assert(isLocalAddress('::ffff:127.0.0.1') === true, 'f-10.13: IPv4-mapped loopback is local');
  assert(isLocalAddress('192.168.1.10') === false, 'f-10.13: a LAN address is not local');
  assert(isLocalAddress('0.0.0.0') === false, 'f-10.13: 0.0.0.0 is not loopback');
  assert(isLocalAddress('example.com') === false, 'f-10.13: a hostname is not loopback');
  assert(isLocalAddress('') === false, 'f-10.13: an empty address is not loopback');
}

console.log('--- Slice f-10: /healthz shape (§2.8) ---');

{
  const r = makeReporter();
  const h = r.health();

  for (const field of ['status', 'version', 'uptime', 'bridgeStatus', 'activeSessions']) {
    assert(field in h, `f-10.25: health exposes "${field}" (§2.8)`);
  }
  assertEqual(h.status, 'healthy', 'f-10.25: no error means healthy');
  assertEqual(h.version, '0.1.0', 'f-10.25: version is reported');
  assertEqual(h.bridgeStatus, 'connected', 'f-10.25: bridge status is reported');
  assertEqual(h.activeSessions, 1, 'f-10.25: active sessions are reported');
  assertEqual(h.uptime, 1_000_000, 'f-10.25: uptime derives from the injected clock');

  // Liveness is 200 even when unhealthy; readiness is what gates traffic.
  const res = r.handle({ path: '/healthz', remoteAddress: '127.0.0.1' });
  assertEqual(res.status, 200, 'f-10.25: /healthz answers 200');
}

console.log('--- Slice f-10: status transitions ---');

{
  const healthy = makeReporter();
  assertEqual(healthy.health().status, 'healthy', 'f-10.25: connected + browser authority is healthy');

  const pairing = makeReporter({ bridgeStatus: 'pairing' });
  assertEqual(pairing.health().status, 'degraded', 'f-10.25: mid-pairing is degraded');

  const disconnected = makeReporter({
    bridgeStatus: 'disconnected', authority: 'companion', documentLoaded: false,
  });
  assertEqual(
    disconnected.health().status,
    'unhealthy',
    'f-10.25: disconnected with no document is unhealthy',
  );

  // Disconnected but the companion holds the document: still degraded, not unhealthy.
  const disconnectedWithDoc = makeReporter({
    bridgeStatus: 'disconnected', authority: 'companion', documentLoaded: true,
  });
  assertEqual(
    disconnectedWithDoc.health().status,
    'degraded',
    'f-10.25: disconnected with a loaded document is degraded',
  );

  const errored = makeReporter();
  errored.recordError('bridge write failed');
  assertEqual(errored.health().status, 'degraded', 'f-10.25: a recorded error is degraded');
  assertEqual(errored.health().lastError, 'bridge write failed', 'f-10.25: lastError is reported');
}

console.log('--- Slice f-10: lastError sanitization (§4.6) ---');

{
  const r = makeReporter();
  r.recordError('auth failed with token ghp_0123456789abcdefghijklmnopqrstuvwxyz');
  const h = r.health();
  assertEqual(h.lastError?.includes('ghp_'), false, 'f-10.11: health output does not leak a token');
  assertEqual(h.lastError?.includes('[redacted]'), true, 'f-10.11: health output marks the redaction');

  const r2 = makeReporter();
  r2.recordError('cannot write /home/anubh/secret-dir/out.vxproj');
  assertEqual(r2.health().lastError?.includes('/home/anubh'), false, 'f-10.11: health output does not leak a path');
}

console.log('--- Slice f-10: /readyz gates ---');

{
  const ready = makeReporter();
  assertEqual(ready.ready().ready, true, 'f-10.25: healthy companion is ready');
  assertEqual(ready.ready().reasons.length, 0, 'f-10.25: a ready companion lists no reasons');
  assertEqual(ready.handle({ path: '/readyz', remoteAddress: '127.0.0.1' }).status, 200, 'f-10.25: /readyz answers 200 when ready');

  const notReady = makeReporter({ bridgeStatus: 'disconnected' });
  const rr = notReady.ready();
  assertEqual(rr.ready, false, 'f-10.25: a disconnected companion is not ready');
  assert(rr.reasons.length > 0, 'f-10.25: readiness failure names a reason');
  const res = notReady.handle({ path: '/readyz', remoteAddress: '127.0.0.1' });
  assertEqual(res.status, 503, 'f-10.25: /readyz answers 503 when not ready');
  assertEqual('body' in res, true, 'f-10.25: the 503 carries a body with the reasons');

  // Companion authority with no document is not ready: mutations would have nowhere to land.
  const companionNoDoc = makeReporter({ authority: 'companion', documentLoaded: false });
  const cnd = companionNoDoc.ready();
  assertEqual(cnd.ready, false, 'f-10.25: companion authority without a document is not ready');
  assert(
    cnd.reasons.some((reason) => reason.includes('document')),
    'f-10.25: the reason names the missing document',
  );

  // A recorded error blocks readiness until cleared.
  const errored = makeReporter();
  errored.recordError('disk full');
  assertEqual(errored.ready().ready, false, 'f-10.25: an unrecovered error blocks readiness');
  assert(
    errored.ready().reasons.some((reason) => reason.includes('error')),
    'f-10.25: the reason names the error',
  );
  errored.clearError();
  assertEqual(errored.ready().ready, true, 'f-10.25: clearing the error restores readiness');

  // No approved directory + companion authority: mutations cannot be persisted.
  const noApproved = makeReporter({ authority: 'companion', approvedDirectories: 0 });
  assert(
    noApproved.ready().reasons.some((reason) => reason.includes('approved')),
    'f-10.25: companion authority without an approved directory is reported',
  );
}

console.log('--- Slice f-10: /metrics is localhost-only (§4.7) ---');

{
  const r = makeReporter();

  const remote = r.handle({ path: '/metrics', remoteAddress: '192.168.1.50' });
  assertEqual(remote.status, 403, 'f-10.25: /metrics refuses a non-loopback caller');
  assertEqual('refused' in remote && remote.refused === true, true, 'f-10.25: the refusal is explicit');

  const local = r.handle({ path: '/metrics', remoteAddress: '127.0.0.1' });
  assertEqual(local.status, 200, 'f-10.25: /metrics answers loopback');

  const unknown = r.handle({ path: '/nope', remoteAddress: '127.0.0.1' });
  assertEqual(unknown.status, 404, 'f-10.25: an unknown path is 404');
}

console.log('--- Slice f-10: metrics content and counters ---');

{
  const r = makeReporter();
  r.increment('toolCalls');
  r.increment('toolCalls');
  r.increment('rejections', 3);

  const m = r.metrics();
  assertEqual(m.counters.toolCalls, 2, 'f-10.25: counters accumulate');
  assertEqual(m.counters.rejections, 3, 'f-10.25: counters accept an increment amount');
  assertEqual(m.uptimeMs, 1_000_000, 'f-10.25: metrics report uptime from the clock');
  assertEqual(m.activeSessions, 1, 'f-10.25: metrics report active sessions');

  r.setState({ documentRevision: 7 });
  assertEqual(r.metrics().documentRevision, 7, 'f-10.25: metrics report the document revision');

  r.setState({ outstandingConfirmationTokens: 2 });
  assertEqual(r.metrics().outstandingConfirmationTokens, 2, 'f-10.25: metrics report outstanding tokens');

  r.setState({ logEntries: 12, logBytes: 4096, artifactCount: 3 });
  const m2 = r.metrics();
  assertEqual(m2.logEntries, 12, 'f-10.25: metrics report log entries');
  assertEqual(m2.logBytes, 4096, 'f-10.25: metrics report log bytes');
  assertEqual(m2.artifactCount, 3, 'f-10.25: metrics report artifact count');
}

console.log('--- Slice f-10: uptime monotonicity ---');

{
  const r = makeReporter();
  const before = r.health().uptime;
  clock += 5_000;
  const after = r.health().uptime;
  assert(after > before, 'f-10.25: uptime grows with the clock');
  assertEqual(after - before, 5_000, 'f-10.25: uptime tracks elapsed clock time');

  const res = r.handle({ path: '/healthz', remoteAddress: '127.0.0.1' });
  assertEqual(res.status, 200, 'f-10.25: /healthz still answers after time passes');
}

console.log('\n=== Slice f-10 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
