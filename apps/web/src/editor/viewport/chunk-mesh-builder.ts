// apps/web/src/editor/viewport/chunk-mesh-builder.ts
// Three.js chunk mesh builder and scene manager (Slice E3.2, AD-3).
// Manages one THREE.BufferGeometry/THREE.Mesh per (placementId, chunkKey, pass).

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

  // Key: `${placementId}:${chunkKey}:${pass}`
  private activeMeshes: Map<string, THREE.Mesh> = new Map();
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
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
      }),
      cutout: new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        transparent: false,
      }),
      translucent: new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      }),
      emissive: new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
      }),
    };
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
            const meshKey = `${placement.id}:${chunkKey}:${pass}`;
            const existingMesh = this.activeMeshes.get(meshKey);
            if (existingMesh) {
              groupEntry.inner.remove(existingMesh);
              existingMesh.geometry.dispose();
              this.activeMeshes.delete(meshKey);
            }
          }
          this.chunkRevisions.delete(revKey);
        }
      }
    }

    for (const [meshKey, mesh] of this.activeMeshes) {
      if (meshKey.startsWith(prefix)) {
        const parts = meshKey.split(':');
        if (parts.length >= 2) {
          const chunkKey = parts[1];
          if (!placement.volume.chunks.has(chunkKey)) {
            groupEntry.inner.remove(mesh);
            mesh.geometry.dispose();
            this.activeMeshes.delete(meshKey);
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

    // 1. Remove and dispose previous meshes for this chunk
    for (const pass of passes) {
      const meshKey = `${placement.id}:${chunkKey}:${pass}`;
      const existingMesh = this.activeMeshes.get(meshKey);
      if (existingMesh) {
        groupEntry.inner.remove(existingMesh);
        existingMesh.geometry.dispose();
        this.activeMeshes.delete(meshKey);
      }
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

    // Create at most 1 THREE.Mesh per non-empty pass
    for (const pass of passes) {
      const passBuffer = meshOutput.passes[pass];
      const geometry = buildBufferGeometryFromPass(passBuffer);
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, this.materials[pass]);
        mesh.name = `${placement.id}:${chunkKey}:${pass}`;
        groupEntry.inner.add(mesh);
        this.activeMeshes.set(mesh.name, mesh);
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

    // Remove and dispose active meshes belonging to this placement
    for (const [key, mesh] of this.activeMeshes) {
      if (key.startsWith(`${placementId}:`)) {
        mesh.geometry.dispose();
        this.activeMeshes.delete(key);
      }
    }

    // Remove chunkRevisions belonging to this placement
    for (const key of Array.from(this.chunkRevisions.keys())) {
      if (key.startsWith(`${placementId}:`)) {
        this.chunkRevisions.delete(key);
      }
    }

    // Filter pendingQueue if it contains items for this placement
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
    for (const [, mesh] of this.activeMeshes) {
      mesh.geometry.dispose();
    }
    this.activeMeshes.clear();

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

    for (const [key, mesh] of this.activeMeshes) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        uniqueChunks.add(`${parts[0]}:${parts[1]}`);
      }
      if (mesh.geometry.index) {
        triangleCount += mesh.geometry.index.count / 3;
      } else if (mesh.geometry.attributes.position) {
        triangleCount += mesh.geometry.attributes.position.count / 3;
      }
    }

    return {
      meshCount: this.activeMeshes.size,
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
