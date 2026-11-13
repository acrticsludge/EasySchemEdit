// apps/mcp-companion/src/listener.ts
// The only impure file in the package: binds 127.0.0.1:43127 and delegates every request to the
// pure router in ./bridge-router.ts (SUBSPEC-F F2 "Port 127.0.0.1:43127, loopback only").
//
// This replaces the two Phase-2 stubs (bridge.ts on 8765, health.ts on 8766 — DOUBTS D-7):
// one listener means one Host/origin policy, which §2.6 explicitly requires.
//
// Run with:  node --experimental-strip-types src/listener.ts

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { WebSocketServer } from 'ws';

import { createBridgeRouter, BRIDGE_PORT } from './bridge-router.ts';
import type { BridgeRequest } from './bridge-router.ts';
import { createPairingAuthority, ALLOWED_HOSTNAMES } from './pairing-token.ts';
import { createDestructiveProtocol, MCP_LIMITS } from './destructive-protocol.ts';
import type { DestructiveProtocolServices, PreviewResult } from './destructive-protocol.ts';
import { createAgentLog } from './agent-log.ts';
import { createHealthReporter } from './health-report.ts';
import { createMcpExporter } from './mcp-export.ts';
import { createCommandBus } from './command-bus.ts';

const HOST = '127.0.0.1';
const PORT = BRIDGE_PORT;

