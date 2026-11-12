# Subspec C — Slice c-7: Storage Budget — Quota Monitoring

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.7 (Storage budget), §2.3.9 (Storage budget)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/persistence` only.

## Goal

Implement IndexedDB storage budget monitoring: quota estimation, usage tracking, warnings before limit, budget check before writes.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/storage-budget.ts` | create | `StorageBudget`, `QuotaInfo`, `StorageBudgetManager` types + functions |

## Types / APIs

```ts
export interface QuotaInfo {
  quota: number;           // total quota in bytes
  usage: number;           // current usage in bytes
  remaining: number;       // remaining quota in bytes
  percentage: number;      // usage/quota * 100
}

export interface StorageBudgetConfig {
  warningThreshold: number;  // 0.8 (80%)
  criticalThreshold: number; // 0.9 (90%)
}

export class StorageBudgetManager {
  constructor(config: StorageBudgetConfig);
  estimateQuota(): Promise<QuotaInfo>;
  checkBudget(estimatedBytes: number): { ok: true } | { ok: false; error: string };
  onWarning(callback: (info: QuotaInfo) => void): void;
  onCritical(callback: (info: QuotaInfo) => void): void;
}
```

## Acceptance criteria

1. estimateQuota() returns quota, usage, remaining, percentage
2. checkBudget() returns ok=false if estimatedBytes would exceed critical threshold
3. Warning callback fires when usage > warningThreshold
4. Critical callback fires when usage > criticalThreshold
5. Budget check prevents writes that would exceed quota

## Tests

No test file yet — verification via typecheck. Test file `slice-c-7-storage-budget.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
