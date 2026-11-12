import type { ChunkedVoxelVolume, Placement, Project } from '../placement.ts';
import { resolveBlockAt } from '../effective-block.ts';

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

// Helper to create a chunk with given palette IDs
function makeChunk(paletteIds: string[]): ChunkedVoxelVolume {
  const palette = paletteIds.map((id) => ({ id, props: {} }));
  const indices = new Uint8Array(4096).fill(0);
  return {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    chunkSize: 16,
    chunks: new Map([[
      '0_0_0',
      { key: '0_0_0', palette, indices, revision: 0 },
    ]]),
    nonAirCount: paletteIds.length > 1 ? 1 : 0,
    paletteCardinality: palette.length,
  };
}

function makePlacement(
  id: string,
  volume: ChunkedVoxelVolume,
  visible = true,
  tombstones: Set<string> = new Set(),
): Placement {
  return {
    id,
    name: id,
    volume,
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      biomes: undefined,
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible,
    locked: false,
    createdAt: '2026-01-01',
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: tombstones,
  };
}

function makeProject(placements: Placement[]): Project {
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'Test',
    placements,
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: { createdAt: '2026-01-01', modifiedAt: '2026-01-01' },
    revision: 0,
  };
}

function setBlockIndex(vol: ChunkedVoxelVolume, x: number, y: number, z: number, idx: number): void {
  const chunk = vol.chunks.get('0_0_0')!;
  chunk.indices[(y * 16 + z) * 16 + x] = idx;
}

// Test 1: Top-wins
const stoneChunk = makeChunk(['minecraft:air', 'minecraft:stone']);
setBlockIndex(stoneChunk, 5, 5, 5, 1);
const p1 = makePlacement('p1', stoneChunk);
const dirtChunk = makeChunk(['minecraft:air', 'minecraft:dirt']);
setBlockIndex(dirtChunk, 5, 5, 5, 1);
const p2 = makePlacement('p2', dirtChunk);
const proj1 = makeProject([p1, p2]);
const r1 = resolveBlockAt(proj1, [5, 5, 5], 'top-wins');
assert(r1.state.id === 'minecraft:dirt', `top-wins: dirt wins, got ${r1.state.id}`);

// Test 2: Bottom-wins
const r2 = resolveBlockAt(proj1, [5, 5, 5], 'bottom-wins');
assert(r2.state.id === 'minecraft:stone', `bottom-wins: stone wins, got ${r2.state.id}`);

// Test 3: Invisible placement does not contribute
const p2Invis = makePlacement('p2', dirtChunk, false);
const proj3 = makeProject([p1, p2Invis]);
const r3 = resolveBlockAt(proj3, [5, 5, 5], 'top-wins');
assert(r3.state.id === 'minecraft:stone', `invisible skipped: stone wins, got ${r3.state.id}`);

// Test 4: Tombstone → air + erase
const proj4 = makeProject([p1]);
proj4.placements[0].eraseTombstones.add('5_5_5');
const r4 = resolveBlockAt(proj4, [5, 5, 5]);
assert(r4.state.id === 'minecraft:air' && r4.isErase === true, `tombstone: air+erase, got ${r4.state.id} erase=${r4.isErase}`);

// Test 5: structure_void is owning
const voidChunk = makeChunk(['minecraft:air', 'minecraft:structure_void']);
setBlockIndex(voidChunk, 5, 5, 5, 1);
const pVoid = makePlacement('pvoid', voidChunk);
const proj5 = makeProject([pVoid]);
const r5 = resolveBlockAt(proj5, [5, 5, 5]);
assert(r5.state.id === 'minecraft:structure_void', `structure_void owning, got ${r5.state.id}`);

// Test 6: Plain air non-owning
const airChunk = makeChunk(['minecraft:air']);
const pAir = makePlacement('pair', airChunk);
// Fresh p1 without tombstone from Test 4
const p1Fresh = makePlacement('p1fresh', stoneChunk);
const proj6 = makeProject([p1Fresh, pAir]);
const r6 = resolveBlockAt(proj6, [5, 5, 5], 'top-wins');
assert(r6.state.id === 'minecraft:stone', `plain air non-owning: stone wins, got ${r6.state.id}`);

// Test 7: Owning placement ID
const r7 = resolveBlockAt(proj1, [5, 5, 5], 'top-wins');
assert(r7.owningPlacementId === 'p2', `owning placement p2, got ${r7.owningPlacementId}`);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
