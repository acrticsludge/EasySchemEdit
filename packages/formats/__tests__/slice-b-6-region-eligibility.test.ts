// Slice b-6: Multi-region export eligibility
import {
  checkRegionEligibility,
  EXPORT_REGION_GROUPING_LOST,
  type RegionGroupMetadata,
} from '../region-eligibility.ts';
import type { Transform } from '../../domain/coordinates.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

const baseTransform: Transform = { translation: [0, 0, 0], rotationY: 0, mirror: 'none' };

function makeGroup(overrides: Partial<RegionGroupMetadata>): RegionGroupMetadata {
  return {
    importGroupId: 'group1',
    baked: false,
    relativePositions: [[0, 0, 0]],
    rotation: baseTransform,
    mirror: 'none',
    sourceFormat: 'litematic',
    regions: ['region1'],
    ...overrides,
  };
}

// 1. All rules pass → eligible multi-region export
{
  const groups = [
    makeGroup({ regions: ['region1'] }),
    makeGroup({ regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === true, 'all rules pass → eligible');
  check(result.lostGrouping === false, 'no grouping lost');
  check(result.exportAsSingleRegion === false, 'not single region');
}

// 2. Different import groups → EXPORT_REGION_GROUPING_LOST
{
  const groups = [
    makeGroup({ importGroupId: 'group1', regions: ['region1'] }),
    makeGroup({ importGroupId: 'group2', regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === false, 'different import groups → ineligible');
  check(result.lostGrouping === true, 'grouping lost');
  check(result.exportAsSingleRegion === true, 'export as single region');
  check(result.reason === EXPORT_REGION_GROUPING_LOST, 'reason = EXPORT_REGION_GROUPING_LOST');
}

// 3. Baked regions → EXPORT_REGION_GROUPING_LOST
{
  const groups = [
    makeGroup({ baked: false, regions: ['region1'] }),
    makeGroup({ baked: true, regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === false, 'baked region → ineligible');
  check(result.lostGrouping === true, 'grouping lost');
}

// 4. Relative positions not intact → EXPORT_REGION_GROUPING_LOST
{
  const groups = [
    makeGroup({ relativePositions: [[0, 0, 0]], regions: ['region1'] }),
    makeGroup({ relativePositions: [[5, 0, 0]], regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === false, 'different relative positions → ineligible');
  check(result.lostGrouping === true, 'grouping lost');
}

// 5. Mixed rotation/mirror → EXPORT_REGION_GROUPING_LOST
{
  const groups = [
    makeGroup({ rotation: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' }, regions: ['region1'] }),
    makeGroup({ rotation: { translation: [0, 0, 0], rotationY: 90, mirror: 'none' }, regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === false, 'different rotation → ineligible');
  check(result.lostGrouping === true, 'grouping lost');
}

// 6. Non-litematic source → EXPORT_REGION_GROUPING_LOST
{
  const groups = [
    makeGroup({ sourceFormat: 'litematic', regions: ['region1'] }),
    makeGroup({ sourceFormat: 'schem-v3', regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === false, 'non-litematic source → ineligible');
  check(result.lostGrouping === true, 'grouping lost');
}

// 7. Single group → always eligible
{
  const groups = [makeGroup({ regions: ['region1'] })];
  const result = checkRegionEligibility(groups);
  check(result.eligible === true, 'single group → eligible');
  check(result.lostGrouping === false, 'no grouping lost');
}

// 8. Empty groups → eligible
{
  const result = checkRegionEligibility([]);
  check(result.eligible === true, 'empty groups → eligible');
}

// 9. Common mirror x/z compatible
{
  const groups = [
    makeGroup({ mirror: 'x', regions: ['region1'] }),
    makeGroup({ mirror: 'x', regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === true, 'same mirror x → eligible');
}

// 10. Mirror xz compatible with x
{
  const groups = [
    makeGroup({ mirror: 'xz', regions: ['region1'] }),
    makeGroup({ mirror: 'x', regions: ['region2'] }),
  ];
  const result = checkRegionEligibility(groups);
  check(result.eligible === true, 'mirror xz compatible with x → eligible');
}

console.log(failures === 0 ? 'All slice b-6 region eligibility tests passed.' : failures + ' failure(s)');