/** Origins allowed to talk to this companion. Extend through configuration, never a wildcard. */
const ALLOWED_ORIGINS = (process.env.EASYSCHEM_ORIGINS ?? 'http://localhost:4321,http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/** Approved export roots. Default: none, so every export is refused until configured (SPEC-F F3). */
const APPROVED_DIRECTORIES_RAW = (process.env.EASYSCHEM_EXPORT_DIRS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

/**
 * Canonicalize an approved root at configuration time (SPEC-F §4.2 "resolve symlinks and
 * canonicalize paths before checking"). Without this, a POSIX-shaped root such as `/tmp/exports`
 * and the canonical candidate `C:\tmp\exports\...` describe the same directory but compare unequal,
 * so every export is (correctly) rejected as a symlink escape. Roots are also created on demand so
 * the realpath below has something to resolve.
 */
function canonicalRoot(raw: string): string {
  try {
    mkdirSync(raw, { recursive: true });
    return realpathSync(raw);
  } catch {
    return raw;
  }
}

const APPROVED_DIRECTORIES = APPROVED_DIRECTORIES_RAW.map(canonicalRoot);

// ── Live document state ────────────────────────────────────────────────────
// The shared command bus (audit PF-2) is now the single authority for document
// mutations. It tracks revisions, provides preview/execute, and supports
// idempotency. The host adapter (this file) wires it to the persistence layer
// and to the browser-live document authority via the bridge.

const commandBus = createCommandBus({ projectId: 'default' });

const protocolServices: DestructiveProtocolServices = {
  getRevision: () => commandBus.state().revision,
  preview: (projectId, operation, args): PreviewResult => {
    commandBus.setProjectId(projectId);
    return commandBus.preview(operation, args);
  },
  execute: (projectId, operation, args) => {
    commandBus.setProjectId(projectId);
    const result = commandBus.execute(operation, args);
    return {
      success: result.success,
      revision: result.revision,
      changedCells: result.changedCells,
      changedPlacements: result.changedPlacements,
      warnings: result.warnings,
      errorMessage: result.errorMessage,
    };
  },
};

// ── Composition root ───────────────────────────────────────────────────────

const pairing = createPairingAuthority({
  services: {
    now: () => Date.now(),
    randomToken: () => randomBytes(32).toString('hex'),
    sha256: (value: string) => createHash('sha256').update(value).digest('hex'),
  },
  allowedOrigins: ALLOWED_ORIGINS,
  generateSessionId: () => randomBytes(16).toString('hex'),
});

const protocol = createDestructiveProtocol({
  services: protocolServices,
  generateToken: () => randomBytes(16).toString('hex'),
});

const log = createAgentLog();
const health = createHealthReporter({
  state: {
    version: '0.1.0',
    startedAt: Date.now(),
    bridgeStatus: 'disconnected',
    activeSessions: 0,
    authority: 'browser',
    documentLoaded: false,
    approvedDirectories: APPROVED_DIRECTORIES.length,
  },
});

const exporter = createMcpExporter({
  approvedDirectories: APPROVED_DIRECTORIES,
  // f-8 keeps all I/O injected; this is the host adapter it expects (SPEC-F §4.2).
  // NOTE the documented gap (DOUBTS D-4): `canonicalizeAfterWrite` re-checks the canonical path
  // AFTER the rename, so the O_NOFOLLOW check-to-open window is narrowed but not eliminated here.
  services: {
    realpath: (path: string) => {
      try {
        return realpathSync(path);
      } catch {
        // The target may not exist yet: canonicalize the nearest existing ancestor and re-append.
        const parent = dirname(path);
        try {
          return `${realpathSync(parent)}/${path.slice(parent.length + 1)}`;
        } catch {
          return path;
        }
      }
    },
    exists: (path: string) => existsSync(path),
    writeTemp: (targetPath: string, data: ArrayBuffer) => {
      const parent = dirname(targetPath);
      mkdirSync(parent, { recursive: true });
      // D-4: write to a temp sibling with O_EXCL (atomic creation, no clobber).
      const temp = `${targetPath}.tmp-${randomBytes(6).toString('hex')}`;
      const fd = openSync(temp, 'wx'); // 'wx' = O_WRONLY | O_CREAT | O_EXCL
      try {
        writeFileSync(fd, Buffer.from(data));
      } finally {
        closeSync(fd);
      }
      return temp;
    },
    readTemp: (tempPath: string) => {
      const buffer = readFileSync(tempPath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
    rename: (tempPath: string, targetPath: string) => renameSync(tempPath, targetPath),
    remove: (path: string) => {
      try {
        rmSync(path, { force: true });
      } catch {
        /* best effort */
      }
    },
    sha256: (data: ArrayBuffer) => createHash('sha256').update(Buffer.from(data)).digest('hex'),
    canonicalizeAfterWrite: (path: string) => {
      // D-4: lstat before and after + realpath comparison (Windows has no O_NOFOLLOW).
      const before = lstatSync(path);
      const real = realpathSync(path);
      const after = lstatSync(path);
      // Verify the inode didn't change (symlink swap detection).
      if (before.ino !== after.ino || before.dev !== after.dev) {
        throw new Error('symlink swap detected during write');
      }
      return real;
    },
    maxExportBytes: 256 * 1024 * 1024,
  },
});

const router = createBridgeRouter({
  pairing,
  protocol,
  log,
  health,
  exporter,
  commandBus,
  port: PORT,
  allowedOrigins: ALLOWED_ORIGINS,
  hostAllowlist: ALLOWED_HOSTNAMES,
  getRevision: () => commandBus.state().revision,
  now: () => Date.now(),
});

// ── HTTP surface ──────────────────────────────────────────────────────────

function readBody(stream: NodeJS.ReadableStream & { destroy?: () => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // §4.1: message size limits. 8 MiB is enough for a JSON tool call; exports stream separately.
    const MAX_BYTES = 8 * 1024 * 1024;
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('request body exceeds the 8 MiB message limit'));
        stream.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

const httpServer = createServer((request, response) => {
  void (async () => {
    const method = (request.method ?? 'GET').toUpperCase();
    const path = (request.url ?? '/').split('?')[0];

    let body: unknown;
    if (method === 'POST') {
      try {
        const raw = await readBody(request);
        body = raw.length === 0 ? undefined : JSON.parse(raw);
      } catch (err) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            ok: false,
            error: {
              code: 'VALIDATION_FAILED',
              message: err instanceof Error ? err.message : 'unreadable request body',
            },
          }),
        );
        return;
      }
    }

    const bridgeRequest: BridgeRequest = {
      method: method === 'POST' ? 'POST' : method === 'OPTIONS' ? 'OPTIONS' : 'GET',
      path,
      host: request.headers.host,
      origin: request.headers.origin,
      authorization: request.headers.authorization,
      remoteAddress: request.socket.remoteAddress ?? '',
      clientId: request.socket.remoteAddress ?? undefined,
      requestedMethod: typeof request.headers['access-control-request-method'] === 'string'
        ? request.headers['access-control-request-method']
        : undefined,
      pnaRequested: request.headers['access-control-request-private-network'] === 'true',
      body,
    };

    const result = router.handle(bridgeRequest);

    health.setState({
      bridgeStatus: pairing.activeSessions() > 0 ? 'connected' : 'disconnected',
      activeSessions: pairing.activeSessions(),
      documentRevision: commandBus.state().revision,
      logEntries: log.size().count,
      logBytes: log.size().bytes,
      outstandingConfirmationTokens: protocol.outstandingTokenCount(),
    });

    response.writeHead(result.status, result.headers);
    response.end(result.body === null ? '' : JSON.stringify(result.body));
  })().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[mcp-companion] request failed:', err);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
    }
    response.end(JSON.stringify({ ok: false, error: { code: 'EXECUTION_FAILED', message: 'internal error' } }));
  });
});

