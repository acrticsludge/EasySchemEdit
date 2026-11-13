// apps/mcp-companion/__tests__/slice-f-13-bridge-router.test.ts
// Slice f-13 tests: single-port bridge router on 43127 (SUBSPEC-F F2, §3.1, §4.1, §4.7, §6, §7).
// Run: node --experimental-strip-types __tests__/slice-f-13-bridge-router.test.ts
// Pure TypeScript; requests are plain objects, so no HTTP server and no sockets are involved.

import {
  createBridgeRouter,
  type BridgeRequest,
  type BridgeDeps,
} from '../src/bridge-router.ts';
import { createPairingAuthority, COMPANION_PORT } from '../src/pairing-token.ts';
import { createDestructiveProtocol } from '../src/destructive-protocol.ts';
import { createAgentLog } from '../src/agent-log.ts';
import { createHealthReporter } from '../src/health-report.ts';
import { createMcpExporter } from '../src/mcp-export.ts';
import type { DestructiveProtocolServices, PreviewResult } from '../src/destructive-protocol.ts';

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

// ── Harness ────────────────────────────────────────────────────────────────

let clock = 20_000_000;
let tokenSeq = 0;
const executions: Array<{ operation: string; args: Record<string, unknown> }> = [];

function makeHarness() {
  let revision = 5;

  const services: DestructiveProtocolServices = {
    getRevision: () => revision,
    preview: (_p, operation, args): PreviewResult => ({
      operation,
      affectedPlacementIds: ['pl-1'],
      affectedBounds: [{ min: [0, 0, 0], maxExclusive: [4, 4, 4] }],
      candidateCells: 64,
      changedCells: 64,
      resultingNonAirCount: 0,
      conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
      estimatedUndoBytes: 2048,
      warnings: [],
    }),
    execute: (_p, operation, args) => {
      executions.push({ operation, args });
      revision += 1;
      return { success: true, revision, changedCells: 64, changedPlacements: ['pl-1'], warnings: [] };
    },
  };

  const pairing = createPairingAuthority({
    services: {
      now: () => clock,
      randomToken: () => `${(++tokenSeq).toString(16).padStart(2, '0')}`.repeat(32),
      sha256: (value: string) => `hash:${value}`.padEnd(64, '0').slice(0, 64),
    },
    allowedOrigins: ['http://localhost:5173'],
    generateSessionId: (() => {
      let n = 0;
      return () => `session-${++n}`;
    })(),
  });

  const protocol = createDestructiveProtocol({
    services,
    now: () => clock,
    generateToken: (() => {
      let n = 0;
      return () => `ct-${++n}`;
    })(),
  });

  const log = createAgentLog({ now: () => clock });
  const health = createHealthReporter({
    state: {
      version: '0.1.0',
      startedAt: 19_000_000,
      bridgeStatus: 'connected',
      activeSessions: 1,
      authority: 'browser',
      documentLoaded: true,
      approvedDirectories: 1,
    },
    now: () => clock,
  });

  const exporter = createMcpExporter({
    approvedDirectories: ['/approved'],
    generateArtifactHandle: (() => {
      let n = 0;
      return () => `artifact-${++n}`;
    })(),
    services: {
      realpath: (p) => p,
      exists: () => false,
      writeTemp: (t) => t,
      readTemp: () => new ArrayBuffer(1),
      rename: () => {},
      remove: () => {},
      sha256: () => 'sum',
      canonicalizeAfterWrite: (p) => p,
      maxExportBytes: 1 << 20,
    },
  });

  const deps: BridgeDeps = {
    pairing,
    protocol,
    log,
    health,
    exporter,
    port: COMPANION_PORT,
    allowedOrigins: ['http://localhost:5173'],
    getRevision: () => revision,
    now: () => clock,
  };

  return { router: createBridgeRouter(deps), pairing, deps, setRevision: (r: number) => { revision = r; }, getRevision: () => revision };
}

