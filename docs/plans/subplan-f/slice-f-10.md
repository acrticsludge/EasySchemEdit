# Subspec F — Slice f-10: Health Endpoints

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.8 (Health check), §4.7 (Health endpoint), §10.1 (Health endpoint tests)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. The HTTP server stays in `src/health.ts`'s caller; this module produces the responses.
**Depends on:** slice f-9 (`agent-log.ts` for `lastError` sanitization).

## Goal

Implement the health/readiness/metrics payloads for the local companion: `/healthz`, `/readyz`, `/metrics`, each localhost-restricted and each built from live companion state rather than static strings.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/health-report.ts` | create | `createHealthReporter`, payload builders, readiness rules, metrics formatting |
| `apps/mcp-companion/__tests__/slice-f-10-health.test.ts` | create | Status transitions, readiness gates, sanitization, metrics, localhost restriction |
| `apps/mcp-companion/src/index.ts` | update | re-export the reporter surface |

**Naming note:** the existing `src/health.ts` is the Phase-2 H-foundation HTTP listener (port 8766, static JSON). This slice adds the payload layer as `health-report.ts` rather than rewriting the listener, so the H-foundation decision is not silently replaced (GOAL.md rule 3). Wiring the listener to the reporter is a separate, explicit change.

## Types / APIs

```ts
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
  startedAt: number;
  bridgeStatus: 'connected' | 'disconnected' | 'pairing';
  activeSessions: number;
  authority: 'browser' | 'companion';
  documentLoaded: boolean;
  approvedDirectories: number;
  lastError?: string;
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

export const HEALTH_PATHS: { healthz: string; readyz: string; metrics: string };

export function isLocalAddress(address: string): boolean;
export function createHealthReporter(deps: HealthReporterDeps): HealthReporter;

export type HealthReporter = {
  setState(patch: Partial<CompanionState>): void;
  recordError(message: string): void;
  increment(counter: string, by?: number): void;
  health(): HealthStatus;
  ready(): ReadyStatus;
  metrics(): MetricsReport;
  /** §4.7: /metrics is debug-only and localhost-restricted. */
  handle(request: { path: string; remoteAddress: string }): { status: number; body: unknown } | { status: number; refused: true; reason: string };
};
```

Key rules:

- `/healthz` always answers 200 with the §2.8 shape (liveness); `/readyz` answers 200 only when every readiness gate passes, else 503 with reasons.
- Readiness gates: loopback binding, exactly one document authority, document loaded when the companion is the authority, at least one approved directory when the companion must write, and no unrecovered error.
- `/metrics` is refused unless the caller address is loopback (§4.7); the refusal is explicit, not a silent empty body.
- `lastError` passes through the slice f-9 sanitizer, so health output cannot leak a token or path.
- Uptime derives from the injected clock, so it is testable.

## Acceptance criteria

1. `/healthz` returns the exact §2.8 shape: status, version, uptime, bridgeStatus, activeSessions, lastError?.
2. `status` is `healthy` with no error, `degraded` while an error is recent or the bridge is mid-pairing, `unhealthy` when the bridge is disconnected and no document is available.
3. `/readyz` fails with a reason list naming each failed gate; it passes only when all gates pass.
4. `/metrics` is refused with 403 for a non-loopback remote address and answered for loopback.
5. Unknown paths return 404.
6. `uptime`/`uptimeMs` derive from the injected clock and grow monotonically across calls.
7. `lastError` is sanitized (no tokens, no absolute paths).
8. Counters accumulate and appear in metrics; document revision and outstanding confirmation tokens are reported.

## Tests

`apps/mcp-companion/__tests__/slice-f-10-health.test.ts`

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-10-health.test.ts
```

## Verification

- `node <typescript@5.9.3>/bin/tsc --noEmit` for `apps/mcp-companion`: exit 0
- Test command above: exit 0
