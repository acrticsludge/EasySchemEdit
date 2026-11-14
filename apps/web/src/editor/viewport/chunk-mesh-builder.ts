// apps/web/src/editor/viewport/chunk-mesh-builder.ts
// Three.js chunk mesh builder and scene manager with GPU BatchedMesh buckets (Slice E3.2, AD-3).
// Consolidates chunk geometries into per-placement, per-pass THREE.BatchedMesh buckets.

import * as THREE from 'three';
import {
  meshChunk,
  type PassGeometryBuffer,
  type TextureUvInfo,
  type AssetSource,
  type MeshPass,
  type BlockLookupResult,
  type BlockStateData,
} from '@easyschemedit/renderer';
import type {
  Placement,
  Project,
  Bounds3i,
  Vec3i,
  BlockStateId,
} from '@easyschemedit/domain';

// Default asset source fallback producing standard 1x1x1 cubes for any block
const DEFAULT_EMPTY_ASSET_SOURCE: AssetSource = {
  getBlockState: () => undefined,
  getModel: () => undefined,
};

// BatchedMesh capacity limits per bucket
const BATCH_MAX_INSTANCES = 1024;
const BATCH_MAX_VERTICES = 524288;
const BATCH_MAX_INDICES = 786432;
const IDENTITY_MATRIX = new THREE.Matrix4();

interface BatchBucket {
  mesh: THREE.BatchedMesh;
  usedInstances: number;
  usedVertices: number;
  usedIndices: number;
}

interface ChunkSlot {
  bucket?: BatchBucket;
  geometryId?: number;
  instanceId?: number;
  standaloneMesh?: THREE.Mesh;
  vertexCount: number;
  indexCount: number;
  triangleCount: number;
}

/**
 * Constructs a THREE.BufferGeometry from a chunk mesher pass geometry buffer.
 * Returns null if the buffer is empty (0 vertices or 0 indices).
 */
