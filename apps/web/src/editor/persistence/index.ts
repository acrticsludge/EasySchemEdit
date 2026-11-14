// apps/web/src/editor/persistence/index.ts
// Barrel exports for persistence controller and UI components (Slice E3.9).

export {
  ProjectPersistenceController,
  type IPersistenceSessionStore,
  type PersistenceControllerOptions,
  type SavedProjectSummary,
  type ExportSchematicOptions,
  bytesToBase64,
  base64ToBytes,
  triggerFileDownload,
} from './persistence-controller.ts';

export {
  ProjectDialog,
  type ProjectDialogProps,
} from './ProjectDialog.tsx';

export {
  LibraryPanel,
  type LibraryPanelProps,
} from './LibraryPanel.tsx';

export {
  ExportDialog,
  type ExportDialogProps,
} from './ExportDialog.tsx';

export {
  ProjectExplorer,
  type ProjectExplorerProps,
} from './ProjectExplorer.tsx';
