// apps/mcp-companion/src/health-report.ts
// Health / readiness / metrics payload layer (SUBSPEC-F §2.8, §4.7, §10.1, F8).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
//
// Scope note: `src/health.ts` is the Phase-2 H-foundation HTTP listener (port 8766, static JSON).
// This module is the payload layer it should serve. The listener is NOT rewritten here, so the
// H-foundation decision is not silently replaced; wiring is an explicit follow-up.
//
// Error text is sanitized before it enters a payload, so health output cannot leak a token or path.
// The sanitizer is INJECTED rather than imported: a value import of `./agent-log.ts` inside `src/`
// fails TS5097 under this package's tsconfig (`.ts` specifiers are only legal for type-only imports,
// which are elided). Injection is also this codebase's established style for collaborators.

// ============================================================================
// Paths (SPEC-F §4.7)
// ============================================================================

export const HEALTH_PATHS = {
  healthz: '/healthz',
  readyz: '/readyz',
  metrics: '/metrics',
} as const;

// ============================================================================
// Payload types
// ============================================================================

/** SPEC-F §2.8, field for field. */
export type HealthStatus = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  bridgeStatus: 'connected' | 'disconnected' | 'pairing';
  activeSessions: number;
  lastError?: string;
};

export type CompanionState = {
  version: string;
  /** Epoch ms when the companion started. */
  startedAt: number;
  bridgeStatus: 'connected' | 'disconnected' | 'pairing';
  activeSessions: number;
  /** SPEC-F §2.1.1 single document authority. */
  authority: 'browser' | 'companion';
  /** True when the authority actually holds a document. */
  documentLoaded: boolean;
  approvedDirectories: number;
  /** Live document revision, when known. */
  documentRevision?: number;
  logEntries?: number;
  logBytes?: number;
  outstandingConfirmationTokens?: number;
  artifactCount?: number;
};

export type ReadyStatus = { ready: boolean; reasons: string[] };

export type MetricsReport = {
  uptimeMs: number;
  activeSessions: number;
  documentRevision: number | null;
  logEntries: number;
  logBytes: number;
  outstandingConfirmationTokens: number;
  artifactCount: number;
  counters: Record<string, number>;
};

export type HealthRequest = { path: string; remoteAddress: string };

export type HealthResponse = { status: number; body: unknown };
export type HealthRefusal = { status: number; refused: true; reason: string };

export type HealthReporterDeps = {
  state: CompanionState;
  /** Clock injection; defaults to `Date.now`. */
  now?: () => number;
  /** Sanitize option pass-through (username/machine name redaction). */
  username?: string;
  machineName?: string;
  /**
   * Text sanitizer injected by the caller — in production, the slice f-9 `sanitizeText`. Kept
   * injectable so this module has no intra-`src/` value imports (see the file header).
   */
  sanitize?: (text: string, options?: { username?: string; machineName?: string }) => string;
};

export type HealthReporter = {
  setState(patch: Partial<CompanionState>): void;
  getState(): CompanionState;
  recordError(message: string): void;
  clearError(): void;
  increment(counter: string, by?: number): void;
  health(): HealthStatus;
  ready(): ReadyStatus;
  metrics(): MetricsReport;
  /** §4.7: /metrics is debug-only and localhost-restricted. */
  handle(request: HealthRequest): HealthResponse | HealthRefusal;
};

// ============================================================================
// Address classification
// ============================================================================

/**
 * True only for genuine loopback forms. `0.0.0.0` is a bind wildcard and is deliberately NOT local
 * — treating it as loopback would expose /metrics on every interface.
 */
export function isLocalAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  const value = address.trim();
  if (value.length === 0) return false;
  if (value === '127.0.0.1' || value === '::1') return true;
  // IPv4-mapped IPv6 loopback.
  if (value === '::ffff:127.0.0.1') return true;
  // The whole 127.0.0.0/8 block is loopback.
  if (/^127(?:\.\d{1,3}){3}$/.test(value)) {
    const octets = value.split('.').map((part) => Number(part));
    return octets.every((octet) => octet >= 0 && octet <= 255);
  }
  return false;
}