export function buildBufferGeometryFromPass(
  pass: PassGeometryBuffer | null | undefined
): THREE.BufferGeometry | null {
  if (!pass || pass.vertexCount === 0 || pass.indices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pass.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(pass.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(pass.uvs, 2));

  // If pass.colors has 4 floats per vertex (RGBA), use itemSize 4.
  // If it has 3 floats per vertex (RGB), expand to 4 floats per vertex (RGBA)
  // so itemSize is 4 and count exactly matches vertexCount.
  if (pass.colors.length === pass.vertexCount * 4) {
    geometry.setAttribute('color', new THREE.BufferAttribute(pass.colors, 4));
  } else if (pass.colors.length === pass.vertexCount * 3) {
    const rgba = new Float32Array(pass.vertexCount * 4);
    for (let i = 0; i < pass.vertexCount; i++) {
      rgba[i * 4] = pass.colors[i * 3]!;
      rgba[i * 4 + 1] = pass.colors[i * 3 + 1]!;
      rgba[i * 4 + 2] = pass.colors[i * 3 + 2]!;
      rgba[i * 4 + 3] = 1.0;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  } else {
    geometry.setAttribute('color', new THREE.BufferAttribute(pass.colors, 4));
  }

  geometry.setIndex(new THREE.BufferAttribute(pass.indices, 1));
  return geometry;
}

export interface RebuildPlacementOptions {
  assetSource?: AssetSource;
  uvLookup?: (tex: string) => TextureUvInfo | undefined;
  dirtyChunkKeys?: string[];
  forceRebuild?: boolean;
}

export interface SyncProjectOptions extends RebuildPlacementOptions {
  dirtyChunkKeysByPlacement?: Map<string, string[]>;
}

export interface ChunkSceneStats {
  meshCount: number;
  chunkCount: number;
  placementCount: number;
  triangleCount: number;
}

interface PlacementGroupEntry {
  root: THREE.Group;
  inner: THREE.Group;
}

/**
 * Manages Three.js scene hierarchy and lifecycle for chunk meshes across all placements.
 */
export class ChunkSceneManager {
  public readonly rootGroup: THREE.Group;
  public readonly materials: Record<MeshPass, THREE.Material>;
  private blockGridUniform = { value: 0.0 };
  private chunkGridUniform = { value: 0 };

  // Key: `${placementId}:${chunkKey}:${pass}`
  private activeChunkSlots: Map<string, ChunkSlot> = new Map();
  // Key: `${placementId}:${pass}`
  private placementBuckets: Map<string, BatchBucket[]> = new Map();
  // Key: placementId
  private placementGroups: Map<string, PlacementGroupEntry> = new Map();

  // Revision & asset tracking cache
  private assetEpoch = 0;
  private lastAssetSource?: AssetSource;
  private lastUvLookup?: (tex: string) => TextureUvInfo | undefined;
  // Key: `${placementId}:${chunkKey}`
  private chunkRevisions: Map<string, { revision: number; assetEpoch: number }> = new Map();

  // Incremental time-sliced queue state
  private pendingQueue: Array<{ placement: Placement; chunkKey: string }> = [];
  private queueIndex = 0;
  private queuedOptions: RebuildPlacementOptions = {};

  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'chunk-scene-root';

    // Shared materials per pass (Slice E3.2)
    const opaqueMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });
    const cutoutMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthFunc: THREE.LessEqualDepth,
    });
    const translucentMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    const emissiveMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });

    const configureBlockGridMaterial = (mat: THREE.MeshBasicMaterial) => {
      mat.customProgramCacheKey = () => 'block-chunk-grid-v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uShowBlockGrid = this.blockGridUniform;
        shader.uniforms.uShowChunkGrid = this.chunkGridUniform;
        shader.vertexShader = shader.vertexShader.replace(
          'void main()',
          'varying vec3 vBlockPos;\nvarying vec3 vWorldPos;\nvoid main()'
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvBlockPos = position;\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main()',
          'uniform float uShowBlockGrid;\nuniform float uShowChunkGrid;\nvarying vec3 vBlockPos;\nvarying vec3 vWorldPos;\nvoid main()'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
if (uShowBlockGrid > 0.5) {
  vec3 f = fract(vBlockPos);
  vec3 d = min(f, 1.0 - f);
  vec3 fw = fwidth(vBlockPos);
  float maxFw = max(fw.x, max(fw.y, fw.z));
  vec3 isNormalAxis = step(fw, vec3(max(1e-3, maxFw * 0.05)));
  vec3 w = max(fw * 0.85, vec3(0.035));
  vec3 a = smoothstep(w * 0.65, w, d) + isNormalAxis;
  float edge = 1.0 - clamp(min(a.x, min(a.y, a.z)), 0.0, 1.0);
  float distFade = 1.0 - smoothstep(0.30, 0.65, maxFw);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), 0.38 * edge * distFade);
}
if (uShowChunkGrid > 0.5) {
  vec2 cw = vWorldPos.xz / 16.0;
  vec2 cd = min(fract(cw), 1.0 - fract(cw)) * 16.0;
  vec2 cfw = fwidth(vWorldPos.xz);
  float maxCfw = max(cfw.x, cfw.y);
  vec2 isNormalAxis = step(cfw, vec2(max(1e-3, maxCfw * 0.05)));
  vec2 width = max(cfw * 1.15, vec2(0.08));
  vec2 ca = smoothstep(width * 0.65, width, cd) + isNormalAxis;
  float chunkEdge = 1.0 - clamp(min(ca.x, ca.y), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.67, 0.0), 0.72 * chunkEdge);
}`
        );
      };
    };

    configureBlockGridMaterial(opaqueMat);
    configureBlockGridMaterial(cutoutMat);
    configureBlockGridMaterial(translucentMat);

    this.materials = {
      opaque: opaqueMat,
      cutout: cutoutMat,
      translucent: translucentMat,
      emissive: emissiveMat,
    };
  }

  /**
   * Toggles the block grid border overlay in the chunk shader.
   */
  public setBlockGrid(enabled: boolean): void {
    this.blockGridUniform.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Toggles the 16x16 chunk grid border overlay in the chunk shader.
   */
  public setChunkGrid(enabled: boolean): void {
    this.chunkGridUniform.value = enabled ? 1 : 0;
  }

  /**
   * Updates all shared pass materials with the provided atlas texture.
   */
  public setAtlasTexture(texture: THREE.Texture | null): void {
    this.assetEpoch++;
    for (const mat of Object.values(this.materials)) {
      (mat as any).map = texture;
      mat.needsUpdate = true;
    }
  }

  /**
   * Tracks changes to asset sources and increments assetEpoch if references changed.
   */
  private updateAssetEpochIfNeeded(options?: RebuildPlacementOptions): void {
    let changed = false;
    if (options) {
      if ('assetSource' in options && options.assetSource !== this.lastAssetSource) {
        this.lastAssetSource = options.assetSource;
        changed = true;
      }
      if ('uvLookup' in options && options.uvLookup !== this.lastUvLookup) {
        this.lastUvLookup = options.uvLookup;
        changed = true;
      }
    }
    if (changed) {
      this.assetEpoch++;
    }
  }

  /**
   * Updates Three.js transform and visibility for a single placement group.
   */
  private applyPlacementTransform(groupEntry: PlacementGroupEntry, placement: Placement): void {
    groupEntry.root.position.set(
      placement.transform.translation[0],
      placement.transform.translation[1],
      placement.transform.translation[2]
    );
    groupEntry.root.rotation.y = (placement.transform.rotationY * Math.PI) / 180;
    groupEntry.root.scale.set(
      placement.transform.mirror === 'x' ? -1 : 1,
      1,
      placement.transform.mirror === 'z' ? -1 : 1
    );
    groupEntry.inner.position.set(
      -placement.origin[0] / 2,
      -placement.origin[1] / 2,
      -placement.origin[2] / 2
    );
    groupEntry.root.visible = placement.visible !== false;
  }

  /**
   * O(1) transform and visibility updates across all placements without touching chunk meshes.
   */
  public updatePlacementTransforms(project: Project): void {
    for (const placement of project.placements) {
      const groupEntry = this.placementGroups.get(placement.id);
      if (groupEntry) {
        this.applyPlacementTransform(groupEntry, placement);
      }
    }
  }

  /**
   * Fast 60fps preview update of a placement's root group position and rotation during gizmo drag,
   * without re-meshing or touching chunk geometries.
   */
  public previewPlacementTransform(
    placementId: string,
    translation: [number, number, number],
    rotationY: number
  ): void {
    const groupEntry = this.placementGroups.get(placementId);
    if (groupEntry) {
      groupEntry.root.position.set(translation[0], translation[1], translation[2]);
      groupEntry.root.rotation.y = (rotationY * Math.PI) / 180;
    }
  }

  /**
   * Retrieves or creates the Three.js group hierarchy for a placement.
   */
  private getOrCreatePlacementGroup(placement: Placement): PlacementGroupEntry {
    let groupEntry = this.placementGroups.get(placement.id);
    if (!groupEntry) {
      const root = new THREE.Group();
      root.name = `placement-${placement.id}`;
      const inner = new THREE.Group();
      inner.name = `placement-${placement.id}-inner`;
      root.add(inner);
      this.rootGroup.add(root);
      groupEntry = { root, inner };
      this.placementGroups.set(placement.id, groupEntry);
    }
    this.applyPlacementTransform(groupEntry, placement);
    return groupEntry;
  }

  /**
   * Removes a chunk slot for a given pass, releasing the batched instance/geometry
   * or disposing the standalone mesh. If the bucket becomes completely empty,
   * disposes and removes the bucket from the scene.
   */
  private removeChunkSlot(
    placementId: string,
    chunkKey: string,
    pass: MeshPass,
    groupEntry: PlacementGroupEntry
  ): void {
    const slotKey = `${placementId}:${chunkKey}:${pass}`;
    const slot = this.activeChunkSlots.get(slotKey);
    if (!slot) return;

    if (slot.standaloneMesh) {
      groupEntry.inner.remove(slot.standaloneMesh);
      slot.standaloneMesh.geometry.dispose();
    } else if (slot.bucket && slot.instanceId !== undefined && slot.geometryId !== undefined) {
      const { bucket, instanceId, geometryId } = slot;
      bucket.mesh.deleteInstance(instanceId);
      bucket.mesh.deleteGeometry(geometryId);
      bucket.usedInstances -= 1;
      bucket.usedVertices -= slot.vertexCount;
      bucket.usedIndices -= slot.indexCount;

      if (bucket.usedInstances === 0) {
        groupEntry.inner.remove(bucket.mesh);
        bucket.mesh.dispose();
        const bucketListKey = `${placementId}:${pass}`;
        const list = this.placementBuckets.get(bucketListKey);
        if (list) {
          const idx = list.indexOf(bucket);
          if (idx !== -1) {
            list.splice(idx, 1);
          }
          if (list.length === 0) {
            this.placementBuckets.delete(bucketListKey);
          }
        }
      }
    }

    this.activeChunkSlots.delete(slotKey);
  }

  /**
   * Adds geometry for a single chunk render pass, using THREE.BatchedMesh buckets
   * or falling back to standalone THREE.Mesh if it exceeds bucket limits.
   */
  private addChunkPassGeometry(
    placementId: string,
    chunkKey: string,
    pass: MeshPass,
    geometry: THREE.BufferGeometry,
    groupEntry: PlacementGroupEntry
  ): void {
    const slotKey = `${placementId}:${chunkKey}:${pass}`;
    const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const indexCount = geometry.index ? geometry.index.count : 0;
    const triangleCount = Math.round(geometry.index ? geometry.index.count / 3 : vertexCount / 3);

    // Fall back to standalone THREE.Mesh if geometry exceeds batch limits on its own
    if (vertexCount > BATCH_MAX_VERTICES || indexCount > BATCH_MAX_INDICES) {
      const mesh = new THREE.Mesh(geometry, this.materials[pass]);
      mesh.name = slotKey;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      groupEntry.inner.add(mesh);
      this.activeChunkSlots.set(slotKey, {
        standaloneMesh: mesh,
        vertexCount,
        indexCount,
        triangleCount,
      });
      return;
    }

    const bucketKey = `${placementId}:${pass}`;
    let buckets = this.placementBuckets.get(bucketKey);
    if (!buckets) {
      buckets = [];
      this.placementBuckets.set(bucketKey, buckets);
    }

    let targetBucket: BatchBucket | undefined;
    for (const b of buckets) {
      if (
        b.usedInstances + 1 <= BATCH_MAX_INSTANCES &&
        b.usedVertices + vertexCount <= BATCH_MAX_VERTICES &&
        b.usedIndices + indexCount <= BATCH_MAX_INDICES
      ) {
        targetBucket = b;
        break;
      }
    }

    if (!targetBucket) {
      const batchedMesh = new THREE.BatchedMesh(
        BATCH_MAX_INSTANCES,
        BATCH_MAX_VERTICES,
        BATCH_MAX_INDICES,
        this.materials[pass]
      );
      batchedMesh.name = `${placementId}:${pass}:batch-${buckets.length}`;
      batchedMesh.matrixAutoUpdate = false;
      batchedMesh.updateMatrix();
      batchedMesh.frustumCulled = true;
      batchedMesh.perObjectFrustumCulled = true;
      groupEntry.inner.add(batchedMesh);

      targetBucket = {
        mesh: batchedMesh,
        usedInstances: 0,
        usedVertices: 0,
        usedIndices: 0,
      };
      buckets.push(targetBucket);
    }

    let geoId: number;
    let instId: number;
    try {
      if (
        targetBucket.mesh.unusedVertexCount < vertexCount ||
        targetBucket.mesh.unusedIndexCount < indexCount ||
        ((targetBucket.mesh as any)._nextVertexStart !== undefined &&
          (targetBucket.mesh as any)._nextVertexStart + vertexCount > BATCH_MAX_VERTICES) ||
        ((targetBucket.mesh as any)._nextIndexStart !== undefined &&
          (targetBucket.mesh as any)._nextIndexStart + indexCount > BATCH_MAX_INDICES)
      ) {
        targetBucket.mesh.optimize();
      }
      geoId = targetBucket.mesh.addGeometry(geometry);
      instId = targetBucket.mesh.addInstance(geoId);
    } catch {
      // If batch addition fails, fall back to standalone mesh
      const standalone = new THREE.Mesh(geometry, this.materials[pass]);
      standalone.name = slotKey;
      standalone.matrixAutoUpdate = false;
      standalone.updateMatrix();
      groupEntry.inner.add(standalone);
      this.activeChunkSlots.set(slotKey, {
        standaloneMesh: standalone,
        vertexCount,
        indexCount,
        triangleCount,
      });
      return;
    }

    targetBucket.mesh.setMatrixAt(instId, IDENTITY_MATRIX);
    targetBucket.usedInstances += 1;
    targetBucket.usedVertices += vertexCount;
    targetBucket.usedIndices += indexCount;

    this.activeChunkSlots.set(slotKey, {
      bucket: targetBucket,
      geometryId: geoId,
      instanceId: instId,
      vertexCount,
      indexCount,
      triangleCount,
    });

    // Dispose temporary geometry after addGeometry copies it into the batch buffer
    geometry.dispose();
  }

  /**
   * Removes meshes and revision cache entries for any chunks deleted from placement.volume.chunks.
   */
  private removeDeletedChunkMeshes(placement: Placement, groupEntry: PlacementGroupEntry): void {
    const passes: MeshPass[] = ['opaque', 'cutout', 'translucent', 'emissive'];
    const prefix = `${placement.id}:`;

    for (const revKey of Array.from(this.chunkRevisions.keys())) {
      if (revKey.startsWith(prefix)) {
        const chunkKey = revKey.slice(prefix.length);
        if (!placement.volume.chunks.has(chunkKey)) {
          for (const pass of passes) {
            this.removeChunkSlot(placement.id, chunkKey, pass, groupEntry);
          }
          this.chunkRevisions.delete(revKey);
        }
      }
    }

    for (const slotKey of Array.from(this.activeChunkSlots.keys())) {
      if (slotKey.startsWith(prefix)) {
        const parts = slotKey.split(':');
        if (parts.length >= 2) {
          const chunkKey = parts[1];
          if (!placement.volume.chunks.has(chunkKey)) {
            const pass = parts[2] as MeshPass;
            this.removeChunkSlot(placement.id, chunkKey, pass, groupEntry);
            this.chunkRevisions.delete(`${placement.id}:${chunkKey}`);
          }
        }
      }
    }
  }

  /**
   * Meshes a single chunk and updates active Three.js meshes and revision cache.
   */
  private rebuildSingleChunk(
    placement: Placement,
    groupEntry: PlacementGroupEntry,
    chunkKey: string,
    assets: AssetSource,
    uvLookup?: (tex: string) => TextureUvInfo | undefined
  ): void {
    const passes: MeshPass[] = ['opaque', 'cutout', 'translucent', 'emissive'];
    const revKey = `${placement.id}:${chunkKey}`;

    // 1. Remove previous chunk geometry/instance from its bucket (or standalone mesh)
    for (const pass of passes) {
      this.removeChunkSlot(placement.id, chunkKey, pass, groupEntry);
    }

    const chunk = placement.volume.chunks.get(chunkKey);
    if (!chunk) {
      this.chunkRevisions.delete(revKey);
      return;
    }

    // Parse chunk origin in placement-local coordinates
    const [cxStr, cyStr, czStr] = chunkKey.split('_');
    const cx = parseInt(cxStr ?? '0', 10) || 0;
    const cy = parseInt(cyStr ?? '0', 10) || 0;
    const cz = parseInt(czStr ?? '0', 10) || 0;
    const chunkOrigin: [number, number, number] = [cx * 16, cy * 16, cz * 16];

    // Convert chunk palette entries to BlockStateData format for meshChunk
    const mappedPalette: (string | BlockStateData)[] = chunk.palette.map((entry) => {
      if (!entry) return 'minecraft:air';
      if (typeof entry === 'string') return entry;
      if ('id' in entry) {
        return { name: entry.id, properties: entry.props ? { ...entry.props } : {} };
      }
      if ('name' in entry) {
        return entry as BlockStateData;
      }
      return 'minecraft:air';
    });

    // Neighbor lookup for cross-chunk face culling
    const getNeighborBlock = (lx: number, ly: number, lz: number): BlockLookupResult => {
      const wx = chunkOrigin[0] + lx;
      const wy = chunkOrigin[1] + ly;
      const wz = chunkOrigin[2] + lz;

      const ncx = Math.floor(wx / 16);
      const ncy = Math.floor(wy / 16);
      const ncz = Math.floor(wz / 16);
      const nKey = `${ncx}_${ncy}_${ncz}`;

      const nChunk = placement.volume.chunks.get(nKey);
      if (!nChunk) return null;

      const clx = ((wx % 16) + 16) % 16;
      const cly = ((wy % 16) + 16) % 16;
      const clz = ((wz % 16) + 16) % 16;
      const idx = (cly * 16 + clz) * 16 + clx;
      const palIdx = nChunk.indices[idx];
      if (palIdx === undefined) return null;

      const palEntry = nChunk.palette[palIdx];
      if (!palEntry) return null;
      if (typeof palEntry === 'string') return palEntry;
      if ('id' in palEntry) {
        return { name: palEntry.id, properties: palEntry.props };
      }
      return palEntry as BlockStateData;
    };

    // Call pure chunk mesher
    const meshOutput = meshChunk({
      chunkKey,
      chunkOrigin,
      palette: mappedPalette,
      indices: chunk.indices,
      assets,
      getTextureUv: uvLookup,
      getNeighborBlock,
    });

    // Add each non-empty pass to batched mesh buckets
    for (const pass of passes) {
      const passBuffer = meshOutput.passes[pass];
      const geometry = buildBufferGeometryFromPass(passBuffer);
      if (geometry) {
        this.addChunkPassGeometry(placement.id, chunkKey, pass, geometry, groupEntry);
      }
    }

    this.chunkRevisions.set(revKey, {
      revision: chunk.revision,
      assetEpoch: this.assetEpoch,
    });
  }

  /**
   * Rebuilds meshes for the given placement (or specific dirty chunks).
   */
  public rebuildPlacementChunks(
    placement: Placement,
    options?: RebuildPlacementOptions
  ): void {
    this.updateAssetEpochIfNeeded(options);
    const assets = options?.assetSource ?? this.lastAssetSource ?? DEFAULT_EMPTY_ASSET_SOURCE;
    const uvLookup = options?.uvLookup ?? this.lastUvLookup;

    const groupEntry = this.getOrCreatePlacementGroup(placement);
    this.applyPlacementTransform(groupEntry, placement);

    // Remove meshes + chunkRevisions for any chunk keys no longer present in placement.volume.chunks
    this.removeDeletedChunkMeshes(placement, groupEntry);

    const forceRebuild = Boolean((options as any)?.forceRebuild);
    let targetChunkKeys: string[];

    if (options?.dirtyChunkKeys) {
      targetChunkKeys = options.dirtyChunkKeys;
    } else {
      targetChunkKeys = [];
      for (const [chunkKey, chunk] of placement.volume.chunks) {
        if (!forceRebuild) {
          const cached = this.chunkRevisions.get(`${placement.id}:${chunkKey}`);
          if (cached && cached.revision === chunk.revision && cached.assetEpoch === this.assetEpoch) {
            continue;
          }
        }
        targetChunkKeys.push(chunkKey);
      }
    }

    for (const chunkKey of targetChunkKeys) {
      this.rebuildSingleChunk(placement, groupEntry, chunkKey, assets, uvLookup);
    }
  }

  /**
   * Synchronizes entire project scene synchronously: creates new placements, removes deleted ones,
   * and updates chunk meshes.
   */
  public syncProject(project: Project, options?: SyncProjectOptions): void {
    this.updateAssetEpochIfNeeded(options);
    const projectPlacementIds = new Set(project.placements.map((p) => p.id));

    // Remove deleted placements
    for (const [placementId] of this.placementGroups) {
      if (!projectPlacementIds.has(placementId)) {
        this.removePlacement(placementId);
      }
    }

    // Rebuild or update each placement
    for (const placement of project.placements) {
      const dirtyChunkKeys = options?.dirtyChunkKeysByPlacement?.get(placement.id);
      this.rebuildPlacementChunks(placement, {
        assetSource: options?.assetSource ?? this.lastAssetSource,
        uvLookup: options?.uvLookup ?? this.lastUvLookup,
        dirtyChunkKeys,
      });
    }
  }

  /**
   * Prepares incremental queue of chunks needing rebuild without blocking the main thread.
   */
  public queueProjectSync(project: Project, options?: SyncProjectOptions): void {
    this.updateAssetEpochIfNeeded(options);
    this.queuedOptions = {
      assetSource: options?.assetSource ?? this.lastAssetSource,
      uvLookup: options?.uvLookup ?? this.lastUvLookup,
    };

    const projectPlacementIds = new Set(project.placements.map((p) => p.id));

    // Remove deleted placements
    for (const [placementId] of this.placementGroups) {
      if (!projectPlacementIds.has(placementId)) {
        this.removePlacement(placementId);
      }
    }

    // Create / update placement groups & transforms, and remove deleted chunks
    for (const placement of project.placements) {
      const groupEntry = this.getOrCreatePlacementGroup(placement);
      this.applyPlacementTransform(groupEntry, placement);
      this.removeDeletedChunkMeshes(placement, groupEntry);
    }

    // Populate pendingQueue
    this.clearChunkQueue();
    const queuedKeys = new Set<string>();

    for (const placement of project.placements) {
      const dirtyForPlacement = options?.dirtyChunkKeysByPlacement?.get(placement.id);
      if (dirtyForPlacement) {
        for (const chunkKey of dirtyForPlacement) {
          if (placement.volume.chunks.has(chunkKey)) {
            const fullKey = `${placement.id}:${chunkKey}`;
            if (!queuedKeys.has(fullKey)) {
              queuedKeys.add(fullKey);
              this.pendingQueue.push({ placement, chunkKey });
            }
          }
        }
      } else {
        for (const [chunkKey, chunk] of placement.volume.chunks) {
          const cached = this.chunkRevisions.get(`${placement.id}:${chunkKey}`);
          if (!cached || cached.revision !== chunk.revision || cached.assetEpoch !== this.assetEpoch) {
            const fullKey = `${placement.id}:${chunkKey}`;
            if (!queuedKeys.has(fullKey)) {
              queuedKeys.add(fullKey);
              this.pendingQueue.push({ placement, chunkKey });
            }
          }
        }
      }
    }
  }

  /**
   * Time-sliced chunk processor. Meshes pending chunks up to budgetMs (always at least 1).
   * Returns true if more chunks remain to be processed, false when finished.
   */
  public processChunkQueue(budgetMs = 10): boolean {
    if (this.queueIndex >= this.pendingQueue.length) {
      this.clearChunkQueue();
      return false;
    }

    const startTime = performance.now();
    const assets = this.queuedOptions.assetSource ?? this.lastAssetSource ?? DEFAULT_EMPTY_ASSET_SOURCE;
    const uvLookup = this.queuedOptions.uvLookup ?? this.lastUvLookup;

    while (this.queueIndex < this.pendingQueue.length) {
      const item = this.pendingQueue[this.queueIndex++];
      const { placement, chunkKey } = item;

      const groupEntry = this.placementGroups.get(placement.id);
      if (groupEntry) {
        this.rebuildSingleChunk(placement, groupEntry, chunkKey, assets, uvLookup);
      }

      if (performance.now() - startTime >= budgetMs) {
        break;
      }
    }

    if (this.queueIndex >= this.pendingQueue.length) {
      this.clearChunkQueue();
      return false;
    }

    return true;
  }

  /**
   * Clears the incremental chunk queue.
   */
  public clearChunkQueue(): void {
    this.pendingQueue = [];
    this.queueIndex = 0;
  }

  /**
   * Returns the number of chunks currently pending in the incremental queue.
   */
  public getPendingChunkCount(): number {
    return Math.max(0, this.pendingQueue.length - this.queueIndex);
  }

  /**
   * Removes a placement and disposes its geometries and groups.
   */
  public removePlacement(placementId: string): void {
    const groupEntry = this.placementGroups.get(placementId);
    if (groupEntry) {
      this.rootGroup.remove(groupEntry.root);
      this.placementGroups.delete(placementId);
    }

    // 1. Dispose and remove all batch buckets for this placement
    const passes: MeshPass[] = ['opaque', 'cutout', 'translucent', 'emissive'];
    for (const pass of passes) {
      const bucketKey = `${placementId}:${pass}`;
      const buckets = this.placementBuckets.get(bucketKey);
      if (buckets) {
        for (const bucket of buckets) {
          bucket.mesh.dispose();
        }
        this.placementBuckets.delete(bucketKey);
      }
    }

    // 2. Dispose standalone meshes and delete active slots for this placement
    for (const [key, slot] of this.activeChunkSlots) {
      if (key.startsWith(`${placementId}:`)) {
        if (slot.standaloneMesh) {
          slot.standaloneMesh.geometry.dispose();
        }
        this.activeChunkSlots.delete(key);
      }
    }

    // 3. Remove chunkRevisions belonging to this placement
    for (const key of Array.from(this.chunkRevisions.keys())) {
      if (key.startsWith(`${placementId}:`)) {
        this.chunkRevisions.delete(key);
      }
    }

    // 4. Filter pendingQueue if it contains items for this placement
    if (this.pendingQueue.length > 0) {
      this.pendingQueue = this.pendingQueue.filter(
        (item) => item.placement.id !== placementId
      );
      if (this.queueIndex >= this.pendingQueue.length) {
        this.clearChunkQueue();
      }
    }
  }

  /**
   * Clears all active meshes and placement groups, disposing all geometries.
   */
  public clear(): void {
    for (const buckets of this.placementBuckets.values()) {
      for (const bucket of buckets) {
        bucket.mesh.dispose();
      }
    }
    this.placementBuckets.clear();

    for (const slot of this.activeChunkSlots.values()) {
      if (slot.standaloneMesh) {
        slot.standaloneMesh.geometry.dispose();
      }
    }
    this.activeChunkSlots.clear();

    for (const [, groupEntry] of this.placementGroups) {
      this.rootGroup.remove(groupEntry.root);
    }
    this.placementGroups.clear();
    this.chunkRevisions.clear();
    this.clearChunkQueue();
  }

  /**
   * Returns current scene statistics.
   */
  public getStats(): ChunkSceneStats {
    let triangleCount = 0;
    const uniqueChunks = new Set<string>();

    for (const [key, slot] of this.activeChunkSlots) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        uniqueChunks.add(`${parts[0]}:${parts[1]}`);
      }
      triangleCount += slot.triangleCount;
    }

    let meshCount = 0;
    for (const buckets of this.placementBuckets.values()) {
      for (const bucket of buckets) {
        if (bucket.usedInstances > 0) {
          meshCount++;
        }
      }
    }
    for (const slot of this.activeChunkSlots.values()) {
      if (slot.standaloneMesh) {
        meshCount++;
      }
    }

    return {
      meshCount,
      chunkCount: uniqueChunks.size,
      placementCount: this.placementGroups.size,
      triangleCount: Math.round(triangleCount),
    };
  }

  /**
   * Disposes all materials, geometries, and clears scene.
   */
  public dispose(): void {
    this.clear();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
  }
}
