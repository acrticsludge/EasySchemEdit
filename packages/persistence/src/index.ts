// packages/persistence/src/index.ts
// Public API for the persistence package.

export {
  openDB,
  STORE_PROJECTS,
  STORE_CHUNKS,
  STORE_AUTOSAVE_JOURNAL,
  STORE_RECOVERY,
} from './idb-store.ts';

export {
  saveProject,
  getProject,
  deleteProject,
  listProjects,
  type ProjectArchive,
  type ProjectStoreError,
} from './project-store.ts';

export {
  saveChunk,
  getChunk,
  deleteChunk,
  type ChunkBlob,
} from './chunk-store.ts';

export {
  saveAutosave,
  getAutosave,
  saveRecovery,
  getRecovery,
  clearRecovery,
  type AutosaveEntry,
  type RecoveryEntry,
} from './autosave.ts';

export {
  commitProject,
  type CommitRecord,
  type CommitPhase,
} from './commit-protocol.ts';

export type { HistoryEntryType } from './history.ts';
export type { HistoryEntry } from './history.ts';
export { HistoryManager } from './history.ts';
export type { HistoryManagerOptions } from './history.ts';

export {
  type SchemaVersion,
  type MigrationStep,
  type MigrationResult,
  MigrationManager,
  type MigrationOptions,
} from './migration.ts';

export {
  type CommitPhaseForRecovery,
  type UncommittedCommit,
  type RecoveryResult,
  RecoveryManager,
} from './recovery.ts';

export {
  type QuotaInfo,
  type StorageBudgetConfig,
  type StorageBudgetCallbacks,
  StorageBudgetManager,
} from './storage-budget.ts';

export {
  type VxprojManifest,
  type VxprojArchive,
  type VxprojServices,
  serializeVxproj,
  deserializeVxproj,
} from './vxproj.ts';
