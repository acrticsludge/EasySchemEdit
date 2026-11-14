// apps/web/__tests__/slice-r3-region-crud.test.ts
// Unit tests for per-schematic selection and UI preferences persistence (Slice R3).

import type { Bounds3i, Vec3i } from '@easyschemedit/domain';
import type { VoxelHit } from '../src/editor/viewport/voxel-raycast.ts';
import {
  saveSchematicSelection,
  loadSchematicSelection,
  saveUiPrefs,
  loadUiPrefs,
  copySchematicState,
  deleteSchematicState,
  isSelectionEmpty,
  type PersistedSelectionState,
  type PersistedUiPrefs,
  type SavedRegion,
  SELECTION_STORAGE_PREFIX,
  CAMERA_STORAGE_PREFIX,
  UI_PREFS_STORAGE_KEY,
} from '../src/editor/persistence/selection-storage.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}. Expected ${expectedStr}, got ${actualStr}`);
  }
}

class MockStorage {
  private store = new Map<string, string>();
  public throwOnSet = false;
  public throwOnGet = false;

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    if (this.throwOnGet) {
      throw new Error('SecurityError: localStorage is disabled');
    }
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      throw new Error('QuotaExceededError: storage quota exceeded');
    }
    this.store.set(key, String(value));
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

console.log('=== Running Slice R3: Selection & UI Preference Persistence Tests ===\n');

// ---------------------------------------------------------------------------
// Test 1: saveSchematicSelection & loadSchematicSelection Roundtrip
// ---------------------------------------------------------------------------
console.log('--- Test 1: Full Selection State Roundtrip ---');
{
  const storage = new MockStorage();
  const schemId = 'schem-alpha-001';

  const mockVoxelHit: VoxelHit = {
    position: [10, 64, -25],
    adjacentPosition: [10, 65, -25],
    normal: [0, 1, 0],
    distance: 4.5,
    state: { id: 'minecraft:stone', props: {} },
    placementId: 'placement-main-0',
  };

  const selectionState: PersistedSelectionState = {
    pos1: [5, 60, -30],
    pos2: [15, 75, -20],
    bounds: {
      min: [5, 60, -30],
      maxExclusive: [16, 76, -19],
    },
    selectedVoxel: mockVoxelHit,
    selectedPlacementId: 'placement-main-0',
  };

  saveSchematicSelection(schemId, selectionState, storage);
  assert(storage.has(SELECTION_STORAGE_PREFIX + schemId), 'Key exists in storage');

  const loaded = loadSchematicSelection(schemId, storage);
  assert(loaded !== null, 'Loaded selection is not null');
  assertDeepEqual(loaded?.pos1, [5, 60, -30], 'pos1 matches');
  assertDeepEqual(loaded?.pos2, [15, 75, -20], 'pos2 matches');
  assertDeepEqual(loaded?.bounds, selectionState.bounds, 'bounds match');
  assertEqual(loaded?.selectedPlacementId, 'placement-main-0', 'selectedPlacementId matches');
  assertDeepEqual(loaded?.selectedVoxel?.position, [10, 64, -25], 'selectedVoxel position matches');
  assertEqual(loaded?.selectedVoxel?.state.id, 'minecraft:stone', 'selectedVoxel state matches');
  console.log('  ✓ Full selection state roundtrip succeeded');
}

// ---------------------------------------------------------------------------
// Test 2: Partial Selection State Roundtrip
// ---------------------------------------------------------------------------
console.log('--- Test 2: Partial Selection State Roundtrip ---');
{
  const storage = new MockStorage();
  const schemId = 'schem-partial-002';

  const partialState: PersistedSelectionState = {
    pos1: [0, 10, 0],
    pos2: null,
    bounds: null,
    selectedVoxel: null,
    selectedPlacementId: 'placement-abc',
  };

  saveSchematicSelection(schemId, partialState, storage);
  const loaded = loadSchematicSelection(schemId, storage);
  assert(loaded !== null, 'Loaded partial selection is not null');
  assertDeepEqual(loaded?.pos1, [0, 10, 0], 'pos1 matches');
  assertEqual(loaded?.pos2, null, 'pos2 is null');
  assertEqual(loaded?.bounds, null, 'bounds is null');
  assertEqual(loaded?.selectedVoxel, null, 'selectedVoxel is null');
  assertEqual(loaded?.selectedPlacementId, 'placement-abc', 'selectedPlacementId matches');
  console.log('  ✓ Partial selection state preserved correctly');
}

