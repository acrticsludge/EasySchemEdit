# Subspec B — Slice b-10: Export Semantics

**Goal:** Implement export semantics per SUBSPEC-B §8: trimOuterAir configurable, oversized axis auto-split, strict vs permissive export, hidden placements excluded by default.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/export-semantics.ts` | Export semantics implementation |

## Functions to Define

```ts
export type ExportSemanticsResult = {
  trimmedAirBlocks: number;
  originalDimensions: Vec3i;
  trimmedDimensions: Vec3i;
  splitAxes: 'x' | 'y' | 'z'[];   // axes that required auto-split
  lossyOperations: string[];       // descriptions of what was lost
};

export function computeExportSemantics(
  snapshot: ProjectSnapshot,
  target: ExportTarget,
  options: ExportOptions,
): ExportSemanticsResult;
```

## Rules

### Outer-air trimming (configurable)
- `trimOuterAir` defaults to `true`; `false` is allowed (not an error)
- When `false`, outer air is preserved and Offset/origin metadata adjusted so world-space positions remain unchanged

### Oversized axis auto-split
- If any remaining dimension exceeds 65,535 after air trim, attempt automatic spatial splitting along that axis
- Each split region must be under the 65,535 limit
- If splitting cannot preserve fidelity, refuse export with `EXPORT_DIMENSION_LIMIT` showing which axis and split result

### Strict vs permissive export
- **Strict (default):** refuse to export if a known fidelity-breaking condition exists, unless user explicitly acknowledges via `confirmLossy`
- **Permissive:** allow export but include visible report of exactly which data was not preserved

### Export semantics
- **Placement:** bakes transform into output blocks
- **Import group:** preserves or flattens per eligibility checker (slice b-6)
- **Composite:** bakes transforms and applies overlap policy (top-wins/bottom-wins)
- **Hidden placements:** excluded by default, includable via option

## Acceptance Criteria

- [ ] `trimOuterAir` defaults to `true`; `false` allowed
- [ ] `trimOuterAir: false` adjusts Offset/origin metadata so world-space positions unchanged
- [ ] Oversized axis auto-split attempted when dimension > 65,535 after trim
- [ ] Split cannot preserve fidelity → `EXPORT_DIMENSION_LIMIT` with axis and split result
- [ ] Strict mode refuses fidelity-breaking export unless `confirmLossy` acknowledged
- [ ] Permissive mode proceeds with visible report of data not preserved
- [ ] Placement export bakes transform
- [ ] Import group preserves or flattens per eligibility
- [ ] Composite export bakes transforms and applies overlap policy
- [ ] Hidden placements excluded by default, includable via option

## Tests

**File:** `packages/formats/__tests__/slice-b-10-export-semantics.test.ts`

1. trimOuterAir defaults to true
2. trimOuterAir: false preserves air and adjusts Offset/origin
3. Oversized axis → auto-split attempted
4. Split cannot preserve fidelity → `EXPORT_DIMENSION_LIMIT`
5. Strict mode refuses unless confirmLossy
6. Permissive mode proceeds with report
7. Placement export bakes transform
8. Hidden placements excluded by default

## Verification Checklist

- [ ] Change does one thing completely (export semantics)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
