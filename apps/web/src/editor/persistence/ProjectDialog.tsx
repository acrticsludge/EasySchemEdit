// apps/web/src/editor/persistence/ProjectDialog.tsx
// Modal dialog for Project Management: Save to Cloud (Neon + R2), Open Saved Cloud Projects,
// New Project, Rename, Delete, Download/Upload .vxproj archives, and Crash Recovery notification banner.

import React, { useState, useEffect, useRef } from 'react';
import type {
  ProjectPersistenceController,
  CloudProjectSummary,
} from './persistence-controller.ts';
import { triggerFileDownload } from './persistence-controller.ts';
import type { Project } from '@easyschemedit/domain';
import type { RecoveryEntry } from '@easyschemedit/persistence';

export interface ProjectDialogProps {
  controller: ProjectPersistenceController;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  onNewProject?: () => void;
  onProjectLoaded?: (project: Project) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ProjectDialog({
  controller,
  isOpen,
  onClose,
  className,
  onNewProject,
  onProjectLoaded,
}: ProjectDialogProps): React.ReactElement | null {
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<Project>(controller.getCurrentProject());
  const [projectNameInput, setProjectNameInput] = useState<string>(
    controller.getCurrentProject().name || 'Untitled Schematic',
  );
  const [recoveryEntry, setRecoveryEntry] = useState<RecoveryEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState<string>('My Project');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      const proj = controller.getCurrentProject();
      setCurrentProject(proj);
      setProjectNameInput(proj.name || 'Untitled Schematic');
      setStatusMessage(null);
      setErrorMessage(null);
      setRenamingProjectId(null);
      setIsCreatingNew(false);
      refreshCloudProjects();
      checkRecovery();
    }
  }, [isOpen, controller]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  const refreshCloudProjects = async () => {
    try {
      const list = await controller.listCloudProjects();
      // Ensure sorted newest first
      const sorted = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setCloudProjects(sorted);
    } catch (err) {
      console.warn('Failed to list cloud projects:', err);
      // Non-fatal if unauthenticated or network error
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to fetch cloud projects list',
      );
    }
  };

  const checkRecovery = async () => {
    try {
      const res = await controller.checkCrashRecovery();
      if (res.hasRecovery && res.entry) {
        setRecoveryEntry(res.entry);
      } else {
        setRecoveryEntry(null);
      }
    } catch {
      setRecoveryEntry(null);
    }
  };

  const handleSaveToCloud = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const targetName = projectNameInput.trim() || 'Untitled Schematic';
      const summary = await controller.saveToCloud(targetName);
      setCurrentProject(controller.getCurrentProject());
      setStatusMessage(
        `Project "${summary.name}" saved to cloud (Revision ${summary.revision})`,
      );
      await refreshCloudProjects();
      setRecoveryEntry(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save to cloud failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProject = async (id: string, name: string) => {
    if (controller.hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Discard them and open this project?')) {
        return;
      }
    }
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const proj = await controller.openFromCloud(id);
      setCurrentProject(proj);
      setProjectNameInput(proj.name || 'Untitled Schematic');
      setStatusMessage(`Loaded project "${proj.name}"`);
      onProjectLoaded?.(proj);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to open cloud project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewProjectSubmit = async () => {
    if (controller.hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Create a new project anyway?')) {
        return;
      }
    }
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const name = newProjectNameInput.trim() || 'Untitled Schematic';
      const proj = await controller.createNewCloudProject(name);
      setCurrentProject(proj);
      setProjectNameInput(proj.name);
      setIsCreatingNew(false);
      onNewProject?.();
      onProjectLoaded?.(proj);
      setStatusMessage(`Created new project "${proj.name}"`);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create new project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setRenamingProjectId(id);
    setRenameInput(currentName);
  };

  const handleConfirmRename = async (id: string) => {
    if (!renameInput.trim()) {
      setRenamingProjectId(null);
      return;
    }
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const updated = await controller.renameCloudProject(id, renameInput.trim());
      setRenamingProjectId(null);
      if (controller.getActiveCloudProjectId() === id) {
        setProjectNameInput(updated.name);
        setCurrentProject(controller.getCurrentProject());
      }
      setStatusMessage(`Renamed project to "${updated.name}"`);
      await refreshCloudProjects();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to rename project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete project "${name}"?`)) {
      return;
    }
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await controller.deleteFromCloud(id);
      setStatusMessage(`Deleted project "${name}"`);
      await refreshCloudProjects();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadVxproj = () => {
    try {
      const { bytes, filename } = controller.exportVxprojBytes();
      triggerFileDownload(filename, bytes);
      setStatusMessage(`Downloaded "${filename}"`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleOpenFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const proj = await controller.importVxprojBytes(bytes);
      setCurrentProject(proj);
      setProjectNameInput(proj.name || 'Untitled Schematic');
      setStatusMessage(`Imported archive "${file.name}" successfully`);
      onProjectLoaded?.(proj);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRestoreRecovery = async () => {
    if (!recoveryEntry) return;
    setIsLoading(true);
    try {
      const restored = await controller.restoreFromRecovery(recoveryEntry.projectId);
      if (restored) {
        setCurrentProject(restored);
        setProjectNameInput(restored.name || 'Untitled Schematic');
        setRecoveryEntry(null);
        setStatusMessage('Session successfully restored from crash recovery');
        onProjectLoaded?.(restored);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Recovery restore failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscardRecovery = async () => {
    if (!recoveryEntry) return;
    try {
      await controller.discardRecovery(recoveryEntry.projectId);
      setRecoveryEntry(null);
      setStatusMessage('Recovery snapshot discarded');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Discard recovery failed');
    }
  };

  if (!isOpen) return null;

  const hasUnsaved = controller.hasUnsavedChanges();
  const activeCloudId = controller.getActiveCloudProjectId();

  return (
    <div
      role="dialog"
      aria-labelledby="project-dialog-title"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        className={`project-dialog ${className ?? ''}`}
        style={{
          width: '100%',
          maxWidth: '660px',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderBottom: '1px solid #3f3f46',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>☁️</span>
            <h2 id="project-dialog-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              Cloud Projects
            </h2>
            {hasUnsaved && (
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: '#b45309',
                  color: '#fef3c7',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                Unsaved Changes
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </header>

        {/* Crash Recovery Notification Banner */}
        {recoveryEntry && (
          <div
            style={{
              backgroundColor: '#451a03',
              borderBottom: '1px solid #b45309',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#fed7aa' }}>
              ⚠️ <strong>Unsaved session recovery found</strong> from{' '}
              {new Date(recoveryEntry.savedAt).toLocaleTimeString()} (rev {recoveryEntry.revision})
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleRestoreRecovery}
                disabled={isLoading}
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#18181b',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Restore
              </button>
              <button
                type="button"
                onClick={handleDiscardRecovery}
                disabled={isLoading}
                style={{
                  backgroundColor: 'transparent',
                  color: '#fdba74',
                  border: '1px solid #78350f',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Current Project Card & Save Action */}
          <div
            style={{
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ flex: '1 1 240px' }}>
                <label
                  htmlFor="project-name-input"
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#a1a1aa',
                    marginBottom: '4px',
                    fontWeight: 500,
                  }}
                >
                  PROJECT NAME
                </label>
                <input
                  id="project-name-input"
                  type="text"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  placeholder="Enter project name..."
                  style={{
                    width: '100%',
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    color: '#f4f4f5',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleSaveToCloud}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>💾</span>
                  <span>{isLoading ? 'Saving...' : 'Save to Cloud'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCreatingNew((prev) => !prev)}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#3f3f46',
                    color: '#f4f4f5',
                    border: '1px solid #52525b',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  ➕ New Project
                </button>
              </div>
            </div>

            {/* Inline New Project Form */}
            {isCreatingNew && (
              <div
                style={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  padding: '10px',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <input
                  type="text"
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  placeholder="New project name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNewProjectSubmit();
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#27272a',
                    border: '1px solid #52525b',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    color: '#f4f4f5',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleNewProjectSubmit}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  style={{
                    background: 'none',
                    border: '1px solid #52525b',
                    color: '#a1a1aa',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Current Project Details & Cloud status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#a1a1aa' }}>
              <span>
                {currentProject.placements.length} placement{currentProject.placements.length === 1 ? '' : 's'}
              </span>
              <span>•</span>
              <span>Rev {currentProject.revision || 0}</span>
              <span>•</span>
              {activeCloudId ? (
                <span style={{ color: '#4ade80' }}>
                  ✓ Cloud linked (ID: {activeCloudId.slice(0, 8)}...)
                </span>
              ) : (
                <span style={{ color: '#f59e0b' }}>
                  ○ Local only (not yet saved to cloud)
                </span>
              )}
            </div>
          </div>

          {/* Saved Cloud Projects List */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#d4d4d8' }}>
                Saved Cloud Projects ({cloudProjects.length})
              </h3>
              <button
                type="button"
                onClick={refreshCloudProjects}
                disabled={isLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            </div>

            {cloudProjects.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '28px 16px',
                  backgroundColor: '#27272a',
                  borderRadius: '6px',
                  color: '#71717a',
                  fontSize: '13px',
                }}
              >
                No cloud projects found. Click &quot;Save to Cloud&quot; above to store this project in Neon + R2.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  backgroundColor: '#18181b',
                }}
              >
                {cloudProjects.map((proj) => {
                  const isCurrent = activeCloudId === proj.id;
                  const isRenaming = renamingProjectId === proj.id;

                  return (
                    <div
                      key={proj.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderBottom: '1px solid #27272a',
                        backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        gap: '8px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isRenaming ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmRename(proj.id);
                                if (e.key === 'Escape') setRenamingProjectId(null);
                              }}
                              style={{
                                backgroundColor: '#27272a',
                                border: '1px solid #3b82f6',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                fontSize: '12px',
                                color: '#ffffff',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleConfirmRename(proj.id)}
                              style={{
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingProjectId(null)}
                              style={{
                                background: 'none',
                                border: '1px solid #52525b',
                                color: '#a1a1aa',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#f4f4f5',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={proj.name}
                            >
                              {proj.name}
                            </span>
                            {isCurrent && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: '#4ade80',
                                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 500,
                                }}
                              >
                                Active
                              </span>
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: '11px',
                            color: '#71717a',
                            marginTop: '2px',
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{proj.placementCount} placement{proj.placementCount === 1 ? '' : 's'}</span>
                          <span>•</span>
                          <span>{formatBytes(proj.sizeBytes)}</span>
                          <span>•</span>
                          <span>Rev {proj.revision}</span>
                          <span>•</span>
                          <span>Updated {new Date(proj.updatedAt).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        {!isRenaming && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenProject(proj.id, proj.name)}
                              disabled={isLoading}
                              style={{
                                backgroundColor: isCurrent ? '#3f3f46' : '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              {isCurrent ? 'Reload' : 'Open'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartRename(proj.id, proj.name)}
                              disabled={isLoading}
                              title="Rename project"
                              style={{
                                backgroundColor: 'transparent',
                                color: '#a1a1aa',
                                border: '1px solid #3f3f46',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(proj.id, proj.name)}
                              disabled={isLoading}
                              aria-label={`Delete ${proj.name}`}
                              title="Delete project"
                              style={{
                                backgroundColor: 'transparent',
                                color: '#ef4444',
                                border: '1px solid #7f1d1d',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Secondary File Operations: Download & Open .vxproj */}
          <div
            style={{
              paddingTop: '8px',
              borderTop: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#71717a' }}>LOCAL ARCHIVE BACKUP:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleDownloadVxproj}
                disabled={isLoading}
                style={{
                  backgroundColor: '#18181b',
                  color: '#38bdf8',
                  border: '1px solid #0284c7',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                ⬇️ Download .vxproj
              </button>
              <button
                type="button"
                onClick={handleOpenFileClick}
                disabled={isLoading}
                style={{
                  backgroundColor: '#18181b',
                  color: '#a78bfa',
                  border: '1px solid #7c3aed',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                📂 Open .vxproj File...
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vxproj"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Status and Error Messages */}
          {statusMessage && (
            <div
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid #22c55e',
                color: '#86efac',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              ✓ {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              ✕ {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderTop: '1px solid #3f3f46',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              backgroundColor: '#3f3f46',
              color: '#f4f4f5',
              border: '1px solid #52525b',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