function req(partial: Partial<BridgeRequest> & { path: string }): BridgeRequest {
  return {
    method: 'POST',
    host: `127.0.0.1:${COMPANION_PORT}`,
    remoteAddress: '127.0.0.1',
    clientId: 'client-1',
    ...partial,
  };
}

const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;
const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

/** Holds the session id a pairing handshake returns, so later requests can authenticate. */
let sessionId = '';

/**
 * Pair a fresh client and return the credential for subsequent requests.
 * The pairing token is one-time use (F1), so every block that talks to an authenticated route must
 * pair first and then present `Session <id>`.
 */
function pair(h: ReturnType<typeof makeHarness>, projectId = 'p1', clientId = 'client-1'): string {
  const { token } = h.pairing.generate(projectId);
  const res = h.router.handle(
    req({ method: 'GET', path: '/metrics', authorization: `Bearer ${token}`, clientId }),
  );
  if (res.status !== 200) {
    throw new Error(`pairing failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const id = (res.body as { sessionId?: string }).sessionId;
  if (typeof id !== 'string') throw new Error('pairing response carried no session id');
  return `Session ${id}`;
}

console.log('--- Slice f-13: single port (F2 / D-7) ---');

{
  assertEqual(COMPANION_PORT, 43127, 'f-13.1: the companion port is 43127');
  const h = makeHarness();
  const r = h.router.handle(req({ method: 'GET', path: '/healthz' }));
  assertEqual(r.status, 200, 'f-13.1: /healthz answers on the single router');
  assertEqual(typeof r.body, 'object', 'f-13.1: /healthz returns a JSON-ready body');
  assertEqual((r.body as { version?: string }).version, '0.1.0', 'f-13.1: health carries the version');
}

console.log('--- Slice f-13: Host validation runs first (F-2.2) ---');

{
  const h = makeHarness();
  const foreign = h.router.handle(req({ method: 'GET', path: '/healthz', host: 'evil.com:43127' }));
  assertEqual(foreign.status, 403, 'f-13.2: a foreign Host is refused');
  assertEqual(
    'Access-Control-Allow-Origin' in foreign.headers,
    false,
    'f-13.2: a Host refusal carries no CORS origin grant',
  );

  const missing = h.router.handle(req({ method: 'GET', path: '/healthz', host: undefined }));
  assertEqual(missing.status, 403, 'f-13.2: a missing Host is refused');

  const spoofed = h.router.handle(req({ method: 'GET', path: '/healthz', host: 'localhost.evil.com' }));
  assertEqual(spoofed.status, 403, 'f-13.2: a suffix-spoofed Host is refused');

  const ok = h.router.handle(req({ method: 'GET', path: '/healthz', host: 'localhost:43127' }));
  assertEqual(ok.status, 200, 'f-13.2: an allowlisted Host passes');
}

console.log('--- Slice f-13: CORS preflight + PNA (F-2.1, F-2.3) ---');

{
  const h = makeHarness();
  const pre = h.router.handle(
    req({
      method: 'OPTIONS',
      path: '/mcp',
      origin: 'http://localhost:5173',
      requestedMethod: 'POST',
      pnaRequested: true,
    }),
  );
  assertEqual(pre.status, 204, 'f-13.3: an allowlisted preflight answers 204');
  assertEqual(
    pre.headers['Access-Control-Allow-Origin'],
    'http://localhost:5173',
    'f-13.3: the exact origin is echoed',
  );
  assertEqual(pre.headers['Vary'], 'Origin', 'f-13.3: Vary: Origin is set');
  assertEqual(
    pre.headers['Access-Control-Allow-Private-Network'],
    'true',
    'f-13.3: PNA is granted when requested',
  );

  const bad = h.router.handle(
    req({ method: 'OPTIONS', path: '/mcp', origin: 'http://evil.com', requestedMethod: 'POST' }),
  );
  assertEqual(bad.status, 403, 'f-13.3: a foreign-origin preflight is refused');

  // Preflight never requires auth.
  const noAuthPreflight = h.router.handle(
    req({ method: 'OPTIONS', path: '/metrics', origin: 'http://localhost:5173' }),
  );
  assertEqual(noAuthPreflight.status, 204, 'f-13.3: preflight is answered before auth');
}

console.log('--- Slice f-13: auth and origin gating ---');

{
  const h = makeHarness();
  const { token } = h.pairing.generate('p1');

  // No credential.
  const anon = h.router.handle(req({ path: '/mcp', body: { tool: 'fill_selection', projectId: 'p1', expectedRevision: 5, args: {} } }));
  assertEqual(anon.status, 401, 'f-13.5: /mcp without a token is 401');
  const anonMetrics = h.router.handle(req({ method: 'GET', path: '/metrics' }));
  assertEqual(anonMetrics.status, 401, 'f-13.5: /metrics without a token is 401');

  // Health needs no credential.
  assertEqual(h.router.handle(req({ method: 'GET', path: '/healthz' })).status, 200, 'f-13.5: /healthz needs no token');
  assertEqual(h.router.handle(req({ method: 'GET', path: '/readyz' })).status, 200, 'f-13.5: /readyz needs no token');

  // Browser request from a non-allowlisted origin is refused even with a valid token.
  const badOrigin = h.router.handle(
    req({
      path: '/mcp',
      origin: 'http://evil.com',
      authorization: `Bearer ${token}`,
      body: { tool: 'fill_selection', projectId: 'p1', expectedRevision: 5, args: {} },
    }),
  );
  assertEqual(badOrigin.status, 403, 'f-13.4: a foreign-origin browser call is refused even with a token');

  // Valid token, allowlisted origin. The pairing token is one-time use (F1), so this response is
  // the pairing handshake and must hand back the session id for all later requests.
  const good = h.router.handle(
    req({
      path: '/mcp',
      origin: 'http://localhost:5173',
      authorization: `Bearer ${token}`,
      body: { tool: 'fill_selection', projectId: 'p1', expectedRevision: 5, args: { state: 'minecraft:stone' } },
    }),
  );
  assertEqual(good.status, 200, 'f-13.6: a valid token from an allowlisted origin is accepted');
  assertEqual(good.headers['Access-Control-Allow-Origin'], 'http://localhost:5173', 'f-13.14: response CORS headers are added');
  assert(good.headers['Access-Control-Allow-Origin'] !== '*', 'f-13.14: no wildcard is emitted');
  const goodBody = good.body as { sessionId?: string };
  assert(typeof goodBody.sessionId === 'string', 'f-13.6: the pairing response hands back a session id');
  sessionId = goodBody.sessionId as string;

  // Project binding: a token minted for p1 cannot touch p2.
  const { token: token2 } = h.pairing.generate('p1');
  const wrongProject = h.router.handle(
    req({
      path: '/mcp',
      authorization: `Bearer ${token2}`,
      body: { tool: 'fill_selection', projectId: 'p2', expectedRevision: 5, args: {} },
    }),
  );
  assertEqual(wrongProject.status, 403, 'f-13.6: a token bound to another project is refused');
  assertEqual(
    (wrongProject.body as { error?: { code?: string } }).error?.code,
    'PROJECT_MISMATCH',
    'f-13.6: the refusal names PROJECT_MISMATCH',
  );

  // Later requests authenticate with the session id, not the spent token.
  const viaSession = h.router.handle(
    req({
      method: 'GET',
      path: '/metrics',
      authorization: `Session ${sessionId}`,
    }),
  );
  assertEqual(viaSession.status, 200, 'f-13.6: a session id authenticates later requests');
  const reusedToken = h.router.handle(
    req({
      method: 'GET',
      path: '/metrics',
      authorization: `Bearer ${token}`,
    }),
  );
  assertEqual(reusedToken.status, 403, 'f-13.6: the spent pairing token cannot be reused');
}

console.log('--- Slice f-13: rate limiting before auth ---');

{
  const h = makeHarness();
  for (let i = 0; i < 5; i++) h.pairing.registerFailure('client-1');
  const blocked = h.router.handle(
    req({ path: '/mcp', body: { tool: 'fill_selection', projectId: 'p1', expectedRevision: 5, args: {} } }),
  );
  assertEqual(blocked.status, 429, 'f-13.7: a blocked client is 429');
  const code = (blocked.body as { error?: { code?: string } }).error?.code;
  assertEqual(code, 'RATE_LIMITED', 'f-13.7: the refusal names RATE_LIMITED');
}

console.log('--- Slice f-13: destructive two-phase over the wire (§6) ---');

{
  const h = makeHarness();
  const { token } = h.pairing.generate('p1');
  // Pair once with the one-time token, then use the session id (F1 pair-once-then-session).
  const pairing = h.router.handle(
    req({
      path: '/mcp',
      authorization: `Bearer ${token}`,
      body: { tool: 'delete_selection', projectId: 'p1', expectedRevision: h.getRevision(), args: { selectionId: 's1' } },
    }),
  );
  const pairBody = pairing.body as { sessionId?: string; confirmationToken?: string; requestId?: string; requiresConfirmation?: boolean; changedCells?: number };
  assert(typeof pairBody.sessionId === 'string', 'f-13.8: the pairing handshake returns a session id');
  const auth = `Session ${pairBody.sessionId}`;
  const before = h.getRevision();

  const dry = h.router.handle(
    req({
      path: '/mcp',
      authorization: auth,
      body: { tool: 'delete_selection', projectId: 'p1', expectedRevision: before, args: { selectionId: 's1' } },
    }),
  );
  assertEqual(dry.status, 200, 'f-13.8: a destructive call without a token returns a dry-run');
  const dryBody = dry.body as { requiresConfirmation?: boolean; confirmationToken?: string; requestId?: string; changedCells?: number };
  assertEqual(dryBody.requiresConfirmation, true, 'f-13.8: the dry-run flags confirmation required');
  assert(typeof dryBody.confirmationToken === 'string', 'f-13.8: the dry-run mints a confirmation token');
  assertEqual(dryBody.changedCells, 64, 'f-13.8: the dry-run reports the preview counts');
  const executionsBeforeApply = executions.length;

  const apply = h.router.handle(
    req({
      path: '/mcp',
      authorization: auth,
      body: {
        tool: 'delete_selection',
        projectId: 'p1',
        expectedRevision: before,
        args: { selectionId: 's1' },
        requestId: dryBody.requestId,
        confirmationToken: dryBody.confirmationToken,
      },
    }),
  );
  assertEqual(apply.status, 200, 'f-13.8: applying with the token succeeds');
  const applyBody = apply.body as { applied?: boolean; revision?: number };
  assertEqual(applyBody.applied, true, 'f-13.8: the apply reports applied=true');
  assertEqual(applyBody.revision, before + 1, 'f-13.8: the revision is incremented');
  assertEqual(executions.length, executionsBeforeApply + 1, 'f-13.8: exactly one execution for the apply');
  const last = executions[executions.length - 1];
  assertEqual(last.operation, 'delete_selection', 'f-13.8: the bound operation executed');
}

console.log('--- Slice f-13: non-destructive executes immediately (§6 rule 3) ---');

{
  const h = makeHarness();
  const { token } = h.pairing.generate('p1');
  const before = h.getRevision();
  const res = h.router.handle(
    req({
      path: '/mcp',
      authorization: `Bearer ${token}`,
      body: {
        tool: 'paste_clipboard',
        projectId: 'p1',
        expectedRevision: before,
        requestId: 'req-1',
        args: { offset: [0, 0, 0] },
      },
    }),
  );
  assertEqual(res.status, 200, 'f-13.9: a non-destructive tool runs without a confirmation token');
  assertEqual(executions.filter((e) => e.operation === 'paste_clipboard').length, 1, 'f-13.9: it executed once');
}

console.log('--- Slice f-13: failure mapping (f-11) ---');

{
  const h = makeHarness();
  const auth = pair(h);

  const stale = h.router.handle(
    req({
      path: '/mcp',
      authorization: auth,
      body: { tool: 'fill_selection', projectId: 'p1', expectedRevision: 999, args: {} },
    }),
  );
  assertEqual(stale.status, 409, 'f-13.10: a stale revision is a conflict');
  const err = (stale.body as { error?: { code?: string; currentRevision?: number } }).error;
  assertEqual(err?.code, 'STALE_REVISION', 'f-13.10: the wire code is STALE_REVISION');
  assertEqual(err?.currentRevision, h.getRevision(), 'f-13.10: the current revision is reported');

  const unknown = h.router.handle(
    req({
      path: '/mcp',
      authorization: auth,
      body: { tool: 'not_a_tool', projectId: 'p1', expectedRevision: h.getRevision(), args: {} },
    }),
  );
  assertEqual(unknown.status, 400, 'f-13.13: an unknown tool is 400');
  assertEqual(
    (unknown.body as { error?: { code?: string } }).error?.code,
    'VALIDATION_FAILED',
    'f-13.13: an unknown tool maps to VALIDATION_FAILED',
  );

  const missing = h.router.handle(req({ method: 'GET', path: '/nope', authorization: auth }));
  assertEqual(missing.status, 404, 'f-13.13: an unknown path is 404');
}

console.log('--- Slice f-13: export (§7) and agent log (§8.2) ---');

{
  const h = makeHarness();
  const auth = pair(h);
  const res = h.router.handle(
    req({
      path: '/export',
      authorization: auth,
      body: { projectId: 'p1', relativePath: 'out/build.vxproj', format: '.vxproj', bytesBase64: b64('payload') },
    }),
  );
  assertEqual(res.status, 200, 'f-13.11: export succeeds');
  const body = res.body as { artifactHandle?: string; relativePath?: string; bytes?: number; data?: unknown };
  assertEqual(body.artifactHandle, 'artifact-1', 'f-13.11: the response carries an artifact handle');
  assertEqual(body.relativePath, 'out/build.vxproj', 'f-13.11: the response carries the relative path');
  assertEqual(body.data, undefined, 'f-13.11: the bytes are never inlined in the response');

  // Traversal is refused through the wire too (403: a security refusal, not a malformed request).
  const trav = h.router.handle(
    req({
      path: '/export',
      authorization: auth,
      body: { projectId: 'p1', relativePath: '../escape.vxproj', format: '.vxproj', bytesBase64: b64('x') },
    }),
  );
  assertEqual(trav.status, 403, 'f-13.11: a traversal path is refused as a security error');

  // Every mutating call appends a log entry.
  const entries = h.deps.log.entries('p1');
  assertEqual(entries.length, 2, 'f-13.12: each mutating call appends an agent-log entry');
  assertEqual(entries[0].tool, 'export_schematic', 'f-13.12: the log records the tool name');
  assertEqual(entries[1].tool, 'export_schematic', 'f-13.12: the refused export is logged too');
  assert(typeof entries[0].id === 'string', 'f-13.12: the entry carries an id');
}

console.log('--- Slice f-13: metrics route ---');

{
  const h = makeHarness();
  const auth = pair(h);
  const res = h.router.handle(req({ method: 'GET', path: '/metrics', authorization: auth }));
  assertEqual(res.status, 200, 'f-13.5: /metrics answers with a session');
  const body = res.body as { activeSessions?: number; counters?: Record<string, number> };
  assert(body.counters !== undefined, 'f-13.5: metrics carry counters');
  assert(typeof body.activeSessions === 'number', 'f-13.5: metrics carry the session count');
}

console.log('\n=== Slice f-13 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}