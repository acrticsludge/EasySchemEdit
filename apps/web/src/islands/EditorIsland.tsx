// apps/web/src/islands/EditorIsland.tsx
// Integrated EasySchemEdit v1 workspace component connecting all editor modules and runtime.

'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import '../editor/design-tokens.css';
import {
  placementWorldBounds,
  localBlockToWorld,
  worldBlockToLocal,
  computeOriginForWorldBlock,
  type Bounds3i,
  type Placement,
  type Project,
  type Vec3Half,
  type Vec3i,
} from '@easyschemedit/domain';
import {
  createCuboidSelection,
  generateStructure,
  generateShape,
  type ClipboardEntry,
} from '@easyschemedit/operations';
import { packVxprojArchive, packVxprojArchiveAsync, unpackVxprojArchive, unpackVxprojArchiveAsync } from '@easyschemedit/persistence';
import { toBlockStateId } from '../editor/viewport/region-hit.ts';
import {
  saveSchematicSelection,
  loadSchematicSelection,
  saveUiPrefs,
  loadUiPrefs,
  copySchematicState,
  deleteSchematicState,
  type PersistedSelectionState,
  type SavedRegion,
} from '../editor/persistence/selection-storage.ts';
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
  AgentLogPanel,
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
  loadSchematicArchive as getSchematicArchive,
} from '../client/projects-client.ts';
import { getMcpSyncState, updateMcpSyncState, serializeClipboardEntries } from '../client/mcp-client.ts';
import { LoginModal } from '../components/LoginModal.tsx';
import { FirstProjectModal } from '../components/FirstProjectModal.tsx';
import { McpConnectModal } from '../components/McpConnectModal.tsx';

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

interface RegionUndoSnapshot {
  savedRegions: SavedRegion[];
  activeRegionId: string | null;
  regionBounds: Bounds3i | null;
  regionPos1: Vec3i | null;
  regionPos2: Vec3i | null;
}

function cloneVec3i(v: Vec3i | null): Vec3i | null {
  return v ? [v[0], v[1], v[2]] : null;
}

function cloneBounds(b: Bounds3i | null): Bounds3i | null {
  if (!b) return null;
  return {
    min: [b.min[0], b.min[1], b.min[2]],
    maxExclusive: [b.maxExclusive[0], b.maxExclusive[1], b.maxExclusive[2]],
  };
}

