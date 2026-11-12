# Subspec B — Slice b-6: Multi-region Export Eligibility Checker

**Goal:** Implement deterministic multi-region export eligibility checker per SUBSPEC-B §5.5. Preserves grouping only when relative transforms intact, shared rotation/mirror, no baking; otherwise single region + `EXPORT_REGION_GROUPING_LOST`.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/region-eligibility.ts` | Export eligibility checker |

## Functions to Define

```ts
export type RegionGroupMetadata = {
  importGroupId: string;
  sourceFilename: string;
  regionNames: string[];
  regionPositions: Vec3i[];
  commonGroupTransform?: Transform;
  baked: boolean;
};

export function checkMultiRegionExportEligibility(
  snapshot: ProjectSnapshot,
  importGroupId: string,
): { eligible: boolean; reason?: string; regions: RegionGroupMetadata[] };
```

## Eligibility Rules

1. All placements must belong to this import group.
2. No placement may have been baked (flattened).
3. Relative positions must remain intact — compare current placement translations against original relative offsets.
4. Common group transform — if all placements share same rotationY and mirror, grouping can be preserved with shared group transform. If any placement has independent rotation/mirror, grouping cannot be preserved.
5. All placements must have compatible source format (litematic).

## Export Behavior

- If `eligible`: export as multi-region `.litematic` with original region names, positions, and shared group transform.
- If not eligible: export as single-region `.litematic` (flattened composite) + warning `EXPORT_REGION_GROUPING_LOST` listing which placements were merged and why.

## Acceptance Criteria

- [ ] Deterministic eligibility checker
- [ ] Preserves grouping only when relative transforms intact
- [ ] Preserves grouping only when shared rotation/mirror
- [ ] Preserves grouping only when no baking
- [ ] Otherwise single region + `EXPORT_REGION_GROUPING_LOST`
- [ ] All placements must have compatible source format (litematic)

## Tests

**File:** `packages/formats/__tests__/slice-b-6-region-eligibility.test.ts`

1. All placements in same import group → eligible
2. Baked placement → not eligible (`placementBaked`)
3. Relative positions changed → not eligible (`relativePositionsChanged`)
4. Independent transforms → not eligible (`independentTransforms`)
5. Non-litematic source format → not eligible (`unsupportedSourceFormat`)
6. Eligible → multi-region export with shared group transform

## Verification Checklist

- [ ] Change does one thing completely (region eligibility checker)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
