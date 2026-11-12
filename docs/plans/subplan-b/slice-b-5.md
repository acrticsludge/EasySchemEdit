# Subspec B — Slice b-5: Export Semantics

**Goal:** Implement export semantics: trimOuterAir (default true; false allowed with Offset/origin adjusted), strict vs permissive + confirmLossy, hidden placements excluded by default, bake transform for placement, composite applies overlap policy. Define ExportError. Keep EXPORT_DIMENSION_LIMIT (no auto-split). Remove decompression-ratio check entirely; use absolute caps from maxDecompressedBytes; set realistic maxTotalVolume default.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/export-semantics.ts` | Export validation + dimension limits |

## trimOuterAir

- Default: `true`
- `false` allowed: Offset/origin metadata adjusted to account for untrimmed air
- Not an error to set `false`

## Strict vs Permissive

- `strict`: all validation errors throw `ExportError`
- `permissive`: warnings emitted, export proceeds where possible
- `confirmLossy`: required when data loss is expected (user confirmation)

## Hidden Placements

- Excluded by default from export
- Includable via `includeHidden: boolean` on selection/composite targets

## Bake Transform

- Placement export: bake transform into block positions
- Composite export: applies overlap policy (`top-wins` / `bottom-wins`)

## Dimension Limit

- Drop auto-split entirely
- Any dimension > 65,535 → `EXPORT_DIMENSION_LIMIT`
- `maxTotalVolume` default: 65,535³ (realistic)

## Safety Limits (no ratio check)

- Remove decompression-ratio check entirely
- Absolute caps from `maxDecompressedBytes` only
- `maxTotalVolume` default set realistically

## ExportError

```ts
export class ExportError extends Error {
  readonly code: 'EXPORT_DIMENSION_LIMIT' | 'EXPORT_REGION_GROUPING_LOST' | 'EXPORT_LOSSY_CONFIRM_REQUIRED' | string;
  constructor(code: string, message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.name = 'ExportError';
  }
}
```

## Acceptance Criteria

- [ ] `trimOuterAir` defaults true; `false` allowed with Offset/origin adjusted
- [ ] `strict` vs `permissive` modes; `confirmLossy` for lossy exports
- [ ] Hidden placements excluded by default; includable via option
- [ ] Placement export bakes transform
- [ ] Composite export applies overlap policy
- [ ] Dimension > 65,535 → `EXPORT_DIMENSION_LIMIT` (no auto-split)
- [ ] No decompression-ratio check; absolute caps from `maxDecompressedBytes`
- [ ] `maxTotalVolume` default = 65,535³
- [ ] `ExportError` class with `code` field

## Tests

**File:** `packages/formats/__tests__/slice-b-5-export.test.ts`

1. `trimOuterAir` default true; `false` allowed with Offset adjusted
2. `strict` mode throws on validation errors; `permissive` warns
3. `confirmLossy` required for lossy exports
4. Hidden placements excluded by default
5. Placement export bakes transform
6. Composite export applies overlap policy
7. Dimension > 65,535 → `EXPORT_DIMENSION_LIMIT`
8. No decompression-ratio check; absolute caps only

## Verification Checklist

- [ ] Change does one thing completely (export semantics)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
