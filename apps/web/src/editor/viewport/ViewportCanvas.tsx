// apps/web/src/editor/viewport/ViewportCanvas.tsx
// Three.js interactive viewport canvas with orbit/fly controls, overlays, HUD, and WebGL context-loss recovery (Slice E3.2).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorSession, SessionChangeEvent } from '@easyschemedit/operations';
import type { AssetSource, TextureUvInfo } from '@easyschemedit/renderer';
import type { Bounds3i, Vec3i } from '@easyschemedit/domain';

import { ChunkSceneManager, type ChunkSceneStats } from './chunk-mesh-builder.ts';
import { ViewportCameraController, type CameraMode, type CameraPreset } from './camera-controller.ts';
import { raycastVoxels, createProjectBlockLookup, type VoxelHit } from './voxel-raycast.ts';
import {
  buildPlacementBoundsGroup,
  buildOriginMarkersGroup,
  buildSelectionBoxMesh,
  buildGridBordersGroup,
  buildConflictOverlayGroup,
  type GridBordersPrefs,
} from './overlays-builder.ts';

export interface GhostPreviewSpec {
  bounds: Bounds3i;
  position: Vec3i;
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
}

const EMPTY_STRING_SET = new Set<string>();

const TRANSFORM_OR_METADATA_EVENT_KINDS = new Set<string>([
  'transform',
  'move',
  'rotate',
  'mirror',
  'visible',
  'lock',
  'select',
  'metadata',
  'placement:transform',
  'placement:set-visible',
  'placement:set-locked',
]);

function isTransformOrMetadataEvent(kind: string): boolean {
  if (TRANSFORM_OR_METADATA_EVENT_KINDS.has(kind)) return true;
  const lower = kind.toLowerCase();
  return (
    lower.includes('transform') ||
    lower.includes('move') ||
    lower.includes('rotate') ||
    lower.includes('mirror') ||
    lower.includes('visible') ||
    lower.includes('lock') ||
    lower.includes('select') ||
    lower.includes('metadata')
  );
}

export interface ViewportCanvasProps {
  session: EditorSession;
  atlasTexture?: THREE.Texture | null;
  assetSource?: AssetSource;
  uvLookup?: (tex: string) => TextureUvInfo | undefined;
  activeTool?: string;
  selectedTool?: string;
  onSelectPlacement?: (id: string | null) => void;
  ghostPreview?: GhostPreviewSpec | null;
  onVoxelClick?: (hit: VoxelHit, event: React.MouseEvent) => void;
  onVoxelHover?: (hit: VoxelHit | null) => void;
  conflictOverlayPositions?: {
    sameState: Vec3i[];
    stateConflict: Vec3i[];
  };
  selectedPlacementIds?: Set<string>;
}

