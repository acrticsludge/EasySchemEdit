// packages/persistence/src/index.ts
// Public API for the persistence package.

export {
  openDb,
  STORE_PROJECTS,
  STORE_CHUNKS,
  STORE_AUTOSAVE,
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
