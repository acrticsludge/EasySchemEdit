// apps/web/__tests__/slice-e4-2-mcp-browser.test.ts
// Slice E4.2 Integration Test: Browser MCP Pairing Client & Agent Log Panel with D-8 Undo Gating.
// Tests pairing with companion, command relay over bridge router, and D-8 revision-based undo gating.
// Run: node --experimental-strip-types apps/web/__tests__/slice-e4-2-mcp-browser.test.ts

import { EditorSession } from '../../../packages/operations/src/session.ts';
import { AGENT_LOG_PANEL_UNDO_SOURCE } from '@easyschemedit/ui';
import {
  McpBridgeClient,
} from '../src/editor/mcp/mcp-bridge-client.ts';
import {
  createBridgeRouter,
  type BridgeRequest,
} from '../../../apps/mcp-companion/src/bridge-router.ts';
import { createPairingAuthority } from '../../../apps/mcp-companion/src/pairing-token.ts';
import { createDestructiveProtocol } from '../../../apps/mcp-companion/src/destructive-protocol.ts';
import { createCommandBus } from '../../../apps/mcp-companion/src/command-bus.ts';
import { createAgentLog } from '../../../apps/mcp-companion/src/agent-log.ts';
import { createHealthReporter } from '../../../apps/mcp-companion/src/health-report.ts';
import { createMcpExporter } from '../../../apps/mcp-companion/src/mcp-export.ts';


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

// ============================================================================
// Test Harness
// ============================================================================

let clock = 10_000_000;
let tokenSeq = 0;

