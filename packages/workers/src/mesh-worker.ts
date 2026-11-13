// packages/workers/src/mesh-worker.ts
// Chunk meshing worker — receives chunk data, neighbor chunks, and models; produces typed arrays per pass.
// SUBSPEC-H §5, AD-3: Heavy geometry processing off main thread; typed messages with ArrayBuffer transfers.

import type {
  WorkerMessage,
  WorkerMessageToMain,
  WorkerCancelResult,
  MeshWorkerPayload,
  ChunkData,
  ResolvedModel,
} from './worker-protocol.ts';
import {
  meshChunk,
  type ChunkMeshInput,
  type ChunkMeshOutput,
  type AssetSource,
  type BlockLookupResult,
} from '../../renderer/src/index.ts';

/**
 * Extracts transferable ArrayBuffers from non-empty passes of a meshed chunk output.
 */
export function getMeshTransfers(output: ChunkMeshOutput): ArrayBufferLike[] {
  const transfers: ArrayBufferLike[] = [];
  for (const passName of ['opaque', 'cutout', 'translucent', 'emissive'] as const) {
    const buf = output.passes[passName];
    if (buf) {
      if (buf.positions?.buffer && !transfers.includes(buf.positions.buffer)) transfers.push(buf.positions.buffer);
      if (buf.normals?.buffer && !transfers.includes(buf.normals.buffer)) transfers.push(buf.normals.buffer);
      if (buf.uvs?.buffer && !transfers.includes(buf.uvs.buffer)) transfers.push(buf.uvs.buffer);
      if (buf.colors?.buffer && !transfers.includes(buf.colors.buffer)) transfers.push(buf.colors.buffer);
      if (buf.indices?.buffer && !transfers.includes(buf.indices.buffer)) transfers.push(buf.indices.buffer);
    }
  }
  return transfers;
}

/**
 * Core handler for chunk meshing requests.
 * Runs in worker thread or directly in tests / Node environments.
 */