function cloneRegionSnapshot(snap: RegionUndoSnapshot): RegionUndoSnapshot {
  return {
    savedRegions: snap.savedRegions.map((r) => ({
      id: r.id,
      name: r.name,
      pos1: [r.pos1[0], r.pos1[1], r.pos1[2]],
      pos2: [r.pos2[0], r.pos2[1], r.pos2[2]],
      bounds: {
        min: [r.bounds.min[0], r.bounds.min[1], r.bounds.min[2]],
        maxExclusive: [r.bounds.maxExclusive[0], r.bounds.maxExclusive[1], r.bounds.maxExclusive[2]],
      },
    })),
    activeRegionId: snap.activeRegionId,
    regionBounds: cloneBounds(snap.regionBounds),
    regionPos1: cloneVec3i(snap.regionPos1),
    regionPos2: cloneVec3i(snap.regionPos2),
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
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [mcpLiveSyncEnabled, setMcpLiveSyncEnabled] = useState(true);
  const [cloudMcpLogs, setCloudMcpLogs] = useState<
    Array<{ id: string; tool: string; revision: number; changedCells: number; summary: string; createdAt: string }>
  >([]);
  const lastSyncedSelectionTimestampRef = useRef<string>('');
  const lastSyncedRevisionRef = useRef<number | null>(null);
  const lastSyncedClipboardTimestampRef = useRef<string | null>(null);
  const selectionSyncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Selection & overlay preferences state
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(
    () => runtime.workspace.inspector.context().selectedPlacementId
  );
  const [selectedVoxel, setSelectedVoxel] = useState<VoxelHit | null>(null);
  const [regionPos1, setRegionPos1] = useState<Vec3i | null>(null);
  const [regionPos2, setRegionPos2] = useState<Vec3i | null>(null);
  const [regionPickMode, setRegionPickMode] = useState<'pos1' | 'pos2' | null>(null);
  const [regionBounds, setRegionBounds] = useState<Bounds3i | null>(null);
  const [savedRegions, setSavedRegions] = useState<SavedRegion[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const addingNewRegionRef = useRef<boolean>(false);

  const regionStateRef = useRef<RegionUndoSnapshot>({
    savedRegions: [],
    activeRegionId: null,
    regionBounds: null,
    regionPos1: null,
    regionPos2: null,
  });

  useEffect(() => {
    regionStateRef.current = {
      savedRegions,
      activeRegionId,
      regionBounds,
      regionPos1,
      regionPos2,
    };
  }, [savedRegions, activeRegionId, regionBounds, regionPos1, regionPos2]);

  const applyRegionSnapshot = useCallback(
    (snap: RegionUndoSnapshot) => {
      const cloned = cloneRegionSnapshot(snap);
      regionStateRef.current = cloned;
      setSavedRegions(cloned.savedRegions);
      setActiveRegionId(cloned.activeRegionId);
      setRegionBounds(cloned.regionBounds);
      setRegionPos1(cloned.regionPos1);
      setRegionPos2(cloned.regionPos2);
      setRegionPickMode(null);
      addingNewRegionRef.current = false;

      if (cloned.regionBounds) {
        const activeReg = cloned.activeRegionId
          ? cloned.savedRegions.find((r) => r.id === cloned.activeRegionId)
          : null;
        const p1 = activeReg ? activeReg.pos1 : cloned.regionPos1;
        const minX = Math.min(cloned.regionBounds.min[0], cloned.regionBounds.maxExclusive[0] - 1);
        const minY = Math.min(cloned.regionBounds.min[1], cloned.regionBounds.maxExclusive[1] - 1);
        const minZ = Math.min(cloned.regionBounds.min[2], cloned.regionBounds.maxExclusive[2] - 1);
        const maxX = Math.max(cloned.regionBounds.min[0], cloned.regionBounds.maxExclusive[0] - 1);
        const maxY = Math.max(cloned.regionBounds.min[1], cloned.regionBounds.maxExclusive[1] - 1);
        const maxZ = Math.max(cloned.regionBounds.min[2], cloned.regionBounds.maxExclusive[2] - 1);
        const anchor = p1
          ? { x: p1[0], y: p1[1], z: p1[2] }
          : { x: minX, y: minY, z: minZ };

        runtime.store.session.setSelectionQuiet(
          createCuboidSelection({ minX, minY, minZ, maxX, maxY, maxZ }, anchor),
          anchor
        );
      } else {
        runtime.store.session.setSelectionQuiet(null);
      }
    },
    [runtime]
  );

  const [nudgeStep, setNudgeStep] = useState<1 | 16>(() => {
    const prefs = loadUiPrefs();
    return prefs?.nudgeStep === 16 ? 16 : 1;
  });

  const [activeOverlays, setActiveOverlays] = useState(() => {
    const prefs = loadUiPrefs();
    return {
      chunk: prefs?.activeOverlays?.chunk ?? false,
      section: prefs?.activeOverlays?.section ?? false,
      block: prefs?.activeOverlays?.block ?? false,
      conflicts: prefs?.activeOverlays?.conflicts ?? true,
    };
  });

  const skipNextLocalSelectionSaveRef = useRef(false);
  const suppressCloudSelectionPushRef = useRef(false);
  const suppressCloudClipboardPushRef = useRef(false);
  const clipboardSyncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSchematicForSelectionRef = useRef<string | null>(null);
  const lastKnownCloudSchematicIdRef = useRef<string | null>(null);

  const prevPlacementTransformsRef = useRef<Map<string, Placement>>(new Map());

  const syncPlacementTransformsRef = useCallback((placements: readonly Placement[]) => {
    const map = new Map<string, Placement>();
    for (const p of placements) {
      map.set(p.id, {
        ...p,
        transform: {
          translation: [...p.transform.translation] as Vec3i,
          rotationY: p.transform.rotationY,
          mirror: p.transform.mirror,
        },
        origin: [...p.origin] as Vec3Half,
      });
    }
    prevPlacementTransformsRef.current = map;
  }, []);

  const restoreSelectionForSchematic = useCallback(
    (schemId: string | null) => {
      skipNextLocalSelectionSaveRef.current = true;
      currentSchematicForSelectionRef.current = schemId;
      syncPlacementTransformsRef(runtime.store.getSnapshot().project.placements);
      runtime.store.clearCustomUndoHistory();

      if (!schemId) {
        setSavedRegions([]);
        setActiveRegionId(null);
        setRegionPos1(null);
        setRegionPos2(null);
        setRegionPickMode(null);
        setRegionBounds(null);
        setSelectedVoxel(null);
        setSelectedPlacementId(null);
        runtime.workspace.selectPlacement(null);
        runtime.store.session.setSelectionQuiet(null);
        runtime.persistence.markClean();
        return;
      }

      const saved = loadSchematicSelection(schemId);
      if (saved) {
        let loadedRegions = saved.savedRegions ?? [];
        let loadedActiveId =
          saved.activeRegionId ?? (loadedRegions.length > 0 ? loadedRegions[0].id : null);

        // Backward-compatibility: synthesize R1 if bounds exist without savedRegions
        if (loadedRegions.length === 0 && saved.bounds) {
          const p1 = saved.pos1 ?? saved.bounds.min;
          const p2 = saved.pos2 ?? [
            saved.bounds.maxExclusive[0] - 1,
            saved.bounds.maxExclusive[1] - 1,
            saved.bounds.maxExclusive[2] - 1,
          ];
          const legacyRegion: SavedRegion = {
            id: 'region-1',
            name: 'R1',
            pos1: p1,
            pos2: p2,
            bounds: saved.bounds,
          };
          loadedRegions = [legacyRegion];
          loadedActiveId = 'region-1';
        }

        setSavedRegions(loadedRegions);
        setActiveRegionId(loadedActiveId);

        const activeReg = loadedRegions.find((r) => r.id === loadedActiveId) ?? loadedRegions[0];
        const p1 = activeReg ? activeReg.pos1 : saved.pos1;
        const p2 = activeReg ? activeReg.pos2 : saved.pos2;
        const bounds = activeReg ? activeReg.bounds : saved.bounds;

        setRegionPos1(loadedRegions.length > 0 ? null : p1);
        setRegionPos2(loadedRegions.length > 0 ? null : p2);
        setRegionPickMode(null);
        setRegionBounds(bounds);
        setSelectedVoxel(saved.selectedVoxel);
        setSelectedPlacementId(saved.selectedPlacementId);
        runtime.workspace.selectPlacement(saved.selectedPlacementId);

        if (bounds) {
          const minX = Math.min(bounds.min[0], bounds.maxExclusive[0] - 1);
          const minY = Math.min(bounds.min[1], bounds.maxExclusive[1] - 1);
          const minZ = Math.min(bounds.min[2], bounds.maxExclusive[2] - 1);
          const maxX = Math.max(bounds.min[0], bounds.maxExclusive[0] - 1);
          const maxY = Math.max(bounds.min[1], bounds.maxExclusive[1] - 1);
          const maxZ = Math.max(bounds.min[2], bounds.maxExclusive[2] - 1);
          const anchor = p1
            ? { x: p1[0], y: p1[1], z: p1[2] }
            : { x: minX, y: minY, z: minZ };

          runtime.store.session.setSelectionQuiet(
            createCuboidSelection({ minX, minY, minZ, maxX, maxY, maxZ }, anchor),
            anchor
          );
        } else {
          runtime.store.session.setSelectionQuiet(null);
        }
      } else {
        setSavedRegions([]);
        setActiveRegionId(null);
        setRegionPos1(null);
        setRegionPos2(null);
        setRegionPickMode(null);
        setRegionBounds(null);
        setSelectedVoxel(null);
        setSelectedPlacementId(null);
        runtime.workspace.selectPlacement(null);
        runtime.store.session.setSelectionQuiet(null);
      }
      runtime.persistence.markClean();
    },
    [runtime, syncPlacementTransformsRef]
  );

  // Auto-translate / transform region selections when placement moves
  useEffect(() => {
    const placements = sessionState.project.placements;
    if (placements.length === 0) {
      syncPlacementTransformsRef(placements);
      return;
    }

    let transformedPlacement: Placement | null = null;
    let oldPlacementState: Placement | null = null;

    for (const p of placements) {
      const oldP = prevPlacementTransformsRef.current.get(p.id);
      if (!oldP) continue;

      const originWorldOld = localBlockToWorld(oldP, [0, 0, 0]);
      const originWorldNew = localBlockToWorld(p, [0, 0, 0]);
      const axisXWorldOld = localBlockToWorld(oldP, [1, 0, 0]);
      const axisXWorldNew = localBlockToWorld(p, [1, 0, 0]);
      const axisZWorldOld = localBlockToWorld(oldP, [0, 0, 1]);
      const axisZWorldNew = localBlockToWorld(p, [0, 0, 1]);

      const didTransform =
        originWorldOld[0] !== originWorldNew[0] ||
        originWorldOld[1] !== originWorldNew[1] ||
        originWorldOld[2] !== originWorldNew[2] ||
        axisXWorldOld[0] !== axisXWorldNew[0] ||
        axisXWorldOld[1] !== axisXWorldNew[1] ||
        axisXWorldOld[2] !== axisXWorldNew[2] ||
        axisZWorldOld[0] !== axisZWorldNew[0] ||
        axisZWorldOld[1] !== axisZWorldNew[1] ||
        axisZWorldOld[2] !== axisZWorldNew[2];

      if (didTransform) {
        transformedPlacement = p;
        oldPlacementState = oldP;
        break;
      }
    }

    if (transformedPlacement && oldPlacementState) {
      const p = transformedPlacement;
      const oldP = oldPlacementState;

      const transformPt = (pt: Vec3i): Vec3i => {
        const local = worldBlockToLocal(oldP, pt);
        return localBlockToWorld(p, local);
      };

      const transformCorners = (p1: Vec3i, p2: Vec3i) => {
        const np1 = transformPt(p1);
        const np2 = transformPt(p2);
        const min: Vec3i = [
          Math.min(np1[0], np2[0]),
          Math.min(np1[1], np2[1]),
          Math.min(np1[2], np2[2]),
        ];
        const maxExclusive: Vec3i = [
          Math.max(np1[0], np2[0]) + 1,
          Math.max(np1[1], np2[1]) + 1,
          Math.max(np1[2], np2[2]) + 1,
        ];
        return { pos1: np1, pos2: np2, bounds: { min, maxExclusive } };
      };

      if (savedRegions.length > 0) {
        const nextSaved = savedRegions.map((reg) => {
          const tc = transformCorners(reg.pos1, reg.pos2);
          return {
            ...reg,
            pos1: tc.pos1,
            pos2: tc.pos2,
            bounds: tc.bounds,
          };
        });
        setSavedRegions(nextSaved);

        const activeReg = nextSaved.find((r) => r.id === activeRegionId) ?? nextSaved[0];
        if (activeReg) {
          setRegionBounds(activeReg.bounds);
        }
        if (regionPos1) setRegionPos1(transformPt(regionPos1));
        if (regionPos2) setRegionPos2(transformPt(regionPos2));
      } else if (regionPos1 && regionPos2) {
        const tc = transformCorners(regionPos1, regionPos2);
        setRegionPos1(tc.pos1);
        setRegionPos2(tc.pos2);
        setRegionBounds(tc.bounds);
      } else if (regionBounds) {
        const p1 = regionBounds.min;
        const p2: Vec3i = [
          regionBounds.maxExclusive[0] - 1,
          regionBounds.maxExclusive[1] - 1,
          regionBounds.maxExclusive[2] - 1,
        ];
        const tc = transformCorners(p1, p2);
        setRegionBounds(tc.bounds);
        if (regionPos1) setRegionPos1(transformPt(regionPos1));
        if (regionPos2) setRegionPos2(transformPt(regionPos2));
      }

      if (selectedVoxel) {
        const newPos = transformPt(selectedVoxel.position);
        setSelectedVoxel({ ...selectedVoxel, position: newPos });
      }
    }

    syncPlacementTransformsRef(placements);
  }, [
    sessionState.project.placements,
    sessionState.revision,
    savedRegions,
    activeRegionId,
    regionPos1,
    regionPos2,
    regionBounds,
    selectedVoxel,
    runtime,
    syncPlacementTransformsRef,
  ]);

  // Save UI preferences on change
  useEffect(() => {
    saveUiPrefs({
      activeOverlays,
      nudgeStep,
    });
  }, [activeOverlays, nudgeStep]);

  // Sync conflicts overlay controller with UI preferences
  useEffect(() => {
    runtime.conflictsController.setOverlayEnabled(activeOverlays.conflicts);
  }, [runtime, activeOverlays.conflicts]);

  // Persist selection for active schematic whenever it changes
  useEffect(() => {
    if (!activeSchematicId) return;

    if (currentSchematicForSelectionRef.current !== activeSchematicId) {
      return;
    }

    if (skipNextLocalSelectionSaveRef.current) {
      skipNextLocalSelectionSaveRef.current = false;
      return;
    }

    saveSchematicSelection(activeSchematicId, {
      pos1: regionPos1,
      pos2: regionPos2,
      bounds: regionBounds,
      selectedVoxel,
      selectedPlacementId,
      savedRegions,
      activeRegionId,
    });
  }, [
    activeSchematicId,
    regionPos1,
    regionPos2,
    regionBounds,
    selectedVoxel,
    selectedPlacementId,
    savedRegions,
    activeRegionId,
  ]);

  // Browser -> Cloud Selection & Active Schematic Reporting (Slice M4b)
  useEffect(() => {
    if (!authUser) return;
    if (!activeSchematicId || activeSchematicId.startsWith('guest-') || activeSchematicId.startsWith('temp-')) return;
    if (suppressCloudSelectionPushRef.current) {
      suppressCloudSelectionPushRef.current = false;
      return;
    }

    if (selectionSyncDebounceTimerRef.current) {
      clearTimeout(selectionSyncDebounceTimerRef.current);
    }

    selectionSyncDebounceTimerRef.current = setTimeout(() => {
      const nowIso = new Date().toISOString();
      lastSyncedSelectionTimestampRef.current = nowIso;
      updateMcpSyncState({
        activeProjectId,
        activeSchematicId,
        selectionState: {
          schematicId: activeSchematicId,
          savedRegions: savedRegions.map((r) => ({
            id: r.id,
            name: r.name,
            pos1: [r.pos1[0], r.pos1[1], r.pos1[2]],
            pos2: [r.pos2[0], r.pos2[1], r.pos2[2]],
            bounds: {
              min: [r.bounds.min[0], r.bounds.min[1], r.bounds.min[2]],
              maxExclusive: [r.bounds.maxExclusive[0], r.bounds.maxExclusive[1], r.bounds.maxExclusive[2]],
            },
          })),
          activeRegionId,
          bounds: regionBounds
            ? {
                min: [regionBounds.min[0], regionBounds.min[1], regionBounds.min[2]],
                maxExclusive: [regionBounds.maxExclusive[0], regionBounds.maxExclusive[1], regionBounds.maxExclusive[2]],
              }
            : null,
          pos1: regionPos1 ? [regionPos1[0], regionPos1[1], regionPos1[2]] : null,
          pos2: regionPos2 ? [regionPos2[0], regionPos2[1], regionPos2[2]] : null,
          updatedAt: nowIso,
        },
      }).catch((_err) => {
        // Best-effort network update, catch silently
      });
    }, 400);

    return () => {
      if (selectionSyncDebounceTimerRef.current) {
        clearTimeout(selectionSyncDebounceTimerRef.current);
      }
    };
  }, [
    authUser,
    activeProjectId,
    activeSchematicId,
    savedRegions,
    activeRegionId,
    regionBounds,
    regionPos1,
    regionPos2,
  ]);

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
                  lastKnownCloudSchematicIdRef.current = schemToOpen.id;
                  setActiveSchematicId(schemToOpen.id);
                  runtime.persistence.setActiveCloudSchematicId(schemToOpen.id);
                  restoreSelectionForSchematic(schemToOpen.id);
                  void syncFromCloudMcp();
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
                    if (active) {
                      restoreSelectionForSchematic(gSchemId);
                    }
                  } catch {
                    // ignore unpack error
                  }
                } else if (gSchemId && active) {
                  restoreSelectionForSchematic(gSchemId);
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
            restoreSelectionForSchematic(DEFAULT_GUEST_SCHEMATIC_ID);
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
                      if (active) {
                        restoreSelectionForSchematic(gSchemId);
                      }
                    });
                    restoredGuest = true;
                  } catch {
                    // ignore
                  }
                } else if (gSchemId && active) {
                  restoreSelectionForSchematic(gSchemId);
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
            restoreSelectionForSchematic(DEFAULT_GUEST_SCHEMATIC_ID);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [restoreSelectionForSchematic, runtime]);

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
          if (activeSchematicId && currentSchematicForSelectionRef.current === activeSchematicId) {
            saveSchematicSelection(activeSchematicId, {
              pos1: regionPos1,
              pos2: regionPos2,
              bounds: regionBounds,
              selectedVoxel,
              selectedPlacementId,
              savedRegions,
              activeRegionId,
            });
          }

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

              copySchematicState(gs.id, cloudSchem.id);
              deleteSchematicState(gs.id);

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
            restoreSelectionForSchematic(newActiveSchematicId);
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
              restoreSelectionForSchematic(firstSchem.id);
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
    [
      pendingAuthAction,
      workspaceProjects,
      activeProjectId,
      activeSchematicId,
      regionPos1,
      regionPos2,
      regionBounds,
      selectedVoxel,
      selectedPlacementId,
      savedRegions,
      activeRegionId,
      restoreSelectionForSchematic,
      performCloudSave,
      runtime,
    ],
  );

  const handleSignOut = useCallback(async () => {
    if (activeSchematicId && currentSchematicForSelectionRef.current === activeSchematicId) {
      saveSchematicSelection(activeSchematicId, {
        pos1: regionPos1,
        pos2: regionPos2,
        bounds: regionBounds,
        selectedVoxel,
        selectedPlacementId,
        savedRegions,
        activeRegionId,
      });
    }
    await logout();
    setAuthUser(null);
    guestBuffersRef.current.clear();
    try {
      localStorage.removeItem('ese_guest_workspace');
    } catch {}
    setWorkspaceProjects(createDefaultGuestProjects());
    setActiveProjectId(DEFAULT_GUEST_PROJECT_ID);
    setActiveSchematicId(DEFAULT_GUEST_SCHEMATIC_ID);
    restoreSelectionForSchematic(DEFAULT_GUEST_SCHEMATIC_ID);
    const emptyProj = createEmptyProjectDocument('untitled.schem');
    await runtime.persistence.replaceProjectInSession(emptyProj);
  }, [
    activeSchematicId,
    regionPos1,
    regionPos2,
    regionBounds,
    selectedVoxel,
    selectedPlacementId,
    savedRegions,
    activeRegionId,
    restoreSelectionForSchematic,
    runtime,
  ]);

  // Explorer Handlers
  const handleSelectSchematic = useCallback(
    async (projectId: string, schematicId: string) => {
      if (schematicId === activeSchematicId) return;
      if (isSwitchingSchematicRef.current) return;
      isSwitchingSchematicRef.current = true;

      try {
        if (activeSchematicId && currentSchematicForSelectionRef.current === activeSchematicId) {
          saveSchematicSelection(activeSchematicId, {
            pos1: regionPos1,
            pos2: regionPos2,
            bounds: regionBounds,
            selectedVoxel,
            selectedPlacementId,
            savedRegions,
            activeRegionId,
          });
        }
        currentSchematicForSelectionRef.current = null;

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
          lastKnownCloudSchematicIdRef.current = schematicId;
          setActiveProjectId(projectId);
          setActiveSchematicId(schematicId);
          restoreSelectionForSchematic(schematicId);
        } else {
          if (runtime.persistence.isDirty() && activeSchematicId) {
            const shouldSave = confirm('You have unsaved changes. Save before switching?');
            if (shouldSave) {
              await runtime.persistence.saveSchematicToCloud(activeSchematicId);
            }
          }
          await runtime.persistence.openSchematicFromCloud(schematicId);
          lastSyncedRevisionRef.current = null;
          lastKnownCloudSchematicIdRef.current = schematicId;
          updateMcpSyncState({ activeProjectId: projectId, activeSchematicId: schematicId }).catch(() => {});
          setActiveProjectId(projectId);
          setActiveSchematicId(schematicId);
          runtime.persistence.setActiveCloudProjectId(projectId);
          runtime.persistence.setActiveCloudSchematicId(schematicId);
          restoreSelectionForSchematic(schematicId);
        }
      } finally {
        isSwitchingSchematicRef.current = false;
      }
    },
    [
      authUser,
      activeSchematicId,
      regionPos1,
      regionPos2,
      regionBounds,
      selectedVoxel,
      selectedPlacementId,
      savedRegions,
      activeRegionId,
      workspaceProjects,
      restoreSelectionForSchematic,
      runtime,
    ],
  );

  // Cloud -> Browser Live Real-Time Sync (Slice M4b)
  const syncFromCloudMcp = useCallback(
    async (forceReloadSchematic = false) => {
      if (!authUser && !forceReloadSchematic) return;
      if (isSwitchingSchematicRef.current || isSaving || activeSchematicId?.startsWith('temp-')) return;
      try {
        const sync = await getMcpSyncState(activeSchematicId);
        if (sync.recentLogs) {
          setCloudMcpLogs(
            sync.recentLogs.map((log) => ({
              id: log.id,
              tool: log.tool,
              revision: log.revision,
              changedCells: log.changedCells,
              summary: log.summary,
              createdAt: log.createdAt,
            }))
          );
        }

        // Case A: AI switched active schematic or created a new project/schematic
        if (sync.activeSchematicId) {
          if (lastKnownCloudSchematicIdRef.current === null) {
            lastKnownCloudSchematicIdRef.current = sync.activeSchematicId;
          } else if (
            sync.activeSchematicId !== lastKnownCloudSchematicIdRef.current &&
            sync.activeSchematicId !== activeSchematicId &&
            !isSwitchingSchematicRef.current &&
            !isSaving
          ) {
            lastKnownCloudSchematicIdRef.current = sync.activeSchematicId;
            const tree = await listWorkspaceTree();
            setWorkspaceProjects(tree);
            let targetProjId = sync.activeProjectId;
            if (!targetProjId) {
              for (const p of tree) {
                if (p.schematics.some((s) => s.id === sync.activeSchematicId)) {
                  targetProjId = p.id;
                  break;
                }
              }
            }
            if (targetProjId) {
              await handleSelectSchematic(targetProjId, sync.activeSchematicId);
            }
            return;
          }
        }

        // Case B: AI modified the currently open schematic (sync.schematicRevision > currentRevision or forceReloadSchematic)
        if (
          activeSchematicId &&
          !activeSchematicId.startsWith('guest-') &&
          !isSaving &&
          !isSwitchingSchematicRef.current
        ) {
          const currentRev = runtime.store.getSnapshot().revision;
          const needsReload =
            forceReloadSchematic ||
            (typeof sync.schematicRevision === 'number' &&
              sync.schematicRevision > Math.max(currentRev, lastSyncedRevisionRef.current ?? 0) &&
              !runtime.persistence.isDirty());

          if (needsReload) {
            const buf = await getSchematicArchive(activeSchematicId);
            const unpacked = await unpackVxprojArchiveAsync(new Uint8Array(buf));
            const summary = sync.recentLogs?.[0]?.summary ?? 'AI Agent Edit';
            runtime.store.session.applyRemoteProjectUpdate(unpacked, summary);
            syncPlacementTransformsRef(unpacked.placements);
            runtime.persistence.markClean();
            lastSyncedRevisionRef.current = sync.schematicRevision ?? unpacked.revision ?? null;
            const tree = await listWorkspaceTree();
            setWorkspaceProjects(tree);
          }
        }

        // Case C: AI updated region selections (sync.selectionState)
        if (
          sync.selectionState &&
          sync.selectionState.schematicId === activeSchematicId &&
          sync.selectionState.updatedAt &&
          sync.selectionState.updatedAt !== lastSyncedSelectionTimestampRef.current
        ) {
          lastSyncedSelectionTimestampRef.current = sync.selectionState.updatedAt;
          suppressCloudSelectionPushRef.current = true;
          setSavedRegions(sync.selectionState.savedRegions ?? []);
          setActiveRegionId(sync.selectionState.activeRegionId ?? null);
          setRegionBounds(sync.selectionState.bounds ?? null);
          setRegionPos1(null);
          setRegionPos2(null);

          if (sync.selectionState.bounds) {
            const b = sync.selectionState.bounds;
            const minX = Math.min(b.min[0], b.maxExclusive[0] - 1);
            const minY = Math.min(b.min[1], b.maxExclusive[1] - 1);
            const minZ = Math.min(b.min[2], b.maxExclusive[2] - 1);
            const maxX = Math.max(b.min[0], b.maxExclusive[0] - 1);
            const maxY = Math.max(b.min[1], b.maxExclusive[1] - 1);
            const maxZ = Math.max(b.min[2], b.maxExclusive[2] - 1);
            runtime.store.session.setSelectionQuiet(
              createCuboidSelection({ minX, minY, minZ, maxX, maxY, maxZ }, { x: minX, y: minY, z: minZ }),
              { x: minX, y: minY, z: minZ }
            );
          } else {
            runtime.store.session.setSelectionQuiet(null);
          }
        }

        // Case D: AI updated clipboard entries (sync.clipboardState)
        if (
          sync.clipboardState &&
          sync.clipboardState.updatedAt &&
          sync.clipboardState.updatedAt !== lastSyncedClipboardTimestampRef.current
        ) {
          lastSyncedClipboardTimestampRef.current = sync.clipboardState.updatedAt;
          const entries: ClipboardEntry[] = (sync.clipboardState.entries ?? []).map((e: any) => ({
            id: e.id,
            data: {
              blocks: (e.data?.blocks ?? []).map((b: any) => ({
                localPos: b.localPos as Vec3i,
                state: {
                  id: b.state?.id ?? 'minecraft:air',
                  props: b.state?.props ?? b.state?.properties ?? {},
                },
              })),
              blockEntities: new Map<string, unknown>(
                Array.isArray(e.data?.blockEntities) ? e.data.blockEntities : []
              ),
              entities: e.data?.entities ?? [],
              biomes: e.data?.biomes,
              anchor: (e.data?.anchor ?? [0, 0, 0]) as Vec3i,
              bounds: {
                min: (e.data?.bounds?.min ?? [0, 0, 0]) as Vec3i,
                maxExclusive: (e.data?.bounds?.maxExclusive ?? [0, 0, 0]) as Vec3i,
              },
            },
            createdAt: e.createdAt ?? Date.now(),
            sourceProjectId: e.sourceProjectId ?? '',
            scope: e.scope ?? 'effective-composite',
          }));
          suppressCloudClipboardPushRef.current = true;
          runtime.store.session.replaceClipboardEntries(entries);
        }
      } catch (err) {
        console.warn('MCP sync poll error:', err);
      }
    },
    [authUser, activeSchematicId, isSaving, runtime, handleSelectSchematic]
  );

  // Poll cloud MCP sync every 2500ms when user is logged in & live sync is enabled
  useEffect(() => {
    if (!authUser || !mcpLiveSyncEnabled) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void syncFromCloudMcp();
    }, 2500);
    return () => clearInterval(interval);
  }, [authUser, mcpLiveSyncEnabled, syncFromCloudMcp]);

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
      const projToDelete = workspaceProjects.find((p) => p.id === projectId);
      if (projToDelete) {
        for (const s of projToDelete.schematics) {
          deleteSchematicState(s.id);
        }
      }

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
            restoreSelectionForSchematic(null);
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
            restoreSelectionForSchematic(nextSchem.id);
          } else {
            setActiveProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
            setActiveSchematicId(null);
            runtime.persistence.setActiveCloudProjectId(
              remainingProjects.length > 0 ? remainingProjects[0].id : null,
            );
            runtime.persistence.setActiveCloudSchematicId(null);
            restoreSelectionForSchematic(null);
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
    [authUser, workspaceProjects, activeProjectId, activeSchematicId, handleSelectSchematic, restoreSelectionForSchematic, runtime],
  );

  const handleCreateSchematic = useCallback(
    async (projectId: string, name: string) => {
      if (activeSchematicId && currentSchematicForSelectionRef.current === activeSchematicId) {
        saveSchematicSelection(activeSchematicId, {
          pos1: regionPos1,
          pos2: regionPos2,
          bounds: regionBounds,
          selectedVoxel,
          selectedPlacementId,
          savedRegions,
          activeRegionId,
        });
      }
      currentSchematicForSelectionRef.current = null;

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
        const archiveBytes = await packVxprojArchiveAsync(emptyProject);
        guestBuffersRef.current.set(newId, archiveBytes);
        await runtime.persistence.replaceProjectInSession(emptyProject, true);
        lastKnownCloudSchematicIdRef.current = newId;
        setActiveProjectId(projectId);
        setActiveSchematicId(newId);
        restoreSelectionForSchematic(newId);
      } else {
        isSwitchingSchematicRef.current = true;
        try {
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
          await runtime.persistence.replaceProjectInSession(emptyProject, true);
          setActiveProjectId(projectId);
          setActiveSchematicId(tempId);
          restoreSelectionForSchematic(tempId);
          runtime.persistence.setActiveCloudProjectId(projectId);
          runtime.persistence.setActiveCloudSchematicId(tempId);

          try {
            const archiveBytes = await packVxprojArchiveAsync(emptyProject);
            const newSchem = await createSchematic(projectId, name, archiveBytes, {
              revision: 1,
              placementCount: 0,
            });
            lastKnownCloudSchematicIdRef.current = newSchem.id;
            updateMcpSyncState({ activeProjectId: projectId, activeSchematicId: newSchem.id }).catch(() => {});
            copySchematicState(tempId, newSchem.id);
            deleteSchematicState(tempId);
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
            restoreSelectionForSchematic(newSchem.id);
          } catch (err) {
            setWorkspaceProjects(prevProjects);
            setActiveProjectId(prevActiveProjId);
            setActiveSchematicId(prevActiveSchemId);
            runtime.persistence.setActiveCloudProjectId(prevActiveProjId);
            runtime.persistence.setActiveCloudSchematicId(prevActiveSchemId);
            throw err;
          }
        } finally {
          isSwitchingSchematicRef.current = false;
        }
      }
    },
    [
      authUser,
      activeSchematicId,
      regionPos1,
      regionPos2,
      regionBounds,
      selectedVoxel,
      selectedPlacementId,
      savedRegions,
      activeRegionId,
      workspaceProjects,
      activeProjectId,
      restoreSelectionForSchematic,
      runtime,
    ],
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
      deleteSchematicState(schematicId);
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
            restoreSelectionForSchematic(null);
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
            restoreSelectionForSchematic(next.id);
          } else {
            setActiveSchematicId(null);
            runtime.persistence.setActiveCloudSchematicId(null);
            restoreSelectionForSchematic(null);
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
    [authUser, activeSchematicId, workspaceProjects, activeProjectId, handleSelectSchematic, restoreSelectionForSchematic, runtime],
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
  const [hasRegionClipboard, setHasRegionClipboard] = useState<boolean>(false);
  const [clipboardEntries, setClipboardEntries] = useState<ClipboardEntry[]>(() =>
    runtime.store.session.getClipboardEntries()
  );
  const [activePasteEntryId, setActivePasteEntryId] = useState<string | null>(null);

  const syncClipboardEntries = useCallback(() => {
    const entries = runtime.store.session.getClipboardEntries();
    setClipboardEntries([...entries]);
    setHasRegionClipboard(entries.length > 0);
  }, [runtime]);

  useEffect(() => {
    return runtime.store.session.subscribe(() => {
      syncClipboardEntries();
    });
  }, [runtime, syncClipboardEntries]);

  // Browser -> Cloud Clipboard Reporting
  useEffect(() => {
    if (!authUser) return;
    if (!activeSchematicId || activeSchematicId.startsWith('guest-') || activeSchematicId.startsWith('temp-')) return;
    if (suppressCloudClipboardPushRef.current) {
      suppressCloudClipboardPushRef.current = false;
      return;
    }

    if (clipboardSyncDebounceTimerRef.current) {
      clearTimeout(clipboardSyncDebounceTimerRef.current);
    }

    clipboardSyncDebounceTimerRef.current = setTimeout(() => {
      const nowIso = new Date().toISOString();
      lastSyncedClipboardTimestampRef.current = nowIso;
      const serialized = serializeClipboardEntries(clipboardEntries);
      updateMcpSyncState({
        clipboardState: {
          entries: serialized,
          updatedAt: nowIso,
        },
      }).catch((_err) => {
        // Best-effort network update, catch silently
      });
    }, 400);

    return () => {
      if (clipboardSyncDebounceTimerRef.current) {
        clearTimeout(clipboardSyncDebounceTimerRef.current);
      }
    };
  }, [authUser, activeSchematicId, clipboardEntries]);
  const [atlasTexture, setAtlasTexture] = useState<THREE.Texture | null>(null);

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
      const prevSnap = cloneRegionSnapshot(regionStateRef.current);

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

      const existingNums = prevSnap.savedRegions
        .map((r) => {
          const m = /^R(\d+)$/.exec(r.name);
          return m ? parseInt(m[1]!, 10) : 0;
        })
        .filter((n) => !isNaN(n) && n > 0);
      const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
      const nextNum = Math.max(prevSnap.savedRegions.length + 1, maxNum + 1);
      const newId = `region-${Date.now()}-${nextNum}`;
      const newReg: SavedRegion = {
        id: newId,
        name: `R${nextNum}`,
        pos1: [p1[0], p1[1], p1[2]],
        pos2: [p2[0], p2[1], p2[2]],
        bounds,
      };

      const nextSnap: RegionUndoSnapshot = {
        savedRegions: [...prevSnap.savedRegions, newReg],
        activeRegionId: newId,
        regionBounds: bounds,
        regionPos1: null,
        regionPos2: null,
      };

      applyRegionSnapshot(nextSnap);
      runtime.store.pushCustomUndo({
        label: `Select Region ${newReg.name}`,
        undo: () => applyRegionSnapshot(prevSnap),
        redo: () => applyRegionSnapshot(nextSnap),
      });
    },
    [applyRegionSnapshot, runtime]
  );

  const handleAddNewRegion = useCallback(() => {
    addingNewRegionRef.current = true;
    setRegionPos1(null);
    setRegionPos2(null);
    setRegionBounds(null);
    setRegionPickMode('pos1');
  }, []);

  const handleSelectRegion = useCallback(
    (regionId: string) => {
      const prevSnap = cloneRegionSnapshot(regionStateRef.current);
      if (prevSnap.activeRegionId === regionId) return;
      const target = prevSnap.savedRegions.find((r) => r.id === regionId);
      if (!target) return;

      const nextSnap: RegionUndoSnapshot = {
        savedRegions: prevSnap.savedRegions,
        activeRegionId: target.id,
        regionBounds: target.bounds,
        regionPos1: null,
        regionPos2: null,
      };

      applyRegionSnapshot(nextSnap);
      runtime.store.pushCustomUndo({
        label: `Select Region ${target.name}`,
        undo: () => applyRegionSnapshot(prevSnap),
        redo: () => applyRegionSnapshot(nextSnap),
      });
    },
    [applyRegionSnapshot, runtime]
  );

  const handleRemoveRegion = useCallback(
    (regionId: string) => {
      const prevSnap = cloneRegionSnapshot(regionStateRef.current);
      const target = prevSnap.savedRegions.find((r) => r.id === regionId);
      if (!target) return;

      const remaining = prevSnap.savedRegions.filter((r) => r.id !== regionId);
      let nextActiveId = prevSnap.activeRegionId;
      let nextBounds = prevSnap.regionBounds;

      if (prevSnap.activeRegionId === regionId) {
        const nextActive = remaining[remaining.length - 1] ?? null;
        if (nextActive) {
          nextActiveId = nextActive.id;
          nextBounds = nextActive.bounds;
        } else {
          nextActiveId = null;
          nextBounds = null;
        }
      }

      const nextSnap: RegionUndoSnapshot = {
        savedRegions: remaining,
        activeRegionId: nextActiveId,
        regionBounds: nextBounds,
        regionPos1: null,
        regionPos2: null,
      };

      applyRegionSnapshot(nextSnap);
      runtime.store.pushCustomUndo({
        label: `Remove Region ${target.name}`,
        undo: () => applyRegionSnapshot(prevSnap),
        redo: () => applyRegionSnapshot(nextSnap),
      });
    },
    [applyRegionSnapshot, runtime]
  );

  const handleSetOriginFromSelectedVoxel = useCallback(() => {
    if (!selectedVoxel?.placementId) return;
    const project = runtime.store.getSnapshot().project;
    const placement = project.placements.find((p) => p.id === selectedVoxel.placementId);
    if (!placement) return;
    const newOrigin = computeOriginForWorldBlock(placement, selectedVoxel.position);
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
    if (regionPos2) {
      applyCuboidSelection(pos, regionPos2);
      setRegionPickMode(null);
    } else {
      setRegionPos1(pos);
      setRegionPickMode('pos2');
    }
  }, [selectedVoxel, regionPos2, applyCuboidSelection]);

  const handleSetPos2FromSelectedVoxel = useCallback(() => {
    if (!selectedVoxel) return;
    const pos = selectedVoxel.position;
    if (regionPos1) {
      applyCuboidSelection(regionPos1, pos);
      setRegionPickMode(null);
    } else {
      setRegionPos2(pos);
      setRegionPickMode('pos1');
    }
  }, [selectedVoxel, regionPos1, applyCuboidSelection]);

  const handleClearRegionSelection = useCallback(() => {
    const prevSnap = cloneRegionSnapshot(regionStateRef.current);
    if (
      prevSnap.savedRegions.length === 0 &&
      !prevSnap.regionBounds &&
      !prevSnap.regionPos1 &&
      !prevSnap.regionPos2
    ) {
      return;
    }

    const nextSnap: RegionUndoSnapshot = {
      savedRegions: [],
      activeRegionId: null,
      regionBounds: null,
      regionPos1: null,
      regionPos2: null,
    };

    applyRegionSnapshot(nextSnap);
    runtime.store.pushCustomUndo({
      label: 'Clear Region Selection',
      undo: () => applyRegionSnapshot(prevSnap),
      redo: () => applyRegionSnapshot(nextSnap),
    });
  }, [applyRegionSnapshot, runtime]);

  const handleDeselectActiveRegion = useCallback(() => {
    if (activeRegionId) {
      handleRemoveRegion(activeRegionId);
    } else {
      handleClearRegionSelection();
    }
  }, [activeRegionId, handleRemoveRegion, handleClearRegionSelection]);

  const handleCancelRegionPick = useCallback(() => {
    setRegionPickMode(null);
    setRegionPos1(null);
    setRegionPos2(null);
    if (addingNewRegionRef.current) {
      addingNewRegionRef.current = false;
      const currentActive = savedRegions.find((r) => r.id === activeRegionId);
      if (currentActive) {
        setRegionBounds(currentActive.bounds);
      }
    }
  }, [savedRegions, activeRegionId]);

  const handleRegionFill = useCallback(
    (blockId: string) => {
      if (!regionBounds) return;
      const block = toBlockStateId(blockId);
      void runtime.store.execute({
        type: 'region:fill',
        bounds: regionBounds,
        block,
      });
    },
    [regionBounds, runtime]
  );

  const handleRegionReplace = useCallback(
    (fromId: string, toId: string) => {
      if (!regionBounds) return;
      const parsedFrom = toBlockStateId(fromId);
      const replacement = toBlockStateId(toId);
      const hasProps = Object.keys(parsedFrom.props).length > 0;
      const matcher = hasProps
        ? { mode: 'exact' as const, blockId: parsedFrom.id, properties: parsedFrom.props }
        : { mode: 'block-id-only' as const, blockId: parsedFrom.id };
      void runtime.store.execute({
        type: 'region:replace',
        bounds: regionBounds,
        matcher,
        replacement,
        preserveProperties: false,
      });
    },
    [regionBounds, runtime]
  );

  const handleRegionWalls = useCallback(
    (blockId: string) => {
      if (!regionBounds) return;
      const wallBlock = toBlockStateId(blockId);
      void runtime.store.execute({
        type: 'region:walls',
        bounds: regionBounds,
        wallBlock,
        fillInterior: null,
        includeTop: true,
        includeBottom: true,
      });
    },
    [regionBounds, runtime]
  );

  const handleRegionHollow = useCallback(() => {
    if (!regionBounds) return;
    void runtime.store.execute({
      type: 'region:hollow',
      bounds: regionBounds,
      shellThickness: 1,
    });
  }, [regionBounds, runtime]);

  const handleRegionCopy = useCallback(() => {
    if (!regionBounds) return;
    void runtime.store.execute({
      type: 'clipboard:copy',
      selection: {
        kind: 'cuboid',
        bounds: regionBounds,
      },
      scope: 'effective-composite',
    }).then((res) => {
      if (res.ok) {
        syncClipboardEntries();
      }
    });
  }, [regionBounds, runtime, syncClipboardEntries]);

  const handleRegionCut = useCallback(() => {
    if (!regionBounds) return;
    void runtime.store.execute({
      type: 'clipboard:cut',
      selection: {
        kind: 'cuboid',
        bounds: regionBounds,
      },
    }).then((res) => {
      if (res.ok) {
        syncClipboardEntries();
      }
    });
  }, [regionBounds, runtime, syncClipboardEntries]);

  const handleRegionPaste = useCallback(() => {
    if (!regionBounds) return;
    void runtime.store.execute({
      type: 'clipboard:paste',
      targetPosition: regionBounds.min,
      entryId: activePasteEntryId ?? undefined,
    });
  }, [regionBounds, runtime, activePasteEntryId]);

  const handleRegionDelete = useCallback(() => {
    if (!regionBounds) return;
    void runtime.store.execute({
      type: 'region:delete',
      bounds: regionBounds,
    });
  }, [regionBounds, runtime]);

  const handlePasteAtTarget = useCallback(
    (targetPos: Vec3i, entryId?: string) => {
      const idToPaste = entryId ?? activePasteEntryId ?? undefined;
      void runtime.store
        .execute({
          type: 'clipboard:paste',
          targetPosition: targetPos,
          entryId: idToPaste,
        })
        .then((res) => {
          if (res.ok) {
            setActivePasteEntryId(null);
          }
        });
    },
    [runtime, activePasteEntryId]
  );

  const handleDeleteClipboardEntry = useCallback(
    (entryId: string) => {
      void runtime.store
        .execute({
          type: 'clipboard:delete',
          entryId,
        })
        .then(() => {
          if (activePasteEntryId === entryId) {
            setActivePasteEntryId(null);
          }
          syncClipboardEntries();
        });
    },
    [runtime, activePasteEntryId, syncClipboardEntries]
  );

  const handleClearClipboard = useCallback(() => {
    void runtime.store
      .execute({
        type: 'clipboard:clear',
      })
      .then(() => {
        setActivePasteEntryId(null);
        syncClipboardEntries();
      });
  }, [runtime, syncClipboardEntries]);

  const handleVoxelClick = useCallback(
    (hit: VoxelHit, event: React.MouseEvent) => {
      if (runtime.importWorkflow.getState() === 'ghost-preview') {
        void runtime.importWorkflow.confirmPlace();
        return;
      }

      if (regionPickMode === 'pos2' && hit) {
        if (regionPos1) {
          applyCuboidSelection(regionPos1, hit.position);
        } else {
          setRegionPos2(hit.position);
        }
        setRegionPickMode(null);
        setSelectedVoxel(hit);
        return;
      }

      if (regionPickMode === 'pos1' && hit) {
        if (regionPos2) {
          applyCuboidSelection(hit.position, regionPos2);
        } else {
          setRegionPos1(hit.position);
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
        onOpenMcpHub={() => setIsMcpModalOpen(true)}
        mcpLiveSyncActive={Boolean(authUser && mcpLiveSyncEnabled)}
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
              savedRegions={savedRegions}
              activeRegionId={activeRegionId}
              onSelectRegion={handleSelectRegion}
              onAddNewRegion={handleAddNewRegion}
              onRemoveRegion={handleRemoveRegion}
              onDeselectActiveRegion={handleDeselectActiveRegion}
              clipboardEntries={clipboardEntries}
              activePasteEntryId={activePasteEntryId}
              onSelectPasteEntry={setActivePasteEntryId}
              onDeleteClipboardEntry={handleDeleteClipboardEntry}
              onClearClipboard={handleClearClipboard}
              onPasteAtTarget={handlePasteAtTarget}
              onSetPos1FromSelectedVoxel={handleSetPos1FromSelectedVoxel}
              onSetPos2FromSelectedVoxel={handleSetPos2FromSelectedVoxel}
              onClearRegionSelection={handleClearRegionSelection}
              onCancelRegionPick={handleCancelRegionPick}
              onRegionFill={handleRegionFill}
              onRegionReplace={handleRegionReplace}
              onRegionWalls={handleRegionWalls}
              onRegionHollow={handleRegionHollow}
              onRegionCopy={handleRegionCopy}
              onRegionCut={handleRegionCut}
              onRegionPaste={handleRegionPaste}
              onRegionDelete={handleRegionDelete}
              hasRegionClipboard={hasRegionClipboard}
              defaultBlockId={selectedVoxel?.state?.id || 'minecraft:stone'}
            />
          </div>
        }
        tabSlots={{
          assets: <AssetLoadPanel manager={runtime.assetManager} />,
          materials: <MaterialListPanel controller={runtime.materialListController} />,
          conflicts: <ConflictsPanel controller={runtime.conflictsController} onOpenBake={() => setIsBakeOpen(true)} />,
          'agent-log': (
            <AgentLogPanel
              client={runtime.mcpClient}
              session={runtime.store.session}
              cloudLogs={cloudMcpLogs}
              onOpenMcpHub={() => setIsMcpModalOpen(true)}
              liveSyncEnabled={mcpLiveSyncEnabled}
            />
          ),
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
                const nextSchemId = foundProj.schematics[0].id;
                setActiveSchematicId(nextSchemId);
                runtime.persistence.setActiveCloudSchematicId(nextSchemId);
                restoreSelectionForSchematic(nextSchemId);
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
          restoreSelectionForSchematic(cloudSchem.id);
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

      {/* Account MCP & AI Builder Hub Modal */}
      <McpConnectModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        authUser={authUser}
        onRequestSignIn={() => {
          setIsMcpModalOpen(false);
          setPendingAuthAction(null);
          setIsLoginModalOpen(true);
        }}
        activeProjectId={activeProjectId}
        activeSchematicId={activeSchematicId}
        defaultPosition={
          selectedVoxel
            ? [selectedVoxel.position[0], selectedVoxel.position[1], selectedVoxel.position[2]]
            : regionBounds
            ? [regionBounds.min[0], regionBounds.min[1], regionBounds.min[2]]
            : [0, 64, 0]
        }
        onMcpMutationComplete={async () => {
          await syncFromCloudMcp(true);
        }}
        liveSyncEnabled={mcpLiveSyncEnabled}
        onToggleLiveSync={setMcpLiveSyncEnabled}
        onLocalGenerateStructure={(spec) => {
          const res = generateStructure(runtime.store.session, {
            kind: spec.structure as any,
            style: spec.style as any,
            position: spec.position,
            placementName: spec.name,
          });
          return { placementId: res.placementId, blockCount: res.changedCells };
        }}
        onLocalGenerateShape={(spec) => {
          const res = generateShape(runtime.store.session, {
            kind: spec.shape as any,
            block: spec.block,
            center: spec.position,
            radius: spec.radius,
            height: spec.height,
            hollow: spec.hollow,
            placementName: spec.name,
          });
          return { placementId: res.placementId, blockCount: res.changedCells };
        }}
      />
    </div>
  );
}