function createHarness() {
  const browserSession = new EditorSession();

  let browserClientRef: McpBridgeClient | null = null;

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

  const commandBus = createCommandBus({
    session: browserSession,
    projectId: 'test-proj',
    authority: 'browser',
    relayToBrowser: (op, args) => {
      if (!browserClientRef) throw new Error('browserClient not initialized');
      return browserClientRef.handleRelayedCommand(op, args);
    },
  });

  const protocol = createDestructiveProtocol({
    services: {
      getRevision: () => browserSession.revision,
      preview: (_proj, op, args) => commandBus.preview(op, args),
      execute: (_proj, op, args) => commandBus.execute(op, args),
    },
    now: () => clock,
  });

  const agentLog = createAgentLog({ now: () => clock });

  const health = createHealthReporter({
    state: {
      version: '0.1.0',
      startedAt: clock,
      bridgeStatus: 'connected',
      activeSessions: 1,
      authority: 'browser',
      documentLoaded: true,
      approvedDirectories: 1,
    },
    now: () => clock,
  });

  const exporter = createMcpExporter({
    approvedDirectories: ['/workspace/export'],
    services: {
      realpath: (p) => p,
      exists: () => false,
      writeTemp: (t) => t,
      readTemp: () => new ArrayBuffer(0),
      rename: () => {},
      remove: () => {},
      sha256: () => 'sum',
      canonicalizeAfterWrite: (p) => p,
      maxExportBytes: 1024 * 1024,
    },
  });

  const router = createBridgeRouter({
    pairing,
    protocol,
    commandBus,
    log: agentLog,
    health,
    exporter,
    port: 43127,
    allowedOrigins: ['http://localhost:5173'],
    getRevision: () => browserSession.revision,
    now: () => clock,
  });

  // Injectable fetchFn routing requests to bridge router
  const fetchFn: typeof fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const parsedUrl = new URL(urlStr);
    const headers = new Headers(init?.headers);
    const authHeader = headers.get('authorization') ?? undefined;
    const bodyStr = init?.body ? String(init.body) : undefined;
    const bodyObj = bodyStr ? JSON.parse(bodyStr) : undefined;

    const bridgeReq: BridgeRequest = {
      method: ((init?.method ?? 'GET').toUpperCase() as any),
      path: parsedUrl.pathname,
      host: '127.0.0.1:43127',
      remoteAddress: '127.0.0.1',
      origin: 'http://localhost:5173',
      authorization: authHeader,
      body: bodyObj,
    };

    const bridgeRes = router.handle(bridgeReq);

    return {
      ok: bridgeRes.status >= 200 && bridgeRes.status < 300,
      status: bridgeRes.status,
      statusText: bridgeRes.status === 200 ? 'OK' : 'Error',
      headers: new Headers(bridgeRes.headers),
      json: async () => bridgeRes.body,
      text: async () => JSON.stringify(bridgeRes.body),
    } as unknown as Response;
  };

  const browserClient = new McpBridgeClient({
    session: browserSession,
    projectId: 'test-proj',
    baseUrl: 'http://127.0.0.1:43127',
    fetchFn,
  });

  browserClientRef = browserClient;

  return {
    browserSession,
    browserClient,
    pairing,
    protocol,
    commandBus,
    router,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

async function runTests() {
  console.log('=== Running Slice E4.2: Browser MCP Pairing & Agent Log Tests ===\n');

  // --------------------------------------------------------------------------
  // Test 1: Mint pairing token -> pairWithToken succeeds -> reuse fails
  // --------------------------------------------------------------------------
  console.log('Test 1: Companion pairing handshake and one-time token enforcement');
  {
    const { browserClient, pairing } = createHarness();

    assertEqual(browserClient.status, 'disconnected', 'initial status is disconnected');
    assertEqual(browserClient.sessionId, null, 'initial sessionId is null');

    // Mint a 64-hex one-time pairing token on the companion
    const { token } = pairing.generate('test-proj');
    assert(token.length === 64, 'minted token is 64 hex characters');

    // Pair browser client with token
    const pairResult = await browserClient.pairWithToken(token);
    assert(pairResult.ok, 'browserClient.pairWithToken(token) succeeded on first use');
    assertEqual(browserClient.status, 'connected', 'status transitioned to connected');
    assert(browserClient.sessionId !== null, 'browserClient stores sessionId');
    assertEqual(pairResult.sessionId, browserClient.sessionId, 'pairResult returns stored sessionId');

    // Attempting to reuse the one-time token a second time must be rejected
    const secondPair = await browserClient.pairWithToken(token);
    assert(!secondPair.ok, 'reusing pairing token must be rejected');
    assertEqual(secondPair.code, 'TOKEN_ALREADY_USED', 'reused token rejected with TOKEN_ALREADY_USED');
    assertEqual(browserClient.status, 'error', 'status is error after failed reuse');
    assert(
      (browserClient.errorMessage ?? '').includes('ALREADY_USED'),
      'errorMessage mentions ALREADY_USED',
    );
  }

  // --------------------------------------------------------------------------
  // Test 2: Agent executes fill_selection through bridge -> mutates browser session
  // --------------------------------------------------------------------------
  console.log('\nTest 2: Agent executes fill_selection via two-phase protocol relayed to browser');
  {
    const { browserSession, browserClient, pairing, router } = createHarness();

    // Pair client
    const { token } = pairing.generate('test-proj');
    const pairResult = await browserClient.pairWithToken(token);
    assert(pairResult.ok, 'paired client');

    const initialRevision = browserSession.revision;

    // Phase 1: Dry-run request from companion agent
    const dryRunReq: BridgeRequest = {
      method: 'POST',
      path: '/mcp',
      host: '127.0.0.1:43127',
      remoteAddress: '127.0.0.1',
      origin: 'http://localhost:5173',
      authorization: `Session ${browserClient.sessionId}`,
      body: {
        tool: 'fill_selection',
        projectId: 'test-proj',
        expectedRevision: initialRevision,
        args: {
          worldBounds: [0, 0, 0, 4, 4, 4],
          blockType: 'minecraft:stone',
        },
      },
    };

    const dryRunRes = router.handle(dryRunReq);
    assertEqual(dryRunRes.status, 200, 'Phase 1 dry-run returns HTTP 200');
    const dryRunBody = dryRunRes.body as any;
    assert(dryRunBody.ok, 'Phase 1 ok is true');
    assert(dryRunBody.requiresConfirmation, 'Phase 1 requires confirmation');
    assertEqual(dryRunBody.candidateCells, 64, 'Phase 1 candidateCells is 64');
    const confirmationToken = dryRunBody.confirmationToken;
    assert(typeof confirmationToken === 'string', 'Phase 1 returned confirmationToken');

    // Document revision should not have changed during dry-run
    assertEqual(browserSession.revision, initialRevision, 'dry-run did not mutate session revision');
    assertEqual(browserClient.getEntries().length, 0, 'no log entries recorded on dry-run');

    // Phase 2: Apply request with confirmationToken and matching requestId
    const applyReq: BridgeRequest = {
      method: 'POST',
      path: '/mcp',
      host: '127.0.0.1:43127',
      remoteAddress: '127.0.0.1',
      origin: 'http://localhost:5173',
      authorization: `Session ${browserClient.sessionId}`,
      body: {
        tool: 'fill_selection',
        projectId: 'test-proj',
        requestId: dryRunBody.requestId,
        expectedRevision: initialRevision,
        confirmationToken,
        args: {
          worldBounds: [0, 0, 0, 4, 4, 4],
          blockType: 'minecraft:stone',
        },
      },
    };

    const applyRes = router.handle(applyReq);
    assertEqual(applyRes.status, 200, 'Phase 2 apply returns HTTP 200');
    const applyBody = applyRes.body as any;
    assert(applyBody.ok, 'Phase 2 apply ok is true');
    assert(applyBody.applied, 'Phase 2 applied is true');
    assertEqual(applyBody.changedCells, 64, 'Phase 2 changed 64 cells');

    // Verify browser EditorSession state mutated
    assert(browserSession.revision > initialRevision, 'browser session revision was incremented');
    assertEqual(browserSession.revision, applyBody.revision, 'session revision matches response revision');

    const snap = browserSession.snapshot();
    const totalNonAir = snap.placements.reduce((sum, p) => sum + p.volume.nonAirCount, 0);
    assertEqual(totalNonAir, 64, 'volume contains 64 stone blocks');

    // Verify agent log entry on browserClient
    const entries = browserClient.getEntries();
    assertEqual(entries.length, 1, 'browserClient recorded 1 agent log entry');
    const entry = entries[0];
    assertEqual(entry.tool, 'fill_selection', 'log entry tool is fill_selection');
    assertEqual(entry.changedCells, 64, 'log entry changedCells is 64');
    assertEqual(entry.revision, browserSession.revision, 'log entry revision matches session revision');
    assert(entry.resultSummary.includes('64'), 'summary mentions 64 blocks');
  }

  // --------------------------------------------------------------------------
  // Test 3: D-8 Undo Rule — enabled only when entry.revision === session.revision
  // --------------------------------------------------------------------------
  console.log('\nTest 3: D-8 Undo rule gating and volume restoration');
  {
    const { browserSession, browserClient, pairing, router } = createHarness();

    const { token } = pairing.generate('test-proj');
    await browserClient.pairWithToken(token);

    // Initial state: 0 non-air blocks
    const initialNonAir = browserSession.snapshot().placements.reduce((sum, p) => sum + p.volume.nonAirCount, 0);
    assertEqual(initialNonAir, 0, 'initial non-air block count is 0');

    // Agent executes fill_selection (dry-run + apply)
    const r0 = browserSession.revision;
    const dryRunRes = router.handle({
      method: 'POST',
      path: '/mcp',
      host: '127.0.0.1:43127',
      remoteAddress: '127.0.0.1',
      origin: 'http://localhost:5173',
      authorization: `Session ${browserClient.sessionId}`,
      body: {
        tool: 'fill_selection',
        projectId: 'test-proj',
        expectedRevision: r0,
        args: { worldBounds: [0, 0, 0, 2, 2, 2], blockType: 'minecraft:stone' },
      },
    });
    const dryRunBody = dryRunRes.body as any;
    const confirmationToken = dryRunBody.confirmationToken;

    const applyRes = router.handle({
      method: 'POST',
      path: '/mcp',
      host: '127.0.0.1:43127',
      remoteAddress: '127.0.0.1',
      origin: 'http://localhost:5173',
      authorization: `Session ${browserClient.sessionId}`,
      body: {
        tool: 'fill_selection',
        projectId: 'test-proj',
        requestId: dryRunBody.requestId,
        expectedRevision: r0,
        confirmationToken,
        args: { worldBounds: [0, 0, 0, 2, 2, 2], blockType: 'minecraft:stone' },
      },
    });
    assertEqual(applyRes.status, 200, 'fill applied');

    const r1 = browserSession.revision;
    assert(r1 > r0, 'revision advanced to r1');

    const [fillEntry] = browserClient.getEntries();
    assertEqual(fillEntry.revision, r1, 'fillEntry revision is r1');
    assertEqual(fillEntry.changedCells, 8, 'fillEntry changed 8 blocks');

    // 3.1: Immediately after fill_selection at r1, isUndoAvailable is true
    assert(
      browserClient.isUndoAvailable(fillEntry.id, browserSession.revision),
      'D-8 rule: isUndoAvailable is true when entry.revision === session.revision',
    );

    // 3.2: User performs manual edit on session (e.g. renaming placement), advancing revision to r2
    const placementId = browserSession.snapshot().placements[0].id;
    const userEditResult = browserSession.execute({
      type: 'placement:rename',
      placementId,
      name: 'User Custom Name',
    });
    assert(userEditResult.ok, 'user manual edit executed');
    const r2 = browserSession.revision;
    assert(r2 > r1, 'revision advanced to r2 after manual edit');

    // Now entry.revision (r1) !== session.revision (r2), so undo MUST be disabled
    assert(
      !browserClient.isUndoAvailable(fillEntry.id, browserSession.revision),
      'D-8 rule: isUndoAvailable is false once session revision has advanced beyond entry',
    );

    // Attempting to undo when disabled is rejected
    const rejectedUndo = browserClient.undoAgentEntry(fillEntry.id);
    assert(!rejectedUndo.ok, 'undoAgentEntry rejected when isUndoAvailable is false');

    // 3.3: Undoing when entry.revision === session.revision restores volume to 0 non-air blocks
    // In a clean scenario where undo is invoked at matching revision:
    const cleanHarness = createHarness();
    const cleanSession = cleanHarness.browserSession;
    const cleanClient = cleanHarness.browserClient;

    // Execute fill directly via relayed command (agent fill)
    const relayedResult = cleanClient.handleRelayedCommand('fill_selection', {
      worldBounds: [0, 0, 0, 3, 3, 3],
      blockType: 'minecraft:stone',
    });
    assert(relayedResult.success, 'relayed fill succeeded');
    const filledNonAir = cleanSession.snapshot().placements.reduce((sum, p) => sum + p.volume.nonAirCount, 0);
    assertEqual(filledNonAir, 27, 'volume has 27 non-air blocks after fill');

    const [agentEntry] = cleanClient.getEntries();
    assertEqual(agentEntry.revision, cleanSession.revision, 'entry revision matches session revision');
    assert(
      cleanClient.isUndoAvailable(agentEntry.id, cleanSession.revision),
      'undo is available when revisions match',
    );

    // Undo the agent entry
    const undoResult = cleanClient.undoAgentEntry(agentEntry.id);
    assert(undoResult.ok, 'undoAgentEntry succeeded at matching revision');

    // Verify volume is restored to 0 non-air blocks
    const restoredNonAir = cleanSession.snapshot().placements.reduce((sum, p) => sum + p.volume.nonAirCount, 0);
    assertEqual(restoredNonAir, 0, 'volume restored to 0 non-air blocks after undo');

    // Verify entry is now marked undone and cannot be undone again
    assert(
      !cleanClient.isUndoAvailable(agentEntry.id, cleanSession.revision),
      'entry cannot be undone again after being undone',
    );
    const secondUndo = cleanClient.undoAgentEntry(agentEntry.id);
    assert(!secondUndo.ok, 'second undo attempt is rejected');
  }

  // --------------------------------------------------------------------------
  // Test 4: Agent Log D-8 Button Contract & Metadata
  // --------------------------------------------------------------------------
  console.log('\nTest 4: Agent Log D-8 button contract and undo source attribute');
  {
    assertEqual(
      AGENT_LOG_PANEL_UNDO_SOURCE,
      'apps/mcp-companion agent-log.isUndoAvailable',
      'AGENT_LOG_PANEL_UNDO_SOURCE points to apps/mcp-companion agent-log.isUndoAvailable',
    );
  }

  console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
