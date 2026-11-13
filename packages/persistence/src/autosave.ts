// packages/persistence/src/autosave.ts
// Autosave snapshot + recovery snapshot on browser reload.
// Quota exhaustion: visible error, previous save never silently dropped.

import { openDB, STORE_AUTOSAVE_JOURNAL, STORE_RECOVERY } from './idb-store.ts';
import { saveProject } from './project-store.ts';

export interface AutosaveEntry {
  projectId: string;
  revision: number;
  archive: string;       // serialized project JSON
  savedAt: string;
}

export interface RecoveryEntry {
  projectId: string;
  revision: number;
  archive: string;
  savedAt: string;
  reason: 'autosave' | 'manual' | 'crash';
}

// Save an autosave snapshot (overwrites previous autosave for projectId).
// Uses crash-safe commit protocol via saveProject and records to journal.
export async function saveAutosave(entry: AutosaveEntry): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE_JOURNAL, 'readwrite');
    const store = tx.objectStore(STORE_AUTOSAVE_JOURNAL);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`AUTOSAVE_JOURNAL_SAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });

  await saveProject({
    projectId: entry.projectId,
    revision: entry.revision,
    projectJson: entry.archive,
    manifestJson: '',
    savedAt: entry.savedAt,
  });
}

// Get the latest autosave for a project.
export async function getAutosave(projectId: string): Promise<AutosaveEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE_JOURNAL, 'readonly');
    const store = tx.objectStore(STORE_AUTOSAVE_JOURNAL);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new Error(`AUTOSAVE_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Save a recovery snapshot (before destructive operations).
export async function saveRecovery(entry: RecoveryEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readwrite');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new Error('QUOTA_EXCEEDED_RECOVERY'));
      } else {
        reject(new Error(`RECOVERY_SAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
      }
    };
  });
}

// Get the latest recovery snapshot for a project.
export async function getRecovery(projectId: string): Promise<RecoveryEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readonly');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new Error(`RECOVERY_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Clear recovery snapshot after successful commit.
export async function clearRecovery(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readwrite');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.delete(projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`RECOVERY_CLEAR_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

export interface AutosaveConfig {
  debounceMs: number;          // 1500
  commandThreshold: number;     // 10
  maxIntervalMs: number;        // 10000
  flushOnVisibilityChange: boolean;
  flushOnBeforeUnload: boolean;
}

export interface AutosaveState {
  config: AutosaveConfig;
  lastCommandAt: number;       // epoch ms
  commandsSinceSave: number;
  lastSaveAt: number;          // epoch ms
  state: 'saved' | 'saving' | 'unsaved' | 'save-failed';
  pendingSave: boolean;
}

const DEFAULT_CONFIG: AutosaveConfig = {
  debounceMs: 1500,
  commandThreshold: 10,
  maxIntervalMs: 10000,
  flushOnVisibilityChange: true,
  flushOnBeforeUnload: true,
};

// In-memory autosave state per project
type InternalAutosaveState = {
  config: AutosaveConfig;
  lastCommandAt: number;
  commandsSinceSave: number;
  lastSaveAt: number;
  state: 'saved' | 'saving' | 'unsaved' | 'save-failed';
  pendingSave: boolean;
  saveInProgress: boolean;
  newerEditArrived: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  intervalTimer: ReturnType<typeof setInterval> | null;
};

const autosaveState = new Map<string, InternalAutosaveState>();

// Record a command for autosave counting.
// Returns true if an autosave should be triggered immediately.
export async function recordCommand(projectId: string, config: AutosaveConfig = DEFAULT_CONFIG): Promise<boolean> {
  let state = autosaveState.get(projectId);
  if (!state) {
    state = {
      config,
      lastCommandAt: Date.now(),
      commandsSinceSave: 1,
      lastSaveAt: Date.now(),
      state: 'unsaved',
      pendingSave: false,
      saveInProgress: false,
      newerEditArrived: false,
      debounceTimer: null,
      intervalTimer: null,
    };
    autosaveState.set(projectId, state);
  } else {
    state.lastCommandAt = Date.now();
    state.commandsSinceSave++;
    state.state = 'unsaved';
    state.pendingSave = true;
  }

  // Check command threshold
  if (state.commandsSinceSave >= state.config.commandThreshold) {
    return await triggerAutosave(projectId);
  }

  // Reset debounce timer
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }
  state.debounceTimer = setTimeout(async () => {
    await triggerAutosave(projectId);
  }, state.config.debounceMs);

  return false;
}

// Trigger an autosave for a project.
async function triggerAutosave(projectId: string): Promise<boolean> {
  const state = autosaveState.get(projectId);
  if (!state || state.saveInProgress) {
    if (state) {
      state.newerEditArrived = true;
    }
    return false;
  }

  state.saveInProgress = true;
  state.state = 'saving';

  // Get the latest autosave entry from IndexedDB
  const existing = await getAutosave(projectId);
  if (!existing) {
    state.saveInProgress = false;
    state.state = 'unsaved';
    return false;
  }

  try {
    await saveProject({
      projectId: existing.projectId,
      revision: existing.revision,
      projectJson: existing.archive,
      manifestJson: '',
      savedAt: Date.now().toString(),
    });
    state.state = 'saved';
    state.commandsSinceSave = 0;
    state.lastSaveAt = Date.now();
    state.saveInProgress = false;

    // If a newer edit arrived during save, schedule immediate save
    if (state.newerEditArrived) {
      state.newerEditArrived = false;
      await saveAutosave(existing);
    }

    return true;
  } catch (err) {
    state.state = 'save-failed';
    state.saveInProgress = false;
    throw err;
  }
}

// Flush any pending autosave immediately.
export async function flushAutosave(projectId: string): Promise<void> {
  const state = autosaveState.get(projectId);
  if (!state || state.saveInProgress) {
    return;
  }

  state.saveInProgress = true;
  state.state = 'saving';

  const existing = await getAutosave(projectId);
  if (!existing) {
    state.saveInProgress = false;
    state.state = 'unsaved';
    return;
  }

  try {
    await saveProject({
      projectId: existing.projectId,
      revision: existing.revision,
      projectJson: existing.archive,
      manifestJson: '',
      savedAt: Date.now().toString(),
    });
    state.state = 'saved';
    state.commandsSinceSave = 0;
    state.lastSaveAt = Date.now();
    state.saveInProgress = false;

    if (state.newerEditArrived) {
      state.newerEditArrived = false;
      await saveAutosave(existing);
    }
  } catch (err) {
    state.state = 'save-failed';
    state.saveInProgress = false;
    throw err;
  }
}

// Initialize autosave state for a project (call when project is opened/created).
export function initAutosave(projectId: string, config: AutosaveConfig = DEFAULT_CONFIG): void {
  if (autosaveState.has(projectId)) {
    return;
  }

  autosaveState.set(projectId, {
    config,
    lastCommandAt: Date.now(),
    commandsSinceSave: 0,
    lastSaveAt: Date.now(),
    state: 'saved',
    pendingSave: false,
    saveInProgress: false,
    newerEditArrived: false,
    debounceTimer: null,
    intervalTimer: null,
  });

  // Start interval timer for max interval checking
  const state = autosaveState.get(projectId)!;
  state.intervalTimer = setInterval(async () => {
    await triggerAutosave(projectId);
  }, state.config.maxIntervalMs);
}

// Clean up autosave state when project is closed.
export function disposeAutosave(projectId: string): void {
  const state = autosaveState.get(projectId);
  if (!state) {
    return;
  }

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }
  if (state.intervalTimer) {
    clearInterval(state.intervalTimer);
  }

  autosaveState.delete(projectId);
}
