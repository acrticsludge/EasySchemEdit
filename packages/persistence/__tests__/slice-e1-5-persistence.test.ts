// packages/persistence/__tests__/slice-e1-5-persistence.test.ts
// Acceptance tests for slice E1.5: Persistence, IndexedDB, .vxproj ZIP, and Build Library.

import 'fake-indexeddb/auto';
import { zipSync, unzipSync } from 'fflate';
import type {
  Project,
  Placement,
  ChunkedVoxelVolume,
  VoxelChunk,
} from '@easyschemedit/domain';
import {
  saveProject,
  getProject,
  saveChunk,
  getChunk,
  saveRecovery,
  getRecovery,
  clearRecovery,
  type RecoveryEntry,
  type ProjectArchive,
  type ChunkBlob,
  StorageBudgetManager,
  ProjectStoreError,
  packVxprojArchive,
  unpackVxprojArchive,
  saveLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  deleteLibraryEntry,
  getLibraryStorageStats,
  type LibraryEntry,
  setIDBFactory,
  closeDB,
} from '../src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown, expectedPattern: RegExp, message: string): void {
  try {
    fn();
    failed++;
    console.error(`FAIL: ${message} — expected exception matching ${expectedPattern}, but nothing was thrown`);
  } catch (err) {
    const errStr = String(err);
    if (expectedPattern.test(errStr)) {
      passed++;
    } else {
      failed++;
      console.error(`FAIL: ${message} — exception ${errStr} did not match pattern ${expectedPattern}`);
    }
  }
}

