// packages/persistence/src/index.ts
// Public API for the persistence package.

export {
  openDB,
  closeDB,
  setIDBFactory,
  getIDBFactory,
  isIDBAvailable,
  STORE_PROJECTS,
  STORE_CHUNKS,
  STORE_AUTOSAVE_JOURNAL,
  STORE_RECOVERY,
  STORE_LIBRARY,
  STORE_ANCILLARY,
  STORE_HISTORY,
  STORE_ASSETS,
  STORE_SETTINGS,
  STORE_IDEMPOTENCY,
  STORE_COMMIT_RECORDS,
} from './idb-store.ts';

export {
  saveProject,
  getProject,
  deleteProject,
  listProjects,
  type ProjectArchive,
  ProjectStoreError,
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

export type { HistoryEntryType, HistoryEntry, HistoryManagerOptions } from './history.ts';
export { HistoryManager } from './history.ts';

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
  packVxprojArchive,
  unpackVxprojArchive,
} from './vxproj.ts';

export {
  type IdempotencyRecord,
  type IdempotencyConfig,
  IdempotencyManager,
} from './idempotency.ts';

export {
  type LibraryEntry,
  saveLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  deleteLibraryEntry,
  getLibraryStorageStats,
} from './library-store.ts';
