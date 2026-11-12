# Subspec B — Slice b-6: Multi-Region Export Eligibility

**Goal:** Restore multi-region export eligibility checker. `RegionGroupMetadata` with rules: same import group, not baked, relative positions intact, common rotation/mirror, litematic sources. Else single region + `EXPORT_REGION_GROUPING_LOST`. Don't replace with `ExportEligibility`.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/region-eligibility.ts` | Multi-region export eligibility checker |

## RegionGroupMetadata

```ts
export type RegionGroupMetadata = {
  importGroupId: string;
  baked: boolean;
  relativePositions: Vec3i[];       // relative to group origin
  rotation: Transform;
  mirror: 'none' | 'x' | 'z' | 'xz';
  sourceFormat: 'litematic' | 'schem-v3' | 'schem-v2' | 'schematic-legacy' | 'vanilla-nbt';
  regions: string[];                 // region names in group
};
```

## Eligibility Rules

A multi-region export is eligible only when ALL of:
1. Same import group
2. Not baked
3. Relative positions intact
4. Common rotation/mirror across all regions
5. All sources are litematic

If any rule fails → single region export + `EXPORT_REGION_GROUPING_LOST`.

## Functions to Define

```ts
export function checkRegionEligibility(groups: RegionGroupMetadata[]): {
  eligible: boolean;
  reason?: string;
  lostGrouping: boolean;
};
```

## Acceptance Criteria

- [ ] `RegionGroupMetadata` type defined with all fields
- [ ] Eligibility: same import group, not baked, relative positions intact, common rotation/mirror, litematic sources
- [ ] Failure → single region + `EXPORT_REGION_GROUPING_LOST`
- [ ] Not replaced by `ExportEligibility` type

## Tests

**File:** `packages/formats/__tests__/slice-b-6-region-eligibility.test.ts`

1. All rules pass → eligible multi-region export
2. Different import groups → `EXPORT_REGION_GROUPING_LOST`
3. Baked regions → `EXPORT_REGION_GROUPING_LOST`
4. Mixed rotation/mirror → `EXPORT_REGION_GROUPING_LOST`
5. Non-litematic source → `EXPORT_REGION_GROUPING_LOST`

## Verification Checklist

- [ ] Change does one thing completely (multi-region eligibility)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