// ── Event channel (SPEC-F §3.1: WebSocket for events/progress) ─────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Forward EditorSession change events over WebSocket to paired browser sessions (Item 4)
commandBus.getSession().subscribe((event) => {
  const msg = JSON.stringify({
    type: 'revision',
    revision: event.revision,
    kind: event.kind,
    placementIds: event.placementIds,
    chunkKeys: event.chunkKeys,
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
});

wss.on('connection', (socket, upgradeRequest) => {
  // Origin validation on upgrade (§2.6: "WebSocket: origin validation on upgrade; no token in URL").
  const origin = upgradeRequest.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.includes(origin)) {
    socket.close(1008, 'origin not allowed');
    return;
  }
  health.setState({ bridgeStatus: 'connected' });
  socket.send(JSON.stringify({ type: 'hello', version: '0.1.0', revision: commandBus.state().revision }));

  socket.on('message', (raw) => {
    // The token is sent in the first message, never in the URL (§2.6).
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: { code: 'VALIDATION_FAILED', message: 'not JSON' } }));
      return;
    }
    const message = parsed as { type?: string; token?: string };
    if (message.type === 'pair' && typeof message.token === 'string') {
      const result = pairing.connect({ token: message.token });
      socket.send(
        JSON.stringify(
          result.ok
            ? { type: 'paired', sessionId: result.sessionId, projectId: result.projectId }
            : { type: 'rejected', reason: result.reason },
        ),
      );
      return;
    }
    socket.send(JSON.stringify({ type: 'ack', revision: commandBus.state().revision }));
  });

  socket.on('close', () => {
    health.setState({ bridgeStatus: pairing.activeSessions() > 0 ? 'connected' : 'disconnected' });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────

httpServer.listen(PORT, HOST, () => {
  // A pairing token is printed once at startup so the operator can paste it into the editor.
  // Plaintext is displayed and then dropped: only its SHA-256 digest is retained (SPEC-F F12).
  const { token } = pairing.generate(commandBus.state().projectId);
  // eslint-disable-next-line no-console
  console.log(`[mcp-companion] listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[mcp-companion] allowed origins: ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
  // eslint-disable-next-line no-console
  console.log(`[mcp-companion] pairing token (5-minute TTL, one-time use): ${token}`);
});

/** Graceful shutdown so the port is released between runs. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // eslint-disable-next-line no-console
    console.log(`[mcp-companion] ${signal} received, closing`);
    wss.close();
    httpServer.close(() => process.exit(0));
  });
}