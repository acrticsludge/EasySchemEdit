// apps/web/src/islands/EditorIsland.tsx
// Integrated EasySchemEdit v1 workspace component connecting all editor modules and runtime.

'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import '../editor/design-tokens.css';
import {
  placementWorldBounds,
  worldBlockToLocal,
  type Bounds3i,
  type Project,
  type Vec3Half,
  type Vec3i,
} from '@easyschemedit/domain';
import { createCuboidSelection } from '@easyschemedit/operations';
import { packVxprojArchive, unpackVxprojArchive } from '@easyschemedit/persistence';
import {
  createEditorRuntime,
  WorkspaceShell,
  ViewportCanvas,
  AssetLoadPanel,
  ImportDialog,
  ExportDialog,
  BakeDialog,
  ProjectDialog,
  MaterialListPanel,
  ConflictsPanel,
  useImportWorkflow,
  ProjectExplorer,
  type GhostPreviewSpec,
  type VoxelHit,
} from '../editor/index.ts';
import { useEditorSession } from '../editor/session-store.ts';
import { getMe, logout, type AuthUser } from '../client/auth-client.ts';
import {
  type WorkspaceProjectNode,
  type CloudSchematicSummary,
  listWorkspaceTree,
  createCloudProject,
  renameCloudProject,
  deleteCloudProject,
  createSchematic,
  renameSchematic,
  deleteSchematic,
} from '../client/projects-client.ts';
import { LoginModal } from '../components/LoginModal.tsx';
import { FirstProjectModal } from '../components/FirstProjectModal.tsx';

const DEFAULT_GUEST_PROJECT_ID = 'guest-project-draft';
const DEFAULT_GUEST_SCHEMATIC_ID = 'guest-schem-untitled';