// ---------------------------------------------------------------------------
// Test 3: Removal When All Null
// ---------------------------------------------------------------------------
console.log('--- Test 3: Removal When All Fields Null ---');
{
  const storage = new MockStorage();
  const schemId = 'schem-clean-003';

  // First save a non-empty selection
  saveSchematicSelection(schemId, {
    pos1: [1, 2, 3],
    pos2: null,
    bounds: null,
    selectedVoxel: null,
    selectedPlacementId: null,
  }, storage);
  assert(storage.has(SELECTION_STORAGE_PREFIX + schemId), 'Key was created');

  // Now save an all-null state
  const emptyState: PersistedSelectionState = {
    pos1: null,
    pos2: null,
    bounds: null,
    selectedVoxel: null,
    selectedPlacementId: null,
  };
  assert(isSelectionEmpty(emptyState), 'isSelectionEmpty identifies empty state');

  saveSchematicSelection(schemId, emptyState, storage);
  assert(!storage.has(SELECTION_STORAGE_PREFIX + schemId), 'Key was removed from storage');

  const loaded = loadSchematicSelection(schemId, storage);
  assertEqual(loaded, null, 'loadSchematicSelection returns null when key removed');
  console.log('  ✓ Saving all null successfully removes storage key');
}

// ---------------------------------------------------------------------------
// Test 4: Corrupted JSON and Invalid Data Resilience
// ---------------------------------------------------------------------------
console.log('--- Test 4: Corrupted JSON and Invalid Data Resilience ---');
{
  const storage = new MockStorage();
  const schemId = 'schem-corrupt';

  // 4a: Non-JSON raw string
  storage.setItem(SELECTION_STORAGE_PREFIX + schemId, 'not valid json {{{');
  assertEqual(loadSchematicSelection(schemId, storage), null, 'Invalid JSON returns null without throwing');

  // 4b: JSON primitive (number)
  storage.setItem(SELECTION_STORAGE_PREFIX + schemId, '12345');
  assertEqual(loadSchematicSelection(schemId, storage), null, 'JSON number returns null');

  // 4c: JSON array instead of object
  storage.setItem(SELECTION_STORAGE_PREFIX + schemId, '["some", "data"]');
  assertEqual(loadSchematicSelection(schemId, storage), null, 'JSON array returns null');

  // 4d: Malformed vector coordinates (floats or strings instead of int coords)
  storage.setItem(SELECTION_STORAGE_PREFIX + schemId, JSON.stringify({
    pos1: 'invalid-pos',
    pos2: [1.5, 2.3, 4.8], // non-integer coordinates
    bounds: { min: [1], maxExclusive: 'bad' },
    selectedVoxel: 'bad',
    selectedPlacementId: 12345, // not a string
  }));
  const sanitized = loadSchematicSelection(schemId, storage);
  assertEqual(sanitized, null, 'Malformed coordinates sanitized to null');

  // 4e: Valid fields mixed with corrupted fields
  storage.setItem(SELECTION_STORAGE_PREFIX + schemId, JSON.stringify({
    pos1: [10, 20, 30],
    pos2: 'corrupted',
    bounds: null,
    selectedVoxel: null,
    selectedPlacementId: null,
  }));
  const partialCorrupt = loadSchematicSelection(schemId, storage);
  assert(partialCorrupt !== null, 'Valid pos1 extracted');
  assertDeepEqual(partialCorrupt?.pos1, [10, 20, 30], 'pos1 valid');
  assertEqual(partialCorrupt?.pos2, null, 'corrupted pos2 sanitized to null');

  // 4f: Non-existent schematic ID
  assertEqual(loadSchematicSelection('non-existent', storage), null, 'Non-existent ID returns null');
  assertEqual(loadSchematicSelection('', storage), null, 'Empty string schematic ID returns null');
  console.log('  ✓ Corrupted JSON and malformed types safely handled without throwing');
}