export function handleMeshRequest(
  requestId: string,
  payload: MeshWorkerPayload,
  isCancelled?: () => boolean,
): WorkerMessageToMain {
  if (isCancelled?.()) {
    return { requestId, type: 'cancelled' };
  }

  try {
    // Build neighbor map
    const neighborMap = new Map<string, ChunkData>();
    if (payload.neighborChunks instanceof Map) {
      for (const [k, v] of payload.neighborChunks) {
        neighborMap.set(k, v);
      }
    } else if (payload.neighborChunks && typeof payload.neighborChunks === 'object') {
      for (const [k, v] of Object.entries(payload.neighborChunks)) {
        neighborMap.set(k, v);
      }
    }

    // Build model map
    const modelMap = new Map<string, ResolvedModel>();
    if (payload.models instanceof Map) {
      for (const [k, v] of payload.models) {
        modelMap.set(k, v);
      }
    } else if (payload.models && typeof payload.models === 'object') {
      for (const [k, v] of Object.entries(payload.models)) {
        modelMap.set(k, v);
      }
    }

    // Adapt to AssetSource
    const assetSource: AssetSource = {
      getBlockState(id: string) {
        if (payload.models && typeof (payload.models as any).getBlockState === 'function') {
          return (payload.models as any).getBlockState(id);
        }
        if (modelMap.has(id)) {
          const m = modelMap.get(id);
          if (m?.variants || m?.multipart) return m;
        }
        const normId = id.startsWith('minecraft:') ? id : `minecraft:${id}`;
        if (modelMap.has(normId)) {
          const m = modelMap.get(normId);
          if (m?.variants || m?.multipart) return m;
        }
        return undefined;
      },
      getModel(id: string) {
        if (payload.models && typeof (payload.models as any).getModel === 'function') {
          return (payload.models as any).getModel(id);
        }
        if (modelMap.has(id)) {
          const m = modelMap.get(id);
          if (m?.elements || m?.parent || m?.textures) return m;
        }
        const normId = id.startsWith('minecraft:') ? id : `minecraft:${id}`;
        if (modelMap.has(normId)) {
          const m = modelMap.get(normId);
          if (m?.elements || m?.parent || m?.textures) return m;
        }
        return undefined;
      },
    };

    // Adapt atlas
    const getTextureUv = payload.atlas
      ? (textureId: string) => {
          if (typeof payload.atlas?.getTextureUv === 'function') {
            return payload.atlas.getTextureUv(textureId);
          }
          if (payload.atlas instanceof Map) {
            return payload.atlas.get(textureId);
          }
          return payload.atlas[textureId] ?? payload.atlas?.textures?.[textureId];
        }
      : undefined;

    // Cross-chunk neighbor accessor
    const getNeighborBlock = (lx: number, ly: number, lz: number): BlockLookupResult => {
      if (payload.chunk.getBlock && (lx < 0 || lx >= 16 || ly < 0 || ly >= 16 || lz < 0 || lz >= 16)) {
        const direct = payload.chunk.getBlock(lx, ly, lz);
        if (direct !== null && direct !== undefined) return direct;
      }

      const cxOffset = Math.floor(lx / 16);
      const cyOffset = Math.floor(ly / 16);
      const czOffset = Math.floor(lz / 16);
      const localX = ((lx % 16) + 16) % 16;
      const localY = ((ly % 16) + 16) % 16;
      const localZ = ((lz % 16) + 16) % 16;

      let baseCx = 0;
      let baseCy = 0;
      let baseCz = 0;
      if (payload.chunk.origin) {
        baseCx = Math.floor(payload.chunk.origin[0] / 16);
        baseCy = Math.floor(payload.chunk.origin[1] / 16);
        baseCz = Math.floor(payload.chunk.origin[2] / 16);
      } else if (payload.chunk.key) {
        const m = payload.chunk.key.match(/(-?\d+)[,_](-?\d+)[,_](-?\d+)$/);
        if (m) {
          baseCx = parseInt(m[1]!, 10);
          baseCy = parseInt(m[2]!, 10);
          baseCz = parseInt(m[3]!, 10);
        }
      }

      const ncx = baseCx + cxOffset;
      const ncy = baseCy + cyOffset;
      const ncz = baseCz + czOffset;

      const candidateKeys = [
        `${ncx}_${ncy}_${ncz}`,
        `${ncx},${ncy},${ncz}`,
        `${cxOffset}_${cyOffset}_${czOffset}`,
        `${cxOffset},${cyOffset},${czOffset}`,
      ];
      if (payload.placementId) {
        candidateKeys.unshift(`${payload.placementId}:${ncx}_${ncy}_${ncz}`);
        candidateKeys.unshift(`${payload.placementId}:${ncx},${ncy},${ncz}`);
      }

      let neighbor: ChunkData | undefined;
      for (const k of candidateKeys) {
        if (neighborMap.has(k)) {
          neighbor = neighborMap.get(k);
          break;
        }
      }

      if (!neighbor) return null;

      if (neighbor.getBlock) {
        return neighbor.getBlock(localX, localY, localZ);
      }
      if (neighbor.indices && neighbor.palette) {
        const idx = localX + localZ * 16 + localY * 256;
        const pIdx = neighbor.indices[idx];
        return pIdx !== undefined ? neighbor.palette[pIdx] : null;
      }
      return null;
    };

    const meshInput: ChunkMeshInput = {
      chunkKey: payload.chunk.key,
      chunkOrigin: payload.chunk.origin,
      getBlock: payload.chunk.getBlock,
      palette: payload.chunk.palette,
      indices: payload.chunk.indices,
      getNeighborBlock,
      assets: assetSource,
      getTextureUv,
    };

    const output = meshChunk(meshInput);

    if (isCancelled?.()) {
      return { requestId, type: 'cancelled' };
    }

    // Attach passes directly to mesh for convenient consumer access
    const meshResult = Object.assign({}, output, output.passes);

    return {
      requestId,
      type: 'result',
      payload: {
        mesh: meshResult,
        placementId: payload.placementId,
        chunkKey: payload.chunk.key,
        baseRevision: payload.baseRevision,
      },
    };
  } catch (err) {
    return {
      requestId,
      type: 'error',
      code: (err as any)?.code ?? 'WORKER_MESH_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// Guarded browser worker event listener
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  let cancelled = false;

  self.addEventListener('message', (event: MessageEvent<WorkerMessage<any>>) => {
    const { requestId, type, payload } = event.data;

    if (type === 'cancel') {
      cancelled = true;
      const cancelResult: WorkerCancelResult = { requestId, type: 'cancelled' };
      self.postMessage(cancelResult);
      return;
    }

    cancelled = false;

    if (type !== 'mesh') {
      self.postMessage({
        requestId,
        type: 'error',
        code: 'WORKER_UNKNOWN_MESSAGE',
        message: `Unknown message type: ${type}`,
      });
      return;
    }

    const result = handleMeshRequest(requestId, payload as MeshWorkerPayload, () => cancelled);

    if (result.type === 'result' && (result as any).payload?.mesh) {
      const transfers = getMeshTransfers((result as any).payload.mesh);
      if (transfers.length > 0) {
        (self as any).postMessage(result, transfers);
        return;
      }
    }

    self.postMessage(result);
  });
}
