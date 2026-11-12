# Subspec D — Slice d-11: Operation Budgets + Worker Offload

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Operation budgets), §4.1 (Worker offload threshold)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement operation budgets: candidate cells tracking, runtime estimate, memory estimate, 25k cells / 8ms threshold for worker offload decision.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/operation-budgets.ts` | create | `OperationBudget`, `BudgetCheckResult`, `BudgetEngine` class |

## Types / APIs

```ts
export interface OperationBudget {
  candidateCells: number;   // total cells examined
  changedCells: number;     // actually changed cells
  runtimeEstimateMs: number;
  memoryEstimateBytes: number;
  shouldOffloadToWorker: boolean;  // true if > 25k cells or > 8ms
}

export interface BudgetCheckResult {
  ok: boolean;              // within budget
  reason?: string;          // why not ok
  budget: OperationBudget;
}

export class BudgetEngine {
  readonly maxCells: number;         // 25000
  readonly maxRuntimeMs: number;     // 8
  readonly maxMemoryBytes: number;   // configurable

  checkBudget(candidateCells: number, changedCells: number): BudgetCheckResult;
  estimateRuntime(cellCount: number): number;
  estimateMemory(cellCount: number): number;
  shouldOffload(budget: OperationBudget): boolean;
}
```

## Acceptance criteria

1. Candidate cells = total cells examined in operation
2. Changed cells = actually modified cells
3. Runtime estimate based on cell count
4. Memory estimate based on cell count
5. shouldOffloadToWorker = true when candidateCells > 25000 OR runtimeEstimateMs > 8
6. Budget check returns ok=false when exceeding limits

## Tests

No test file yet — verification via typecheck. Test file `slice-d-11-budgets.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
