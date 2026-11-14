// apps/web/src/editor/persistence/persistence-controller.ts
// Controller for project save/load, autosave, crash recovery, .vxproj archives, build library, and schematic export.
// Bridges IndexedDB persistence (@easyschemedit/persistence) and schematic formats (@easyschemedit/formats) with EditorSessionStore.

import type { Project, Placement, Bounds3i } from '@easyschemedit/domain';
import {
  saveProject,
  getProject,
  deleteProject,
  listProjects,
  type ProjectArchive,
  ProjectStoreError,
  saveAutosave,
  getAutosave,
  saveRecovery,
  getRecovery,
  clearRecovery,
  type AutosaveEntry,
  type RecoveryEntry,
  packVxprojArchive,
  unpackVxprojArchive,
  saveLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  deleteLibraryEntry,
  getLibraryStorageStats,
  type LibraryEntry,
} from '@easyschemedit/persistence';
import {
  exportSchematic,
  importSchematic,
  type ExportResult,
  type ExportTarget,
} from '@easyschemedit/formats';
import type { EditorSessionStore } from '../session-store.ts';

export interface IPersistenceSessionStore {
  readonly session?: any;
  getSnapshot(): { project: Project; revision: number; [key: string]: any };
  execute(cmd: any, opts?: any): Promise<any>;
  subscribe?(listener: () => void): () => void;
}

export interface PersistenceControllerOptions {
  autosaveDebounceMs?: number;
}

export interface SavedProjectSummary {
  id: string;
  name: string;
  revision: number;
  savedAt: string;
}

export interface ExportSchematicOptions {
  scope?: 'composite' | 'placement' | 'selection';
  placementId?: string;
  selectionBounds?: Bounds3i;
  strict?: boolean;
  allowLossy?: boolean;
}

/**
 * Encodes Uint8Array into a base64 string portably across browser and Node.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

/**
 * Decodes a base64 string into a Uint8Array portably across browser and Node.
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Triggers a browser file download for binary payload.
 */
