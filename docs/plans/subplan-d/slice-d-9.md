# Subspec D — Slice d-9: Verify and Material Report

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Verify operation, Material report), §5.7 (Verify operation)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement verify operation: compare placed blocks against source, report missing/extra/wrong-state per-placement/per-region. Material report: per-type block counts, exportable CSV, hover row highlights blocks.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/verify-material.ts` | create | `VerifyResult`, `MaterialReport`, `VerifyMaterialEngine` class with verify() and materialReport() methods |

## Types / APIs

```ts
export interface VerifyComparison {
  position: Vec3i;
  sourceState: BlockStateId | null;
  placedState: BlockStateId | null;
  status: 'match' | 'missing' | 'extra' | 'wrong-state';
}

export interface VerifyResult {
  success: boolean;
  comparisons: VerifyComparison[];
  missingCount: number;
  extraCount: number;
  wrongStateCount: number;
  matchCount: number;
  perPlacement: Record<string, { missing: number; extra: number; wrongState: number; match: number }>;
}

export interface MaterialTypeCount {
  blockId: string;
  count: number;
  percentage: number;
}

export interface MaterialReport {
  totalBlocks: number;
  totalTypes: number;
  typeCounts: MaterialTypeCount[];
  csv: string;  // exportable CSV
}

export class VerifyMaterialEngine {
  verify(project: Project, sourceBlocks: Map<string, BlockStateId>, bounds: Bounds3i): VerifyResult;
  materialReport(project: Project, bounds: Bounds3i): MaterialReport;
}
```

## Acceptance criteria

1. Verify: missing = in source but not placed; extra = placed but not in source; wrong-state = placed but wrong block ID/props
2. Verify: match = source and placed match exactly
3. Verify results broken down per-placement
4. Material report: per-type block counts with percentage
5. Material report CSV exportable
6. All bounds-respecting (only compare within bounds)

## Tests

No test file yet — verification via typecheck. Test file `slice-d-9-verify-material.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
