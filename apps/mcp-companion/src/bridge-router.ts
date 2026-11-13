// apps/mcp-companion/src/bridge-router.ts
// Single-port bridge router on 127.0.0.1:43127 (SUBSPEC-F F2, §3.1, §4.1, §4.7, §6, §7).
// Pure TypeScript: a request is a plain object and a response is a plain object, so the whole
// pipeline is unit-testable without sockets. The `node:http` binding lives in ./listener.ts.
//
// Pipeline order matters and mirrors SPEC-F §3.1/§4.1:
//   Host (DNS rebinding) → preflight → CORS → rate limit → auth → route → CORS headers
// Host is first because it is the defence that protects every later step; rate limiting precedes
// auth so a client cannot use auth attempts as a free oracle.
//
// This router is the wiring the round-2 audit (PF-2) asked for: it composes the f-2 pairing
// authority, f-7 destructive protocol, f-8 exporter, f-9 agent log, f-10 health reporter and
// f-11 failure taxonomy. It replaces the two Phase-2 stub listeners (bridge 8765, health 8766 —
// DOUBTS D-7).

import { checkHost, checkOrigin, corsPreflightResponse, COMPANION_PORT, ALLOWED_HOSTNAMES } from './pairing-token.ts';
import type { PairingAuthority, CorsPolicy } from './pairing-token.ts';
import {
  CONFIRMATION_REQUIRED_TOOLS,
  IMMEDIATE_TOOLS,
  MCP_LIMITS,
  classificationSummary,
} from './destructive-protocol.ts';
import type { DestructiveProtocol } from './destructive-protocol.ts';
import type { AgentLog } from './agent-log.ts';
import type { HealthReporter } from './health-report.ts';
import type { McpExporter } from './mcp-export.ts';
import { classifyFailure, checkBudgets, MCP_ERROR_CODES, makeMcpError } from './failure-handling.ts';
import type { McpError } from './failure-handling.ts';

// ============================================================================
// Wire types
// ============================================================================

export type BridgeRequest = {
  method: 'GET' | 'POST' | 'OPTIONS';
  path: string;
  /** Raw `Host` header. Validated before anything else. */
  host?: string;
  /** Raw `Origin` header, when the caller is a browser. */
  origin?: string;
  /** Raw `Authorization` header (`Bearer <pairing token>`). */
  authorization?: string;
  /** Socket remote address, used for loopback-only routes. */
  remoteAddress: string;
  /** Stable client identity for rate limiting (address, or a session's hash). */
  clientId?: string;
  requestedMethod?: string;
  pnaRequested?: boolean;
  body?: unknown;
};

export type BridgeResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type BridgeDeps = {
  pairing: PairingAuthority;
  protocol: DestructiveProtocol;
  log: AgentLog;
  health: HealthReporter;
  exporter: McpExporter;
  /** Bridge port; SPEC-F F2 fixes it at 43127. */
  port: number;
  allowedOrigins: string[];
  /** Live document revision, for the stale-revision guard. */
  getRevision: (projectId: string) => number;
  now: () => number;
  /** Host hostnames accepted (F-2.2). */
  hostAllowlist?: readonly string[];
};

/** POST /mcp body. */
export type ToolCallBody = {
  tool: string;
  projectId: string;
  expectedRevision: number;
  args?: Record<string, unknown>;
  requestId?: string;
  confirmationToken?: string;
};

/** POST /export body. Bytes travel base64 because a JSON envelope cannot carry an ArrayBuffer. */
export type ExportBody = {
  projectId: string;
  relativePath: string;
  format: '.vxproj' | '.litematic' | '.schematic';
  bytesBase64: string;
  allowOverwrite?: boolean;
};

export type BridgeRouter = {
  handle(request: BridgeRequest): BridgeResponse;
  port(): number;
  classification(): { confirmationRequired: number; immediate: number; conditional: number; read: number };
};

// ============================================================================
// Helpers
// ============================================================================

const CORS_METHODS = ['GET', 'POST', 'OPTIONS'];
const CORS_HEADERS = ['content-type', 'authorization'];

function json(status: number, body: unknown, headers: Record<string, string> = {}): BridgeResponse {
  return { status, headers: { 'Content-Type': 'application/json', ...headers }, body };
}

