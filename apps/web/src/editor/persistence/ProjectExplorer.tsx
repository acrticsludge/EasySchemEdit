// apps/web/src/editor/persistence/ProjectExplorer.tsx
// 3-level tree explorer: <username | guest> -> Project folders -> Schematic files.
// Dark S&box aesthetic adhering to EXPLORER_PLAN.md.

import React, { useState, useRef, useEffect } from 'react';
import type { WorkspaceProjectNode, CloudSchematicSummary } from '../../client/projects-client.ts';

export interface ProjectExplorerProps {
  rootLabel: string;
  projects: WorkspaceProjectNode[];
  activeProjectId: string | null;
  activeSchematicId: string | null;
  isDirty: boolean;
  onCreateProject: (name: string) => Promise<void> | void;
  onRenameProject: (projectId: string, name: string) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onCreateSchematic: (projectId: string, name: string) => Promise<void> | void;
  onSelectSchematic: (projectId: string, schematicId: string) => Promise<void> | void;
  onRenameSchematic: (schematicId: string, name: string) => Promise<void> | void;
  onDeleteSchematic: (schematicId: string) => Promise<void> | void;
}

export function ProjectExplorer({
  rootLabel,
  projects,
  activeProjectId,
  activeSchematicId,
  isDirty,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCreateSchematic,
  onSelectSchematic,
  onRenameSchematic,
  onDeleteSchematic,
}: ProjectExplorerProps) {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of projects) {
      initial[p.id] = true;
    }
    return initial;
  });

  // Auto-expand newly created projects when `projects` grows
  const prevProjectIdsRef = useRef<Set<string>>(new Set(projects.map((p) => p.id)));
  useEffect(() => {
    const prevIds = prevProjectIdsRef.current;
    const currentIds = new Set(projects.map((p) => p.id));
    const newlyAdded: Record<string, boolean> = {};
    let hasNew = false;
    for (const p of projects) {
      if (!prevIds.has(p.id)) {
        newlyAdded[p.id] = true;
        hasNew = true;
      }
    }
    prevProjectIdsRef.current = currentIds;
    if (hasNew) {
      setExpandedProjects((prev) => ({ ...prev, ...newlyAdded }));
    }
  }, [projects]);

  // Inline error message banner state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline creation / editing states
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const [creatingSchematicInProject, setCreatingSchematicInProject] = useState<string | null>(null);
  const [newSchematicName, setNewSchematicName] = useState('');

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  const [editingSchematicId, setEditingSchematicId] = useState<string | null>(null);
  const [editingSchematicName, setEditingSchematicName] = useState('');

  const toggleProjectExpand = (projectId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleCreateProjectSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newProjectName.trim();
    if (name) {
      // Close inline inputs immediately on submit so UI never freezes
      setIsCreatingProject(false);
      setNewProjectName('');
      setIsRootExpanded(true);
      try {
        await onCreateProject(name);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleCreateSchematicSubmit = async (projectId: string, e?: React.FormEvent) => {
    e?.preventDefault();
    let name = newSchematicName.trim();
    if (name) {
      if (!name.endsWith('.schem') && !name.endsWith('.litematic')) {
        name += '.schem';
      }
      // Close inline inputs immediately on submit
      setCreatingSchematicInProject(null);
      setNewSchematicName('');
      setExpandedProjects((prev) => ({ ...prev, [projectId]: true }));
      try {
        await onCreateSchematic(projectId, name);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleRenameProjectSubmit = async (projectId: string, e?: React.FormEvent) => {
    e?.preventDefault();
    const name = editingProjectName.trim();
    if (name) {
      // Close inline rename input immediately
      setEditingProjectId(null);
      setEditingProjectName('');
      try {
        await onRenameProject(projectId, name);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleRenameSchematicSubmit = async (schematicId: string, e?: React.FormEvent) => {
    e?.preventDefault();
    let name = editingSchematicName.trim();
    if (name) {
      if (!name.endsWith('.schem') && !name.endsWith('.litematic')) {
        name += '.schem';
      }
      // Close inline rename input immediately
      setEditingSchematicId(null);
      setEditingSchematicName('');
      try {
        await onRenameSchematic(schematicId, name);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <div
      className="editor-project-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxHeight: isSectionCollapsed ? '34px' : '45%',
        flexShrink: 0,
        backgroundColor: '#14161b',
        borderBottom: '1px solid #282828',
        borderRight: '1px solid var(--color-border-subtle, #333333)',
        color: '#eaeaea',
        fontSize: '12px',
        userSelect: 'none',
        overflow: 'hidden',
        transition: 'max-height 0.15s ease-out',
      }}
    >
      {/* 1. Header Bar */}
      <div
        onClick={() => setIsSectionCollapsed((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '34px',
          minHeight: '34px',
          padding: '0 10px',
          borderBottom: isSectionCollapsed ? 'none' : '1px solid #24272f',
          backgroundColor: '#0f1115',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              color: '#888888',
              transform: isSectionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              display: 'inline-block',
            }}
          >
            ▼
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: '11px',
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: '#c2c5cc',
            }}
          >
            Explorer
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            title="New Project"
            aria-label="New Project"
            onClick={(e) => {
              e.stopPropagation();
              if (isSectionCollapsed) setIsSectionCollapsed(false);
              setIsRootExpanded(true);
              setIsCreatingProject(true);
            }}
            style={actionButtonStyle}
          >
            +
          </button>
        </div>
      </div>

      {/* 2. Tree Body */}
      {!isSectionCollapsed && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {/* Dismissible Inline Error Banner */}
          {errorMessage && (
            <div
              style={{
                margin: '2px 8px 6px 8px',
                padding: '4px 8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: '3px',
                color: '#fca5a5',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={errorMessage}
              >
                {errorMessage}
              </span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '11px',
                  lineHeight: 1,
                }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          {/* Root Level: <rootLabel> */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px 4px 6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#9aa0a6',
              cursor: 'pointer',
            }}
            onClick={() => setIsRootExpanded((prev) => !prev)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '9px', color: '#666', width: '10px', textAlign: 'center' }}>
                {isRootExpanded ? '▼' : '▶'}
              </span>
              <span style={{ fontSize: '13px' }}>📁</span>
              <span style={{ color: rootLabel === 'guest' ? '#e2a93b' : '#4a9eff' }}>
                {rootLabel}
              </span>
            </div>
            <button
              type="button"
              title="Add Project folder"
              onClick={(e) => {
                e.stopPropagation();
                setIsRootExpanded(true);
                setIsCreatingProject(true);
              }}
              style={actionButtonStyle}
            >
              +
            </button>
          </div>

          {/* Inline Create Project Input */}
          {isCreatingProject && (
            <div style={{ padding: '2px 8px 4px 22px' }}>
              <form
                onSubmit={handleCreateProjectSubmit}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="Project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsCreatingProject(false);
                      setNewProjectName('');
                    }
                  }}
                  style={inputStyle}
                />
                <button type="submit" style={confirmButtonStyle}>✓</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingProject(false);
                    setNewProjectName('');
                  }}
                  style={cancelButtonStyle}
                >
                  ✕
                </button>
              </form>
            </div>
          )}

          {/* Level 2: Project Folders */}
          {isRootExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {projects.length === 0 && !isCreatingProject ? (
                <div
                  style={{
                    padding: '6px 12px 6px 26px',
                    fontSize: '11px',
                    color: '#666',
                    fontStyle: 'italic',
                  }}
                >
                  No projects. Click + to create one.
                </div>
              ) : (
                projects.map((project) => {
                  const isExpanded = expandedProjects[project.id] ?? true;
                  const isEditingThisProject = editingProjectId === project.id;
                  const isCreatingInThis = creatingSchematicInProject === project.id;

                  return (
                    <div key={project.id} style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Project Row */}
                      <div
                        className="project-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 8px 3px 18px',
                          cursor: 'pointer',
                          backgroundColor: activeProjectId === project.id ? '#1b1f29' : 'transparent',
                        }}
                        onClick={() => toggleProjectExpand(project.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              color: '#777',
                              width: '10px',
                              textAlign: 'center',
                            }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </span>
                          <span style={{ fontSize: '12px' }}>📁</span>
                          {isEditingThisProject ? (
                            <form
                              onSubmit={(e) => handleRenameProjectSubmit(project.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingProjectId(null);
                                }}
                                style={{ ...inputStyle, width: '110px' }}
                              />
                              <button type="submit" style={confirmButtonStyle}>✓</button>
                              <button
                                type="button"
                                onClick={() => setEditingProjectId(null)}
                                style={cancelButtonStyle}
                              >
                                ✕
                              </button>
                            </form>
                          ) : (
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: 500,
                                color: '#d0d3da',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={project.name}
                            >
                              {project.name}
                            </span>
                          )}
                        </div>

                        {/* Project Actions */}
                        {!isEditingThisProject && (
                          <div
                            className="project-actions"
                            style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="Add Schematic file"
                              onClick={() => {
                                setExpandedProjects((prev) => ({ ...prev, [project.id]: true }));
                                setCreatingSchematicInProject(project.id);
                                setNewSchematicName('untitled.schem');
                              }}
                              style={actionButtonStyle}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              title="Rename Project"
                              onClick={() => {
                                setEditingProjectId(project.id);
                                setEditingProjectName(project.name);
                              }}
                              style={actionButtonStyle}
                            >
                              ✏
                            </button>
                            <button
                              type="button"
                              title="Delete Project"
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Delete project "${project.name}" and all its schematics? This cannot be undone.`,
                                  )
                                ) {
                                  try {
                                    await onDeleteProject(project.id);
                                  } catch (err) {
                                    setErrorMessage(err instanceof Error ? err.message : String(err));
                                  }
                                }
                              }}
                              style={{ ...actionButtonStyle, color: '#ef4444' }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Create Schematic Input */}
                      {isExpanded && isCreatingInThis && (
                        <div style={{ padding: '2px 8px 4px 34px' }}>
                          <form
                            onSubmit={(e) => handleCreateSchematicSubmit(project.id, e)}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <input
                              type="text"
                              autoFocus
                              placeholder="schematic.schem"
                              value={newSchematicName}
                              onChange={(e) => setNewSchematicName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setCreatingSchematicInProject(null);
                                  setNewSchematicName('');
                                }
                              }}
                              style={inputStyle}
                            />
                            <button type="submit" style={confirmButtonStyle}>✓</button>
                            <button
                              type="button"
                              onClick={() => {
                                setCreatingSchematicInProject(null);
                                setNewSchematicName('');
                              }}
                              style={cancelButtonStyle}
                            >
                              ✕
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Level 3: Schematic File Rows */}
                      {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {project.schematics.length === 0 && !isCreatingInThis ? (
                            <div
                              style={{
                                padding: '3px 8px 3px 36px',
                                fontSize: '11px',
                                color: '#555',
                                fontStyle: 'italic',
                              }}
                            >
                              (no schematics)
                            </div>
                          ) : (
                            project.schematics.map((schematic: CloudSchematicSummary) => {
                              const isActive = schematic.id === activeSchematicId;
                              const isEditingThisSchematic = editingSchematicId === schematic.id;

                              return (
                                <div
                                  key={schematic.id}
                                  className="schematic-row"
                                  onClick={async () => {
                                    if (!isActive) {
                                      try {
                                        await onSelectSchematic(project.id, schematic.id);
                                      } catch (err) {
                                        setErrorMessage(err instanceof Error ? err.message : String(err));
                                      }
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '3px 8px 3px 34px',
                                    backgroundColor: isActive ? '#1c2838' : 'transparent',
                                    borderLeft: isActive ? '3px solid #4a9eff' : '3px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.1s',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <span style={{ fontSize: '12px' }}>📄</span>
                                    {isEditingThisSchematic ? (
                                      <form
                                        onSubmit={(e) => handleRenameSchematicSubmit(schematic.id, e)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                                      >
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingSchematicName}
                                          onChange={(e) => setEditingSchematicName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') setEditingSchematicId(null);
                                          }}
                                          style={{ ...inputStyle, width: '100px' }}
                                        />
                                        <button type="submit" style={confirmButtonStyle}>✓</button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingSchematicId(null)}
                                          style={cancelButtonStyle}
                                        >
                                          ✕
                                        </button>
                                      </form>
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: '11.5px',
                                          color: isActive ? '#ffffff' : '#b8bcc6',
                                          fontWeight: isActive ? 600 : 400,
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}
                                        title={schematic.name}
                                      >
                                        {schematic.name}
                                        {isActive && isDirty ? '*' : ''}
                                      </span>
                                    )}
                                  </div>

                                  {/* Schematic Actions */}
                                  {!isEditingThisSchematic && (
                                    <div
                                      className="schematic-actions"
                                      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        title="Rename Schematic"
                                        onClick={() => {
                                          setEditingSchematicId(schematic.id);
                                          setEditingSchematicName(schematic.name);
                                        }}
                                        style={actionButtonStyle}
                                      >
                                        ✏
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete Schematic"
                                        onClick={async () => {
                                          if (
                                            confirm(
                                              `Delete schematic "${schematic.name}"? This cannot be undone.`,
                                            )
                                          ) {
                                            try {
                                              await onDeleteSchematic(schematic.id);
                                            } catch (err) {
                                              setErrorMessage(err instanceof Error ? err.message : String(err));
                                            }
                                          }
                                        }}
                                        style={{ ...actionButtonStyle, color: '#ef4444' }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: '2px',
  color: '#8b929e',
  cursor: 'pointer',
  fontSize: '11px',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0c0d10',
  border: '1px solid #3d4452',
  borderRadius: '2px',
  color: '#ffffff',
  fontSize: '11px',
  padding: '2px 6px',
  outline: 'none',
  width: '120px',
};

const confirmButtonStyle: React.CSSProperties = {
  backgroundColor: '#2e7d32',
  border: 'none',
  borderRadius: '2px',
  color: '#ffffff',
  fontSize: '10px',
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

const cancelButtonStyle: React.CSSProperties = {
  backgroundColor: '#3a3e47',
  border: 'none',
  borderRadius: '2px',
  color: '#ffffff',
  fontSize: '10px',
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};
