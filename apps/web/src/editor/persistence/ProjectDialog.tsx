// apps/web/src/editor/persistence/ProjectDialog.tsx
// Modal dialog for Project Management: Save to IndexedDB, Open Saved, New Project,
// Download/Upload .vxproj archives, and Crash Recovery notification banner.

import React, { useState, useEffect, useRef } from 'react';
import type {
  ProjectPersistenceController,
  SavedProjectSummary,
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

export function ProjectDialog({
  controller,
  isOpen,
  onClose,
  className,
  onNewProject,
  onProjectLoaded,
}: ProjectDialogProps): React.ReactElement | null {
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<Project>(controller.getCurrentProject());
  const [recoveryEntry, setRecoveryEntry] = useState<RecoveryEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setCurrentProject(controller.getCurrentProject());
      setStatusMessage(null);
      setErrorMessage(null);
      refreshSavedProjects();
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

  const refreshSavedProjects = async () => {
    try {
      const list = await controller.listSavedProjectsDetailed();
      setSavedProjects(list);
    } catch (err) {
      console.error('Failed to list saved projects:', err);
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

  const handleSaveCurrent = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await controller.saveCurrentProject();
      setStatusMessage(`Project saved to IndexedDB (Revision ${res.revision})`);
      await refreshSavedProjects();
      setRecoveryEntry(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadProject = async (id: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const proj = await controller.loadProjectById(id);
      setCurrentProject(proj);
      setStatusMessage(`Loaded project "${proj.name}"`);
      onProjectLoaded?.(proj);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete project "${id}"?`)) {
      return;
    }
    setIsLoading(true);
    try {
      await controller.deleteSavedProject(id);
      if (selectedProjectId === id) setSelectedProjectId(null);
      await refreshSavedProjects();
      setStatusMessage(`Deleted project "${id}"`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Delete failed');
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
      setStatusMessage(`Imported archive "${file.name}" successfully`);
      onProjectLoaded?.(proj);
      await refreshSavedProjects();
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

  const handleNewProjectClick = () => {
    if (controller.hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Create a new project anyway?')) {
        return;
      }
    }
    onNewProject?.();
    onClose();
  };

  if (!isOpen) return null;

  const hasUnsaved = controller.hasUnsavedChanges();

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
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
          maxWidth: '640px',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
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
            <span style={{ fontSize: '16px' }}>📁</span>
            <h2 id="project-dialog-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              Project Management
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
        <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Current Project Actions */}
          <div
            style={{
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7' }}>
                  Current Project: {currentProject.name || 'Untitled'}
                </span>
                <span style={{ fontSize: '11px', color: '#a1a1aa', marginLeft: '8px' }}>
                  (ID: {currentProject.id}, Rev: {currentProject.revision}, {currentProject.placements.length} placements)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSaveCurrent}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  💾 Save to IDB
                </button>
                <button
                  type="button"
                  onClick={handleNewProjectClick}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#3f3f46',
                    color: '#f4f4f5',
                    border: '1px solid #52525b',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  ➕ New Project
                </button>
              </div>
            </div>

            {/* Archive Operations */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleDownloadVxproj}
                disabled={isLoading}
                style={{
                  backgroundColor: '#18181b',
                  color: '#38bdf8',
                  border: '1px solid #0284c7',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                ⬇️ Download .vxproj Archive
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
                  padding: '6px 10px',
                  fontSize: '12px',
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

          {/* Saved Projects List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#d4d4d8' }}>
                Saved Projects in IndexedDB ({savedProjects.length})
              </h3>
              <button
                type="button"
                onClick={refreshSavedProjects}
                disabled={isLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                🔄 Refresh
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  backgroundColor: '#27272a',
                  borderRadius: '6px',
                  color: '#71717a',
                  fontSize: '13px',
                }}
              >
                No saved projects found in IndexedDB. Click &quot;Save to IDB&quot; above to store this project.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  backgroundColor: '#18181b',
                }}
              >
                {savedProjects.map((proj) => {
                  const isCurrent = proj.id === currentProject.id;
                  return (
                    <div
                      key={proj.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderBottom: '1px solid #27272a',
                        backgroundColor: isCurrent ? '#27272a' : 'transparent',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#f4f4f5' }}>
                          {proj.name}
                          {isCurrent && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '10px',
                                color: '#4ade80',
                                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}
                            >
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#71717a' }}>
                          Rev {proj.revision} • Saved {new Date(proj.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleLoadProject(proj.id)}
                            disabled={isLoading}
                            style={{
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(proj.id)}
                          disabled={isLoading}
                          aria-label={`Delete ${proj.name}`}
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
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