// ============================================================================
// Factory
// ============================================================================

export function createHealthReporter(deps: HealthReporterDeps): HealthReporter {
  const now = deps.now ?? (() => Date.now());
  const sanitizeOptions = { username: deps.username, machineName: deps.machineName };
  const sanitize = deps.sanitize ?? ((text: string) => text);

  let state: CompanionState = { ...deps.state };
  let lastError: string | undefined;
  const counters: Record<string, number> = {};

  function setState(patch: Partial<CompanionState>): void {
    state = { ...state, ...patch };
  }

  function recordError(message: string): void {
    lastError = sanitize(message, sanitizeOptions);
  }

  function clearError(): void {
    lastError = undefined;
  }

  function increment(counter: string, by = 1): void {
    counters[counter] = (counters[counter] ?? 0) + by;
  }

  /**
   * Liveness. `healthy` with no outstanding error, `unhealthy` when the companion is neither
   * proxying to a browser nor holding a document (nothing can be served), `degraded` otherwise.
   */
  function health(): HealthStatus {
    let status: HealthStatus['status'];
    if (lastError !== undefined) {
      status = 'degraded';
    } else if (state.bridgeStatus === 'pairing') {
      status = 'degraded';
    } else if (state.bridgeStatus === 'disconnected' && !state.documentLoaded) {
      status = 'unhealthy';
    } else if (state.bridgeStatus === 'disconnected') {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const payload: HealthStatus = {
      status,
      version: state.version,
      uptime: now() - state.startedAt,
      bridgeStatus: state.bridgeStatus,
      activeSessions: state.activeSessions,
    };
    if (lastError !== undefined) payload.lastError = lastError;
    return payload;
  }

  /** Readiness gates: each failure names itself so the caller can act on it. */
  function ready(): ReadyStatus {
    const reasons: string[] = [];

    if (state.bridgeStatus === 'disconnected') {
      reasons.push('bridge is disconnected');
    }
    if (lastError !== undefined) {
      reasons.push(`unrecovered error: ${lastError}`);
    }
    if (state.authority === 'companion' && !state.documentLoaded) {
      reasons.push('companion authority is set but no document is loaded');
    }
    if (state.authority === 'companion' && state.approvedDirectories === 0) {
      reasons.push('no approved directory is configured for companion-authority writes');
    }

    return { ready: reasons.length === 0, reasons };
  }

  function metrics(): MetricsReport {
    return {
      uptimeMs: now() - state.startedAt,
      activeSessions: state.activeSessions,
      documentRevision: state.documentRevision ?? null,
      logEntries: state.logEntries ?? 0,
      logBytes: state.logBytes ?? 0,
      outstandingConfirmationTokens: state.outstandingConfirmationTokens ?? 0,
      artifactCount: state.artifactCount ?? 0,
      counters: { ...counters },
    };
  }

  function handle(request: HealthRequest): HealthResponse | HealthRefusal {
    if (request.path === HEALTH_PATHS.metrics && !isLocalAddress(request.remoteAddress)) {
      return {
        status: 403,
        refused: true,
        reason: `${HEALTH_PATHS.metrics} is restricted to loopback callers (§4.7)`,
      };
    }

    switch (request.path) {
      case HEALTH_PATHS.healthz:
        return { status: 200, body: health() };
      case HEALTH_PATHS.readyz: {
        const status = ready();
        return { status: status.ready ? 200 : 503, body: status };
      }
      case HEALTH_PATHS.metrics:
        return { status: 200, body: metrics() };
      default:
        return { status: 404, body: { error: 'not found', path: request.path } };
    }
  }

  function getState(): CompanionState {
    return { ...state };
  }

  return {
    setState,
    getState,
    recordError,
    clearError,
    increment,
    health,
    ready,
    metrics,
    handle,
  };
}

/** §4.7 diagnostic counts for the settings panel. */
export function healthSummary(reporter: HealthReporter): {
  status: HealthStatus['status'];
  ready: boolean;
  reasons: string[];
} {
  return {
    status: reporter.health().status,
    ready: reporter.ready().ready,
    reasons: reporter.ready().reasons,
  };
}