// ---------------------------------------------------------------------------
// Test 5: saveUiPrefs & loadUiPrefs Roundtrip
// ---------------------------------------------------------------------------
console.log('--- Test 5: UI Preferences Roundtrip ---');
{
  const storage = new MockStorage();

  const prefs: PersistedUiPrefs = {
    activeOverlays: {
      chunk: true,
      section: false,
      block: true,
      conflicts: false,
    },
    nudgeStep: 16,
  };

  saveUiPrefs(prefs, storage);
  assert(storage.has(UI_PREFS_STORAGE_KEY), 'UI prefs key exists in storage');

  const loaded = loadUiPrefs(storage);
  assert(loaded !== null, 'Loaded UI prefs not null');
  assertEqual(loaded?.activeOverlays?.chunk, true, 'chunk overlay matches');
  assertEqual(loaded?.activeOverlays?.section, false, 'section overlay matches');
  assertEqual(loaded?.activeOverlays?.block, true, 'block overlay matches');
  assertEqual(loaded?.activeOverlays?.conflicts, false, 'conflicts overlay matches');
  assertEqual(loaded?.nudgeStep, 16, 'nudgeStep matches');

  // Partial prefs: nudgeStep only
  saveUiPrefs({ nudgeStep: 1 }, storage);
  const loadedNudge = loadUiPrefs(storage);
  assertEqual(loadedNudge?.nudgeStep, 1, 'nudgeStep 1 saved');
  assertEqual(loadedNudge?.activeOverlays, undefined, 'activeOverlays undefined');

  // Empty prefs removes key
  saveUiPrefs({}, storage);
  assert(!storage.has(UI_PREFS_STORAGE_KEY), 'Empty prefs removes storage key');
  assertEqual(loadUiPrefs(storage), null, 'loadUiPrefs returns null for empty/removed');

  // Corrupted JSON in UI prefs
  storage.setItem(UI_PREFS_STORAGE_KEY, '{corrupted');
  assertEqual(loadUiPrefs(storage), null, 'Corrupted UI prefs returns null');
  console.log('  ✓ UI preferences roundtrip, partial, removal, and corruption resilience passed');
}

// ---------------------------------------------------------------------------
// Test 6: copySchematicState (Guest to Cloud Migration) & deleteSchematicState
// ---------------------------------------------------------------------------
console.log('--- Test 6: Schematic State Copy & Delete (Migration) ---');
{
  const storage = new MockStorage();
  const guestId = 'guest-schem-untitled';
  const cloudId = 'cloud-schem-987';

  // Seed guest selection and camera
  saveSchematicSelection(guestId, {
    pos1: [100, 50, 200],
    pos2: [110, 60, 210],
    bounds: { min: [100, 50, 200], maxExclusive: [111, 61, 211] },
    selectedVoxel: null,
    selectedPlacementId: 'guest-p1',
  }, storage);

  storage.setItem(CAMERA_STORAGE_PREFIX + guestId, JSON.stringify({
    mode: 'orbit',
    target: [105, 55, 205],
    distance: 30,
    yaw: 0.5,
    pitch: 0.2,
  }));

  // Perform migration copy
  copySchematicState(guestId, cloudId, storage);

  // Cloud schematic should now have exact selection and camera
  const cloudSelection = loadSchematicSelection(cloudId, storage);
  assert(cloudSelection !== null, 'Cloud schematic has copied selection');
  assertDeepEqual(cloudSelection?.pos1, [100, 50, 200], 'Cloud pos1 matches guest');
  assertEqual(cloudSelection?.selectedPlacementId, 'guest-p1', 'Cloud placementId matches guest');

  const cloudCamera = storage.getItem(CAMERA_STORAGE_PREFIX + cloudId);
  assert(cloudCamera !== null, 'Cloud camera key copied');
  assert(cloudCamera!.includes('105,55,205') || cloudCamera!.includes('"target":[105,55,205]'), 'Cloud camera target matches');

  // Delete schematic state
  deleteSchematicState(guestId, storage);
  assertEqual(storage.has(SELECTION_STORAGE_PREFIX + guestId), false, 'Guest selection deleted');
  assertEqual(storage.has(CAMERA_STORAGE_PREFIX + guestId), false, 'Guest camera deleted');
  assertEqual(storage.has(SELECTION_STORAGE_PREFIX + cloudId), true, 'Cloud selection retained');

  console.log('  ✓ Schematic state migration copy and deletion verified');
}

