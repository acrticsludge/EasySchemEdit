# Subspec C — Slice c-9: Idempotency Keys — Dedupe Repeated Saves

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.9 (Idempotency), §2.3.11 (Idempotency)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/persistence` only.

## Goal

Implement idempotency key system: dedupe repeated saves using `{projectId}-{revision}-{operation}` keys with TTL-based expiration.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/idempotency.ts` | create | `IdempotencyRecord`, `IdempotencyManager` types + functions |

## Types / APIs

```ts
export interface IdempotencyRecord {
  key: string;
  projectId: string;
  revision: number;
  operation: string;
  result: unknown;
  createdAt: number;
  expiresAt: number;
}

export interface IdempotencyConfig {
  defaultTTLMs: number;       // default 300000 (5 minutes)
}

export class IdempotencyManager {
  constructor(db: IDBDatabase, config?: IdempotencyConfig);
  check(key: string): Promise<{ hit: true; result: unknown } | { hit: false }>;
  set(key: string, projectId: string, revision: number, operation: string, result: unknown): Promise<void>;
  cleanup(): Promise<number>;  // returns count of expired records removed
}
```

## Acceptance criteria

1. check() returns cached result if key exists and not expired
2. check() returns miss if key not found or expired
3. set() stores result with key, projectId, revision, operation
4. cleanup() removes expired records, returns count removed
5. Same key with same revision returns cached result (dedupe)

## Tests

No test file yet — verification via typecheck. Test file `slice-c-9-idempotency.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