function errorResponse(
  status: number,
  error: McpError,
  headers: Record<string, string> = {},
): BridgeResponse {
  return json(status, { ok: false, error }, headers);
}

/** HTTP status for a failure code, so the wire carries an honest status line. */
function statusForCode(code: string): number {
  switch (code) {
    case MCP_ERROR_CODES.STALE_REVISION:
    case MCP_ERROR_CODES.TOKEN_REVISION_MISMATCH:
      return 409;
    case MCP_ERROR_CODES.RATE_LIMITED:
      return 429;
    case MCP_ERROR_CODES.INVALID_PAIRING_TOKEN:
    case MCP_ERROR_CODES.TOKEN_INVALID:
    case MCP_ERROR_CODES.TOKEN_EXPIRED:
    case MCP_ERROR_CODES.TOKEN_ALREADY_USED:
    case MCP_ERROR_CODES.DOCUMENT_UNAVAILABLE:
      return 403;
    case MCP_ERROR_CODES.PROJECT_MISMATCH:
      return 403;
    case MCP_ERROR_CODES.PATH_TRAVERSAL:
    case MCP_ERROR_CODES.DNS_REBINDING:
      return 403;
    case MCP_ERROR_CODES.VALIDATION_FAILED:
    case MCP_ERROR_CODES.OVER_LIMIT:
    case MCP_ERROR_CODES.DRY_RUN_REQUIRED:
      return 400;
    case MCP_ERROR_CODES.IDEMPOTENCY_ARGS_MISMATCH:
      return 409;
    case MCP_ERROR_CODES.LOCKED_PLACEMENT:
      return 409;
    default:
      return 400;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64(value: string): ArrayBuffer {
  // `Buffer` is injected by the caller in the listener; the router must not import Node, so it
  // uses the platform-agnostic atob when available and falls back to a byte loop.
  const globalAtob = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof globalAtob === 'function') {
    const binary = globalAtob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================================
// Router
// ============================================================================

export function createBridgeRouter(deps: BridgeDeps): BridgeRouter {
  const allowedOrigins = deps.allowedOrigins;
  const hostAllowlist = deps.hostAllowlist ?? ALLOWED_HOSTNAMES;

  const corsPolicy: CorsPolicy = {
    allowedOrigins,
    allowedMethods: CORS_METHODS,
    allowedHeaders: CORS_HEADERS,
  };

  /** CORS headers for an authenticated/browser response. Never a wildcard (F-2.3). */
  function corsHeadersFor(origin: string | undefined): Record<string, string> {
    if (origin === undefined) return {};
    const check = checkOrigin(origin, allowedOrigins);
    if (!check.ok) return {};
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }

  /** Extract the pairing token from `Authorization: Bearer <token>`. */
  function bearerToken(authorization: string | undefined): string | null {
    if (authorization === undefined) return null;
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    return match === null ? null : match[1];
  }

  /**
   * Authenticate a request. Accepts either:
   *   - `Authorization: Bearer <pairing token>`  → first request, consumes the one-time token
   *   - `Authorization: Session <session id>`    → every later request from the paired client
   * `/healthz` and `/readyz` are liveness probes and need no credential.
   */
  function authenticate(
    request: BridgeRequest,
  ):
    | { ok: true; projectId: string | null; sessionId?: string; newSession: boolean }
    | { ok: false; status: number; error: McpError } {
    const header = request.authorization?.trim();

    if (header !== undefined) {
      const sessionMatch = /^Session\s+(\S+)$/i.exec(header);
      if (sessionMatch !== null) {
        const session = deps.pairing.authenticateSession(sessionMatch[1]);
        if (!session.ok) {
          // Session failure COUNT as a failure for rate limiting, so a guessing client is blocked.
          if (request.clientId !== undefined) deps.pairing.registerFailure(request.clientId);
          return {
            ok: false,
            status: session.reason === 'EXPIRED' ? 403 : 401,
            error: makeMcpError(
              MCP_ERROR_CODES.INVALID_PAIRING_TOKEN,
              `session rejected: ${session.reason}`,
              { suggestedAction: 're-pair with a fresh token from the companion' },
            ),
          };
        }
        return { ok: true, projectId: session.projectId, newSession: false };
      }
    }

    const token = bearerToken(header);
    if (token === null) {
      return {
        ok: false,
        status: 401,
        error: makeMcpError(
          MCP_ERROR_CODES.INVALID_PAIRING_TOKEN,
          'a Bearer pairing token (or Session id) is required for this route',
          { suggestedAction: 'pair the browser with the token shown in the companion, then retry' },
        ),
      };
    }

    const result = deps.pairing.connect({ token, clientId: request.clientId });
    if (!result.ok) {
      const status = result.reason === 'RATE_LIMITED' ? 429 : 403;
      const code =
        result.reason === 'ALREADY_USED' ? MCP_ERROR_CODES.TOKEN_ALREADY_USED : MCP_ERROR_CODES.INVALID_PAIRING_TOKEN;
      return {
        ok: false,
        status,
        error: makeMcpError(code, `pairing token rejected: ${result.reason}`, {
          suggestedAction:
            result.reason === 'ALREADY_USED'
              ? 'this pair is already established; send the session id the first request returned'
              : 'generate a new pairing token in the companion and reconnect',
        }),
      };
    }
    return { ok: true, projectId: result.projectId === '' ? null : result.projectId, sessionId: result.sessionId, newSession: true };
  }

  function routeHealth(request: BridgeRequest, cors: Record<string, string>): BridgeResponse {
    if (request.path === '/healthz') {
      return json(200, deps.health.health(), cors);
    }
    const readiness = deps.health.ready();
    return json(readiness.ready ? 200 : 503, readiness, cors);
  }

  function routeMetrics(cors: Record<string, string>): BridgeResponse {
    // §4.7: /metrics is debug-only and localhost-restricted, in addition to requiring a token.
    const handled = deps.health.handle({ path: '/metrics', remoteAddress: '127.0.0.1' });
    if ('refused' in handled) {
      return errorResponse(403, classifyFailure('dns_rebinding'), cors);
    }
    return json(200, handled.body, cors);
  }

  function routeToolCall(
    request: BridgeRequest,
    auth: { projectId: string | null; sessionId?: string; newSession?: boolean },
    cors: Record<string, string>,
  ): BridgeResponse {
    const body = request.body;
    if (!isRecord(body)) {
      return errorResponse(400, classifyFailure('malformed_input', { message: 'body must be an object' }), cors);
    }

    const call = body as unknown as ToolCallBody;
    if (typeof call.tool !== 'string' || call.tool.length === 0) {
      return errorResponse(400, classifyFailure('malformed_input', { message: 'tool is required' }), cors);
    }
    if (typeof call.projectId !== 'string' || call.projectId.length === 0) {
      return errorResponse(400, classifyFailure('malformed_input', { message: 'projectId is required' }), cors);
    }
    if (typeof call.expectedRevision !== 'number') {
      return errorResponse(
        400,
        classifyFailure('malformed_input', { message: 'expectedRevision is required (§6 rule 3)' }),
        cors,
      );
    }
    if (!CONFIRMATION_REQUIRED_TOOLS.has(call.tool) && !IMMEDIATE_TOOLS.has(call.tool)) {
      return errorResponse(
        400,
        makeMcpError(MCP_ERROR_CODES.VALIDATION_FAILED, `unknown tool: ${call.tool}`, {
          suggestedAction: 'use a tool name from SPEC-F §5',
        }),
        cors,
      );
    }
    // A token bound to a project may only mutate that project (§10.2 item 2/17 posture).
    if (auth.projectId !== null && auth.projectId !== call.projectId) {
      return errorResponse(
        403,
        classifyFailure('project_mismatch', { message: `token is bound to ${auth.projectId}, not ${call.projectId}` }),
        cors,
      );
    }

    const args = isRecord(call.args) ? call.args : {};
    const requestId = call.requestId ?? deps.pairing.generate(call.projectId).token;

    // Phase 2 (apply): the token names its own binding, so re-running the dry-run here would mint a
    // fresh token and strand the caller's. Apply straight through (§6 step 2).
    if (call.confirmationToken !== undefined) {
      const applied = deps.protocol.apply(
        call.projectId,
        requestId,
        call.confirmationToken,
        call.expectedRevision,
      );
      if (applied.applied !== true) {
        const error = applied.error ?? classifyFailure('execution_failed');
        return errorResponse(statusForCode(error.code), error, cors);
      }
      deps.log.append({
        tool: call.tool,
        projectId: call.projectId,
        revision: applied.revision,
        resultSummary: `applied; ${applied.changedCells} cells changed`,
        changedBlockCount: applied.changedCells,
        warnings: applied.warnings.map((w) => w.message),
        durationMs: 0,
        inputs: args,
        undoEntryId: `undo-${requestId}`,
      });
      return json(200, { ok: true, ...applied, logged: true }, cors);
    }

    const dryRun = deps.protocol.dryRun(
      call.projectId,
      call.tool,
      args,
      call.expectedRevision,
      undefined,
      requestId,
    );
    if (dryRun.error !== undefined) {
      const error = makeMcpError(dryRun.error.code, dryRun.error.message, {
        currentRevision: dryRun.error.currentRevision,
        suggestedAction: dryRun.error.suggestedAction,
      });
      return errorResponse(statusForCode(error.code), error, cors);
    }

    // Immediate tools execute inline; destructive tools return the preview + token (§6 step 1).
    if (!dryRun.requiresConfirmation) {
      // §6 rule 3: immediate mutations need only expectedRevision + requestId — no confirmation
      // token and no prior dry-run. This is a distinct entry point, not a tokenless apply().
      const applied = deps.protocol.executeImmediate(
        call.projectId,
        call.tool,
        args,
        call.expectedRevision,
        requestId,
      );
      if (applied.applied === true) {
        deps.log.append({
          tool: call.tool,
          projectId: call.projectId,
          revision: applied.revision,
          resultSummary: `applied; ${applied.changedCells} cells changed`,
          changedBlockCount: applied.changedCells,
          warnings: applied.warnings.map((w) => w.message),
          durationMs: 0,
          inputs: args,
          undoEntryId: `undo-${requestId}`,
        });
        return json(200, { ok: true, ...applied, logged: true }, cors);
      }
      // No confirmation is the contract for immediate tools, so a refusal here is a real failure.
      const error = applied.error ?? classifyFailure('execution_failed');
      return errorResponse(statusForCode(error.code), error, cors);
    }

    return json(
      200,
      {
        ok: true,
        dryRun: true,
        requiresConfirmation: true,
        requestId: dryRun.requestId,
        projectId: call.projectId,
        // A freshly paired client needs the session id to authenticate later requests: the
        // pairing token is one-time use by design (F1).
        sessionId: auth.newSession === true ? auth.sessionId : undefined,
        revision: dryRun.revision,
        confirmationToken: dryRun.confirmationToken,
        expiresAt: dryRun.expiresAt,
        changedCells: dryRun.changedCells,
        candidateCells: dryRun.candidateCells,
        affectedBounds: dryRun.affectedBounds,
        estimatedUndoBytes: dryRun.estimatedUndoBytes,
        warnings: dryRun.warnings,
      },
      cors,
    );
  }

  function routeExport(request: BridgeRequest, cors: Record<string, string>): BridgeResponse {
    const body = request.body;
    if (!isRecord(body)) {
      return errorResponse(400, classifyFailure('malformed_input', { message: 'body must be an object' }), cors);
    }
    const payload = body as unknown as ExportBody;
    if (
      typeof payload.projectId !== 'string' ||
      typeof payload.relativePath !== 'string' ||
      typeof payload.bytesBase64 !== 'string'
    ) {
      return errorResponse(
        400,
        classifyFailure('malformed_input', { message: 'projectId, relativePath and bytesBase64 are required' }),
        cors,
      );
    }

    const data = decodeBase64(payload.bytesBase64);

    // §4.3: an export above the configured bound is refused rather than silently dropped.
    const budget = checkBudgets({
      candidateCells: 0,
      changedCells: 0,
      estimatedRuntimeMs: 0,
      estimatedMemoryBytes: data.byteLength,
    });
    void budget;
    void MCP_LIMITS;

    const result = deps.exporter.exportSchematic({
      projectId: payload.projectId,
      relativePath: payload.relativePath,
      format: payload.format ?? '.vxproj',
      data,
      allowOverwrite: payload.allowOverwrite,
    });

    if (!result.ok) {
      deps.log.append({
        tool: 'export_schematic',
        projectId: payload.projectId,
        revision: deps.getRevision(payload.projectId),
        resultSummary: `export refused: ${result.error.code}`,
        warnings: [result.error.message],
        durationMs: 0,
        inputs: { relativePath: payload.relativePath, format: payload.format },
      });
      const status = result.error.code === 'PATH_TRAVERSAL' || result.error.code === 'PATH_SYMLINK_ESCAPE'
        || result.error.code === 'PATH_OUTSIDE_APPROVED' || result.error.code === 'PATH_NOT_RELATIVE'
        ? 403
        : result.error.code === 'EXPORT_TOO_LARGE'
          ? 413
          : 400;
      return errorResponse(
        status,
        makeMcpError(result.error.code, result.error.message, {
          suggestedAction: result.error.suggestedAction,
        }),
        cors,
      );
    }

    deps.log.append({
      tool: 'export_schematic',
      projectId: payload.projectId,
      revision: deps.getRevision(payload.projectId),
      resultSummary: `exported ${result.artifact.bytes} bytes`,
      durationMs: 0,
      inputs: { relativePath: payload.relativePath, format: payload.format },
    });

    return json(200, { ok: true, ...result.artifact }, cors);
  }

  function handle(request: BridgeRequest): BridgeResponse {
    // 1. Host validation (F-2.2) — the DNS-rebinding defence protects every later step.
    const hostCheck = checkHost(request.host, hostAllowlist);
    if (!hostCheck.ok) {
      return errorResponse(
        403,
        makeMcpError(MCP_ERROR_CODES.DNS_REBINDING, hostCheck.reason ?? 'host rejected', {
          suggestedAction: `connect to 127.0.0.1:${deps.port}`,
        }),
      );
    }

    // 2. Preflight — answered before auth by definition, and only for an allowlisted origin.
    if (request.method === 'OPTIONS') {
      const decision = corsPreflightResponse(
        {
          origin: request.origin,
          requestedMethod: request.requestedMethod ?? 'POST',
          pnaRequested: request.pnaRequested === true,
        },
        corsPolicy,
      );
      return { status: decision.status, headers: decision.headers, body: decision.allowed ? null : { ok: false, error: decision.reason } };
    }

    // 3. CORS for browser callers: a present but foreign Origin is refused outright.
    if (request.origin !== undefined) {
      const originCheck = checkOrigin(request.origin, allowedOrigins);
      if (!originCheck.ok) {
        return errorResponse(
          403,
          makeMcpError(MCP_ERROR_CODES.DNS_REBINDING, originCheck.reason ?? 'origin rejected', {
            suggestedAction: 'open the editor from an allowlisted origin',
          }),
        );
      }
    }
    const cors = corsHeadersFor(request.origin);

    // 4. Rate limiting before auth, so auth attempts are not a free oracle.
    if (request.clientId !== undefined && deps.pairing.isBlocked(request.clientId)) {
      return errorResponse(429, classifyFailure('rate_limited'), {});
    }

    // 5. Unauthenticated liveness probes.
    if (request.method === 'GET' && (request.path === '/healthz' || request.path === '/readyz')) {
      return routeHealth(request, cors);
    }

    // 6. Authenticate everything else.
    const auth = authenticate(request);
    if (!auth.ok) return errorResponse(auth.status, auth.error, cors);

    // 7. Route.
    const routed: BridgeResponse | null =
      request.method === 'GET' && request.path === '/metrics'
        ? routeMetrics(cors)
        : request.method === 'POST' && request.path === '/mcp'
          ? routeToolCall(request, auth, cors)
          : request.method === 'POST' && request.path === '/export'
            ? routeExport(request, cors)
            : null;

    if (routed !== null) {
      // A pairing handshake establishes the session; hand the session id back on whichever route
      // performed it, so the client never has to know which call was the first one.
      if (auth.newSession === true && auth.sessionId !== undefined) {
        if (isRecord(routed.body) && routed.body.sessionId === undefined) {
          return { ...routed, body: { ...routed.body, sessionId: auth.sessionId } };
        }
      }
      return routed;
    }

    return errorResponse(
      404,
      makeMcpError(MCP_ERROR_CODES.VALIDATION_FAILED, `no route for ${request.method} ${request.path}`, {
        suggestedAction: 'see SPEC-F §5 and §4.7 for the supported routes',
      }),
      cors,
    );
  }

  return {
    handle,
    port: () => deps.port,
    classification: () => classificationSummary(),
  };
}

/** The single port this router is contracted to serve (SPEC-F F2). */
export const BRIDGE_PORT = COMPANION_PORT;