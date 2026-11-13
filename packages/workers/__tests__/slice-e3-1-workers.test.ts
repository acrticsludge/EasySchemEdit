// packages/workers/__tests__/slice-e3-1-workers.test.ts
// Unit tests for Slice E3.1: Worker handlers (import, export, mesh), cancellation, and revision rule.
// Zero external test runner dependencies. Runs with node --experimental-strip-types.

import {
  handleImportRequest,
  handleExportRequest,
  handleMeshRequest,
  shouldApplyWorkerResult,
} from '../src/index.ts';
import { exportSchematic } from '../../formats/index.ts';
import { blockStateId, CANONICAL_AIR } from '../../domain/block-state.ts';
import type { Bounds3i, Vec3i } from '../../domain/types.ts';
import type { Transform } from '../../domain/coordinates.ts';
import type { Placement } from '../../domain/placement.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`PASS: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
    console.log(`PASS: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createTestPlacement(
  id: string,
  name: string,
  width: number,
  height: number,
  length: number,
  origin: [number, number, number],
  translation: Vec3i,
  blockMap: Map<string, any>,
): Placement {
  const bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [width, height, length] };
  const CHUNK_SIZE = 16;
  const chunks = new Map<string, any>();
  let nonAirCount = 0;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const state = blockMap.get(`${x}_${y}_${z}`) ?? CANONICAL_AIR;
        if (state.id !== 'minecraft:air') nonAirCount++;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const ckey = `${cx}_${cy}_${cz}`;

        let chunk = chunks.get(ckey);
        if (!chunk) {
          chunk = {
            key: ckey,
            palette: [CANONICAL_AIR],
            indices: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE),
            revision: 0,
          };
          chunks.set(ckey, chunk);
        }

        const lx = x % CHUNK_SIZE;
        const ly = y % CHUNK_SIZE;
        const lz = z % CHUNK_SIZE;
        const li = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

        let pIdx = 0;
        if (state.id !== 'minecraft:air') {
          let found = -1;
          for (let i = 1; i < chunk.palette.length; i++) {
            if (
              chunk.palette[i].id === state.id &&
              JSON.stringify(chunk.palette[i].props) === JSON.stringify(state.props)
            ) {
              found = i;
              break;
            }
          }
          if (found >= 0) {
            pIdx = found;
          } else {
            pIdx = chunk.palette.length;
            chunk.palette.push(state);
          }
        }
        chunk.indices[li] = pIdx;
      }
    }
  }

  const transform: Transform = { translation, rotationY: 0, mirror: 'none' };
  const ancillary = {
    blockEntities: new Map<string, any>(),
    entities: [],
    biomes: undefined,
    pendingBlockTicks: [],
    pendingFluidTicks: [],
    unknownTags: new Map<string, any>(),
  };

  return {
    id,
    name,
    volume: {
      bounds,
      chunkSize: CHUNK_SIZE,
      chunks,
      nonAirCount,
      paletteCardinality: chunks.size > 0 ? Array.from(chunks.values())[0].palette.length : 1,
    },
    transform,
    origin,
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: {
      format: 'schem-v3',
      filename: undefined,
      regionName: name,
      dataVersion: 3955,
      formatVersion: 3,
      diagnostics: [],
    },
    eraseTombstones: new Set(),
    ancillary,
  } as any as Placement;
}

async function runTests(): Promise<void> {
  console.log('=== Slice E3.1 Workers Unit Tests ===\n');

  // Setup test snapshot
  const stone = blockStateId('minecraft:stone');
  const blockMap = new Map<string, any>([['0_0_0', stone]]);
  const placement = createTestPlacement('p1', 'p1', 1, 1, 1, [0, 0, 0], [0, 0, 0], blockMap);
  const snapshot = {
    schemaVersion: 1,
    id: 'proj1',
    name: 'test_project',
    placements: [placement],
    importGroups: [],
    overlapPolicy: 'top-wins' as const,
    revision: 3,
  };

  // --------------------------------------------------------------------------
  // 1. handleExportRequest (schem-v3 and litematic)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. handleExportRequest ---');
  const expV3 = await handleExportRequest('req-exp-1', {
    targetFormat: 'schem-v3',
    snapshot,
    baseRevision: 3,
  });
  assertEqual(expV3.type, 'result', 'export schem-v3 succeeds');
  const expV3Payload = (expV3 as any).payload;
  assert(expV3Payload.bytes instanceof Uint8Array, 'export schem-v3 returns Uint8Array');
  assertEqual(expV3Payload.filename, 'test_project.schem', 'export schem-v3 filename matches');
  assertEqual(expV3Payload.baseRevision, 3, 'export schem-v3 baseRevision preserved');
  assertEqual(expV3Payload.report.format, 'schem-v3', 'export report format is schem-v3');

  const expLite = await handleExportRequest('req-exp-2', {
    targetFormat: 'litematic',
    snapshot,
    baseRevision: 4,
  });
  assertEqual(expLite.type, 'result', 'export litematic succeeds');
  const expLitePayload = (expLite as any).payload;
  assert(expLitePayload.bytes instanceof Uint8Array, 'export litematic returns Uint8Array');
  assert(expLitePayload.filename.endsWith('.litematic'), 'export litematic filename ends with .litematic');
  assertEqual(expLitePayload.baseRevision, 4, 'export litematic baseRevision preserved');

  // --------------------------------------------------------------------------
  // 2. handleImportRequest (round-trip with exported Sponge v3)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. handleImportRequest ---');
  const impRes = await handleImportRequest('req-imp-1', {
    bytes: expV3Payload.bytes,
    fileName: expV3Payload.filename,
    baseRevision: 3,
  });
  assertEqual(impRes.type, 'result', 'import schem-v3 succeeds');
  const impPayload = (impRes as any).payload;
  assert(Array.isArray(impPayload.placements), 'imported placements is an array');
  assertEqual(impPayload.placements.length, 1, 'imported exactly 1 placement');
  assertEqual(impPayload.report.format.kind, 'schem-v3', 'imported format detected as schem-v3');
  assertEqual(impPayload.baseRevision, 3, 'import baseRevision preserved');

  // --------------------------------------------------------------------------
  // 3. handleMeshRequest (16³ chunk with stone block)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. handleMeshRequest ---');
  const meshRes = handleMeshRequest('req-mesh-1', {
    chunk: {
      key: '0,0,0',
      origin: [0, 0, 0],
      getBlock: (lx, ly, lz) => (lx === 0 && ly === 0 && lz === 0 ? 'minecraft:stone' : null),
    },
    placementId: 'p1',
    baseRevision: 3,
  });
  assertEqual(meshRes.type, 'result', 'handleMeshRequest succeeds');
  const meshPayload = (meshRes as any).payload;
  assertEqual(meshPayload.chunkKey, '0,0,0', 'mesh chunkKey matches');
  assertEqual(meshPayload.placementId, 'p1', 'mesh placementId matches');
  assertEqual(meshPayload.baseRevision, 3, 'mesh baseRevision preserved');

  assert(meshPayload.mesh !== undefined, 'mesh payload contains mesh object');
  const opaquePass = meshPayload.mesh.passes?.opaque ?? meshPayload.mesh.opaque;
  assert(opaquePass !== null && opaquePass !== undefined, 'opaque pass is populated');
  assertEqual(opaquePass.vertexCount, 24, 'single stone block produces 24 vertices (6 faces * 4 verts)');
  assertEqual(opaquePass.faceCount, 6, 'single stone block produces 6 faces');
  assert(opaquePass.indices.length > 0, 'opaque pass has non-zero indices');
  assertEqual(opaquePass.indices.length, 36, 'single stone block has 36 indices (6 faces * 6 indices)');

  // --------------------------------------------------------------------------
  // 4. Cancellation Handling
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Cancellation Handling ---');
  const cancelImp = await handleImportRequest(
    'req-cancel-imp',
    { bytes: expV3Payload.bytes, fileName: 'test.schem' },
    () => true,
  );
  assertEqual(cancelImp.type, 'cancelled', 'handleImportRequest cancelled returns cancelled');

  const cancelExp = await handleExportRequest(
    'req-cancel-exp',
    { targetFormat: 'schem-v3', snapshot },
    () => true,
  );
  assertEqual(cancelExp.type, 'cancelled', 'handleExportRequest cancelled returns cancelled');

  const cancelMesh = handleMeshRequest(
    'req-cancel-mesh',
    { chunk: { key: '0,0,0' } },
    () => true,
  );
  assertEqual(cancelMesh.type, 'cancelled', 'handleMeshRequest cancelled returns cancelled');

  // --------------------------------------------------------------------------
  // 5. Stale-Revision Discard Rule: shouldApplyWorkerResult
  // --------------------------------------------------------------------------
  console.log('\n--- 5. shouldApplyWorkerResult ---');
  assertEqual(shouldApplyWorkerResult(undefined, 5), true, 'undefined baseRevision is applied');
  assertEqual(shouldApplyWorkerResult(5, 5), true, 'matching baseRevision 5 === 5 is applied');
  assertEqual(shouldApplyWorkerResult(4, 5), false, 'stale baseRevision 4 !== 5 is discarded');
  assertEqual(shouldApplyWorkerResult(6, 5), false, 'mismatched baseRevision 6 !== 5 is discarded');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