function createDefaultGuestProjects(): WorkspaceProjectNode[] {
  return [
    {
      id: DEFAULT_GUEST_PROJECT_ID,
      name: 'Draft Project',
      revision: 1,
      placementCount: 0,
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schematics: [
        {
          id: DEFAULT_GUEST_SCHEMATIC_ID,
          projectId: DEFAULT_GUEST_PROJECT_ID,
          name: 'untitled.schem',
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ];
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createEmptyProjectDocument(name: string): Project {
  return {
    schemaVersion: 1,
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    placements: [],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: {
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    revision: 0,
  };
}

export default function EditorIsland() {
  const runtime = useMemo(() => createEditorRuntime(), []);

  const sessionState = useEditorSession(runtime.store);
  const [assetSnap, setAssetSnap] = useState(() => runtime.assetManager.getStateSnapshot());
  const importState = useImportWorkflow(runtime.importWorkflow);

  useEffect(() => {
    return runtime.assetManager.subscribe(() => {
      setAssetSnap(runtime.assetManager.getStateSnapshot());
    });
  }, [runtime]);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isBakeOpen, setIsBakeOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<'save' | 'projects' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [dirtyVersion, setDirtyVersion] = useState(0);

  // Re-evaluated on sessionState.revision / dirtyVersion
  const isDirty = dirtyVersion >= 0 && runtime.persistence.isDirty();

  const [workspaceProjects, setWorkspaceProjects] = useState<WorkspaceProjectNode[]>(() =>
    createDefaultGuestProjects(),
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(DEFAULT_GUEST_PROJECT_ID);
  const [activeSchematicId, setActiveSchematicId] = useState<string | null>(DEFAULT_GUEST_SCHEMATIC_ID);
  const guestBuffersRef = useRef<Map<string, Uint8Array>>(new Map());
  const isSwitchingSchematicRef = useRef(false);
  const [isFirstProjectOpen, setIsFirstProjectOpen] = useState(false);

  // Check current session on mount (non-blocking)
  useEffect(() => {
    let active = true;
    getMe()
      .then(async (user) => {
        if (!active) return;
        setAuthUser(user);
        if (user) {
          try {
            const tree = await listWorkspaceTree();
            if (!active) return;
            setWorkspaceProjects(tree);
            if (tree.length === 0) {
              setIsFirstProjectOpen(true);
            } else {
              let targetProjId: string | null = null;
              let targetSchemId: string | null = null;
              try {
                const raw = localStorage.getItem('ese_last_active:' + user.id);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (
                    parsed &&
                    typeof parsed.projectId === 'string' &&
                    typeof parsed.schematicId === 'string'
                  ) {
                    const foundProj = tree.find((p) => p.id === parsed.projectId);
                    if (foundProj && foundProj.schematics.some((s) => s.id === parsed.schematicId)) {
                      targetProjId = parsed.projectId;
                      targetSchemId = parsed.schematicId;
                    }
                  }
                }
              } catch {
                // Ignore storage parsing error
              }

              const projToOpen = (targetProjId && tree.find((p) => p.id === targetProjId)) || tree[0];
              const schemToOpen =
                (targetSchemId && projToOpen.schematics.find((s) => s.id === targetSchemId)) ||
                projToOpen.schematics[0];

              setActiveProjectId(projToOpen.id);
              runtime.persistence.setActiveCloudProjectId(projToOpen.id);
              if (schemToOpen) {
                await runtime.persistence.openSchematicFromCloud(schemToOpen.id);
                if (active) {
                  setActiveSchematicId(schemToOpen.id);
                  runtime.persistence.setActiveCloudSchematicId(schemToOpen.id);
                }
              }
            }
          } catch (err) {
            console.warn('Failed to load cloud workspace tree:', err);
          }
        } else {
          // Restore guest workspace from localStorage if saved
          let restoredGuest = false;
          try {
            const raw = localStorage.getItem('ese_guest_workspace');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
                setWorkspaceProjects(parsed.projects);
                const gProjId = parsed.activeProjectId || parsed.projects[0].id;
                const gSchemId = parsed.activeSchematicId || parsed.projects[0].schematics[0]?.id;
                setActiveProjectId(gProjId);
                setActiveSchematicId(gSchemId ?? null);

                if (parsed.buffersBase64 && typeof parsed.buffersBase64 === 'object') {
                  for (const [id, b64] of Object.entries(parsed.buffersBase64)) {
                    if (typeof b64 === 'string') {
                      try {
                        guestBuffersRef.current.set(id, base64ToUint8Array(b64));
                      } catch {
                        // ignore corrupt buffer
                      }
                    }
                  }
                }

                if (gSchemId && guestBuffersRef.current.has(gSchemId)) {
                  const buf = guestBuffersRef.current.get(gSchemId)!;
                  try {
                    const proj = unpackVxprojArchive(buf);
                    await runtime.persistence.replaceProjectInSession(proj);
                    runtime.persistence.markClean();
                    restoredGuest = true;
                  } catch {
                    // ignore unpack error
                  }
                }
              }
            }
          } catch {
            // fallback
          }

          if (!restoredGuest && active) {
            setWorkspaceProjects(createDefaultGuestProjects());
            setActiveProjectId(DEFAULT_GUEST_PROJECT_ID);
            setActiveSchematicId(DEFAULT_GUEST_SCHEMATIC_ID);
          }
        }
      })
      .catch(() => {
        if (active) {
          setAuthUser(null);
          let restoredGuest = false;
          try {
            const raw = localStorage.getItem('ese_guest_workspace');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
                setWorkspaceProjects(parsed.projects);
                const gProjId = parsed.activeProjectId || parsed.projects[0].id;
                const gSchemId = parsed.activeSchematicId || parsed.projects[0].schematics[0]?.id;
                setActiveProjectId(gProjId);
                setActiveSchematicId(gSchemId ?? null);

                if (parsed.buffersBase64 && typeof parsed.buffersBase64 === 'object') {
                  for (const [id, b64] of Object.entries(parsed.buffersBase64)) {
                    if (typeof b64 === 'string') {
                      try {
                        guestBuffersRef.current.set(id, base64ToUint8Array(b64));
                      } catch {
                        // ignore
                      }
                    }
                  }
                }

                if (gSchemId && guestBuffersRef.current.has(gSchemId)) {
                  const buf = guestBuffersRef.current.get(gSchemId)!;
                  try {
                    const proj = unpackVxprojArchive(buf);
                    void runtime.persistence.replaceProjectInSession(proj).then(() => {
                      runtime.persistence.markClean();
                    });
                    restoredGuest = true;
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch {
            // fallback
          }

          if (!restoredGuest) {
            setWorkspaceProjects(createDefaultGuestProjects());
            setActiveProjectId(DEFAULT_GUEST_PROJECT_ID);
            setActiveSchematicId(DEFAULT_GUEST_SCHEMATIC_ID);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  const performCloudSave = useCallback(
    async (userToUse?: AuthUser | null, options?: { silent?: boolean }) => {
      const user = userToUse !== undefined ? userToUse : authUser;
      if (!user) {
        if (!options?.silent) {
          setPendingAuthAction('save');
          setIsLoginModalOpen(true);
        }
        return;
      }

      setIsSaving(true);
      try {
        if (
          activeSchematicId &&
          !activeSchematicId.startsWith('guest-') &&
          !activeSchematicId.startsWith('temp-')
        ) {
          const summary = await runtime.persistence.saveSchematicToCloud(activeSchematicId);
          setDirtyVersion((v) => v + 1);
          console.info(`Saved schematic "${summary.name}" to cloud.`);
          setWorkspaceProjects((prev) =>
            prev.map((p) => {
              const hasSchem = p.schematics.some((s) => s.id === summary.id);
              if (!hasSchem) return p;
              return {
                ...p,
                updatedAt: new Date().toISOString(),
                schematics: p.schematics.map((s) => (s.id === summary.id ? summary : s)),
              };
            }),
          );
        } else {
          const summary = await runtime.persistence.saveToCloud();
          setDirtyVersion((v) => v + 1);
          console.info(`Saved project "${summary.name}" to cloud.`);
          const tree = await listWorkspaceTree();
          setWorkspaceProjects(tree);
        }
      } catch (err) {
        if (options?.silent) {
          console.warn('Background autosave failed:', err);
        } else {
          console.error('Failed to save to cloud:', err);
          if (err instanceof Error && err.message.toLowerCase().includes('unauthorized')) {
            setAuthUser(null);
            setPendingAuthAction('save');
            setIsLoginModalOpen(true);
          } else {
            alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } finally {
        setIsSaving(false);
      }
    },
    [authUser, activeSchematicId, runtime],
  );

  // Track last active project & schematic for authenticated user
  useEffect(() => {
    if (authUser && activeProjectId && activeSchematicId) {
      try {
        localStorage.setItem(
          'ese_last_active:' + authUser.id,
          JSON.stringify({ projectId: activeProjectId, schematicId: activeSchematicId }),
        );
      } catch {
        // Ignore storage error
      }
    }
  }, [authUser, activeProjectId, activeSchematicId]);

  // Cloud autosave (debounced 2.5s)
  useEffect(() => {
    if (
      authUser &&
      activeSchematicId &&
      !activeSchematicId.startsWith('guest-') &&
      !activeSchematicId.startsWith('temp-') &&
      isDirty &&
      !isSaving &&
      !isSwitchingSchematicRef.current
    ) {
      const timer = window.setTimeout(() => {
        if (!isSwitchingSchematicRef.current) {
          void performCloudSave(authUser, { silent: true });
        }
      }, 2500);
      return () => window.clearTimeout(timer);
    }
  }, [authUser, activeSchematicId, isDirty, isSaving, sessionState.revision, performCloudSave]);

  // Guest snapshot & workspace autosave (debounced 1s)
  useEffect(() => {
    if (authUser) return;
    const timer = window.setTimeout(() => {
      try {
        if (activeSchematicId) {
          const currentProj = runtime.persistence.getCurrentProject();
          if (currentProj) {
            guestBuffersRef.current.set(activeSchematicId, packVxprojArchive(currentProj));
          }
        }
        const buffersBase64: Record<string, string> = {};
        for (const [id, buf] of guestBuffersRef.current.entries()) {
          if (buf instanceof Uint8Array) {
            buffersBase64[id] = uint8ArrayToBase64(buf);
          }
        }
        localStorage.setItem(
          'ese_guest_workspace',
          JSON.stringify({
            projects: workspaceProjects,
            activeProjectId,
            activeSchematicId,
            buffersBase64,
          }),
        );
      } catch (err) {
        console.warn('Failed to persist guest workspace to localStorage:', err);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [authUser, workspaceProjects, activeProjectId, activeSchematicId, isDirty, sessionState.revision, runtime]);

  const handleSave = useCallback(() => {
    if (!authUser) {
      setPendingAuthAction('save');
      setIsLoginModalOpen(true);
    } else {
      void performCloudSave(authUser);
    }
  }, [authUser, performCloudSave]);

  const handleOpenProjects = useCallback(() => {
    if (!authUser) {
      setPendingAuthAction('projects');
      setIsLoginModalOpen(true);
    } else {
      setIsProjectsOpen(true);
    }
  }, [authUser]);

  const handleAuthSuccess = useCallback(
    async (user: AuthUser) => {
      setAuthUser(user);
      setIsLoginModalOpen(false);
      const action = pendingAuthAction;
      setPendingAuthAction(null);

      try {
        const currentPlacements = runtime.store.getSnapshot().project.placements;
        const isCurrentDirty = runtime.persistence.isDirty();
        const hasBuffers = guestBuffersRef.current.size > 0;
        const isNotDefaultSingleGuest =
          workspaceProjects.length > 1 ||
          (workspaceProjects.length === 1 &&
            (workspaceProjects[0].name !== 'Draft Project' ||
              workspaceProjects[0].schematics.length > 1 ||
              (workspaceProjects[0].schematics.length === 1 &&
                workspaceProjects[0].schematics[0].name !== 'untitled.schem')));

        const hasGuestWork =
          currentPlacements.length > 0 || isCurrentDirty || hasBuffers || isNotDefaultSingleGuest;

        if (hasGuestWork) {
          console.info('Migrating guest work to user cloud storage...');
          let newActiveProjectId: string | null = null;
          let newActiveSchematicId: string | null = null;

          for (const gp of workspaceProjects) {
            const cloudProj = await createCloudProject(gp.name);
            if (!newActiveProjectId && gp.id === activeProjectId) {
              newActiveProjectId = cloudProj.id;
            }

            for (const gs of gp.schematics) {
              let projBytes: Uint8Array;
              let pCount = 0;

              if (gs.id === activeSchematicId) {
                projBytes = runtime.persistence.packCurrentProjectBytes();
                pCount = currentPlacements.length;
              } else if (guestBuffersRef.current.has(gs.id)) {
                const stored = guestBuffersRef.current.get(gs.id)!;
                if (stored instanceof Uint8Array) {
                  projBytes = stored;
                  try {
                    const unpacked = unpackVxprojArchive(stored);
                    pCount = unpacked.placements.length;
                  } catch {
                    pCount = 0;
                  }
                } else {
                  projBytes = packVxprojArchive(stored as unknown as Project);
                  pCount = (stored as unknown as Project).placements?.length ?? 0;
                }
              } else {
                const empty = createEmptyProjectDocument(gs.name);
                projBytes = packVxprojArchive(empty);
                pCount = 0;
              }

              const cloudSchem = await createSchematic(cloudProj.id, gs.name, projBytes, {
                revision: 1,
                placementCount: pCount,
              });

              if (gs.id === activeSchematicId) {
                newActiveProjectId = cloudProj.id;
                newActiveSchematicId = cloudSchem.id;
              }
            }
          }

          guestBuffersRef.current.clear();
          try {
            localStorage.removeItem('ese_guest_workspace');
          } catch {}
          const tree = await listWorkspaceTree();
          setWorkspaceProjects(tree);

          if (newActiveProjectId && newActiveSchematicId) {
            setActiveProjectId(newActiveProjectId);
            setActiveSchematicId(newActiveSchematicId);
            runtime.persistence.setActiveCloudProjectId(newActiveProjectId);
            runtime.persistence.setActiveCloudSchematicId(newActiveSchematicId);
            runtime.persistence.markClean();
          }
        } else {
          // Untouched empty guest draft
          const tree = await listWorkspaceTree();
          setWorkspaceProjects(tree);

          if (tree.length === 0) {
            setIsFirstProjectOpen(true);
          } else {
            const firstProj = tree[0];
            setActiveProjectId(firstProj.id);
            runtime.persistence.setActiveCloudProjectId(firstProj.id);
            if (firstProj.schematics.length > 0) {
              const firstSchem = firstProj.schematics[0];
              await runtime.persistence.openSchematicFromCloud(firstSchem.id);
              setActiveSchematicId(firstSchem.id);
              runtime.persistence.setActiveCloudSchematicId(firstSchem.id);
            }
          }
        }

        if (action === 'save') {
          void performCloudSave(user);
        } else if (action === 'projects') {
          setIsProjectsOpen(true);
        }
      } catch (err) {
        console.error('Error during post-auth migration/load:', err);
      }
    },
    [pendingAuthAction, workspaceProjects, activeProjectId, activeSchematicId, performCloudSave, runtime],
  );

  const handleSignOut = useCallback(async () => {
    await logout();
    setAuthUser(null);
    guestBuffersRef.current.clear();
    try {
      localStorage.removeItem('ese_guest_workspace');
    } catch {}
    setWorkspaceProjects(createDefaultGuestProjects());
    setActiveProjectId(DEFAULT_GUEST_PROJECT_ID);
    setActiveSchematicId(DEFAULT_GUEST_SCHEMATIC_ID);
    setRegionPos1(null);
    setRegionPos2(null);
    setRegionPickMode(null);
    setRegionBounds(null);
    const emptyProj = createEmptyProjectDocument('untitled.schem');
    await runtime.persistence.replaceProjectInSession(emptyProj);
  }, [runtime]);

  // Explorer Handlers
  const handleSelectSchematic = useCallback(
    async (projectId: string, schematicId: string) => {
      if (schematicId === activeSchematicId) return;
      if (isSwitchingSchematicRef.current) return;
      isSwitchingSchematicRef.current = true;

      try {
        if (!authUser) {
          if (activeSchematicId) {
            guestBuffersRef.current.set(
              activeSchematicId,
              packVxprojArchive(runtime.persistence.getCurrentProject()),
            );
          }
          let nextBytes = guestBuffersRef.current.get(schematicId);
          let nextProj: Project;
          if (nextBytes) {
            try {
              nextProj = unpackVxprojArchive(nextBytes);
            } catch (err) {
              console.error('Failed to unpack guest schematic:', err);
              const foundNode = workspaceProjects
                .flatMap((p) => p.schematics)
                .find((s) => s.id === schematicId);
              nextProj = createEmptyProjectDocument(foundNode?.name || 'untitled.schem');
            }
          } else {
            const foundNode = workspaceProjects
              .flatMap((p) => p.schematics)
              .find((s) => s.id === schematicId);
            nextProj = createEmptyProjectDocument(foundNode?.name || 'untitled.schem');
            guestBuffersRef.current.set(schematicId, packVxprojArchive(nextProj));
          }
          await runtime.persistence.replaceProjectInSession(nextProj);
          setActiveProjectId(projectId);
          setActiveSchematicId(schematicId);
          setSelectedPlacementId(null);
          setSelectedVoxel(null);
          setRegionPos1(null);
          setRegionPos2(null);
          setRegionPickMode(null);
          setRegionBounds(null);
        } else {
          if (runtime.persistence.isDirty() && activeSchematicId) {
            const shouldSave = confirm('You have unsaved changes. Save before switching?');
            if (shouldSave) {
              await runtime.persistence.saveSchematicToCloud(activeSchematicId);
            }
          }
          await runtime.persistence.openSchematicFromCloud(schematicId);
          setActiveProjectId(projectId);
          setActiveSchematicId(schematicId);
          runtime.persistence.setActiveCloudProjectId(projectId);
          runtime.persistence.setActiveCloudSchematicId(schematicId);
          setSelectedPlacementId(null);
          setSelectedVoxel(null);
          setRegionPos1(null);
          setRegionPos2(null);
          setRegionPickMode(null);
          setRegionBounds(null);
        }
      } finally {
        isSwitchingSchematicRef.current = false;
      }
    },
    [authUser, activeSchematicId, workspaceProjects, runtime],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      if (!authUser) {
        const newId = `guest-proj-${Date.now()}`;
        const newProj: WorkspaceProjectNode = {
          id: newId,
          name,
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schematics: [],
        };
        setWorkspaceProjects((prev) => [...prev, newProj]);
        setActiveProjectId(newId);
      } else {
        const tempId = `temp-proj-${Date.now()}`;
        const optimisticProj: WorkspaceProjectNode = {
          id: tempId,
          name,
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          schematics: [],
        };
        const prevProjects = workspaceProjects;
        const prevActiveId = activeProjectId;
        setWorkspaceProjects((prev) => [...prev, optimisticProj]);
        setActiveProjectId(tempId);
        runtime.persistence.setActiveCloudProjectId(tempId);

        try {
          const newProj = await createCloudProject(name);
          setWorkspaceProjects((prev) =>
            prev.map((p) =>
              p.id === tempId ? { ...p, id: newProj.id, revision: newProj.revision } : p,
            ),
          );
          setActiveProjectId((prev) => (prev === tempId ? newProj.id : prev));
          runtime.persistence.setActiveCloudProjectId(newProj.id);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          setActiveProjectId(prevActiveId);
          runtime.persistence.setActiveCloudProjectId(prevActiveId);
          throw err;
        }
      }
    },
    [authUser, workspaceProjects, activeProjectId, runtime],
  );

  const handleRenameProject = useCallback(
    async (projectId: string, name: string) => {
      if (!authUser) {
        setWorkspaceProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, name, updatedAt: new Date().toISOString() } : p,
          ),
        );
      } else {
        const prevProjects = workspaceProjects;
        setWorkspaceProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, name, updatedAt: new Date().toISOString() } : p,
          ),
        );
        try {
          await renameCloudProject(projectId, name);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          throw err;
        }
      }
    },
    [authUser, workspaceProjects],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      if (!authUser) {
        const remainingProjects = workspaceProjects.filter((p) => p.id !== projectId);
        setWorkspaceProjects(remainingProjects);
        if (activeProjectId === projectId) {
          const remainingSchematics = remainingProjects.flatMap((p) => p.schematics);
          if (remainingSchematics.length > 0) {
            const nextSchem = remainingSchematics[0];
            void handleSelectSchematic(nextSchem.projectId, nextSchem.id);
          } else {
            setActiveProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
            setActiveSchematicId(null);
            const emptyProj = createEmptyProjectDocument('untitled.schem');
            await runtime.persistence.replaceProjectInSession(emptyProj);
          }
        }
      } else {
        const prevProjects = workspaceProjects;
        const prevActiveProj = activeProjectId;
        const prevActiveSchem = activeSchematicId;
        const remainingProjects = workspaceProjects.filter((p) => p.id !== projectId);
        setWorkspaceProjects(remainingProjects);

        if (activeProjectId === projectId) {
          const remainingSchematics = remainingProjects.flatMap((p) => p.schematics);
          if (remainingSchematics.length > 0) {
            const nextSchem = remainingSchematics[0];
            await runtime.persistence.openSchematicFromCloud(nextSchem.id);
            setActiveProjectId(nextSchem.projectId);
            setActiveSchematicId(nextSchem.id);
            runtime.persistence.setActiveCloudProjectId(nextSchem.projectId);
            runtime.persistence.setActiveCloudSchematicId(nextSchem.id);
          } else {
            setActiveProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
            setActiveSchematicId(null);
            runtime.persistence.setActiveCloudProjectId(
              remainingProjects.length > 0 ? remainingProjects[0].id : null,
            );
            runtime.persistence.setActiveCloudSchematicId(null);
            const emptyProj = createEmptyProjectDocument('untitled.schem');
            await runtime.persistence.replaceProjectInSession(emptyProj);
            if (remainingProjects.length === 0) {
              setIsFirstProjectOpen(true);
            }
          }
        }

        try {
          await deleteCloudProject(projectId);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          setActiveProjectId(prevActiveProj);
          setActiveSchematicId(prevActiveSchem);
          runtime.persistence.setActiveCloudProjectId(prevActiveProj);
          runtime.persistence.setActiveCloudSchematicId(prevActiveSchem);
          throw err;
        }
      }
    },
    [authUser, workspaceProjects, activeProjectId, activeSchematicId, handleSelectSchematic, runtime],
  );

  const handleCreateSchematic = useCallback(
    async (projectId: string, name: string) => {
      if (!authUser) {
        if (activeSchematicId) {
          guestBuffersRef.current.set(
            activeSchematicId,
            packVxprojArchive(runtime.persistence.getCurrentProject()),
          );
        }
        const newId = `guest-schem-${Date.now()}`;
        const newSchemNode: CloudSchematicSummary = {
          id: newId,
          projectId,
          name,
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setWorkspaceProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, schematics: [...p.schematics, newSchemNode] } : p,
          ),
        );
        const emptyProject = createEmptyProjectDocument(name);
        guestBuffersRef.current.set(newId, packVxprojArchive(emptyProject));
        await runtime.persistence.replaceProjectInSession(emptyProject);
        setActiveProjectId(projectId);
        setActiveSchematicId(newId);
      } else {
        if (runtime.persistence.isDirty() && activeSchematicId) {
          const shouldSave = confirm(
            'You have unsaved changes. Save current schematic before creating a new one?',
          );
          if (shouldSave) {
            await runtime.persistence.saveSchematicToCloud(activeSchematicId);
          }
        }
        const tempId = `temp-schem-${Date.now()}`;
        const tempSchem: CloudSchematicSummary = {
          id: tempId,
          projectId,
          name,
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const prevProjects = workspaceProjects;
        const prevActiveSchemId = activeSchematicId;
        const prevActiveProjId = activeProjectId;

        setWorkspaceProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, schematics: [...p.schematics, tempSchem] } : p,
          ),
        );
        const emptyProject = createEmptyProjectDocument(name);
        await runtime.persistence.replaceProjectInSession(emptyProject);
        setActiveProjectId(projectId);
        setActiveSchematicId(tempId);
        runtime.persistence.setActiveCloudProjectId(projectId);
        runtime.persistence.setActiveCloudSchematicId(tempId);

        try {
          const archiveBytes = packVxprojArchive(emptyProject);
          const newSchem = await createSchematic(projectId, name, archiveBytes, {
            revision: 1,
            placementCount: 0,
          });
          setWorkspaceProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    schematics: p.schematics.map((s) => (s.id === tempId ? newSchem : s)),
                  }
                : p,
            ),
          );
          setActiveSchematicId((prev) => (prev === tempId ? newSchem.id : prev));
          runtime.persistence.setActiveCloudSchematicId(newSchem.id);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          setActiveProjectId(prevActiveProjId);
          setActiveSchematicId(prevActiveSchemId);
          runtime.persistence.setActiveCloudProjectId(prevActiveProjId);
          runtime.persistence.setActiveCloudSchematicId(prevActiveSchemId);
          throw err;
        }
      }
    },
    [authUser, activeSchematicId, workspaceProjects, activeProjectId, runtime],
  );

  const handleRenameSchematic = useCallback(
    async (schematicId: string, name: string) => {
      if (!authUser) {
        setWorkspaceProjects((prev) =>
          prev.map((p) => ({
            ...p,
            schematics: p.schematics.map((s) => (s.id === schematicId ? { ...s, name } : s)),
          })),
        );
        if (activeSchematicId === schematicId) {
          const currentProj = runtime.store.getSnapshot().project;
          currentProj.name = name;
          (runtime.store as any).updateSnapshotAndNotify?.();
        }
      } else {
        const prevProjects = workspaceProjects;
        const prevProjName = runtime.store.getSnapshot().project.name;
        setWorkspaceProjects((prev) =>
          prev.map((p) => ({
            ...p,
            schematics: p.schematics.map((s) => (s.id === schematicId ? { ...s, name } : s)),
          })),
        );
        if (activeSchematicId === schematicId) {
          const currentProj = runtime.store.getSnapshot().project;
          currentProj.name = name;
          (runtime.store as any).updateSnapshotAndNotify?.();
        }
        try {
          await renameSchematic(schematicId, name);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          if (activeSchematicId === schematicId) {
            const currentProj = runtime.store.getSnapshot().project;
            currentProj.name = prevProjName;
            (runtime.store as any).updateSnapshotAndNotify?.();
          }
          throw err;
        }
      }
    },
    [authUser, activeSchematicId, workspaceProjects, runtime],
  );

  const handleDeleteSchematic = useCallback(
    async (schematicId: string) => {
      if (!authUser) {
        guestBuffersRef.current.delete(schematicId);
        const updatedProjects = workspaceProjects.map((p) => ({
          ...p,
          schematics: p.schematics.filter((s) => s.id !== schematicId),
        }));
        setWorkspaceProjects(updatedProjects);
        if (activeSchematicId === schematicId) {
          const remaining = updatedProjects
            .flatMap((p) => p.schematics)
            .filter((s) => s.id !== schematicId);
          if (remaining.length > 0) {
            void handleSelectSchematic(remaining[0].projectId, remaining[0].id);
          } else {
            const empty = createEmptyProjectDocument('untitled.schem');
            await runtime.persistence.replaceProjectInSession(empty);
            setActiveSchematicId(null);
          }
        }
      } else {
        const prevProjects = workspaceProjects;
        const prevActiveSchem = activeSchematicId;
        const prevActiveProj = activeProjectId;
        const updatedProjects = workspaceProjects.map((p) => ({
          ...p,
          schematics: p.schematics.filter((s) => s.id !== schematicId),
        }));
        setWorkspaceProjects(updatedProjects);

        if (activeSchematicId === schematicId) {
          const remaining = updatedProjects.flatMap((p) => p.schematics);
          if (remaining.length > 0) {
            const next = remaining[0];
            await runtime.persistence.openSchematicFromCloud(next.id);
            setActiveProjectId(next.projectId);
            setActiveSchematicId(next.id);
            runtime.persistence.setActiveCloudProjectId(next.projectId);
            runtime.persistence.setActiveCloudSchematicId(next.id);
          } else {
            setActiveSchematicId(null);
            runtime.persistence.setActiveCloudSchematicId(null);
            const empty = createEmptyProjectDocument('untitled.schem');
            await runtime.persistence.replaceProjectInSession(empty);
            if (updatedProjects.length === 0) {
              setIsFirstProjectOpen(true);
            }
          }
        }

        try {
          await deleteSchematic(schematicId);
        } catch (err) {
          setWorkspaceProjects(prevProjects);
          setActiveProjectId(prevActiveProj);
          setActiveSchematicId(prevActiveSchem);
          runtime.persistence.setActiveCloudProjectId(prevActiveProj);
          runtime.persistence.setActiveCloudSchematicId(prevActiveSchem);
          throw err;
        }
      }
    },
    [authUser, activeSchematicId, workspaceProjects, activeProjectId, handleSelectSchematic, runtime],
  );

  // Shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSave]);

  const [hoveredBlockName, setHoveredBlockName] = useState<string | null>(null);
  const [cursorCoordinates, setCursorCoordinates] = useState<{ x: number; y: number; z: number } | null>(null);
  const [selectedVoxel, setSelectedVoxel] = useState<VoxelHit | null>(null);
  const [regionPos1, setRegionPos1] = useState<Vec3i | null>(null);
  const [regionPos2, setRegionPos2] = useState<Vec3i | null>(null);
  const [regionPickMode, setRegionPickMode] = useState<'pos1' | 'pos2' | null>(null);
  const [regionBounds, setRegionBounds] = useState<Bounds3i | null>(null);
  const [atlasTexture, setAtlasTexture] = useState<THREE.Texture | null>(null);
  const [nudgeStep, setNudgeStep] = useState<1 | 16>(1);

  // Crash recovery check on mount
  useEffect(() => {
    const currentProjectId = runtime.store.getSnapshot().project.id;
    runtime.persistence.checkCrashRecovery(currentProjectId).then((recovered) => {
      if (recovered) {
        console.info('Restored project from crash recovery snapshot.');
      }
    }).catch((err) => {
      console.warn('Crash recovery check failed:', err);
    });

    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  // Build GPU texture atlas when assets are ready
  useEffect(() => {
    if (
      assetSnap.state !== 'ready' ||
      typeof document === 'undefined' ||
      typeof createImageBitmap === 'undefined'
    ) {
      setAtlasTexture(null);
      return;
    }

    const bundle = runtime.assetManager.getBundle();
    const atlas = runtime.assetManager.getAtlas();
    const page = atlas?.pages?.[0];
    if (!bundle || !atlas || !page) return;

    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    (async () => {
      for (const [path, rect] of atlas.rects.entries()) {
        if (cancelled || rect.page !== 0) continue;
        const pngBytes = bundle.getFile(path);
        if (!pngBytes) continue;
        try {
          const blob = new Blob([pngBytes as unknown as BlobPart], { type: 'image/png' });
          const bmp = await createImageBitmap(blob);
          ctx.drawImage(bmp, 0, 0, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);

          // Extrude 8px border into atlas padding gutter to prevent edge bleeding
          ctx.drawImage(bmp, 0, 0, 1, rect.h, rect.x - 8, rect.y, 8, rect.h);
          ctx.drawImage(bmp, rect.w - 1, 0, 1, rect.h, rect.x + rect.w, rect.y, 8, rect.h);
          ctx.drawImage(bmp, 0, 0, rect.w, 1, rect.x, rect.y - 8, rect.w, 8);
          ctx.drawImage(bmp, 0, rect.h - 1, rect.w, 1, rect.x, rect.y + rect.h, rect.w, 8);
          ctx.drawImage(bmp, 0, 0, 1, 1, rect.x - 8, rect.y - 8, 8, 8);
          ctx.drawImage(bmp, rect.w - 1, 0, 1, 1, rect.x + rect.w, rect.y - 8, 8, 8);
          ctx.drawImage(bmp, 0, rect.h - 1, 1, 1, rect.x - 8, rect.y + rect.h, 8, 8);
          ctx.drawImage(bmp, rect.w - 1, rect.h - 1, 1, 1, rect.x + rect.w, rect.y + rect.h, 8, 8);

          bmp.close();
        } catch {
          // Ignore individual unreadable texture
        }
      }
      if (cancelled) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      setAtlasTexture(texture);
    })();

    return () => {
      cancelled = true;
    };
  }, [assetSnap.state, assetSnap.textureCount, assetSnap.atlasRevision, runtime]);

  const assetSource = useMemo(
    () => runtime.assetManager.getAssetSource(),
    [assetSnap.state, assetSnap.textureCount, assetSnap.atlasRevision, runtime]
  );
  const uvLookup = useMemo(
    () => runtime.assetManager.getUvLookup(),
    [assetSnap.state, assetSnap.textureCount, assetSnap.atlasRevision, runtime]
  );

  const ghostPreview: GhostPreviewSpec | null = useMemo(() => {
    if (importState.state !== 'ghost-preview' || !importState.pendingImport) return null;
    const dims = importState.pendingImport.report?.dimensions ?? { width: 1, height: 1, length: 1 };
    return {
      bounds: {
        min: [0, 0, 0],
        maxExclusive: [
          Math.max(1, dims.width),
          Math.max(1, dims.height),
          Math.max(1, dims.length),
        ],
      },
      position: importState.cursorPosition,
      rotationY: importState.ghostRotationY,
      mirror: importState.ghostMirror,
    };
  }, [importState]);

  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(
    () => runtime.workspace.inspector.context().selectedPlacementId
  );

  const handleSelectPlacement = useCallback(
    (id: string | null) => {
      runtime.workspace.selectPlacement(id);
      setSelectedPlacementId(id);
    },
    [runtime]
  );

  const prevPlacementIdsRef = useRef<Set<string>>(
    new Set(sessionState.project.placements.map((p) => p.id))
  );

  useEffect(() => {
    const placements = sessionState.project.placements;
    const currentIds = new Set(placements.map((p) => p.id));
    const prevIds = prevPlacementIdsRef.current;

    let newlyAddedId: string | null = null;
    for (const p of placements) {
      if (!prevIds.has(p.id)) {
        newlyAddedId = p.id;
      }
    }

    prevPlacementIdsRef.current = currentIds;

    if (newlyAddedId) {
      runtime.workspace.selectPlacement(newlyAddedId);
      setSelectedPlacementId(newlyAddedId);
    } else if (selectedPlacementId && !currentIds.has(selectedPlacementId)) {
      const nextId = placements.length > 0 ? placements[placements.length - 1]!.id : null;
      runtime.workspace.selectPlacement(nextId);
      setSelectedPlacementId(nextId);
    }
  }, [sessionState.project.placements, selectedPlacementId, runtime]);

  const [activeOverlays, setActiveOverlays] = useState({
    chunk: false,
    section: false,
    block: false,
    conflicts: true,
  });

  const handleToggleOverlay = useCallback(
    (overlay: 'chunk' | 'section' | 'block' | 'conflicts') => {
      setActiveOverlays((prev) => {
        const next = { ...prev, [overlay]: !prev[overlay] };
        if (overlay === 'conflicts') {
          runtime.conflictsController.setOverlayEnabled(next.conflicts);
        }
        return next;
      });
    },
    [runtime]
  );

  const [conflictOverlayPositions, setConflictOverlayPositions] = useState(() =>
    runtime.conflictsController.getOverlayPositions()
  );

  useEffect(() => {
    return runtime.conflictsController.subscribe(() => {
      setConflictOverlayPositions(runtime.conflictsController.getOverlayPositions());
    });
  }, [runtime]);

  const selectedPlacementIds = useMemo(
    () => (selectedPlacementId ? new Set([selectedPlacementId]) : undefined),
    [selectedPlacementId, sessionState.revision]
  );

  const applyCuboidSelection = useCallback(
    (p1: Vec3i, p2: Vec3i) => {
      const minX = Math.min(p1[0], p2[0]);
      const maxX = Math.max(p1[0], p2[0]);
      const minY = Math.min(p1[1], p2[1]);
      const maxY = Math.max(p1[1], p2[1]);
      const minZ = Math.min(p1[2], p2[2]);
      const maxZ = Math.max(p1[2], p2[2]);

      const bounds: Bounds3i = {
        min: [minX, minY, minZ],
        maxExclusive: [maxX + 1, maxY + 1, maxZ + 1],
      };
      setRegionBounds(bounds);

      void runtime.store.execute({
        type: 'selection:set',
        selection: createCuboidSelection(
          { minX, minY, minZ, maxX, maxY, maxZ },
          { x: p1[0], y: p1[1], z: p1[2] }
        ),
      });
    },
    [runtime]
  );

  const handleSetOriginFromSelectedVoxel = useCallback(() => {
    if (!selectedVoxel?.placementId) return;
    const project = runtime.store.getSnapshot().project;
    const placement = project.placements.find((p) => p.id === selectedVoxel.placementId);
    if (!placement) return;
    const local = worldBlockToLocal(placement, selectedVoxel.position);
    const newOrigin: Vec3Half = [local[0] * 2, local[1] * 2, local[2] * 2];
    void runtime.store.execute({
      type: 'placement:setOrigin',
      placementId: placement.id,
      origin: newOrigin,
      keepBlocksInPlace: true,
    });
  }, [selectedVoxel, runtime]);

  const handleSetPos1FromSelectedVoxel = useCallback(() => {
    if (!selectedVoxel) return;
    const pos = selectedVoxel.position;
    setRegionPos1(pos);
    if (regionPos2) {
      applyCuboidSelection(pos, regionPos2);
      setRegionPickMode(null);
    } else {
      setRegionPickMode('pos2');
    }
  }, [selectedVoxel, regionPos2, applyCuboidSelection]);

  const handleSetPos2FromSelectedVoxel = useCallback(() => {
    if (!selectedVoxel) return;
    const pos = selectedVoxel.position;
    setRegionPos2(pos);
    if (regionPos1) {
      applyCuboidSelection(regionPos1, pos);
      setRegionPickMode(null);
    } else {
      setRegionPickMode('pos1');
    }
  }, [selectedVoxel, regionPos1, applyCuboidSelection]);

  const handleClearRegionSelection = useCallback(() => {
    setRegionPos1(null);
    setRegionPos2(null);
    setRegionPickMode(null);
    setRegionBounds(null);
    void runtime.store.execute({ type: 'selection:clear' });
  }, [runtime]);

  const handleCancelRegionPick = useCallback(() => {
    setRegionPickMode(null);
  }, []);

  const handleVoxelClick = useCallback(
    (hit: VoxelHit, event: React.MouseEvent) => {
      if (runtime.importWorkflow.getState() === 'ghost-preview') {
        void runtime.importWorkflow.confirmPlace();
        return;
      }

      if (regionPickMode === 'pos2' && hit) {
        setRegionPos2(hit.position);
        if (regionPos1) {
          applyCuboidSelection(regionPos1, hit.position);
        }
        setRegionPickMode(null);
        setSelectedVoxel(hit);
        return;
      }

      if (regionPickMode === 'pos1' && hit) {
        setRegionPos1(hit.position);
        if (regionPos2) {
          applyCuboidSelection(hit.position, regionPos2);
        }
        setRegionPickMode(null);
        setSelectedVoxel(hit);
        return;
      }

      if (hit.placementId) {
        setSelectedVoxel((prev) =>
          prev &&
          prev.position[0] === hit.position[0] &&
          prev.position[1] === hit.position[1] &&
          prev.position[2] === hit.position[2]
            ? null
            : hit
        );
      } else {
        setSelectedVoxel(null);
      }

      const activeTool = runtime.store.getSnapshot().selectedTool;
      if (
        [
          'cuboid',
          'cuboid-select',
          'fill',
          'replace',
          'walls',
          'hollow',
          'delete',
          'delete-region',
        ].includes(activeTool)
      ) {
        if (event.shiftKey || runtime.selectionTool.getCorner1()) {
          void runtime.selectionTool.setCorner2(hit.position);
        } else {
          runtime.selectionTool.setCorner1(hit.position);
        }
      } else if (['select', 'move', 'rotate'].includes(activeTool) && hit.placementId) {
        handleSelectPlacement(hit.placementId);
      } else {
        runtime.selectionTool.setCorner1(hit.position);
      }
    },
    [
      runtime,
      regionPickMode,
      regionPos1,
      regionPos2,
      applyCuboidSelection,
      handleSelectPlacement,
    ]
  );

  // Clear selected voxel on Escape keydown (when not in a text input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName?.toUpperCase();
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          target?.isContentEditable
        ) {
          return;
        }
        setSelectedVoxel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Clear selected voxel when placements clear or when selected placement is deleted
  useEffect(() => {
    if (sessionState.project.placements.length === 0) {
      setSelectedVoxel(null);
    } else if (selectedVoxel?.placementId) {
      const placementStillExists = sessionState.project.placements.some(
        (p) => p.id === selectedVoxel.placementId
      );
      if (!placementStillExists) {
        setSelectedVoxel(null);
      }
    }
  }, [sessionState.project.placements, selectedVoxel]);

  const handleVoxelHover = useCallback((hit: VoxelHit | null) => {
    if (!hit) {
      setHoveredBlockName(null);
      setCursorCoordinates(null);
      return;
    }
    setHoveredBlockName(hit.state.id);
    setCursorCoordinates({ x: hit.position[0], y: hit.position[1], z: hit.position[2] });

    if (runtime.importWorkflow.getState() === 'ghost-preview') {
      runtime.importWorkflow.snapGhostToGround({
        voxelPosition: hit.position,
        adjacentPosition: hit.adjacentPosition,
      });
    }
  }, [runtime]);

  return (
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <WorkspaceShell
        store={runtime.store}
        controllers={runtime.workspace}
        conflictsController={runtime.conflictsController}
        materialListController={runtime.materialListController}
        selectedPlacementId={selectedPlacementId}
        onSelectPlacement={handleSelectPlacement}
        activeOverlays={activeOverlays}
        onToggleOverlay={handleToggleOverlay}
        onImport={() => setIsImportOpen(true)}
        onExport={() => setIsExportOpen(true)}
        onBake={() => setIsBakeOpen(true)}
        onSave={handleSave}
        onOpenProjects={handleOpenProjects}
        isDirty={isDirty}
        isSaving={isSaving}
        authUser={authUser}
        onSignIn={() => {
          setPendingAuthAction(null);
          setIsLoginModalOpen(true);
        }}
        onSignOut={handleSignOut}
        hoveredBlockName={hoveredBlockName}
        cursorCoordinates={cursorCoordinates}
        nudgeStep={nudgeStep}
        onNudgeStepChange={setNudgeStep}
        explorerSlot={
          <ProjectExplorer
            rootLabel={authUser ? authUser.username : 'guest'}
            projects={workspaceProjects}
            activeProjectId={activeProjectId}
            activeSchematicId={activeSchematicId}
            isDirty={isDirty}
            onCreateProject={handleCreateProject}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            onCreateSchematic={handleCreateSchematic}
            onSelectSchematic={handleSelectSchematic}
            onRenameSchematic={handleRenameSchematic}
            onDeleteSchematic={handleDeleteSchematic}
          />
        }
        viewportSlot={
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <ViewportCanvas
              session={runtime.store.session}
              assetSource={assetSource}
              uvLookup={uvLookup}
              atlasTexture={atlasTexture}
              selectedTool={sessionState.selectedTool}
              onSelectPlacement={handleSelectPlacement}
              ghostPreview={ghostPreview}
              selectedPlacementIds={selectedPlacementIds}
              conflictOverlayPositions={conflictOverlayPositions}
              onVoxelClick={handleVoxelClick}
              onVoxelHover={handleVoxelHover}
              dragSnapStep={nudgeStep}
              selectedVoxelPosition={selectedVoxel?.position ?? null}
              onClearSelectedVoxel={() => setSelectedVoxel(null)}
              activeSchematicId={activeSchematicId}
              onSetOriginFromSelectedVoxel={handleSetOriginFromSelectedVoxel}
              regionPos1={regionPos1}
              regionPos2={regionPos2}
              regionPickMode={regionPickMode}
              regionBounds={regionBounds}
              onSetPos1FromSelectedVoxel={handleSetPos1FromSelectedVoxel}
              onSetPos2FromSelectedVoxel={handleSetPos2FromSelectedVoxel}
              onClearRegionSelection={handleClearRegionSelection}
              onCancelRegionPick={handleCancelRegionPick}
            />
          </div>
        }
        tabSlots={{
          assets: <AssetLoadPanel manager={runtime.assetManager} />,
          materials: <MaterialListPanel controller={runtime.materialListController} />,
          conflicts: <ConflictsPanel controller={runtime.conflictsController} onOpenBake={() => setIsBakeOpen(true)} />,
        }}
      />

      {/* Modals */}
      <ImportDialog
        controller={runtime.importWorkflow}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      {isExportOpen && (
        <ExportDialog
          controller={runtime.persistence}
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
        />
      )}

      {isBakeOpen && (
        <BakeDialog
          controller={runtime.bakeController}
          isOpen={isBakeOpen}
          onClose={() => setIsBakeOpen(false)}
        />
      )}

      {/* Cloud Projects Modal */}
      <ProjectDialog
        controller={runtime.persistence}
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        onProjectLoaded={async () => {
          setSelectedPlacementId(null);
          setSelectedVoxel(null);
          try {
            const tree = await listWorkspaceTree();
            setWorkspaceProjects(tree);
            const currentCloudId = runtime.persistence.getActiveCloudProjectId();
            if (currentCloudId) {
              setActiveProjectId(currentCloudId);
              const foundProj = tree.find((p) => p.id === currentCloudId);
              if (foundProj && foundProj.schematics.length > 0) {
                setActiveSchematicId(foundProj.schematics[0].id);
                runtime.persistence.setActiveCloudSchematicId(foundProj.schematics[0].id);
              }
            }
          } catch (err) {
            console.warn('Failed to refresh workspace tree after project loaded:', err);
          }
        }}
      />

      {/* First Project Onboarding Modal */}
      <FirstProjectModal
        isOpen={isFirstProjectOpen}
        onClose={() => setIsFirstProjectOpen(false)}
        onCreate={async (projectName, schematicName, thenImport) => {
          const cloudProj = await createCloudProject(projectName);
          const archiveBytes = runtime.persistence.packCurrentProjectBytes();
          const count = runtime.store.getSnapshot().project.placements.length;
          const cloudSchem = await createSchematic(cloudProj.id, schematicName, archiveBytes, {
            revision: 1,
            placementCount: count,
          });
          const tree = await listWorkspaceTree();
          setWorkspaceProjects(tree);
          setActiveProjectId(cloudProj.id);
          setActiveSchematicId(cloudSchem.id);
          runtime.persistence.setActiveCloudProjectId(cloudProj.id);
          runtime.persistence.setActiveCloudSchematicId(cloudSchem.id);
          runtime.persistence.markClean();
          setIsFirstProjectOpen(false);
          if (thenImport) {
            setIsImportOpen(true);
          }
        }}
      />

      {/* Auth In-Editor Popup */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setPendingAuthAction(null);
        }}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