async function runTests(): Promise<void> {
  console.log('--- Test 1: IndexedDB Project & Chunks Storage ---');
  {
    const sampleChunk: VoxelChunk = {
      key: '0_0_0',
      palette: [
        { id: 'minecraft:air', props: {} },
        { id: 'minecraft:stone', props: {} },
        { id: 'minecraft:oak_stairs', props: { facing: 'north', half: 'bottom' } },
      ],
      indices: new Uint8Array(4096),
      revision: 1,
    };
    sampleChunk.indices[0] = 1;
    sampleChunk.indices[1] = 2;

    const chunksMap = new Map<string, VoxelChunk>();
    chunksMap.set('0_0_0', sampleChunk);

    const sampleVolume: ChunkedVoxelVolume = {
      bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
      chunkSize: 16,
      chunks: chunksMap,
      nonAirCount: 2,
      paletteCardinality: 3,
    };

    const samplePlacement: Placement = {
      id: 'p-1',
      name: 'Test House',
      volume: sampleVolume,
      transform: {
        translation: [10, 0, -5],
        rotationY: 90,
        mirror: 'none',
      },
      origin: [0, 0, 0],
      ancillary: {
        blockEntities: new Map([
          ['0_0_1', { position: [0, 0, 1], nbt: { type: 'compound', value: { id: { type: 'string', value: 'minecraft:chest' } } } as any }],
        ]),
        entities: [],
        pendingBlockTicks: [],
        pendingFluidTicks: [],
        unknownTags: new Map(),
      },
      visible: true,
      locked: false,
      lockReason: undefined,
      color: '#ffaa00',
      createdAt: '2026-11-13T12:00:00.000Z',
      source: { format: 'schem-v3', filename: 'house.schem', diagnostics: [] },
      eraseTombstones: new Set(['0_0_2']),
    };

    const sampleProject: Project = {
      schemaVersion: 1,
      id: 'proj-e1-5-test',
      name: 'E1.5 Test Project',
      placements: [samplePlacement],
      importGroups: [],
      overlapPolicy: 'top-wins',
      conflictOverlay: 'conflicts',
      metadata: {
        author: 'Builder',
        createdAt: '2026-11-13T10:00:00.000Z',
        modifiedAt: '2026-11-13T12:00:00.000Z',
      },
      revision: 1,
    };

    // Save project archive
    const archive: ProjectArchive = {
      projectId: sampleProject.id,
      revision: 1,
      projectJson: JSON.stringify(sampleProject),
      manifestJson: '{"version":1}',
      savedAt: '2026-11-13T12:00:00.000Z',
    };
    await saveProject(archive);

    // Load back project archive
    const loaded = await getProject(sampleProject.id);
    assert(loaded !== null, 'T1: getProject returns non-null');
    assertEqual(loaded?.projectId, sampleProject.id, 'T1: loaded projectId matches');
    assertEqual(loaded?.revision, 1, 'T1: loaded revision matches');
    const parsedProject = JSON.parse(loaded!.projectJson) as Project;
    assertEqual(parsedProject.name, sampleProject.name, 'T1: loaded project name matches');
    assertEqual(parsedProject.placements.length, 1, 'T1: placement count matches');
    assertEqual(parsedProject.placements[0].name, 'Test House', 'T1: placement name matches');

    // Save chunk blob
    const rawChunkData = new Uint8Array([0x56, 0x4f, 0x4f, 0x58, 1, 2, 3, 4]).buffer;
    const chunkBlob: ChunkBlob = {
      chunkKey: '0_0_0',
      projectId: sampleProject.id,
      data: rawChunkData,
      savedAt: '2026-11-13T12:00:00.000Z',
    };
    await saveChunk(chunkBlob);

    // Read chunk blob back
    const loadedChunk = await getChunk('0_0_0', sampleProject.id);
    assert(loadedChunk !== null, 'T1: getChunk returns non-null');
    assertEqual(loadedChunk?.chunkKey, '0_0_0', 'T1: chunkKey matches');
    assertEqual(loadedChunk?.projectId, sampleProject.id, 'T1: projectId matches');
    assertEqual(loadedChunk?.data.byteLength, rawChunkData.byteLength, 'T1: chunk data byteLength matches');
  }

  console.log('--- Test 2: .vxproj Archive ZIP Round-Trip & Tamper Resistance ---');
  {
    const sampleChunk: VoxelChunk = {
      key: '1_-2_3',
      palette: [
        { id: 'minecraft:air', props: {} },
        { id: 'minecraft:stone_bricks', props: {} },
      ],
      indices: new Uint8Array(4096),
      revision: 0,
    };
    sampleChunk.indices[42] = 1;

    const chunks = new Map<string, VoxelChunk>();
    chunks.set('1_-2_3', sampleChunk);

    const project: Project = {
      schemaVersion: 1,
      id: 'proj-roundtrip-zip',
      name: 'Zip Roundtrip Project',
      placements: [
        {
          id: 'p-roundtrip',
          name: 'Watchtower',
          volume: {
            bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
            chunkSize: 16,
            chunks,
            nonAirCount: 1,
            paletteCardinality: 2,
          },
          transform: {
            translation: [25, 64, -10],
            rotationY: 180,
            mirror: 'x',
          },
          origin: [0, 0, 0],
          ancillary: {
            blockEntities: new Map([
              ['1_2_3', { position: [1, 2, 3], nbt: { type: 'compound', value: { id: { type: 'string', value: 'minecraft:beacon' } } } as any }],
            ]),
            entities: [],
            pendingBlockTicks: [],
            pendingFluidTicks: [],
            unknownTags: new Map(),
          },
          visible: true,
          locked: true,
          lockReason: 'user',
          color: '#00ffcc',
          createdAt: '2026-11-13T14:30:00.000Z',
          source: { format: 'litematic', filename: 'tower.litematic', diagnostics: [] },
          eraseTombstones: new Set(['1_2_4']),
        },
      ],
      importGroups: [],
      overlapPolicy: 'bottom-wins',
      conflictOverlay: 'full',
      metadata: {
        author: 'Architect',
        createdAt: '2026-11-13T14:00:00.000Z',
        modifiedAt: '2026-11-13T14:30:00.000Z',
      },
      revision: 4,
    };

    // Pack into ZIP
    const zipBytes = packVxprojArchive(project);
    assert(zipBytes.length > 0, 'T2: packVxprojArchive returns non-empty byte array');

    // Unpack from ZIP
    const restored = unpackVxprojArchive(zipBytes);
    assertEqual(restored.id, project.id, 'T2: unpacked project id matches');
    assertEqual(restored.name, project.name, 'T2: unpacked project name matches');
    assertEqual(restored.revision, project.revision, 'T2: unpacked revision matches');
    assertEqual(restored.overlapPolicy, project.overlapPolicy, 'T2: unpacked overlapPolicy matches');
    assertEqual(restored.conflictOverlay, project.conflictOverlay, 'T2: unpacked conflictOverlay matches');
    assertEqual(restored.placements.length, 1, 'T2: placements length matches');

    const p = restored.placements[0];
    assertEqual(p.id, 'p-roundtrip', 'T2: placement id matches');
    assertEqual(p.name, 'Watchtower', 'T2: placement name matches');
    assertEqual(p.transform.rotationY, 180, 'T2: transform rotationY matches');
    assertEqual(p.transform.mirror, 'x', 'T2: transform mirror matches');
    assertEqual(p.locked, true, 'T2: placement locked state matches');
    assertEqual(p.eraseTombstones.has('1_2_4'), true, 'T2: eraseTombstones set restored');
    assertEqual(
      (p.ancillary.blockEntities.get('1_2_3')?.nbt as any)?.value?.id?.value,
      'minecraft:beacon',
      'T2: blockEntities Map restored'
    );

    const restoredChunk = p.volume.chunks.get('1_-2_3');
    assert(restoredChunk !== undefined, 'T2: chunk restored in volume chunks map');
    assertEqual(restoredChunk?.palette[1]?.id, 'minecraft:stone_bricks', 'T2: chunk palette entry restored');
    assertEqual(restoredChunk?.indices[42], 1, 'T2: chunk indices array data restored');

    // Tampering test: tamper with a byte in chunk binary
    const unzipped = unzipSync(zipBytes);
    const chunkPath = 'placements/p-roundtrip/chunks/1_-2_3.bin';
    assert(Boolean(unzipped[chunkPath]), 'T2: chunk file found in unzipped structure');
    const tamperedChunkData = new Uint8Array(unzipped[chunkPath]);
    tamperedChunkData[20] ^= 0xff; // flip bits in payload
    unzipped[chunkPath] = tamperedChunkData;
    const tamperedZip = zipSync(unzipped);

    assertThrows(
      () => unpackVxprojArchive(tamperedZip),
      /CHECKSUM_MISMATCH/,
      'T2: tampered zip entry is rejected on unpack with CHECKSUM_MISMATCH'
    );

    // Tampering test: unexpected file
    const unzippedWithExtra = unzipSync(zipBytes);
    unzippedWithExtra['malicious.txt'] = new TextEncoder().encode('bad');
    const extraZip = zipSync(unzippedWithExtra);
    assertThrows(
      () => unpackVxprojArchive(extraZip),
      /UNEXPECTED_ENTRY/,
      'T2: unexpected file in zip rejected on unpack with UNEXPECTED_ENTRY'
    );

    // Tampering test: path traversal attempt
    const unzippedTraversal = unzipSync(zipBytes);
    unzippedTraversal['../escaped.txt'] = new TextEncoder().encode('bad');
    const traversalZip = zipSync(unzippedTraversal);
    assertThrows(
      () => unpackVxprojArchive(traversalZip),
      /PATH_TRAVERSAL/,
      'T2: path traversal rejected on unpack with PATH_TRAVERSAL'
    );
  }

  console.log('--- Test 3: Storage Budget & Quota Handling ---');
  {
    // Save project revision 1
    const pId = 'proj-budget-test';
    const initialArchive: ProjectArchive = {
      projectId: pId,
      revision: 1,
      projectJson: JSON.stringify({ id: pId, name: 'Budget Project Rev 1', revision: 1 }),
      manifestJson: '{}',
      savedAt: '2026-11-13T12:00:00.000Z',
    };
    await saveProject(initialArchive);

    const sbm = new StorageBudgetManager({
      warningThreshold: 0.8,
      criticalThreshold: 0.9,
    });

    // Simulate quota check under threshold
    const budgetCheckOk = sbm.checkBudget(1024);
    assert(budgetCheckOk.ok === true, 'T3: checkBudget ok when no quota exceeded');

    // Attempt invalid revision commit (e.g. revision 4 when current is 1)
    let errorSurfaced = false;
    try {
      await saveProject({
        projectId: pId,
        revision: 4,
        projectJson: JSON.stringify({ id: pId, name: 'Corrupt Rev 4', revision: 4 }),
        manifestJson: '{}',
        savedAt: '2026-11-13T12:05:00.000Z',
      });
    } catch (err) {
      errorSurfaced = true;
      assert(err instanceof ProjectStoreError, 'T3: ProjectStoreError surfaced on bad revision');
    }
    assert(errorSurfaced, 'T3: error was surfaced');

    // Verify prior saved project was NOT corrupted
    const priorProject = await getProject(pId);
    assert(priorProject !== null, 'T3: prior project exists');
    assertEqual(priorProject?.revision, 1, 'T3: prior project revision remains intact at 1');
    const parsed = JSON.parse(priorProject!.projectJson);
    assertEqual(parsed.name, 'Budget Project Rev 1', 'T3: prior project data uncorrupted');
  }

  console.log('--- Test 4: Autosave & Recovery Snapshot Round-Trip ---');
  {
    const recovery: RecoveryEntry = {
      projectId: 'proj-recovery-42',
      revision: 3,
      archive: JSON.stringify({ id: 'proj-recovery-42', name: 'Saved Before Destructive Op' }),
      savedAt: '2026-11-13T15:00:00.000Z',
      reason: 'manual',
    };

    // Save recovery snapshot
    await saveRecovery(recovery);

    // Get recovery snapshot
    const loadedRecovery = await getRecovery('proj-recovery-42');
    assert(loadedRecovery !== null, 'T4: getRecovery returns snapshot');
    assertEqual(loadedRecovery?.projectId, 'proj-recovery-42', 'T4: recovery projectId matches');
    assertEqual(loadedRecovery?.revision, 3, 'T4: recovery revision matches');
    assertEqual(loadedRecovery?.reason, 'manual', 'T4: recovery reason matches');

    // Clear recovery snapshot
    await clearRecovery('proj-recovery-42');
    const cleared = await getRecovery('proj-recovery-42');
    assertEqual(cleared, null, 'T4: clearRecovery successfully removed snapshot');
  }

  console.log('--- Test 5: Build Library CRUD & Storage Stats ---');
  {
    const entry1: LibraryEntry = {
      id: 'lib-castle-1',
      name: 'Medieval Fortress Gate',
      description: 'Heavy stone gate with portcullis',
      tags: ['medieval', 'gate', 'stone'],
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
      format: 'schem-v3',
      dimensions: { width: 15, height: 20, length: 7 },
      nonAirCount: 840,
      sizeBytes: 120,
      data: new Uint8Array([1, 2, 3, 4, 5]),
      thumbnailPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    };

    const entry2: LibraryEntry = {
      id: 'lib-redstone-1',
      name: '3x3 Seamless Piston Door',
      description: 'Compact survival piston door',
      tags: ['redstone', 'door', 'contraption'],
      createdAt: '2026-11-13T11:00:00.000Z',
      updatedAt: '2026-11-13T11:00:00.000Z',
      format: 'litematic',
      dimensions: { width: 5, height: 9, length: 3 },
      nonAirCount: 65,
      sizeBytes: 80,
      data: new Uint8Array([10, 20, 30]),
    };

    // Save both entries
    await saveLibraryEntry(entry1);
    await saveLibraryEntry(entry2);

    // Retrieve entry 1
    const loaded1 = await getLibraryEntry('lib-castle-1');
    assert(loaded1 !== null, 'T5: getLibraryEntry returns entry');
    assertEqual(loaded1?.name, 'Medieval Fortress Gate', 'T5: loaded entry name matches');
    assertEqual(loaded1?.format, 'schem-v3', 'T5: loaded entry format matches');
    assertEqual(loaded1?.tags.length, 3, 'T5: loaded entry tags count matches');
    assert(loaded1?.data instanceof Uint8Array, 'T5: loaded entry data is Uint8Array');
    assertEqual(loaded1?.data.length, 5, 'T5: loaded entry data length matches');
    assert(loaded1?.thumbnailPng instanceof Uint8Array, 'T5: thumbnailPng is Uint8Array');

    // List all entries (omits data)
    const allSummaries = await listLibraryEntries();
    assert(allSummaries.length >= 2, 'T5: listLibraryEntries returns all entries');
    assert((allSummaries[0] as any).data === undefined, 'T5: summary omits binary data payload');

    // Filter by tag
    const redstoneEntries = await listLibraryEntries({ tag: 'redstone' });
    assertEqual(redstoneEntries.length, 1, 'T5: tag filter returns matching entry');
    assertEqual(redstoneEntries[0].id, 'lib-redstone-1', 'T5: tag filter returned expected id');

    // Filter by search query (case-insensitive substring on name or description)
    const searchEntries = await listLibraryEntries({ search: 'fortress' });
    assertEqual(searchEntries.length, 1, 'T5: search filter returns matching entry');
    assertEqual(searchEntries[0].id, 'lib-castle-1', 'T5: search filter returned expected id');

    const noMatchEntries = await listLibraryEntries({ search: 'spaceship' });
    assertEqual(noMatchEntries.length, 0, 'T5: non-matching search returns 0 entries');

    // Storage stats
    const stats = await getLibraryStorageStats();
    assert(stats.entryCount >= 2, 'T5: stats entryCount >= 2');
    assert(stats.totalBytes >= 200, 'T5: stats totalBytes >= 200');

    // Delete entry
    const deleted = await deleteLibraryEntry('lib-castle-1');
    assertEqual(deleted, true, 'T5: deleteLibraryEntry returns true for existing entry');
    const loadedAfterDelete = await getLibraryEntry('lib-castle-1');
    assertEqual(loadedAfterDelete, null, 'T5: getLibraryEntry returns null after deletion');

    const deletedAgain = await deleteLibraryEntry('lib-castle-1');
    assertEqual(deletedAgain, false, 'T5: deleteLibraryEntry returns false for non-existent entry');
  }

  // Summary
  console.log(`\n=== Acceptance Test Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
