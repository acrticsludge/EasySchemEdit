// Slice b-5: Export semantics
import {
  validateExportDimensions,
  validateTotalVolume,
  checkLossyConfirmation,
  filterHiddenPlacements,
  computeTrimmedBounds,
  validateExport,
  MAX_DIMENSION,
  DEFAULT_MAX_TOTAL_VOLUME,
} from '../export-semantics.ts';
import { ExportError } from '../errors.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

// 1. Dimension limit: any dimension > 65535 → EXPORT_DIMENSION_LIMIT
{
  const r1 = validateExportDimensions(65536, 10, 10);
  check(!r1.valid && r1.error instanceof ExportError && r1.error.code === 'EXPORT_DIMENSION_LIMIT', 'width > 65535 → EXPORT_DIMENSION_LIMIT');
  const r2 = validateExportDimensions(10, 65536, 10);
  check(!r2.valid && r2.error!.code === 'EXPORT_DIMENSION_LIMIT', 'height > 65535 → EXPORT_DIMENSION_LIMIT');
  const r3 = validateExportDimensions(10, 10, 65536);
  check(!r3.valid && r3.error!.code === 'EXPORT_DIMENSION_LIMIT', 'length > 65535 → EXPORT_DIMENSION_LIMIT');
  const r4 = validateExportDimensions(65535, 65535, 65535);
  check(r4.valid, 'all = 65535 → valid');
}

// 2. No auto-split: dimension limit is a hard refusal, not split
{
  const r = validateExportDimensions(100000, 100, 100);
  check(!r.valid && r.error!.code === 'EXPORT_DIMENSION_LIMIT', 'oversized → refused, not split');
}

// 3. Total volume limit
{
  const maxVol = BigInt(1000) * BigInt(1000) * BigInt(1000);
  const r1 = validateTotalVolume(BigInt(999) * BigInt(999) * BigInt(999), maxVol);
  check(r1.valid, 'volume under limit → valid');
  const r2 = validateTotalVolume(maxVol + 1n, maxVol);
  check(!r2.valid && r2.error!.code === 'EXPORT_VOLUME_LIMIT', 'volume over limit → EXPORT_VOLUME_LIMIT');
}

// 4. DEFAULT_MAX_TOTAL_VOLUME = 65535³
{
  const expected = BigInt(65535) * BigInt(65535) * BigInt(65535);
  check(DEFAULT_MAX_TOTAL_VOLUME === expected, 'DEFAULT_MAX_TOTAL_VOLUME = 65535³');
}

// 5. Lossy confirmation required
{
  const optsNoConfirm = { confirmLossy: false } as any;
  const r1 = checkLossyConfirmation(true, optsNoConfirm);
  check(!r1.valid && r1.error!.code === 'EXPORT_LOSSY_CONFIRM_REQUIRED', 'lossy without confirmLossy → error');
  const r2 = checkLossyConfirmation(true, { confirmLossy: true } as any);
  check(r2.valid, 'lossy with confirmLossy → valid');
  const r3 = checkLossyConfirmation(false, { confirmLossy: false } as any);
  check(r3.valid, 'no data loss → valid');
}

// 6. Hidden placements excluded by default
{
  const placements = [
    { visible: true, id: 'a' },
    { visible: false, id: 'b' },
    { visible: true, id: 'c' },
  ];
  const excluded = filterHiddenPlacements(placements, false);
  check(excluded.length === 2 && excluded[0].id === 'a' && excluded[1].id === 'c', 'hidden excluded by default');
  const included = filterHiddenPlacements(placements, true);
  check(included.length === 3, 'hidden included when includeHidden=true');
}

// 7. trimOuterAir bounds passthrough
{
  const bounds = { min: [0, 0, 0] as const, maxExclusive: [10, 10, 10] as const };
  const r1 = computeTrimmedBounds(bounds, true);
  check(r1.bounds.min[0] === 0 && r1.bounds.maxExclusive[0] === 10, 'trimOuterAir=true passes through (no block data)');
  const r2 = computeTrimmedBounds(bounds, false);
  check(r2.trimmed === false, 'trimOuterAir=false → not trimmed');
}

// 8. MAX_DIMENSION constant
{
  check(MAX_DIMENSION === 65535, 'MAX_DIMENSION = 65535');
}

// 9. validateExport with oversized selection
{
  const snapshot: any = {
    id: 'test', name: 'test', schemaVersion: 1,
    placements: [], importGroups: [],
    overlapPolicy: 'top-wins', revision: 0,
  };
  const target: any = {
    kind: 'selection',
    bounds: { min: [0, 0, 0], maxExclusive: [70000, 10, 10] },
    includeHidden: false,
  };
  const options: any = {
    strict: true, confirmLossy: false, includeRegionMetadata: false,
    trimOuterAir: true, bakeTransforms: true, targetDataVersion: 3345,
  };
  const result = validateExport(snapshot, target, options);
  check(!result.valid, 'oversized selection → invalid');
  check(result.errors.length > 0, 'has error messages');
}

// 10. validateExport valid case
{
  const snapshot: any = {
    id: 'test', name: 'test', schemaVersion: 1,
    placements: [], importGroups: [],
    overlapPolicy: 'top-wins', revision: 0,
  };
  const target: any = {
    kind: 'selection',
    bounds: { min: [0, 0, 0], maxExclusive: [10, 10, 10] },
    includeHidden: false,
  };
  const options: any = {
    strict: true, confirmLossy: true, includeRegionMetadata: false,
    trimOuterAir: true, bakeTransforms: true, targetDataVersion: 3345,
  };
  const result = validateExport(snapshot, target, options);
  check(result.valid, 'valid selection → valid');
  check(result.errors.length === 0, 'no errors');
}

console.log(failures === 0 ? 'All slice b-5 export semantics tests passed.' : failures + ' failure(s)');