export const ViewportCanvas: React.FC<ViewportCanvasProps> = ({
  session,
  atlasTexture = null,
  assetSource,
  uvLookup,
  activeTool = 'select',
  selectedTool,
  onSelectPlacement,
  ghostPreview = null,
  onVoxelClick,
  onVoxelHover,
  conflictOverlayPositions,
  selectedPlacementIds = EMPTY_STRING_SET,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Three.js and controller refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const chunkManagerRef = useRef<ChunkSceneManager | null>(null);
  const cameraCtrlRef = useRef<ViewportCameraController | null>(null);

  // Transform gizmo refs
  const transformCtrlRef = useRef<TransformControls | null>(null);
  const gizmoProxyRef = useRef<THREE.Object3D | null>(null);
  const isGizmoDraggingRef = useRef<boolean>(false);
  const dragStartPlacementIdRef = useRef<string | null>(null);
  const dragStartTranslationRef = useRef<[number, number, number]>([0, 0, 0]);
  const dragStartRotationYRef = useRef<number>(0);
  const dragStartGizmoPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const dragStartGizmoRotRef = useRef<number>(0);
  const onSelectPlacementRef = useRef(onSelectPlacement);
  onSelectPlacementRef.current = onSelectPlacement;
  const selectedToolRef = useRef(selectedTool);
  selectedToolRef.current = selectedTool;
  const shiftKeyRef = useRef<boolean>(false);
  const [sessionRevision, setSessionRevision] = useState<number>(() => session.peekProject().revision);

  // Overlay root groups
  const placementBoundsGroupRef = useRef<THREE.Group | null>(null);
  const originMarkersGroupRef = useRef<THREE.Group | null>(null);
  const selectionGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const conflictGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);

  // Prop refs for stable callbacks
  const assetSourceRef = useRef(assetSource);
  assetSourceRef.current = assetSource;
  const uvLookupRef = useRef(uvLookup);
  uvLookupRef.current = uvLookup;
  const selectedPlacementIdsRef = useRef(selectedPlacementIds);
  selectedPlacementIdsRef.current = selectedPlacementIds;
  const gridPrefsRef = useRef<GridBordersPrefs>({
    chunkBorders: false,
    sectionBorders: false,
    blockBorders: false,
  });
  const conflictOverlayPositionsRef = useRef(conflictOverlayPositions);
  conflictOverlayPositionsRef.current = conflictOverlayPositions;
  const ghostPreviewRef = useRef(ghostPreview);
  ghostPreviewRef.current = ghostPreview;
  const prevPlacementCountRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // UI state
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [gridPrefs, setGridPrefs] = useState<GridBordersPrefs>({
    chunkBorders: false,
    sectionBorders: false,
    blockBorders: false,
  });
  gridPrefsRef.current = gridPrefs;
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);
  const [stats, setStats] = useState<ChunkSceneStats>({
    meshCount: 0,
    chunkCount: 0,
    placementCount: 0,
    triangleCount: 0,
  });
  const [hoveredVoxel, setHoveredVoxel] = useState<VoxelHit | null>(null);

  // Animation frame & input tracking
  const animFrameIdRef = useRef<number | null>(null);
  const chunkSyncRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragButtonRef = useRef<number>(0);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const keysDownRef = useRef<Set<string>>(new Set());

  // Raycaster helper vectors
  const mouseRaycaster = useRef(new THREE.Raycaster());
  const mouseNdc = useRef(new THREE.Vector2());

  // --------------------------------------------------------------------------
  // Update Overlays
  // --------------------------------------------------------------------------
  const updateOverlays = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const project = session.peekProject();
    const selIds = selectedPlacementIdsRef.current;
    const gPrefs = gridPrefsRef.current;
    const cPos = conflictOverlayPositionsRef.current;
    const gPrev = ghostPreviewRef.current;

    // 1. Placement bounds
    if (placementBoundsGroupRef.current) scene.remove(placementBoundsGroupRef.current);
    placementBoundsGroupRef.current = buildPlacementBoundsGroup(
      project.placements,
      selIds
    );
    scene.add(placementBoundsGroupRef.current);

    // 2. Origin markers
    if (originMarkersGroupRef.current) scene.remove(originMarkersGroupRef.current);
    originMarkersGroupRef.current = buildOriginMarkersGroup(project.placements);
    scene.add(originMarkersGroupRef.current);

    // 3. Selection bounds
    const selection = (session as any).getSelection?.() ?? null;
    const selBounds = selection?.bounds ?? null;
    if (selectionGroupRef.current) scene.remove(selectionGroupRef.current);
    selectionGroupRef.current = buildSelectionBoxMesh(selBounds);
    scene.add(selectionGroupRef.current);

    // 4. Grid borders
    let unionBounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
    if (project.placements.length > 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of project.placements) {
        minX = Math.min(minX, p.volume.bounds.min[0] + p.transform.translation[0]);
        minY = Math.min(minY, p.volume.bounds.min[1] + p.transform.translation[1]);
        minZ = Math.min(minZ, p.volume.bounds.min[2] + p.transform.translation[2]);
        maxX = Math.max(maxX, p.volume.bounds.maxExclusive[0] + p.transform.translation[0]);
        maxY = Math.max(maxY, p.volume.bounds.maxExclusive[1] + p.transform.translation[1]);
        maxZ = Math.max(maxZ, p.volume.bounds.maxExclusive[2] + p.transform.translation[2]);
      }
      if (Number.isFinite(minX)) {
        unionBounds = {
          min: [minX, minY, minZ],
          maxExclusive: [maxX, maxY, maxZ],
        };
      }
    }
    if (gridGroupRef.current) scene.remove(gridGroupRef.current);
    gridGroupRef.current = buildGridBordersGroup(unionBounds, gPrefs);
    scene.add(gridGroupRef.current);

    // 5. Conflicts
    if (conflictGroupRef.current) scene.remove(conflictGroupRef.current);
    const confGroup = new THREE.Group();
    confGroup.name = 'conflicts-root';
    if (cPos?.sameState?.length) {
      confGroup.add(buildConflictOverlayGroup(cPos.sameState, 0x00e5ff));
    }
    if (cPos?.stateConflict?.length) {
      confGroup.add(buildConflictOverlayGroup(cPos.stateConflict, 0xff3344));
    }
    conflictGroupRef.current = confGroup;
    scene.add(conflictGroupRef.current);

    // 6. Ghost preview
    if (ghostGroupRef.current) scene.remove(ghostGroupRef.current);
    const ghost = new THREE.Group();
    ghost.name = 'ghost-preview';
    if (gPrev) {
      const { bounds, position, rotationY, mirror } = gPrev;
      const ghostBox = buildSelectionBoxMesh(bounds);
      ghostBox.position.set(position[0], position[1], position[2]);
      ghostBox.rotation.y = (rotationY * Math.PI) / 180;
      ghostBox.scale.set(mirror === 'x' ? -1 : 1, 1, mirror === 'z' ? -1 : 1);
      ghost.add(ghostBox);
    }
    ghostGroupRef.current = ghost;
    scene.add(ghostGroupRef.current);
  }, [session]);

  // --------------------------------------------------------------------------
  // Incremental Chunk Sync (rAF Time-Sliced)
  // --------------------------------------------------------------------------
  const scheduleChunkSync = useCallback(
    (dirtyPlacementIds?: string[], dirtyChunkKeys?: string[]) => {
      const manager = chunkManagerRef.current;
      if (!manager) return;

      if (chunkSyncRafRef.current !== null) {
        cancelAnimationFrame(chunkSyncRafRef.current);
        chunkSyncRafRef.current = null;
      }

      const project = session.peekProject();

      let dirtyChunkKeysByPlacement: Map<string, string[]> | undefined;
      if (
        dirtyChunkKeys &&
        dirtyChunkKeys.length > 0 &&
        dirtyPlacementIds &&
        dirtyPlacementIds.length > 0
      ) {
        dirtyChunkKeysByPlacement = new Map();
        for (const pId of dirtyPlacementIds) {
          dirtyChunkKeysByPlacement.set(pId, dirtyChunkKeys);
        }
      }

      manager.queueProjectSync(project, {
        assetSource: assetSourceRef.current,
        uvLookup: uvLookupRef.current,
        dirtyChunkKeysByPlacement,
      });

      const hasMore = manager.processChunkQueue(10);
      setStats(manager.getStats());

      if (prevPlacementCountRef.current === 0 && project.placements.length > 0) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const p of project.placements) {
          minX = Math.min(minX, p.volume.bounds.min[0] + p.transform.translation[0]);
          minY = Math.min(minY, p.volume.bounds.min[1] + p.transform.translation[1]);
          minZ = Math.min(minZ, p.volume.bounds.min[2] + p.transform.translation[2]);
          maxX = Math.max(maxX, p.volume.bounds.maxExclusive[0] + p.transform.translation[0]);
          maxY = Math.max(maxY, p.volume.bounds.maxExclusive[1] + p.transform.translation[1]);
          maxZ = Math.max(maxZ, p.volume.bounds.maxExclusive[2] + p.transform.translation[2]);
        }
        if (Number.isFinite(minX) && cameraCtrlRef.current) {
          cameraCtrlRef.current.frameBounds({
            min: [minX, minY, minZ],
            maxExclusive: [maxX, maxY, maxZ],
          });
          if (cameraRef.current) {
            cameraCtrlRef.current.syncToThreeCamera(cameraRef.current);
          }
        }
      }
      prevPlacementCountRef.current = project.placements.length;

      if (hasMore) {
        const stepQueue = () => {
          const stillMore = manager.processChunkQueue(10);
          setStats(manager.getStats());
          if (stillMore) {
            chunkSyncRafRef.current = requestAnimationFrame(stepQueue);
          } else {
            chunkSyncRafRef.current = null;
          }
        };
        chunkSyncRafRef.current = requestAnimationFrame(stepQueue);
      }
    },
    [session]
  );

  const scheduleChunkSyncRef = useRef(scheduleChunkSync);
  scheduleChunkSyncRef.current = scheduleChunkSync;

  // Update atlas texture on manager when prop changes
  useEffect(() => {
    if (chunkManagerRef.current) {
      chunkManagerRef.current.setAtlasTexture(atlasTexture);
    }
  }, [atlasTexture]);

  // Separate useEffects for prop updates without recreating WebGL context
  useEffect(() => {
    updateOverlays();
  }, [updateOverlays, selectedPlacementIds, gridPrefs, conflictOverlayPositions, ghostPreview]);

  useEffect(() => {
    scheduleChunkSync();
  }, [scheduleChunkSync, assetSource, uvLookup, atlasTexture]);

  // --------------------------------------------------------------------------
  // Main Three.js Lifecycle
  // --------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x181824);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    cameraRef.current = camera;

    // Camera controller
    const cameraCtrl = new ViewportCameraController({
      mode: cameraMode,
      target: [0, 8, 0],
      distance: 35,
      yaw: Math.PI / 4,
      pitch: Math.PI / 6,
    });
    cameraCtrlRef.current = cameraCtrl;
    cameraCtrl.syncToThreeCamera(camera);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(60, 100, 40);
    const dirLight2 = new THREE.DirectionalLight(0xaabbcc, 0.35);
    dirLight2.position.set(-50, -40, -50);
    scene.add(ambientLight, dirLight1, dirLight2);

    // Ground helper
    const groundGrid = new THREE.GridHelper(128, 128, 0x444466, 0x252538);
    groundGrid.position.y = -0.01;
    scene.add(groundGrid);

    // Chunk Manager
    const chunkManager = new ChunkSceneManager();
    chunkManagerRef.current = chunkManager;
    scene.add(chunkManager.rootGroup);

    // Transform Controls & Gizmo Proxy (Slice E3.2, three@0.187.0)
    const transformCtrl = new TransformControls(camera, renderer.domElement);
    transformCtrl.setTranslationSnap(1);
    transformCtrl.setRotationSnap(Math.PI / 2);
    scene.add(transformCtrl.getHelper());
    transformCtrlRef.current = transformCtrl;

    const gizmoProxy = new THREE.Object3D();
    gizmoProxy.name = 'viewport-gizmo-proxy';
    scene.add(gizmoProxy);
    gizmoProxyRef.current = gizmoProxy;

    transformCtrl.addEventListener('dragging-changed', (event: any) => {
      const isDragging = Boolean(event.value);
      isGizmoDraggingRef.current = isDragging;

      if (isDragging) {
        const selIds = selectedPlacementIdsRef.current;
        if (selIds && selIds.size === 1) {
          const pId = Array.from(selIds)[0]!;
          const p = session.peekProject().placements.find((pl) => pl.id === pId);
          if (p && !p.locked) {
            dragStartPlacementIdRef.current = pId;
            dragStartTranslationRef.current = [...p.transform.translation];
            dragStartRotationYRef.current = p.transform.rotationY;
            dragStartGizmoPosRef.current.copy(gizmoProxy.position);
            dragStartGizmoRotRef.current = gizmoProxy.rotation.y;
          }
        }
      } else {
        const placementId = dragStartPlacementIdRef.current;
        if (placementId) {
          const p = session.peekProject().placements.find((pl) => pl.id === placementId);
          if (p && !p.locked) {
            const tool = selectedToolRef.current ?? 'move';
            if (tool === 'rotate') {
              const deltaRotRad = gizmoProxy.rotation.y - dragStartGizmoRotRef.current;
              const deltaRotDeg = Math.round(((deltaRotRad * 180) / Math.PI) / 90) * 90;
              let finalRotY = ((dragStartRotationYRef.current + deltaRotDeg) % 360 + 360) % 360;
              finalRotY = (Math.round(finalRotY / 90) * 90) % 360;

              if (finalRotY !== dragStartRotationYRef.current) {
                session.execute({
                  type: 'placement:transform',
                  placementId,
                  translation: dragStartTranslationRef.current,
                  rotationY: finalRotY as 0 | 90 | 180 | 270,
                });
              } else {
                chunkManager.previewPlacementTransform(
                  placementId,
                  dragStartTranslationRef.current,
                  dragStartRotationYRef.current
                );
              }
            } else {
              const isShift =
                shiftKeyRef.current ||
                keysDownRef.current.has('ShiftLeft') ||
                keysDownRef.current.has('ShiftRight');
              const snap = isShift ? 16 : 1;
              const rawDx = gizmoProxy.position.x - dragStartGizmoPosRef.current.x;
              const rawDy = gizmoProxy.position.y - dragStartGizmoPosRef.current.y;
              const rawDz = gizmoProxy.position.z - dragStartGizmoPosRef.current.z;

              const dx = Math.round(rawDx / snap) * snap;
              const dy = Math.round(rawDy / snap) * snap;
              const dz = Math.round(rawDz / snap) * snap;

              if (dx !== 0 || dy !== 0 || dz !== 0) {
                const finalTranslation: [number, number, number] = [
                  dragStartTranslationRef.current[0] + dx,
                  dragStartTranslationRef.current[1] + dy,
                  dragStartTranslationRef.current[2] + dz,
                ];
                session.execute({
                  type: 'placement:transform',
                  placementId,
                  translation: finalTranslation,
                  rotationY: dragStartRotationYRef.current as 0 | 90 | 180 | 270,
                });
              } else {
                chunkManager.previewPlacementTransform(
                  placementId,
                  dragStartTranslationRef.current,
                  dragStartRotationYRef.current
                );
              }
            }
          }
          dragStartPlacementIdRef.current = null;
        }
      }
    });

    transformCtrl.addEventListener('objectChange', () => {
      if (!isGizmoDraggingRef.current) return;
      const placementId = dragStartPlacementIdRef.current;
      if (!placementId) return;

      const tool = selectedToolRef.current ?? 'move';
      if (tool === 'rotate') {
        const deltaRotRad = gizmoProxy.rotation.y - dragStartGizmoRotRef.current;
        const deltaRotDeg = (deltaRotRad * 180) / Math.PI;
        const previewRot = dragStartRotationYRef.current + deltaRotDeg;
        chunkManager.previewPlacementTransform(
          placementId,
          dragStartTranslationRef.current,
          previewRot
        );
      } else {
        const dx = gizmoProxy.position.x - dragStartGizmoPosRef.current.x;
        const dy = gizmoProxy.position.y - dragStartGizmoPosRef.current.y;
        const dz = gizmoProxy.position.z - dragStartGizmoPosRef.current.z;
        const previewPos: [number, number, number] = [
          dragStartTranslationRef.current[0] + dx,
          dragStartTranslationRef.current[1] + dy,
          dragStartTranslationRef.current[2] + dz,
        ];
        chunkManager.previewPlacementTransform(
          placementId,
          previewPos,
          dragStartRotationYRef.current
        );
      }
    });

    // Initial project synchronization
    scheduleChunkSync();
    updateOverlays();

    // Auto-frame initial project if placements exist
    const project = session.peekProject();
    if (project.placements.length > 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of project.placements) {
        minX = Math.min(minX, p.volume.bounds.min[0] + p.transform.translation[0]);
        minY = Math.min(minY, p.volume.bounds.min[1] + p.transform.translation[1]);
        minZ = Math.min(minZ, p.volume.bounds.min[2] + p.transform.translation[2]);
        maxX = Math.max(maxX, p.volume.bounds.maxExclusive[0] + p.transform.translation[0]);
        maxY = Math.max(maxY, p.volume.bounds.maxExclusive[1] + p.transform.translation[1]);
        maxZ = Math.max(maxZ, p.volume.bounds.maxExclusive[2] + p.transform.translation[2]);
      }
      if (Number.isFinite(minX)) {
        cameraCtrl.frameBounds({
          min: [minX, minY, minZ],
          maxExclusive: [maxX, maxY, maxZ],
        });
        cameraCtrl.syncToThreeCamera(camera);
      }
    }

    // Subscribe to session changes
    const unsubscribeSession = session.subscribe((event: SessionChangeEvent) => {
      setSessionRevision(session.peekProject().revision);
      if (isTransformOrMetadataEvent(event.kind)) {
        chunkManager.updatePlacementTransforms(session.peekProject());
        updateOverlays();
      } else {
        scheduleChunkSyncRef.current(event.placementIds, event.chunkKeys);
        updateOverlays();
      }
    });

    // WebGL context loss handlers
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };

    const handleContextRestored = () => {
      setContextLost(false);
      scheduleChunkSyncRef.current();
      updateOverlays();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Render loop
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Fly navigation keys
      if (cameraCtrl.getMode() === 'fly') {
        const keys = keysDownRef.current;
        let forward = 0;
        let right = 0;
        let up = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;
        if (keys.has('Space')) up += 1;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) up -= 1;

        if (forward !== 0 || right !== 0 || up !== 0) {
          cameraCtrl.moveFly(forward, right, up, dt);
        }
      }

      cameraCtrl.syncToThreeCamera(camera);
      renderer.render(scene, camera);

      animFrameIdRef.current = requestAnimationFrame(animate);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (chunkSyncRafRef.current !== null) {
        cancelAnimationFrame(chunkSyncRafRef.current);
        chunkSyncRafRef.current = null;
      }
      resizeObserver.disconnect();
      unsubscribeSession();

      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      if (transformCtrlRef.current) {
        scene.remove(transformCtrlRef.current.getHelper());
        transformCtrlRef.current.dispose();
        transformCtrlRef.current = null;
      }
      if (gizmoProxyRef.current) {
        scene.remove(gizmoProxyRef.current);
        gizmoProxyRef.current = null;
      }

      chunkManager.dispose();
      renderer.dispose();
    };
  }, [session]);

  // --------------------------------------------------------------------------
  // Synchronize TransformControls attachment to single selected placement
  // --------------------------------------------------------------------------
  useEffect(() => {
    const transformCtrl = transformCtrlRef.current;
    const gizmoProxy = gizmoProxyRef.current;
    if (!transformCtrl || !gizmoProxy) return;

    if (isGizmoDraggingRef.current) return;

    const tool = selectedTool ?? activeTool;
    if (selectedPlacementIds?.size === 1 && (tool === 'move' || tool === 'rotate')) {
      const pId = Array.from(selectedPlacementIds)[0]!;
      const placement = session.peekProject().placements.find((p) => p.id === pId);
      if (placement && !placement.locked) {
        const [tx, ty, tz] = placement.transform.translation;
        const { min, maxExclusive } = placement.volume.bounds;
        const cx = tx + (min[0] + maxExclusive[0]) / 2;
        const cy = ty + (min[1] + maxExclusive[1]) / 2;
        const cz = tz + (min[2] + maxExclusive[2]) / 2;

        gizmoProxy.position.set(cx, cy, cz);
        gizmoProxy.rotation.set(0, (placement.transform.rotationY * Math.PI) / 180, 0);
        gizmoProxy.scale.set(1, 1, 1);

        transformCtrl.setMode(tool === 'rotate' ? 'rotate' : 'translate');
        transformCtrl.showY = true;
        transformCtrl.showX = true;
        transformCtrl.showZ = true;
        transformCtrl.attach(gizmoProxy);
        return;
      }
    }

    if (transformCtrl.object) {
      transformCtrl.detach();
    }
  }, [selectedPlacementIds, selectedTool, activeTool, sessionRevision, session]);

  // --------------------------------------------------------------------------
  // Mouse and Keyboard Event Handlers
  // --------------------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isGizmoDraggingRef.current || (transformCtrlRef.current && (transformCtrlRef.current as any).axis)) {
      return;
    }
    isDraggingRef.current = true;
    dragButtonRef.current = e.button;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const performRaycast = useCallback(
    (clientX: number, clientY: number): VoxelHit | null => {
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return null;

      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;

      mouseNdc.current.set(x, y);
      mouseRaycaster.current.setFromCamera(mouseNdc.current, camera);

      const rayOrigin: [number, number, number] = [
        mouseRaycaster.current.ray.origin.x,
        mouseRaycaster.current.ray.origin.y,
        mouseRaycaster.current.ray.origin.z,
      ];
      const rayDir: [number, number, number] = [
        mouseRaycaster.current.ray.direction.x,
        mouseRaycaster.current.ray.direction.y,
        mouseRaycaster.current.ray.direction.z,
      ];

      const project = session.peekProject();
      const blockLookup = createProjectBlockLookup(project);

      const voxelHit = raycastVoxels(rayOrigin, rayDir, 256, blockLookup);
      if (voxelHit) return voxelHit;

      if (Math.abs(rayDir[1]) > 1e-5) {
        const t = -rayOrigin[1] / rayDir[1];
        if (t > 0 && t <= 512) {
          const gx = Math.floor(rayOrigin[0] + rayDir[0] * t);
          const gz = Math.floor(rayOrigin[2] + rayDir[2] * t);
          return {
            position: [gx, 0, gz],
            normal: [0, 1, 0],
            adjacentPosition: [gx, 0, gz],
            distance: t,
            state: { id: 'minecraft:air', props: {} } as any,
            placementId: null,
          };
        }
      }
      return null;
    },
    [session]
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cameraCtrl = cameraCtrlRef.current;

    if (isDraggingRef.current && cameraCtrl) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const isOrbitPan = dragButtonRef.current === 2 || (dragButtonRef.current === 0 && e.shiftKey);

      if (cameraCtrl.getMode() === 'orbit') {
        if (isOrbitPan) {
          const panScale = cameraCtrl.getDistance() * 0.0015;
          cameraCtrl.pan(-dx * panScale, dy * panScale);
        } else {
          cameraCtrl.orbit(-dx * 0.006, dy * 0.006);
        }
      } else {
        // Fly look
        cameraCtrl.lookFly(-dx * 0.004, -dy * 0.004);
      }
    } else {
      if (transformCtrlRef.current && (transformCtrlRef.current as any).axis) {
        setHoveredVoxel(null);
        onVoxelHover?.(null);
        return;
      }
      // Hover raycasting
      const hit = performRaycast(e.clientX, e.clientY);
      setHoveredVoxel(hit);
      onVoxelHover?.(hit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if pointer was not captured
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cameraCtrl = cameraCtrlRef.current;
    if (!cameraCtrl) return;

    if (cameraCtrl.getMode() === 'orbit') {
      cameraCtrl.zoom(-e.deltaY);
    } else {
      // Adjust fly speed
      cameraCtrl.adjustFlySpeed(e.deltaY > 0 ? -2 : 2);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isGizmoDraggingRef.current || (transformCtrlRef.current && (transformCtrlRef.current as any).axis)) {
      return;
    }
    const dist = Math.hypot(
      e.clientX - pointerDownPosRef.current.x,
      e.clientY - pointerDownPosRef.current.y
    );
    if (dist > 5) return;

    const hit = performRaycast(e.clientX, e.clientY);
    if (hit) {
      onVoxelClick?.(hit, e);
    }
  };

  // Keyboard handlers for Fly mode, placement nudging, deletion, and side-by-side duplication
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current.add(e.code);
      shiftKeyRef.current = e.shiftKey;

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

      const selIds = selectedPlacementIdsRef.current;
      if (!selIds || selIds.size !== 1) return;

      const placementId = Array.from(selIds)[0]!;
      const project = session.peekProject();
      const placement = project.placements.find((p) => p.id === placementId);
      if (!placement) return;

      const step = e.shiftKey ? 16 : 1;
      const [tx, ty, tz] = placement.transform.translation;

      if (e.key === 'ArrowLeft') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx - step, ty, tz],
          });
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx + step, ty, tz],
          });
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx, ty, tz - step],
          });
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx, ty, tz + step],
          });
        }
        return;
      }

      if (e.key === 'PageUp') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx, ty + step, tz],
          });
        }
        return;
      }

      if (e.key === 'PageDown') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:transform',
            placementId,
            translation: [tx, ty - step, tz],
          });
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!placement.locked) {
          e.preventDefault();
          session.execute({
            type: 'placement:delete',
            placementId,
          });
          onSelectPlacementRef.current?.(null);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (!placement.locked) {
          e.preventDefault();
          const width = placement.volume.bounds.maxExclusive[0] - placement.volume.bounds.min[0];
          const offset: [number, number, number] = [Math.max(1, width) + 1, 0, 0];
          const res = session.execute({
            type: 'placement:duplicate',
            placementId,
            offset,
          });
          if (res.ok) {
            const newPlacementId = res.changed?.placementIds?.[0];
            if (newPlacementId) {
              onSelectPlacementRef.current?.(newPlacementId);
            }
          }
        }
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code);
      shiftKeyRef.current = e.shiftKey;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [session]);

  // Preset handler
  const handleApplyPreset = (preset: CameraPreset) => {
    const cameraCtrl = cameraCtrlRef.current;
    if (!cameraCtrl) return;

    const project = session.peekProject();
    let bounds: Bounds3i | undefined;
    if (project.placements.length > 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of project.placements) {
        minX = Math.min(minX, p.volume.bounds.min[0] + p.transform.translation[0]);
        minY = Math.min(minY, p.volume.bounds.min[1] + p.transform.translation[1]);
        minZ = Math.min(minZ, p.volume.bounds.min[2] + p.transform.translation[2]);
        maxX = Math.max(maxX, p.volume.bounds.maxExclusive[0] + p.transform.translation[0]);
        maxY = Math.max(maxY, p.volume.bounds.maxExclusive[1] + p.transform.translation[1]);
        maxZ = Math.max(maxZ, p.volume.bounds.maxExclusive[2] + p.transform.translation[2]);
      }
      if (Number.isFinite(minX)) {
        bounds = { min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] };
      }
    }

    cameraCtrl.applyPreset(preset, bounds);
    if (cameraRef.current) {
      cameraCtrl.syncToThreeCamera(cameraRef.current);
    }
  };

  const handleFrameAll = () => {
    const cameraCtrl = cameraCtrlRef.current;
    if (!cameraCtrl) return;
    const project = session.peekProject();
    if (project.placements.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of project.placements) {
      minX = Math.min(minX, p.volume.bounds.min[0] + p.transform.translation[0]);
      minY = Math.min(minY, p.volume.bounds.min[1] + p.transform.translation[1]);
      minZ = Math.min(minZ, p.volume.bounds.min[2] + p.transform.translation[2]);
      maxX = Math.max(maxX, p.volume.bounds.maxExclusive[0] + p.transform.translation[0]);
      maxY = Math.max(maxY, p.volume.bounds.maxExclusive[1] + p.transform.translation[1]);
      maxZ = Math.max(maxZ, p.volume.bounds.maxExclusive[2] + p.transform.translation[2]);
    }
    if (Number.isFinite(minX)) {
      cameraCtrl.frameBounds({ min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] });
      if (cameraRef.current) cameraCtrl.syncToThreeCamera(cameraRef.current);
    }
  };

  const handleToggleMode = () => {
    const nextMode: CameraMode = cameraMode === 'orbit' ? 'fly' : 'orbit';
    setCameraMode(nextMode);
    cameraCtrlRef.current?.setMode(nextMode);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        backgroundColor: '#181824',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          outline: 'none',
          cursor: isDraggingRef.current ? 'grabbing' : 'crosshair',
        }}
      />

      {/* WebGL Context Loss Banner */}
      {contextLost && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#ff3344dd',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}
        >
          WebGL context lost. Waiting for GPU recovery...
        </div>
      )}

      {/* Top Floating HUD Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: '#1e1e2edd',
          backdropFilter: 'blur(8px)',
          border: '1px solid #33334d',
          borderRadius: '8px',
          padding: '10px 12px',
          color: '#e2e2ec',
          fontSize: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 10,
        }}
      >
        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleToggleMode}
            style={{
              padding: '4px 8px',
              backgroundColor: cameraMode === 'orbit' ? '#2e4466' : '#66442e',
              border: '1px solid #556688',
              borderRadius: '4px',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {cameraMode === 'orbit' ? 'Orbit Mode' : 'Fly Mode (WASD)'}
          </button>
          <button
            onClick={() => handleApplyPreset('isometric')}
            style={btnStyle}
            title="Isometric View"
          >
            Iso
          </button>
          <button
            onClick={() => handleApplyPreset('top')}
            style={btnStyle}
            title="Top View"
          >
            Top
          </button>
          <button
            onClick={() => handleApplyPreset('front')}
            style={btnStyle}
            title="Front View"
          >
            Front
          </button>
          <button
            onClick={() => handleApplyPreset('right')}
            style={btnStyle}
            title="Right View"
          >
            Right
          </button>
          <button
            onClick={handleFrameAll}
            style={btnStyle}
            title="Frame Entire Schematic"
          >
            Frame
          </button>
          <button
            onClick={() => setHudCollapsed((c) => !c)}
            style={{
              ...btnStyle,
              marginLeft: '4px',
              fontWeight: 700,
              padding: '4px 8px',
            }}
            title={hudCollapsed ? 'Expand HUD' : 'Collapse HUD'}
          >
            {hudCollapsed ? '▸' : '▾'}
          </button>
        </div>

        {!hudCollapsed && (
          <>
            {/* Overlay toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#a0a0b8' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gridPrefs.chunkBorders}
                  onChange={(e) => setGridPrefs((p) => ({ ...p, chunkBorders: e.target.checked }))}
                />
                Chunk Grid
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gridPrefs.sectionBorders}
                  onChange={(e) => setGridPrefs((p) => ({ ...p, sectionBorders: e.target.checked }))}
                />
                Section Grid
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gridPrefs.blockBorders}
                  onChange={(e) => setGridPrefs((p) => ({ ...p, blockBorders: e.target.checked }))}
                />
                Block Grid
              </label>
            </div>

            {/* Scene Stats */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#8888a0' }}>
              <span>Meshes: <strong>{stats.meshCount}</strong></span>
              <span>Chunks: <strong>{stats.chunkCount}</strong></span>
              <span>Triangles: <strong>{stats.triangleCount.toLocaleString()}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Bottom Floating Hover Readout */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          backgroundColor: '#1e1e2edd',
          backdropFilter: 'blur(8px)',
          border: '1px solid #33334d',
          borderRadius: '6px',
          padding: '6px 12px',
          color: '#e2e2ec',
          fontSize: '12px',
          fontFamily: 'monospace',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {hoveredVoxel ? (
          <div>
            <span style={{ color: '#00e5ff', fontWeight: 600 }}>
              [{hoveredVoxel.position[0]}, {hoveredVoxel.position[1]}, {hoveredVoxel.position[2]}]
            </span>{' '}
            · <span style={{ color: '#ffcc00' }}>{hoveredVoxel.state.id}</span>
            {Object.keys(hoveredVoxel.state.props || {}).length > 0 && (
              <span style={{ color: '#9999bb' }}>
                [{Object.entries(hoveredVoxel.state.props).map(([k, v]) => `${k}=${v}`).join(',')}]
              </span>
            )}
            {hoveredVoxel.placementId && (
              <span style={{ color: '#8888aa' }}> · {hoveredVoxel.placementId}</span>
            )}
          </div>
        ) : (
          <span style={{ color: '#666680' }}>Hover over voxels to inspect</span>
        )}
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#28283c',
  border: '1px solid #44445c',
  borderRadius: '4px',
  color: '#e2e2ec',
  cursor: 'pointer',
  fontSize: '11px',
};
