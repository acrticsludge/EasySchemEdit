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
    for (const mat of Object.values(this.materials)) {
      (mat as any).map = texture;
      mat.needsUpdate = true;
    }
  }

  /**
   * Rebuilds meshes for the given placement (or specific dirty chunks).
   */
  public rebuildPlacementChunks(
    placement: Placement,
    options?: RebuildPlacementOptions
  ): void {
    const assets = options?.assetSource ?? DEFAULT_EMPTY_ASSET_SOURCE;
    const uvLookup = options?.uvLookup;

    // Get or create placement group hierarchy
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

    // Apply placement transform & visibility
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

    // Determine which chunk keys to mesh
    const targetChunkKeys: string[] = options?.dirtyChunkKeys
      ? options.dirtyChunkKeys
      : Array.from(placement.volume.chunks.keys());

    const passes: MeshPass[] = ['opaque', 'cutout', 'translucent', 'emissive'];

    for (const chunkKey of targetChunkKeys) {
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
      if (!chunk) continue;

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
    }
  }

  /**
   * Synchronizes entire project scene: creates new placements, removes deleted ones,
   * and updates chunk meshes.
   */
  public syncProject(project: Project, options?: SyncProjectOptions): void {
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
        assetSource: options?.assetSource,
        uvLookup: options?.uvLookup,
        dirtyChunkKeys,
      });
    }
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
