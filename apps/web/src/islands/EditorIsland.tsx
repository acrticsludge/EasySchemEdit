// apps/web/src/islands/EditorIsland.tsx
// Integrated EasySchemEdit v1 workspace component connecting all editor modules and runtime.

'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import '../editor/design-tokens.css';
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
  type GhostPreviewSpec,
  type VoxelHit,
} from '../editor/index.ts';
import { useEditorSession } from '../editor/session-store.ts';
import { getMe, logout, type AuthUser } from '../client/auth-client.ts';
import { LoginModal } from '../components/LoginModal.tsx';

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
  const [, setDirtyVersion] = useState(0);

  // Check current session on mount (non-blocking)
  useEffect(() => {
    let active = true;
    getMe()
      .then((user) => {
        if (active) setAuthUser(user);
      })
      .catch(() => {
        if (active) setAuthUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const performCloudSave = useCallback(
    async (userToUse?: AuthUser | null) => {
      const user = userToUse !== undefined ? userToUse : authUser;
      if (!user) {
        setPendingAuthAction('save');
        setIsLoginModalOpen(true);
        return;
      }

      const proj = runtime.store.getSnapshot().project;
      const isUntitled =
        !proj.name || proj.name === 'Untitled Schematic' || proj.name === 'Untitled Project';
      const hasNoCloudId = !runtime.persistence.getActiveCloudProjectId();

      if (isUntitled && hasNoCloudId) {
        setIsProjectsOpen(true);
        return;
      }

      setIsSaving(true);
      try {
        const summary = await runtime.persistence.saveToCloud();
        setDirtyVersion((v) => v + 1);
        console.info(`Saved project "${summary.name}" to cloud.`);
      } catch (err) {
        console.error('Failed to save to cloud:', err);
        if (err instanceof Error && err.message.toLowerCase().includes('unauthorized')) {
          setAuthUser(null);
          setPendingAuthAction('save');
          setIsLoginModalOpen(true);
        } else {
          alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [authUser, runtime],
  );

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
    (user: AuthUser) => {
      setAuthUser(user);
      setIsLoginModalOpen(false);
      const action = pendingAuthAction;
      setPendingAuthAction(null);

      if (action === 'save') {
        void performCloudSave(user);
      } else if (action === 'projects') {
        setIsProjectsOpen(true);
      }
    },
    [pendingAuthAction, performCloudSave],
  );

  const handleSignOut = useCallback(async () => {
    await logout();
    setAuthUser(null);
  }, []);

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

  const handleVoxelClick = useCallback((hit: VoxelHit, event: React.MouseEvent) => {
    if (runtime.importWorkflow.getState() === 'ghost-preview') {
      void runtime.importWorkflow.confirmPlace();
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
    if (['cuboid', 'cuboid-select', 'fill', 'replace', 'walls', 'hollow', 'delete', 'delete-region'].includes(activeTool)) {
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
  }, [runtime, handleSelectPlacement]);

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
        isDirty={runtime.persistence.isDirty()}
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
        onProjectLoaded={() => {
          setSelectedPlacementId(null);
          setSelectedVoxel(null);
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
