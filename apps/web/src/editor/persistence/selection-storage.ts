// apps/web/src/editor/persistence/selection-storage.ts
// LocalStorage persistence for per-schematic region selections and editor UI preferences.

import type { Bounds3i, Vec3i } from '@easyschemedit/domain';
import type { VoxelHit } from '../viewport/voxel-raycast.ts';

export const SELECTION_STORAGE_PREFIX = 'ese_selection:';
export const CAMERA_STORAGE_PREFIX = 'ese_camera:';
export const UI_PREFS_STORAGE_KEY = 'ese_ui_prefs';

export interface PersistedSelectionState {
  pos1: Vec3i | null;
  pos2: Vec3i | null;
  bounds: Bounds3i | null;
  selectedVoxel: VoxelHit | null;
  selectedPlacementId: string | null;
}

export interface PersistedUiPrefs {
  activeOverlays?: {
    chunk: boolean;
    section: boolean;
    block: boolean;
    conflicts: boolean;
  };
  nudgeStep?: number;
}

function isValidVec3i(v: unknown): v is Vec3i {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number' &&
    Number.isInteger(v[0]) &&
    Number.isInteger(v[1]) &&
    Number.isInteger(v[2])
  );
}

function isValidBounds(b: unknown): b is Bounds3i {
  if (!b || typeof b !== 'object') return false;
  const candidate = b as { min?: unknown; maxExclusive?: unknown };
  return isValidVec3i(candidate.min) && isValidVec3i(candidate.maxExclusive);
}

function isValidVoxelHit(v: unknown): v is VoxelHit {
  if (!v || typeof v !== 'object') return false;
  const candidate = v as Partial<VoxelHit>;
  return (
    isValidVec3i(candidate.position) &&
    isValidVec3i(candidate.adjacentPosition) &&
    isValidVec3i(candidate.normal) &&
    typeof candidate.distance === 'number' &&
    candidate.state !== undefined &&
    (candidate.placementId === null || typeof candidate.placementId === 'string')
  );
}

export function isSelectionEmpty(state: PersistedSelectionState): boolean {
  return (
    state.pos1 === null &&
    state.pos2 === null &&
    state.bounds === null &&
    state.selectedVoxel === null &&
    state.selectedPlacementId === null
  );
}

/**
 * Persists selection state for a schematic.
 * If all fields are null, removes the localStorage key.
 */
export function saveSchematicSelection(
  schematicId: string,
  state: PersistedSelectionState,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>
): void {
  if (!schematicId) return;
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;

  try {
    const key = SELECTION_STORAGE_PREFIX + schematicId;
    if (isSelectionEmpty(state)) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify(state));
  } catch {
    // Catch quota exceeded or localStorage disabled
  }
}

/**
 * Loads persisted selection state for a schematic.
 * Returns null if not found, corrupted, or all fields are null.
 */
export function loadSchematicSelection(
  schematicId: string,
  storage?: Pick<Storage, 'getItem'>
): PersistedSelectionState | null {
  if (!schematicId) return null;
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return null;

  try {
    const key = SELECTION_STORAGE_PREFIX + schematicId;
    const raw = store.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const state: PersistedSelectionState = {
      pos1: isValidVec3i(parsed.pos1) ? parsed.pos1 : null,
      pos2: isValidVec3i(parsed.pos2) ? parsed.pos2 : null,
      bounds: isValidBounds(parsed.bounds) ? parsed.bounds : null,
      selectedVoxel: isValidVoxelHit(parsed.selectedVoxel) ? parsed.selectedVoxel : null,
      selectedPlacementId: typeof parsed.selectedPlacementId === 'string' ? parsed.selectedPlacementId : null,
    };

    if (isSelectionEmpty(state)) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Persists editor UI preferences (active overlays, nudge step).
 */
export function saveUiPrefs(
  prefs: PersistedUiPrefs,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>
): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;

  try {
    if (!prefs || (!prefs.activeOverlays && prefs.nudgeStep === undefined)) {
      store.removeItem(UI_PREFS_STORAGE_KEY);
      return;
    }
    store.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota exceeded or disabled localStorage
  }
}

/**
 * Loads persisted editor UI preferences.
 * Returns null if not set or corrupted.
 */
export function loadUiPrefs(
  storage?: Pick<Storage, 'getItem'>
): PersistedUiPrefs | null {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return null;

  try {
    const raw = store.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const result: PersistedUiPrefs = {};
    if (parsed.activeOverlays && typeof parsed.activeOverlays === 'object') {
      result.activeOverlays = {
        chunk: Boolean(parsed.activeOverlays.chunk),
        section: Boolean(parsed.activeOverlays.section),
        block: Boolean(parsed.activeOverlays.block),
        conflicts: parsed.activeOverlays.conflicts !== undefined ? Boolean(parsed.activeOverlays.conflicts) : true,
      };
    }
    if (typeof parsed.nudgeStep === 'number' && Number.isFinite(parsed.nudgeStep)) {
      result.nudgeStep = parsed.nudgeStep;
    }

    if (!result.activeOverlays && result.nudgeStep === undefined) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Copies schematic state (selection + camera) from one schematic ID to another (e.g. during guest migration).
 */
export function copySchematicState(
  sourceSchematicId: string,
  targetSchematicId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): void {
  if (!sourceSchematicId || !targetSchematicId || sourceSchematicId === targetSchematicId) return;
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;

  try {
    const sel = store.getItem(SELECTION_STORAGE_PREFIX + sourceSchematicId);
    if (sel !== null) {
      store.setItem(SELECTION_STORAGE_PREFIX + targetSchematicId, sel);
    }
    const cam = store.getItem(CAMERA_STORAGE_PREFIX + sourceSchematicId);
    if (cam !== null) {
      store.setItem(CAMERA_STORAGE_PREFIX + targetSchematicId, cam);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Deletes schematic state (selection + camera) when a schematic is deleted.
 */
export function deleteSchematicState(
  schematicId: string,
  storage?: Pick<Storage, 'removeItem'>
): void {
  if (!schematicId) return;
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;

  try {
    store.removeItem(SELECTION_STORAGE_PREFIX + schematicId);
    store.removeItem(CAMERA_STORAGE_PREFIX + schematicId);
  } catch {
    // Ignore storage errors
  }
}
