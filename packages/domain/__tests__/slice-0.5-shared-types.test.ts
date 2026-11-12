import type {
  BlockEntityRecord,
  EntityRecord,
  BiomeVolume,
  PendingTickRecord,
  PlacementSource,
  ImportGroup,
  Diagnostic,
} from '../shared-types.ts';
import {
  ERROR_CODES,
  getErrorCode,
  makeDiagnostic,
} from '../error-codes.ts';
import type { ErrorCodeEntry } from '../error-codes.ts';

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

// Test 1: Shared types are exported and usable
const blockEntity: BlockEntityRecord = {
  position: [0, 0, 0],
  nbt: { type: 'compound', value: new Map() },
};
assert(blockEntity.position[0] === 0, 'BlockEntityRecord position');

const entity: EntityRecord = {
  id: 'test-entity',
  position: [0.5, 1.0, 0.5],
  rotation: [0, 90, 0],
  nbt: { type: 'compound', value: new Map() },
};
assert(entity.id === 'test-entity', 'EntityRecord id');

const biome: BiomeVolume = {
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  palette: ['minecraft:plains'],
  indices: new Uint8Array(4096),
};
assert(biome.bounds.min[0] === 0, 'BiomeVolume bounds');

const tick: PendingTickRecord = {
  position: [5, 5, 5],
  blockState: { id: 'minecraft:stone', props: {} },
  tickDelay: 10,
  nbt: { type: 'compound', value: new Map() },
};
assert(tick.tickDelay === 10, 'PendingTickRecord tickDelay');

// Test 2: PlacementSource, ImportGroup, Diagnostic types are exported
const source: PlacementSource = {
  format: 'schem-v3',
  filename: 'build.schem',
  diagnostics: [],
};
assert(source.format === 'schem-v3', 'PlacementSource format');

const group: ImportGroup = {
  id: 'group-1',
  name: 'My Build',
  sourceFilename: 'build.litematic',
  placementIds: ['p1', 'p2'],
  sourceFormat: 'litematic',
};
assert(group.sourceFormat === 'litematic', 'ImportGroup sourceFormat');

const diag: Diagnostic = {
  code: 'ENGINE_OFF_GRID_TRANSFORM',
  severity: 'error',
  message: 'Origin is off-grid',
};
assert(diag.severity === 'error', 'Diagnostic severity');

// Test 3: Error code ENGINE_OFF_GRID_TRANSFORM exists with severity 'error'
const offGrid = ERROR_CODES['ENGINE_OFF_GRID_TRANSFORM'];
assert(offGrid !== undefined, 'ENGINE_OFF_GRID_TRANSFORM exists');
assert(offGrid?.severity === 'error', 'ENGINE_OFF_GRID_TRANSFORM severity is error');

// Test 4: Error code CORRUPT_ARCHIVE exists with severity 'error'
const corrupt = ERROR_CODES['CORRUPT_ARCHIVE'];
assert(corrupt !== undefined, 'CORRUPT_ARCHIVE exists');
assert(corrupt?.severity === 'error', 'CORRUPT_ARCHIVE severity is error');

// Test 5: getErrorCode returns entries
assert(getErrorCode('ENGINE_OFF_GRID_TRANSFORM')?.code === 'ENGINE_OFF_GRID_TRANSFORM', 'getErrorCode returns correct code');
assert(getErrorCode('NONEXISTENT') === undefined, 'getErrorCode returns undefined for unknown code');

// Test 6: makeDiagnostic uses error code registry
const diag2 = makeDiagnostic('ENGINE_OFF_GRID_TRANSFORM');
assert(diag2.code === 'ENGINE_OFF_GRID_TRANSFORM', 'makeDiagnostic uses registry code');
assert(diag2.severity === 'error', 'makeDiagnostic uses registry severity');

// Test 7: All error codes have unique strings, severity, message
const codes: readonly ErrorCodeEntry[] = Object.values(ERROR_CODES);
const codeSet = new Set(codes.map((c: ErrorCodeEntry) => c.code));
assert(codeSet.size === codes.length, 'All error codes are unique');
for (const entry of codes) {
  assert(entry.severity === 'error' || entry.severity === 'warning' || entry.severity === 'info', `Valid severity for ${entry.code}`);
  assert(entry.message.length > 0, `Non-empty message for ${entry.code}`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
