// apps/web/src/editor/viewport/overlays-builder.ts
// Viewport overlays: placement bounds, origin markers, selection box, grid borders, conflict overlays (Slice E3.2).

import * as THREE from 'three';
import type { Bounds3i, Placement, Vec3i } from '@easyschemedit/domain';
import { placementWorldBounds } from '../../../../../packages/domain/coordinates.ts';

/**
 * Builds 12 edge line segments for a cuboid defined by [minX, minY, minZ] and [maxX, maxY, maxZ].
 */
function createBoxLineGeometry(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number
): THREE.BufferGeometry {
  const positions = new Float32Array([
    // Bottom 4 edges
    x0, y0, z0,  x1, y0, z0,
    x1, y0, z0,  x1, y0, z1,
    x1, y0, z1,  x0, y0, z1,
    x0, y0, z1,  x0, y0, z0,

    // Top 4 edges
    x0, y1, z0,  x1, y1, z0,
    x1, y1, z0,  x1, y1, z1,
    x1, y1, z1,  x0, y1, z1,
    x0, y1, z1,  x0, y1, z0,

    // 4 vertical connecting edges
    x0, y0, z0,  x0, y1, z0,
    x1, y0, z0,  x1, y1, z0,
    x1, y0, z1,  x1, y1, z1,
    x0, y0, z1,  x0, y1, z1,
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geom;
}

/**
 * Builds wireframe bounding boxes around all visible placements,
 * highlighting selected placements with an accent color.
 */
export function buildPlacementBoundsGroup(
  placements: Placement[],
  selectedIds: Set<string>
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'placement-bounds-overlay';

  const unselectedMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const selectedMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  for (const placement of placements) {
    if (placement.visible === false) continue;

    const bounds = placementWorldBounds(placement);
    const geom = createBoxLineGeometry(
      bounds.min[0],
      bounds.min[1],
      bounds.min[2],
      bounds.maxExclusive[0],
      bounds.maxExclusive[1],
      bounds.maxExclusive[2]
    );

    const isSelected = selectedIds.has(placement.id);
    const line = new THREE.LineSegments(geom, isSelected ? selectedMat : unselectedMat);
    line.name = `placement-bounds-${placement.id}`;
    group.add(line);
  }

  return group;
}

/**
 * Builds RGB origin axis crosses (Red +X, Green +Y, Blue +Z) at each placement's world origin.
 */
export function buildOriginMarkersGroup(placements: Placement[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'origin-markers-overlay';

  const axisLength = 1.75;

  for (const placement of placements) {
    if (placement.visible === false) continue;

    const [tx, ty, tz] = placement.transform.translation;

    // +X (Red)
    const xPos = new Float32Array([tx, ty, tz, tx + axisLength, ty, tz]);
    const xGeom = new THREE.BufferGeometry();
    xGeom.setAttribute('position', new THREE.BufferAttribute(xPos, 3));
    const xLine = new THREE.LineSegments(
      xGeom,
      new THREE.LineBasicMaterial({ color: 0xff3333, depthWrite: false })
    );

    // +Y (Green)
    const yPos = new Float32Array([tx, ty, tz, tx, ty + axisLength, tz]);
    const yGeom = new THREE.BufferGeometry();
    yGeom.setAttribute('position', new THREE.BufferAttribute(yPos, 3));
    const yLine = new THREE.LineSegments(
      yGeom,
      new THREE.LineBasicMaterial({ color: 0x33ff33, depthWrite: false })
    );

    // +Z (Blue)
    const zPos = new Float32Array([tx, ty, tz, tx, ty, tz + axisLength]);
    const zGeom = new THREE.BufferGeometry();
    zGeom.setAttribute('position', new THREE.BufferAttribute(zPos, 3));
    const zLine = new THREE.LineSegments(
      zGeom,
      new THREE.LineBasicMaterial({ color: 0x3388ff, depthWrite: false })
    );

    const markerGroup = new THREE.Group();
    markerGroup.name = `origin-marker-${placement.id}`;
    markerGroup.add(xLine, yLine, zLine);
    group.add(markerGroup);
  }

  return group;
}

/**
 * Builds a vibrant emerald-green translucent filled box + wireframe box around current selection bounds.
 */
export function buildSelectionBoxMesh(bounds: Bounds3i | null): THREE.Group {
  const group = new THREE.Group();
  group.name = 'selection-box-overlay';

  if (!bounds) return group;

  const sx = bounds.maxExclusive[0] - bounds.min[0];
  const sy = bounds.maxExclusive[1] - bounds.min[1];
  const sz = bounds.maxExclusive[2] - bounds.min[2];

  if (sx <= 0 || sy <= 0 || sz <= 0) return group;

  const cx = bounds.min[0] + sx / 2;
  const cy = bounds.min[1] + sy / 2;
  const cz = bounds.min[2] + sz / 2;

  // Translucent inner box inflated slightly by 0.008 to prevent z-fighting
  const boxGeom = new THREE.BoxGeometry(sx + 0.008, sy + 0.008, sz + 0.008);
  const boxMat = new THREE.MeshBasicMaterial({
    color: 0x14f195,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  const fillMesh = new THREE.Mesh(boxGeom, boxMat);
  fillMesh.position.set(cx, cy, cz);

  // Wireframe outline
  const lineGeom = createBoxLineGeometry(
    bounds.min[0],
    bounds.min[1],
    bounds.min[2],
    bounds.maxExclusive[0],
    bounds.maxExclusive[1],
    bounds.maxExclusive[2]
  );
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x39ffaa,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const lineMesh = new THREE.LineSegments(lineGeom, lineMat);

  group.add(fillMesh, lineMesh);
  return group;
}

export interface GridBordersPrefs {
  chunkBorders: boolean;
  sectionBorders: boolean;
  blockBorders: boolean;
}

/**
 * Builds an infinite horizontal floor grid at floorY featuring:
 * - 16x16 chunk borders in warm gold/amber (#ffaa00)
 * - 1x1 block sub-grid in subtle slate/cool-blue (#6688aa) with anti-moiré far zoom fade
 * - Smooth distance fade out past ~1200 blocks
 */
export function buildInfiniteChunkFloorGrid(floorY: number): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(4096, 4096);
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldPos;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uCameraPos;
      varying vec3 vWorldPos;

      void main() {
        vec2 fw = fwidth(vWorldPos.xz);

        // 16-block Chunk Grid: warm gold/amber #ffaa00 with ~0.78 alpha
        vec2 cCoord = vWorldPos.xz / 16.0;
        vec2 cDist = min(fract(cCoord), 1.0 - fract(cCoord)) * 16.0;
        vec2 cLineWidth = max(fw * 1.25, vec2(0.04));
        vec2 cLineAlpha = 1.0 - smoothstep(vec2(0.0), cLineWidth, cDist);
        float cFactor = max(cLineAlpha.x, cLineAlpha.y);

        // Smooth distance fade out past ~1200 blocks from uCameraPos.xz
        float dist = length(vWorldPos.xz - uCameraPos.xz);
        float distFade = 1.0 - smoothstep(800.0, 1200.0, dist);

        float cAlpha = cFactor * 0.78 * distFade;
        vec3 cColor = vec3(1.0, 0.667, 0.0);

        // 1-block Sub-Grid (16x16 inside each chunk): subtle slate/cool-blue #6688aa with ~0.18 alpha
        vec2 bDist = min(fract(vWorldPos.xz), 1.0 - fract(vWorldPos.xz));
        vec2 bLineWidth = max(fw * 0.85, vec2(0.02));
        vec2 bLineAlpha = 1.0 - smoothstep(vec2(0.0), bLineWidth, bDist);
        float bFactor = max(bLineAlpha.x, bLineAlpha.y);

        // Fading out cleanly at far zoom (smoothstep on fwidth(vWorldPos.xz)) so it never causes moiré noise
        float maxFw = max(fw.x, fw.y);
        float bZoomFade = 1.0 - smoothstep(0.08, 0.28, maxFw);
        float bAlpha = bFactor * 0.18 * bZoomFade * distFade;
        vec3 bColor = vec3(0.4, 0.533, 0.667);

        float finalAlpha = cAlpha + bAlpha * (1.0 - cAlpha);
        if (finalAlpha < 0.002) {
          discard;
        }

        vec3 finalColor = (cColor * cAlpha + bColor * bAlpha * (1.0 - cAlpha)) / max(finalAlpha, 1e-4);
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'infinite-chunk-floor-grid';
  mesh.renderOrder = -1;
  mesh.position.set(0, floorY, 0);

  return mesh;
}

/**
 * Builds grid borders group:
 * - Chunk borders: infinite horizontal floor grid at minY - 0.02.
 * - Section borders: horizontal 16-high plane lines in blue (0x0088ff).
 *
 * If all preferences are false, returns an empty THREE.Group with 0 children.
 */
export function buildGridBordersGroup(
  bounds: Bounds3i,
  prefs: GridBordersPrefs
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'grid-borders-overlay';

  if (!prefs.chunkBorders && !prefs.sectionBorders) {
    return group; // 0 children
  }

  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.maxExclusive;

  // 1. Chunk floor grid (horizontal floor at bounds.min[1] - 0.02)
  if (prefs.chunkBorders) {
    const floorY = bounds.min[1] - 0.02;
    group.add(buildInfiniteChunkFloorGrid(floorY));
  }

  // 2. Section horizontal borders (every 16 on Y)
  if (prefs.sectionBorders) {
    const sectionPositions: number[] = [];
    const minCx = Math.floor(x0 / 16) * 16;
    const maxCx = Math.ceil(x1 / 16) * 16;
    const minCz = Math.floor(z0 / 16) * 16;
    const maxCz = Math.ceil(z1 / 16) * 16;
    const minY = Math.floor(y0 / 16) * 16;
    const maxY = Math.ceil(y1 / 16) * 16;

    for (let sy = minY; sy <= maxY; sy += 16) {
      // Lines along X
      for (let cz = minCz; cz <= maxCz; cz += 16) {
        sectionPositions.push(minCx, sy, cz, maxCx, sy, cz);
      }
      // Lines along Z
      for (let cx = minCx; cx <= maxCx; cx += 16) {
        sectionPositions.push(cx, sy, minCz, cx, sy, maxCz);
      }
    }

    if (sectionPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sectionPositions), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      group.add(new THREE.LineSegments(geom, mat));
    }
  }

  return group;
}

/**
 * Builds conflict highlight cubes at the specified voxel coordinates using InstancedMesh.
 */
export function buildConflictOverlayGroup(
  positions: Vec3i[],
  colorHex: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'conflict-overlay';

  if (!positions || positions.length === 0) return group;

  const count = positions.length;
  const geom = new THREE.BoxGeometry(1.004, 1.004, 1.004);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const inst = new THREE.InstancedMesh(geom, mat, count);
  inst.frustumCulled = false;

  const dummyMatrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const [x, y, z] = positions[i];
    dummyMatrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    inst.setMatrixAt(i, dummyMatrix);
  }
  inst.instanceMatrix.needsUpdate = true;

  group.add(inst);
  return group;
}