// ---------------------------------------------------------------------------
// Test 7: Storage Exception & SSR Safety (Quota / Disabled localStorage)
// ---------------------------------------------------------------------------
console.log('--- Test 7: Storage Exception Safety ---');
{
  const storage = new MockStorage();
  storage.throwOnSet = true;
  storage.throwOnGet = true;

  // None of these should throw
  let threw = false;
  try {
    saveSchematicSelection('test', {
      pos1: [0, 0, 0],
      pos2: null,
      bounds: null,
      selectedVoxel: null,
      selectedPlacementId: null,
    }, storage);

    const res = loadSchematicSelection('test', storage);
    assertEqual(res, null, 'Throwing storage returns null on load');

    saveUiPrefs({ nudgeStep: 16 }, storage);
    const prefRes = loadUiPrefs(storage);
    assertEqual(prefRes, null, 'Throwing storage returns null on loadUiPrefs');

    copySchematicState('a', 'b', storage);
    deleteSchematicState('a', storage);
  } catch {
    threw = true;
  }

  assert(!threw, 'Functions must not throw when storage throws QuotaExceeded or SecurityError');
  console.log('  ✓ Storage exception safety verified');
}

// ---------------------------------------------------------------------------
// Test 8: Multiple SavedRegions & ActiveRegionId Persistence Roundtrip
// ---------------------------------------------------------------------------
console.log('--- Test 8: Multiple SavedRegions & ActiveRegionId Roundtrip ---');
{
  const storage = new MockStorage();
  const schemId = 'schem-multi-regions';

  const r1: SavedRegion = {
    id: 'region-1',
    name: 'R1',
    pos1: [0, 64, 0],
    pos2: [15, 79, 15],
    bounds: {
      min: [0, 64, 0],
      maxExclusive: [16, 80, 16],
    },
  };

  const r2: SavedRegion = {
    id: 'region-2',
    name: 'R2',
    pos1: [20, 60, -10],
    pos2: [40, 90, 10],
    bounds: {
      min: [20, 60, -10],
      maxExclusive: [41, 91, 11],
    },
  };

  const stateWithRegions: PersistedSelectionState = {
    pos1: r2.pos1,
    pos2: r2.pos2,
    bounds: r2.bounds,
    selectedVoxel: null,
    selectedPlacementId: null,
    savedRegions: [r1, r2],
    activeRegionId: 'region-2',
  };

  saveSchematicSelection(schemId, stateWithRegions, storage);
  assert(storage.has(SELECTION_STORAGE_PREFIX + schemId), 'Key exists for multi-region state');

  const loaded = loadSchematicSelection(schemId, storage);
  assert(loaded !== null, 'Loaded state is not null');
  assertEqual(loaded?.activeRegionId, 'region-2', 'activeRegionId matches');
  assertEqual(loaded?.savedRegions?.length, 2, '2 saved regions restored');
  assertDeepEqual(loaded?.savedRegions?.[0], r1, 'R1 matches exactly');
  assertDeepEqual(loaded?.savedRegions?.[1], r2, 'R2 matches exactly');

  // Test corrupt savedRegion filtering
  storage.setItem(
    SELECTION_STORAGE_PREFIX + 'corrupt-regions',
    JSON.stringify({
      pos1: null,
      pos2: null,
      bounds: null,
      selectedVoxel: null,
      selectedPlacementId: null,
      activeRegionId: 'valid-id',
      savedRegions: [
        r1,
        { id: '', name: 'bad-id', pos1: [0, 0, 0], pos2: [1, 1, 1], bounds: r1.bounds },
        { id: 'bad-coords', name: 'bad', pos1: 'wrong', pos2: [1, 1, 1], bounds: r1.bounds },
        'not-an-object',
        r2,
      ],
    })
  );

  const filtered = loadSchematicSelection('corrupt-regions', storage);
  assert(filtered !== null, 'Loaded filtered state is not null');
  assertEqual(filtered?.savedRegions?.length, 2, 'Only the 2 valid regions kept');
  assertEqual(filtered?.savedRegions?.[0].id, 'region-1', 'First is r1');
  assertEqual(filtered?.savedRegions?.[1].id, 'region-2', 'Second is r2');

  console.log('  ✓ Multiple saved regions and activeRegionId persisted and sanitized correctly');
}

console.log('\nAll Slice R3 selection and UI persistence tests passed successfully!');