export function triggerFileDownload(
  filename: string,
  bytes: Uint8Array,
  mimeType: string = 'application/octet-stream',
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([bytes as any], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * High-level persistence controller managing project storage, crash recovery,
 * .vxproj file archives, persistent build library, and schematic export.
 */
export class ProjectPersistenceController {
  private readonly store: IPersistenceSessionStore;
  private lastSavedRevision: number;
  private lastAutosavedRevision: number = -1;
  private autosaveWorker: Worker | null = null;
  private nextAutosaveRequestId: number = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autosaveDebounceMs: number;
  private isAutosaving = false;

  constructor(
    store: IPersistenceSessionStore | EditorSessionStore,
    options?: PersistenceControllerOptions,
  ) {
    this.store = store;
    this.lastSavedRevision = store.getSnapshot().project.revision;
    this.autosaveDebounceMs = options?.autosaveDebounceMs ?? 2500;
  }

  // ==========================================================================
  // Status & Revisions
  // ==========================================================================

  public getLastSavedRevision(): number {
    return this.lastSavedRevision;
  }

  public hasUnsavedChanges(): boolean {
    const currentRev = this.store.getSnapshot().project.revision;
    return currentRev !== this.lastSavedRevision;
  }

  public getCurrentProject(): Project {
    return this.store.getSnapshot().project;
  }

  public getCurrentProjectId(): string {
    return this.store.getSnapshot().project.id;
  }

  // ==========================================================================
  // IndexedDB Project Save / Load / List / Delete
  // ==========================================================================

  /**
   * Saves the current project state into IndexedDB.
   * Full ChunkedVoxelVolume chunks, palettes, transforms, and ancillary data
   * are serialized into a .vxproj ZIP archive and encoded in the archive payload.
   */
  public async saveCurrentProject(): Promise<{ revision: number; savedAt: string }> {
    const project = this.store.getSnapshot().project;
    const zipBytes = packVxprojArchive(project);
    const existing = await getProject(project.id);
    const nextRevision = existing ? existing.revision + 1 : (project.revision || 1);
    const savedAt = new Date().toISOString();

    const payload = JSON.stringify({
      format: 'vxproj-base64',
      payload: bytesToBase64(zipBytes),
      id: project.id,
      name: project.name,
      revision: nextRevision,
      savedAt,
    });

    const archive: ProjectArchive = {
      projectId: project.id,
      revision: nextRevision,
      projectJson: payload,
      manifestJson: JSON.stringify({ version: 1, format: 'vxproj' }),
      savedAt,
    };

    await saveProject(archive);
    this.lastSavedRevision = nextRevision;

    // Clear any pending recovery entry on clean save
    try {
      await clearRecovery(project.id);
    } catch {
      // Non-fatal if recovery was not present
    }

    return { revision: nextRevision, savedAt };
  }

  /**
   * Loads a project from IndexedDB by projectId and syncs it into the session store.
   */
  public async loadProjectById(projectId: string): Promise<Project> {
    const archive = await getProject(projectId);
    if (!archive) {
      throw new ProjectStoreError('NOT_FOUND', `Project ${projectId} not found in IndexedDB`);
    }

    let project: Project;
    const parsed = JSON.parse(archive.projectJson);
    if (parsed && parsed.format === 'vxproj-base64' && typeof parsed.payload === 'string') {
      const bytes = base64ToBytes(parsed.payload);
      project = unpackVxprojArchive(bytes);
    } else {
      project = parsed as Project;
    }

    await this.syncProjectIntoStore(project);
    this.lastSavedRevision = archive.revision;
    return project;
  }

  /**
   * Lists all saved project IDs from IndexedDB.
   */
  public async listSavedProjects(): Promise<string[]> {
    return listProjects();
  }

  /**
   * Lists detailed summaries for all saved projects.
   */
  public async listSavedProjectsDetailed(): Promise<SavedProjectSummary[]> {
    const ids = await listProjects();
    const summaries: SavedProjectSummary[] = [];

    for (const id of ids) {
      try {
        const archive = await getProject(id);
        if (archive) {
          let name = id;
          try {
            const parsed = JSON.parse(archive.projectJson);
            name = parsed.name || id;
          } catch {
            // fallback to id
          }
          summaries.push({
            id: archive.projectId,
            name,
            revision: archive.revision,
            savedAt: archive.savedAt,
          });
        }
      } catch {
        // Skip unreadable projects
      }
    }

    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /**
   * Deletes a project from IndexedDB.
   */
  public async deleteSavedProject(projectId: string): Promise<void> {
    await deleteProject(projectId);
    try {
      await clearRecovery(projectId);
    } catch {
      // Ignored
    }
  }

  // ==========================================================================
  // Debounced Autosave & Crash Recovery
  // ==========================================================================

  /**
   * Manually triggers an autosave snapshot, storing full .vxproj payload into
   * both autosave journal and recovery store.
   */
  public async triggerAutosave(): Promise<void> {
    if (this.isAutosaving) return;

    const project = this.store.getSnapshot().project;
    if (project.revision === this.lastAutosavedRevision) {
      return;
    }

    this.isAutosaving = true;

    try {
      let base64Payload: string;

      if (typeof Worker !== 'undefined') {
        if (!this.autosaveWorker) {
          try {
            this.autosaveWorker = new Worker(
              new URL('../../workers/autosave-worker.ts', import.meta.url),
              { type: 'module' },
            );
          } catch {
            this.autosaveWorker = null;
          }
        }
      }

      if (this.autosaveWorker) {
        try {
          base64Payload = await this.packWithWorker(this.autosaveWorker, project);
        } catch (workerErr) {
          console.warn('Autosave worker failed, falling back to sync pack:', workerErr);
          const zipBytes = packVxprojArchive(project);
          base64Payload = bytesToBase64(zipBytes);
        }
      } else {
        const zipBytes = packVxprojArchive(project);
        base64Payload = bytesToBase64(zipBytes);
      }

      const existing = await getProject(project.id);
      const nextRevision = existing ? existing.revision + 1 : (project.revision || 1);
      const savedAt = new Date().toISOString();

      const payload = JSON.stringify({
        format: 'vxproj-base64',
        payload: base64Payload,
        id: project.id,
        name: project.name,
        revision: nextRevision,
        savedAt,
      });

      const autoEntry: AutosaveEntry = {
        projectId: project.id,
        revision: nextRevision,
        archive: payload,
        savedAt,
      };

      const recoveryEntry: RecoveryEntry = {
        projectId: project.id,
        revision: nextRevision,
        archive: payload,
        savedAt,
        reason: 'autosave',
      };

      await saveAutosave(autoEntry);
      await saveRecovery(recoveryEntry);

      this.lastAutosavedRevision = project.revision;
    } finally {
      this.isAutosaving = false;
    }
  }

  /**
   * Offloads .vxproj packaging and Base64 encoding to a Web Worker.
   */
  private packWithWorker(worker: Worker, project: Project): Promise<string> {
    const id = ++this.nextAutosaveRequestId;
    return new Promise<string>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<any>) => {
        if (event.data && event.data.id === id) {
          cleanup();
          if (event.data.ok) {
            resolve(event.data.base64);
          } else {
            reject(new Error(event.data.error || 'Worker autosave failed'));
          }
        }
      };

      const handleError = (error: ErrorEvent) => {
        cleanup();
        reject(error);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Autosave worker timed out'));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timeout);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({ id, project });
    });
  }

  /**
   * Schedules a debounced autosave.
   */
  public scheduleAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.triggerAutosave().catch((err) => {
        console.error('Debounced autosave failed:', err);
      });
    }, this.autosaveDebounceMs);
  }

  /**
   * Checks whether a recovery snapshot exists for the specified (or current) project.
   */
  public async checkCrashRecovery(
    projectId?: string,
  ): Promise<{ hasRecovery: boolean; entry: RecoveryEntry | null }> {
    const targetId = projectId ?? this.getCurrentProjectId();
    try {
      const entry = await getRecovery(targetId);
      return {
        hasRecovery: entry !== null,
        entry,
      };
    } catch {
      return { hasRecovery: false, entry: null };
    }
  }

  /**
   * Restores project from recovery snapshot into the session store.
   */
  public async restoreFromRecovery(projectId?: string): Promise<Project | null> {
    const targetId = projectId ?? this.getCurrentProjectId();
    const entry = await getRecovery(targetId);
    if (!entry) return null;

    let project: Project;
    const parsed = JSON.parse(entry.archive);
    if (parsed && parsed.format === 'vxproj-base64' && typeof parsed.payload === 'string') {
      const bytes = base64ToBytes(parsed.payload);
      project = unpackVxprojArchive(bytes);
    } else {
      project = parsed as Project;
    }

    await this.syncProjectIntoStore(project);
    return project;
  }

  /**
   * Discards the recovery snapshot for a project.
   */
  public async discardRecovery(projectId?: string): Promise<void> {
    const targetId = projectId ?? this.getCurrentProjectId();
    await clearRecovery(targetId);
  }

  // ==========================================================================
  // .vxproj File Import / Export
  // ==========================================================================

  /**
   * Packs the current project snapshot into a .vxproj ZIP archive buffer.
   */
  public exportVxprojBytes(): { bytes: Uint8Array; filename: string } {
    const project = this.store.getSnapshot().project;
    const bytes = packVxprojArchive(project);
    const sanitizedName = (project.name || 'project').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return {
      bytes,
      filename: `${sanitizedName}.vxproj`,
    };
  }

  /**
   * Unpacks a .vxproj ZIP archive buffer and restores it into the session store.
   */
  public async importVxprojBytes(bytes: Uint8Array): Promise<Project> {
    const project = unpackVxprojArchive(bytes);
    await this.syncProjectIntoStore(project);
    this.lastSavedRevision = project.revision;
    return project;
  }

  // ==========================================================================
  // Persistent Build Library
  // ==========================================================================

  /**
   * Exports a placement and persists it as an entry in the build library.
   */
  public async savePlacementToLibrary(
    placementId: string,
    meta?: {
      name?: string;
      description?: string;
      tags?: string[];
      format?: 'schem-v3' | 'litematic';
    },
  ): Promise<LibraryEntry> {
    const project = this.store.getSnapshot().project;
    const placement = project.placements.find((p) => p.id === placementId);
    if (!placement) {
      throw new Error(`Placement ${placementId} not found in project`);
    }

    const format = meta?.format ?? 'schem-v3';
    const exportResult = await exportSchematic(format, project, {
      target: { kind: 'placement', placementId },
    });

    const bounds = placement.volume.bounds;
    const width = Math.max(1, bounds.maxExclusive[0] - bounds.min[0]);
    const height = Math.max(1, bounds.maxExclusive[1] - bounds.min[1]);
    const length = Math.max(1, bounds.maxExclusive[2] - bounds.min[2]);

    const entry: LibraryEntry = {
      id: `lib_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: meta?.name?.trim() || placement.name || 'Untitled Build',
      description: meta?.description?.trim() || '',
      tags: meta?.tags ? meta.tags.map((t) => t.trim()).filter(Boolean) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      format,
      dimensions: { width, height, length },
      nonAirCount: placement.volume.nonAirCount,
      sizeBytes: exportResult.bytes.byteLength,
      data: exportResult.bytes,
    };

    await saveLibraryEntry(entry);
    return entry;
  }

  /**
   * Queries entries from the build library by search string or tag.
   */
  public async browseLibrary(query?: {
    search?: string;
    tag?: string;
  }): Promise<Omit<LibraryEntry, 'data'>[]> {
    return listLibraryEntries(query);
  }

  /**
   * Imports a library entry and adds its placement(s) to the session store.
   */
  public async placeFromLibrary(
    entryId: string,
    targetPosition?: [number, number, number],
  ): Promise<Placement[]> {
    const entry = await getLibraryEntry(entryId);
    if (!entry) {
      throw new Error(`Library entry not found: ${entryId}`);
    }

    const ext = entry.format === 'litematic' ? '.litematic' : '.schem';
    const importResult = await importSchematic(entry.data, `${entry.name}${ext}`);
    const addedPlacements: Placement[] = [];

    for (const p of importResult.placements) {
      const placementId = `placement_lib_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let placed: Placement = {
        ...p,
        id: placementId,
      };

      if (targetPosition) {
        placed = {
          ...placed,
          origin: [
            p.origin[0] + targetPosition[0],
            p.origin[1] + targetPosition[1],
            p.origin[2] + targetPosition[2],
          ],
          transform: {
            ...p.transform,
            translation: [
              p.transform.translation[0] + targetPosition[0],
              p.transform.translation[1] + targetPosition[1],
              p.transform.translation[2] + targetPosition[2],
            ],
          },
        };
      }

      await this.store.execute({ type: 'placement:add', placement: placed });
      addedPlacements.push(placed);
    }

    return addedPlacements;
  }

  /**
   * Deletes a library entry by ID.
   */
  public async removeLibraryEntry(entryId: string): Promise<boolean> {
    return deleteLibraryEntry(entryId);
  }

  /**
   * Gets storage statistics for the build library.
   */
  public async getLibraryStats(): Promise<{ entryCount: number; totalBytes: number }> {
    return getLibraryStorageStats();
  }

  // ==========================================================================
  // Schematic Export (.schem v3 / .litematic)
  // ==========================================================================

  /**
   * Exports project schematic data according to target format and scope.
   */
  public async exportProjectSchematic(
    target: 'schem-v3' | 'litematic',
    opts?: ExportSchematicOptions,
  ): Promise<ExportResult> {
    const project = this.store.getSnapshot().project;
    const scope = opts?.scope ?? 'composite';

    let exportTarget: ExportTarget;
    if (scope === 'placement') {
      const pId = opts?.placementId ?? project.placements[0]?.id;
      if (!pId) {
        throw new Error('No placement available for placement export');
      }
      exportTarget = { kind: 'placement', placementId: pId };
    } else if (scope === 'selection' && opts?.selectionBounds) {
      exportTarget = {
        kind: 'selection',
        bounds: opts.selectionBounds,
        includeHidden: false,
      };
    } else {
      exportTarget = { kind: 'composite', includeHidden: false };
    }

    return exportSchematic(target, project, {
      target: exportTarget,
      strict: opts?.strict ?? false,
      confirmLossy: opts?.allowLossy ?? false,
    });
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  /**
   * Synchronizes a Project object into the session store by clearing existing
   * placements and adding all project placements via commands.
   */
  private async syncProjectIntoStore(project: Project): Promise<void> {
    const currentPlacements = [...this.store.getSnapshot().project.placements];

    // Remove existing placements
    for (const p of currentPlacements) {
      if (p.locked) {
        await this.store.execute({
          type: 'placement:setLocked',
          placementId: p.id,
          locked: false,
        });
      }
      await this.store.execute({
        type: 'placement:remove',
        placementId: p.id,
      });
    }

    // Add incoming placements
    for (const p of project.placements) {
      await this.store.execute({
        type: 'placement:add',
        placement: p,
      });
    }

    // Update metadata directly if session is attached
    if (this.store.session) {
      const sessionProj = (this.store.session as any).project;
      if (sessionProj) {
        sessionProj.id = project.id;
        sessionProj.name = project.name;
        sessionProj.importGroups = project.importGroups ?? [];
        sessionProj.overlapPolicy = project.overlapPolicy ?? 'top-wins';
        sessionProj.conflictOverlay = project.conflictOverlay ?? 'off';
        sessionProj.metadata = project.metadata ?? {
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
        };
      }
    }

    (this.store as any).updateSnapshotAndNotify?.();
  }

  public dispose(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.autosaveWorker) {
      this.autosaveWorker.terminate();
      this.autosaveWorker = null;
    }
  }
}
