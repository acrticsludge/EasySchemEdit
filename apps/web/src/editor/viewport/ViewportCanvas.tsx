// apps/web/src/editor/viewport/ViewportCanvas.tsx
// Three.js interactive viewport canvas with orbit/fly controls, overlays, HUD, and WebGL context-loss recovery (Slice E3.2).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorSession, SessionChangeEvent } from '@easyschemedit/operations';
import type { AssetSource, TextureUvInfo } from '@easyschemedit/renderer';
import { placementWorldBounds, type Bounds3i, type Vec3i } from '@easyschemedit/domain';

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

function makeAlignmentPoint(
  axis: number,
  alignVal: number,
  u: number,
  v: number
): [number, number, number] {
  if (axis === 0) return [alignVal, u, v];
  if (axis === 1) return [u, alignVal, v];
  return [u, v, alignVal];
}

function intersectRayAABB(
  orig: [number, number, number],
  dir: [number, number, number],
  bounds: Bounds3i
): { minT: number; maxT: number } | null {
  if (
    bounds.min[0] >= bounds.maxExclusive[0] ||
    bounds.min[1] >= bounds.maxExclusive[1] ||
    bounds.min[2] >= bounds.maxExclusive[2]
  ) {
    return null;
  }

  let tMin = -Infinity;
  let tMax = Infinity;

  for (let i = 0; i < 3; i++) {
    const o = orig[i];
    const d = dir[i];
    const minVal = bounds.min[i];
    const maxVal = bounds.maxExclusive[i];

    if (Math.abs(d) < 1e-8) {
      if (o < minVal || o > maxVal) return null;
    } else {
      const invD = 1 / d;
      let t1 = (minVal - o) * invD;
      let t2 = (maxVal - o) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }

  if (tMax < 0) return null;
  return { minT: Math.max(0, tMin), maxT: tMax };
}

function isSameVoxelHit(a: VoxelHit | null, b: VoxelHit | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.placementId === b.placementId &&
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.state?.id === b.state?.id
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
  const dragSnappedTranslationRef = useRef<[number, number, number] | null>(null);
  const dragStartBoundsRef = useRef<Bounds3i | null>(null);
  const alignGuidesLineRef = useRef<THREE.LineSegments | null>(null);
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
  const groundGridRef = useRef<THREE.GridHelper | null>(null);

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
  const onVoxelHoverRef = useRef(onVoxelHover);
  onVoxelHoverRef.current = onVoxelHover;
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

  // Raycast throttling and wheel cache
  const lastHoverRaycastTimeRef = useRef<number>(0);
  const lastHoveredVoxelRef = useRef<VoxelHit | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelRaycastRef = useRef<{
    x: number;
    y: number;
    time: number;
    anchor: [number, number, number] | null;
  } | null>(null);

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

    chunkManagerRef.current?.setBlockGrid(gPrefs.blockBorders);
    (chunkManagerRef.current as any)?.setChunkGrid?.(gPrefs.chunkBorders);

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
        const wb = placementWorldBounds(p);
        minX = Math.min(minX, wb.min[0]);
        minY = Math.min(minY, wb.min[1]);
        minZ = Math.min(minZ, wb.min[2]);
        maxX = Math.max(maxX, wb.maxExclusive[0]);
        maxY = Math.max(maxY, wb.maxExclusive[1]);
        maxZ = Math.max(maxZ, wb.maxExclusive[2]);
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

    if (groundGridRef.current) {
      groundGridRef.current.visible = project.placements.length === 0 && !gPrefs.chunkBorders;
    }

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
          const wb = placementWorldBounds(p);
          minX = Math.min(minX, wb.min[0]);
          minY = Math.min(minY, wb.min[1]);
          minZ = Math.min(minZ, wb.min[2]);
          maxX = Math.max(maxX, wb.maxExclusive[0]);
          maxY = Math.max(maxY, wb.maxExclusive[1]);
          maxZ = Math.max(maxZ, wb.maxExclusive[2]);
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
    chunkManagerRef.current?.setBlockGrid(gridPrefs.blockBorders);
    (chunkManagerRef.current as any)?.setChunkGrid?.(gridPrefs.chunkBorders);
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
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.5, 16000);
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
    groundGrid.visible = session.peekProject().placements.length === 0 && !gridPrefsRef.current.chunkBorders;
    groundGridRef.current = groundGrid;
    scene.add(groundGrid);

    // Chunk Manager
    const chunkManager = new ChunkSceneManager();
    chunkManager.setBlockGrid(gridPrefsRef.current.blockBorders);
    (chunkManager as any).setChunkGrid?.(gridPrefsRef.current.chunkBorders);
    chunkManagerRef.current = chunkManager;
    scene.add(chunkManager.rootGroup);

    // Transform Controls & Gizmo Proxy (Slice E3.2, three@0.187.0)
    const transformCtrl = new TransformControls(camera, renderer.domElement);
    transformCtrl.setTranslationSnap(null);
    transformCtrl.setRotationSnap(Math.PI / 2);
    scene.add(transformCtrl.getHelper());
    transformCtrlRef.current = transformCtrl;

    const gizmoProxy = new THREE.Object3D();
    gizmoProxy.name = 'viewport-gizmo-proxy';
    scene.add(gizmoProxy);
    gizmoProxyRef.current = gizmoProxy;

    // Alignment Guides LineSegments (Move gizmo snapping & magnetic guides)
    const alignGuidesGeometry = new THREE.BufferGeometry();
    const alignGuidesMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const alignGuidesLine = new THREE.LineSegments(alignGuidesGeometry, alignGuidesMaterial);
    alignGuidesLine.name = 'viewport-align-guides';
    alignGuidesLine.renderOrder = 998;
    alignGuidesLine.visible = false;
    scene.add(alignGuidesLine);
    alignGuidesLineRef.current = alignGuidesLine;

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
            dragStartBoundsRef.current = placementWorldBounds(p);
            dragSnappedTranslationRef.current = null;
          }
        }
      } else {
        if (alignGuidesLineRef.current) {
          alignGuidesLineRef.current.visible = false;
          alignGuidesLineRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
          alignGuidesLineRef.current.geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
        }
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

              const finalTranslation: [number, number, number] = dragSnappedTranslationRef.current
                ? [...dragSnappedTranslationRef.current]
                : [
                    dragStartTranslationRef.current[0] + dx,
                    dragStartTranslationRef.current[1] + dy,
                    dragStartTranslationRef.current[2] + dz,
                  ];
              dragSnappedTranslationRef.current = null;

              if (
                finalTranslation[0] !== dragStartTranslationRef.current[0] ||
                finalTranslation[1] !== dragStartTranslationRef.current[1] ||
                finalTranslation[2] !== dragStartTranslationRef.current[2]
              ) {
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
          dragStartBoundsRef.current = null;
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

        const isShift =
          shiftKeyRef.current ||
          keysDownRef.current.has('ShiftLeft') ||
          keysDownRef.current.has('ShiftRight');
        const step = isShift ? 16 : 1;

        let sx = Math.round((dragStartTranslationRef.current[0] + dx) / step) * step;
        let sy = Math.round((dragStartTranslationRef.current[1] + dy) / step) * step;
        let sz = Math.round((dragStartTranslationRef.current[2] + dz) / step) * step;

        const startBounds = dragStartBoundsRef.current;
        const project = session.peekProject();
        const siblings = project.placements.filter(
          (pl) => pl.id !== placementId && pl.visible !== false
        );

        const linePositions: number[] = [];
        const lineColors: number[] = [];

        if (startBounds && siblings.length > 0 && !isShift) {
          const startTx = dragStartTranslationRef.current[0];
          const startTy = dragStartTranslationRef.current[1];
          const startTz = dragStartTranslationRef.current[2];

          const curMin: [number, number, number] = [
            startBounds.min[0] + (sx - startTx),
            startBounds.min[1] + (sy - startTy),
            startBounds.min[2] + (sz - startTz),
          ];
          const curMax: [number, number, number] = [
            startBounds.maxExclusive[0] + (sx - startTx),
            startBounds.maxExclusive[1] + (sy - startTy),
            startBounds.maxExclusive[2] + (sz - startTz),
          ];

          interface AlignedRecord {
            axis: number;
            alignVal: number;
            isFlush: boolean;
            siblingBounds: Bounds3i;
          }
          const alignedRecords: AlignedRecord[] = [];

          const curCenterX = (curMin[0] + curMax[0]) / 2;
          const curCenterY = (curMin[1] + curMax[1]) / 2;
          const curCenterZ = (curMin[2] + curMax[2]) / 2;

          for (let axis = 0; axis < 3; axis++) {
            let bestDelta = 0;
            let minAbsDelta = Infinity;
            let closestDistSq = Infinity;

            for (const sib of siblings) {
              const sb = placementWorldBounds(sib);
              const sbCenterX = (sb.min[0] + sb.maxExclusive[0]) / 2;
              const sbCenterY = (sb.min[1] + sb.maxExclusive[1]) / 2;
              const sbCenterZ = (sb.min[2] + sb.maxExclusive[2]) / 2;
              const distSq =
                (sbCenterX - curCenterX) ** 2 +
                (sbCenterY - curCenterY) ** 2 +
                (sbCenterZ - curCenterZ) ** 2;

              const cMin = curMin[axis];
              const cMax = curMax[axis];

              const candidates = [
                { delta: sb.min[axis] - cMin, alignVal: sb.min[axis], isFlush: false },
                { delta: sb.maxExclusive[axis] - cMax, alignVal: sb.maxExclusive[axis], isFlush: false },
                { delta: sb.maxExclusive[axis] - cMin, alignVal: sb.maxExclusive[axis], isFlush: true },
                { delta: sb.min[axis] - cMax, alignVal: sb.min[axis], isFlush: true },
              ];

              for (const c of candidates) {
                const absD = Math.abs(c.delta);
                if (absD <= 2) {
                  if (absD < minAbsDelta || (absD === minAbsDelta && distSq < closestDistSq)) {
                    minAbsDelta = absD;
                    bestDelta = c.delta;
                    closestDistSq = distSq;
                  }
                }
              }
            }

            if (minAbsDelta <= 2) {
              if (axis === 0) sx += bestDelta;
              else if (axis === 1) sy += bestDelta;
              else if (axis === 2) sz += bestDelta;

              curMin[axis] += bestDelta;
              curMax[axis] += bestDelta;

              // Record all matching targets for this axis
              for (const sib of siblings) {
                const sb = placementWorldBounds(sib);
                const curMinBefore = curMin[axis] - bestDelta;
                const curMaxBefore = curMax[axis] - bestDelta;

                const candidates = [
                  { delta: sb.min[axis] - curMinBefore, alignVal: sb.min[axis], isFlush: false },
                  { delta: sb.maxExclusive[axis] - curMaxBefore, alignVal: sb.maxExclusive[axis], isFlush: false },
                  { delta: sb.maxExclusive[axis] - curMinBefore, alignVal: sb.maxExclusive[axis], isFlush: true },
                  { delta: sb.min[axis] - curMaxBefore, alignVal: sb.min[axis], isFlush: true },
                ];

                for (const c of candidates) {
                  if (c.delta === bestDelta) {
                    alignedRecords.push({
                      axis,
                      alignVal: c.alignVal,
                      isFlush: c.isFlush,
                      siblingBounds: sb,
                    });
                  }
                }
              }
            }
          }

          if (alignedRecords.length > 0) {
            const addedLines = new Set<string>();
            const addSegment = (
              p1: [number, number, number],
              p2: [number, number, number],
              color: [number, number, number]
            ) => {
              const k1 = `${p1[0]},${p1[1]},${p1[2]}-${p2[0]},${p2[1]},${p2[2]}`;
              const k2 = `${p2[0]},${p2[1]},${p2[2]}-${p1[0]},${p1[1]},${p1[2]}`;
              if (addedLines.has(k1) || addedLines.has(k2)) return;
              addedLines.add(k1);
              linePositions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
              lineColors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
            };

            for (const rec of alignedRecords) {
              const { axis, alignVal, isFlush, siblingBounds } = rec;
              // Cyan for co-planar edge alignment, Magenta for flush / adjacent docking
              const color: [number, number, number] = isFlush
                ? [1.0, 0.1, 0.7]
                : [0.0, 0.95, 1.0];

              const uAxis = axis === 0 ? 1 : 0;
              const vAxis = axis === 2 ? 1 : 2;

              const uMin = Math.min(curMin[uAxis], siblingBounds.min[uAxis]) - 1;
              const uMax = Math.max(curMax[uAxis], siblingBounds.maxExclusive[uAxis]) + 1;
              const vMin = Math.min(curMin[vAxis], siblingBounds.min[vAxis]) - 1;
              const vMax = Math.max(curMax[vAxis], siblingBounds.maxExclusive[vAxis]) + 1;

              const vValues = new Set<number>([
                curMin[vAxis],
                curMax[vAxis],
                siblingBounds.min[vAxis],
                siblingBounds.maxExclusive[vAxis],
              ]);
              for (const v of vValues) {
                const p1 = makeAlignmentPoint(axis, alignVal, uMin, v);
                const p2 = makeAlignmentPoint(axis, alignVal, uMax, v);
                addSegment(p1, p2, color);
              }

              const uValues = new Set<number>([
                curMin[uAxis],
                curMax[uAxis],
                siblingBounds.min[uAxis],
                siblingBounds.maxExclusive[uAxis],
              ]);
              for (const u of uValues) {
                const p1 = makeAlignmentPoint(axis, alignVal, u, vMin);
                const p2 = makeAlignmentPoint(axis, alignVal, u, vMax);
                addSegment(p1, p2, color);
              }
            }
          }
        }

        const alignGuidesLine = alignGuidesLineRef.current;
        if (alignGuidesLine) {
          if (linePositions.length > 0) {
            const geom = alignGuidesLine.geometry;
            geom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            geom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
            geom.computeBoundingSphere();
            alignGuidesLine.visible = true;
          } else {
            alignGuidesLine.visible = false;
          }
        }

        dragSnappedTranslationRef.current = [sx, sy, sz];
        chunkManager.previewPlacementTransform(
          placementId,
          [sx, sy, sz],
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
        const wb = placementWorldBounds(p);
        minX = Math.min(minX, wb.min[0]);
        minY = Math.min(minY, wb.min[1]);
        minZ = Math.min(minZ, wb.min[2]);
        maxX = Math.max(maxX, wb.maxExclusive[0]);
        maxY = Math.max(maxY, wb.maxExclusive[1]);
        maxZ = Math.max(maxZ, wb.maxExclusive[2]);
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

      cameraCtrl.stepDamping(dt);
      cameraCtrl.syncToThreeCamera(camera);

      // Snap infinite chunk floor grid position to 16x16 chunk boundaries and update camera position uniform
      if (gridGroupRef.current) {
        const floorGrid = gridGroupRef.current.getObjectByName('infinite-chunk-floor-grid') as THREE.Mesh | undefined;
        if (floorGrid) {
          const target = (cameraCtrl as any).target ?? cameraCtrl.getTarget();
          floorGrid.position.x = Math.floor(target[0] / 16) * 16;
          floorGrid.position.z = Math.floor(target[2] / 16) * 16;
          const mat = floorGrid.material as THREE.ShaderMaterial;
          if (mat.uniforms?.uCameraPos) {
            mat.uniforms.uCameraPos.value.copy(camera.position);
          }
        }
      }

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
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
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
      if (alignGuidesLineRef.current) {
        scene.remove(alignGuidesLineRef.current);
        alignGuidesLineRef.current.geometry.dispose();
        (alignGuidesLineRef.current.material as THREE.Material).dispose();
        alignGuidesLineRef.current = null;
      }
      groundGridRef.current = null;

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
        const wb = placementWorldBounds(placement);
        const cx = (wb.min[0] + wb.maxExclusive[0]) / 2;
        const cy = (wb.min[1] + wb.maxExclusive[1]) / 2;
        const cz = (wb.min[2] + wb.maxExclusive[2]) / 2;

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
      if (alignGuidesLineRef.current) {
        alignGuidesLineRef.current.visible = false;
      }
    }
  }, [selectedPlacementIds, selectedTool, activeTool, sessionRevision, session]);

  // --------------------------------------------------------------------------
  // Mouse and Keyboard Event Handlers
  // --------------------------------------------------------------------------
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

      let hitAny = false;
      let minHitT = Infinity;
      let maxHitT = -Infinity;

      for (const p of project.placements) {
        if (p.visible === false) continue;
        const wb = placementWorldBounds(p);
        const hit = intersectRayAABB(rayOrigin, rayDir, wb);
        if (hit) {
          hitAny = true;
          if (hit.minT < minHitT) minHitT = hit.minT;
          if (hit.maxT > maxHitT) maxHitT = hit.maxT;
        }
      }

      if (!hitAny) {
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
      }

      const blockLookup = createProjectBlockLookup(project);
      const advanceDist = Math.max(0, minHitT - 1);
      const clippedOrigin: [number, number, number] = [
        rayOrigin[0] + rayDir[0] * advanceDist,
        rayOrigin[1] + rayDir[1] * advanceDist,
        rayOrigin[2] + rayDir[2] * advanceDist,
      ];
      const maxDist = Math.min(2048, maxHitT - advanceDist + 2);

      const voxelHit = raycastVoxels(clippedOrigin, rayDir, maxDist, blockLookup);
      if (voxelHit) {
        voxelHit.distance += advanceDist;
        return voxelHit;
      }

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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isGizmoDraggingRef.current || (transformCtrlRef.current && (transformCtrlRef.current as any).axis)) {
      return;
    }
    isDraggingRef.current = true;
    dragButtonRef.current = e.button;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const cameraCtrl = cameraCtrlRef.current;
    if (cameraCtrl && cameraCtrl.getMode() === 'orbit' && e.button === 0 && !e.shiftKey) {
      const hit = performRaycast(e.clientX, e.clientY);
      if (hit) {
        cameraCtrl.setPivotPreservingCamera([
          hit.position[0] + 0.5,
          hit.position[1] + 0.5,
          hit.position[2] + 0.5,
        ]);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cameraCtrl = cameraCtrlRef.current;

    if (isDraggingRef.current && cameraCtrl) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const isOrbitPan = dragButtonRef.current === 2 || (dragButtonRef.current === 0 && e.shiftKey);

      if (cameraCtrl.getMode() === 'orbit') {
        if (isOrbitPan) {
          const panScale = Math.max(0.05, cameraCtrl.getDistance() * 0.0022);
          cameraCtrl.pan(-dx * panScale, dy * panScale);
        } else {
          cameraCtrl.orbit(-dx * 0.008, dy * 0.008);
        }
      } else {
        // Fly look
        cameraCtrl.lookFly(-dx * 0.006, -dy * 0.006);
      }
    } else {
      if (transformCtrlRef.current && (transformCtrlRef.current as any).axis) {
        if (lastHoveredVoxelRef.current !== null) {
          lastHoveredVoxelRef.current = null;
          setHoveredVoxel(null);
          onVoxelHoverRef.current?.(null);
        }
        return;
      }

      // Hover raycasting throttled to at most once every 45ms
      const now = performance.now();
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      const clientX = e.clientX;
      const clientY = e.clientY;

      if (now - lastHoverRaycastTimeRef.current >= 45) {
        lastHoverRaycastTimeRef.current = now;
        const hit = performRaycast(clientX, clientY);
        if (!isSameVoxelHit(lastHoveredVoxelRef.current, hit)) {
          lastHoveredVoxelRef.current = hit;
          setHoveredVoxel(hit);
          onVoxelHoverRef.current?.(hit);
        }
      } else {
        const remaining = 45 - (now - lastHoverRaycastTimeRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
          hoverTimeoutRef.current = null;
          lastHoverRaycastTimeRef.current = performance.now();
          const hit = performRaycast(clientX, clientY);
          if (!isSameVoxelHit(lastHoveredVoxelRef.current, hit)) {
            lastHoveredVoxelRef.current = hit;
            setHoveredVoxel(hit);
            onVoxelHoverRef.current?.(hit);
          }
        }, remaining);
      }
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
      const now = performance.now();
      let anchor: [number, number, number] | null = null;
      const cached = lastWheelRaycastRef.current;

      if (
        cached &&
        now - cached.time <= 120 &&
        Math.hypot(e.clientX - cached.x, e.clientY - cached.y) <= 4
      ) {
        anchor = cached.anchor;
        cached.time = now;
      } else {
        const hit = performRaycast(e.clientX, e.clientY);
        if (hit) {
          anchor = [hit.position[0] + 0.5, hit.position[1] + 0.5, hit.position[2] + 0.5];
        } else {
          const camera = cameraRef.current;
          const canvas = canvasRef.current;
          if (camera && canvas) {
            const rect = canvas.getBoundingClientRect();
            const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
            const target = cameraCtrl.getTarget();
            const fwd = cameraCtrl.getForwardVector();
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              new THREE.Vector3(fwd[0], fwd[1], fwd[2]),
              new THREE.Vector3(target[0], target[1], target[2])
            );
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, intersection)) {
              anchor = [intersection.x, intersection.y, intersection.z];
            }
          }
        }
        lastWheelRaycastRef.current = {
          x: e.clientX,
          y: e.clientY,
          time: now,
          anchor,
        };
      }
      cameraCtrl.queueZoom(-e.deltaY, anchor);
    } else {
      // Adjust fly speed
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      cameraCtrl.setFlySpeed(cameraCtrl.getFlySpeed() * factor);
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
        const wb = placementWorldBounds(p);
        minX = Math.min(minX, wb.min[0]);
        minY = Math.min(minY, wb.min[1]);
        minZ = Math.min(minZ, wb.min[2]);
        maxX = Math.max(maxX, wb.maxExclusive[0]);
        maxY = Math.max(maxY, wb.maxExclusive[1]);
        maxZ = Math.max(maxZ, wb.maxExclusive[2]);
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
      const wb = placementWorldBounds(p);
      minX = Math.min(minX, wb.min[0]);
      minY = Math.min(minY, wb.min[1]);
      minZ = Math.min(minZ, wb.min[2]);
      maxX = Math.max(maxX, wb.maxExclusive[0]);
      maxY = Math.max(maxY, wb.maxExclusive[1]);
      maxZ = Math.max(maxZ, wb.maxExclusive[2]);
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
        onPointerLeave={() => {
          if (hoverTimeoutRef.current !== null) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          if (lastHoveredVoxelRef.current !== null) {
            lastHoveredVoxelRef.current = null;
            setHoveredVoxel(null);
            onVoxelHoverRef.current?.(null);
          }
        }}
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

      {/* Floating Hover Readout (top-left so it never overlaps SelectedPlacementBar at bottom-center) */}
      <div
        style={{
          position: 'absolute',
          top: 12,
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
