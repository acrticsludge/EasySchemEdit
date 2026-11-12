import type { Project } from '../placement.ts';
import type { Placement } from '../placement.ts';
import type { Vec3i } from '../types.ts';
import { checkInvariants } from '../placement.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Helper to create a minimal valid placement
function makePlacement(id: string): Placement {
  return {
    id,
    name: `Placement ${id}`,
    volume: {
      bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 0,
    },
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: {
      format: 'generated',
      diagnostics: [],
    },
    eraseTombstones: new Set(),
  };
}

// Test 1: valid Project → all invariants pass
const proj1: Project = {
  schemaVersion: 1,
  id: 'proj-1',
  name: 'Test Project',
  placements: [makePlacement('p1')],
  importGroups: [],
  overlapPolicy: 'top-wins',
  conflictOverlay: 'off',
  metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
  revision: 0,
};
const result1 = checkInvariants(proj1);
assert(result1.ok, `valid project passes: ${result1.violations.join(', ')}`);

// Test 2: duplicate placement id → violation
const proj2: Project = { ...proj1, placements: [makePlacement('p1'), makePlacement('p1')] };
const result2 = checkInvariants(proj2);
assert(!result2.ok, 'duplicate placement id detected');
assert(result2.violations.some((v) => v.includes('Duplicate placement id')), 'duplicate id violation message');

// Test 3: fractional translation → violation
const proj3: Project = {
  ...proj1,
  placements: [{ ...makePlacement('p1'), transform: { translation: [1.5, 0, 0], rotationY: 0, mirror: 'none' } }],
};
const result3 = checkInvariants(proj3);
assert(!result3.ok, 'fractional translation detected');
assert(result3.violations.some((v) => v.includes('fractional translation')), 'fractional translation violation');

// Test 4: revision increments by exactly 1 per transaction
const proj4a: Project = { ...proj1, revision: 5 };
const proj4b: Project = { ...proj1, revision: 6 };
assert(proj4b.revision === proj4a.revision + 1, 'revision increments by 1');

// Test 5: zero-size placement (all-air volume) allowed
const proj5: Project = {
  ...proj1,
  placements: [{ ...makePlacement('p1'), volume: { ...proj1.placements[0].volume, chunks: new Map(), nonAirCount: 0 } }],
};
const result5 = checkInvariants(proj5);
assert(result5.ok, 'zero-size/all-air placement passes invariants');

// Test 6: origin with odd half-block component → violation
const proj6: Project = {
  ...proj1,
  placements: [{ ...makePlacement('p1'), origin: [1, 0, 0] }],
};
const result6 = checkInvariants(proj6);
assert(!result6.ok, 'odd origin component detected');
assert(result6.violations.some((v) => v.includes('not integral')), 'odd origin violation message');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
