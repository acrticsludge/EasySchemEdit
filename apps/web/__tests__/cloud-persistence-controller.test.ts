// apps/web/__tests__/cloud-persistence-controller.test.ts
// Unit and integration tests for cloud projects client and ProjectPersistenceController.
// Tests .vxproj pack -> upload -> download -> unpack roundtrip with mocked fetch.

import {
  listCloudProjects,
  createCloudProject,
  saveCloudProjectArchive,
  loadCloudProjectArchive,
  renameCloudProject,
  deleteCloudProject,
  type CloudProjectSummary,
} from '../src/client/projects-client.ts';
import { ProjectPersistenceController } from '../src/editor/persistence/persistence-controller.ts';
import { EditorSessionStore } from '../src/editor/session-store.ts';
import { packVxprojArchive, unpackVxprojArchive } from '@easyschemedit/persistence';
import type { Project, Placement } from '@easyschemedit/domain';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Cloud Persistence & Projects Client Tests...');

// In-memory mock server state
interface MockServerProject {
  id: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  archiveBytes: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
}

let mockProjectsDb = new Map<string, MockServerProject>();
let mockAuthFailure = false;

function setupMockFetch() {
  (globalThis as any).fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const method = init?.method?.toUpperCase() || 'GET';

    if (mockAuthFailure) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. GET /api/projects
    if (urlStr === '/api/projects' && method === 'GET') {
      const list = Array.from(mockProjectsDb.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((p) => ({
          id: p.id,
          name: p.name,
          revision: p.revision,
          placementCount: p.placementCount,
          sizeBytes: p.sizeBytes,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
      return new Response(JSON.stringify({ projects: list }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. POST /api/projects
    if (urlStr === '/api/projects' && method === 'POST') {
      const headers = (init?.headers as Record<string, string>) || {};
      const contentType = headers['Content-Type'] || '';
      const id = `cloud-proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      if (contentType.includes('application/json')) {
        const body = JSON.parse(init?.body as string);
        const name = body.name || 'Untitled Project';
        const project: MockServerProject = {
          id,
          name,
          revision: 1,
          placementCount: 0,
          sizeBytes: 0,
          archiveBytes: null,
          createdAt: now,
          updatedAt: now,
        };
        mockProjectsDb.set(id, project);
        return new Response(JSON.stringify({ project }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Binary upload
      const rawName = headers['X-Project-Name'];
      const name = rawName ? decodeURIComponent(rawName) : 'Untitled Project';
      const revision = parseInt(headers['X-Revision'] || '1', 10);
      const placementCount = parseInt(headers['X-Placement-Count'] || '0', 10);
      const archiveBytes = init?.body as Uint8Array;
      const sizeBytes = archiveBytes?.byteLength || 0;

      const project: MockServerProject = {
        id,
        name,
        revision,
        placementCount,
        sizeBytes,
        archiveBytes: new Uint8Array(archiveBytes),
        createdAt: now,
        updatedAt: now,
      };
      mockProjectsDb.set(id, project);
      return new Response(JSON.stringify({ project }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. PUT /api/projects/:id/archive
    const archiveMatch = urlStr.match(/^\/api\/projects\/([^/]+)\/archive$/);
    if (archiveMatch && method === 'PUT') {
      const id = decodeURIComponent(archiveMatch[1]!);
      const existing = mockProjectsDb.get(id);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const headers = (init?.headers as Record<string, string>) || {};
      const rawName = headers['X-Project-Name'];
      if (rawName) existing.name = decodeURIComponent(rawName);
      if (headers['X-Revision']) existing.revision = parseInt(headers['X-Revision'], 10);
      if (headers['X-Placement-Count']) existing.placementCount = parseInt(headers['X-Placement-Count'], 10);

      const archiveBytes = init?.body as Uint8Array;
      existing.archiveBytes = new Uint8Array(archiveBytes);
      existing.sizeBytes = existing.archiveBytes.byteLength;
      existing.updatedAt = new Date().toISOString();

      return new Response(JSON.stringify({ project: existing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. GET /api/projects/:id/archive
    if (archiveMatch && method === 'GET') {
      const id = decodeURIComponent(archiveMatch[1]!);
      const existing = mockProjectsDb.get(id);
      if (!existing || !existing.archiveBytes) {
        return new Response(JSON.stringify({ error: 'Archive not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(existing.archiveBytes as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
        },
      });
    }

    // 5. GET /api/projects/:id or PATCH /api/projects/:id (rename)
    const projectMatch = urlStr.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === 'GET') {
      const id = decodeURIComponent(projectMatch[1]!);
      const existing = mockProjectsDb.get(id);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ project: existing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (projectMatch && method === 'PATCH') {
      const id = decodeURIComponent(projectMatch[1]!);
      const existing = mockProjectsDb.get(id);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const body = JSON.parse(init?.body as string);
      if (!body.name || !body.name.trim()) {
        return new Response(JSON.stringify({ error: 'Name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      existing.name = body.name.trim();
      existing.updatedAt = new Date().toISOString();
      return new Response(JSON.stringify({ project: existing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. DELETE /api/projects/:id
    if (projectMatch && method === 'DELETE') {
      const id = decodeURIComponent(projectMatch[1]!);
      if (!mockProjectsDb.has(id)) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      mockProjectsDb.delete(id);
      return new Response(JSON.stringify({ ok: true, id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Not found: ${method} ${urlStr}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

// Helper to create test placement
function makeTestPlacement(id: string, name: string): Placement {
  return {
    id,
    name,
    volume: {
      bounds: { min: [0, 0, 0], maxExclusive: [2, 2, 2] },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: {
      translation: [0, 0, 0],
      rotationY: 0,
      mirror: 'none',
    },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: new Set(),
  };
}

async function runTests() {
  setupMockFetch();
  mockProjectsDb.clear();
  mockAuthFailure = false;

  // --------------------------------------------------------------------------
  // Test 1: Direct projects-client.ts API wrappers
  // --------------------------------------------------------------------------
  console.log('Test 1: projects-client CRUD methods...');

  const initialList = await listCloudProjects();
  assert(Array.isArray(initialList) && initialList.length === 0, 'Initial projects list is empty');

  // Create project via JSON
  const createdJson = await createCloudProject('Metropolis');
  assert(createdJson.name === 'Metropolis', 'Created project name matches');
  assert(typeof createdJson.id === 'string', 'Created project has valid id');

  // Create project with binary payload
  const dummyArchive = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const createdBin = await createCloudProject('Tower Archive', dummyArchive, {
    revision: 2,
    placementCount: 3,
  });
  assert(createdBin.name === 'Tower Archive', 'Created binary project name matches');
  assert(createdBin.revision === 2, 'Created binary project revision matches');
  assert(createdBin.placementCount === 3, 'Created binary project placement count matches');

  // Verify list
  const listAfterCreate = await listCloudProjects();
  assert(listAfterCreate.length === 2, 'Projects list contains 2 projects');

  // Load archive
  const downloadedBytes = await loadCloudProjectArchive(createdBin.id);
  assert(downloadedBytes.byteLength === dummyArchive.byteLength, 'Downloaded archive byte length matches');

  // Save/update archive
  const updatedDummy = new Uint8Array([80, 75, 5, 6, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const savedRes = await saveCloudProjectArchive(createdBin.id, updatedDummy, {
    name: 'Tower Archive v2',
    revision: 3,
    placementCount: 4,
  });
  assert(savedRes.name === 'Tower Archive v2', 'Updated project name matches');
  assert(savedRes.revision === 3, 'Updated project revision matches');

  // Rename project
  const renamed = await renameCloudProject(createdJson.id, 'Neo-Metropolis');
  assert(renamed.name === 'Neo-Metropolis', 'Renamed project matches new name');

  // Delete project
  await deleteCloudProject(createdJson.id);
  const listAfterDelete = await listCloudProjects();
  assert(listAfterDelete.length === 1, 'Projects list decreased after deletion');
  assert(listAfterDelete[0]?.id === createdBin.id, 'Remaining project is Tower Archive');

  console.log('✓ Test 1 passed.');

  // --------------------------------------------------------------------------
  // Test 2: Error handling in projects-client.ts
  // --------------------------------------------------------------------------
  console.log('Test 2: projects-client error handling...');

  mockAuthFailure = true;
  let authErrorCaught = false;
  try {
    await listCloudProjects();
  } catch (err) {
    authErrorCaught = true;
    assert((err as Error).message.includes('Unauthorized'), 'Error message contains Unauthorized');
  }
  assert(authErrorCaught, 'Throws error when server returns 401');

  mockAuthFailure = false;
  let notFoundCaught = false;
  try {
    await loadCloudProjectArchive('non-existent-id');
  } catch (err) {
    notFoundCaught = true;
  }
  assert(notFoundCaught, 'Throws error when project archive is not found');

  console.log('✓ Test 2 passed.');

  // --------------------------------------------------------------------------
  // Test 3: ProjectPersistenceController cloud integration & .vxproj roundtrip
  // --------------------------------------------------------------------------
  console.log('Test 3: ProjectPersistenceController cloud lifecycle...');

  const store = new EditorSessionStore();
  const controller = new ProjectPersistenceController(store);

  assert(controller.getActiveCloudProjectId() === null, 'Initially no active cloud project');
  assert(!controller.isDirty(), 'Initially not dirty');

  // Add placement to document
  const placement1 = makeTestPlacement('placement-1', 'Castle Keep');
  await store.execute({
    type: 'placement:add',
    placement: placement1,
  });

  assert(controller.isDirty(), 'Controller becomes dirty after placement:add');

  // Save to cloud
  const cloudSummary = await controller.saveToCloud('Castle Build');
  assert(typeof cloudSummary.id === 'string', 'Returned cloud summary id');
  assert(cloudSummary.name === 'Castle Build', 'Saved with overridden name');
  assert(controller.getActiveCloudProjectId() === cloudSummary.id, 'activeCloudProjectId is set');
  assert(!controller.isDirty(), 'isDirty is false after successful save');

  // Verify archive stored on mock server can be unpacked as a valid Project
  const storedOnServer = mockProjectsDb.get(cloudSummary.id);
  assert(storedOnServer !== undefined, 'Project exists in server DB');
  assert(storedOnServer!.archiveBytes !== null, 'Project has archive binary on server');

  const unpackedServerProject = unpackVxprojArchive(storedOnServer!.archiveBytes!);
  assert(unpackedServerProject.placements.length === 1, 'Unpacked project contains 1 placement');
  assert(unpackedServerProject.placements[0]!.id === 'placement-1', 'Placement ID matches');

  // Mutate project and save revision 2
  const placement2 = makeTestPlacement('placement-2', 'Moat Gate');
  await store.execute({
    type: 'placement:add',
    placement: placement2,
  });

  assert(controller.isDirty(), 'isDirty is true after second placement added');

  const rev2Summary = await controller.saveToCloud();
  assert(rev2Summary.id === cloudSummary.id, 'Updates existing project id');
  assert(rev2Summary.revision === 2, 'Revision incremented to 2');
  assert(!controller.isDirty(), 'isDirty is false after second save');

  // Test Rename
  const renamedSummary = await controller.renameCloudProject(cloudSummary.id, 'Royal Castle Build');
  assert(renamedSummary.name === 'Royal Castle Build', 'Cloud project renamed');
  assert(store.getSnapshot().project.name === 'Royal Castle Build', 'Session project name updated');

  // Test createNewCloudProject
  const freshProject = await controller.createNewCloudProject('Clean Slate');
  assert(freshProject.name === 'Clean Slate', 'New project name is Clean Slate');
  assert(store.getSnapshot().project.placements.length === 0, 'Placements cleared');
  assert(controller.getActiveCloudProjectId() === null, 'activeCloudProjectId cleared to null');
  assert(!controller.isDirty(), 'Fresh project is clean');

  // Test openFromCloud
  const reloaded = await controller.openFromCloud(cloudSummary.id);
  assert(reloaded.name === 'Royal Castle Build', 'Reloaded project name matches');
  assert(store.getSnapshot().project.placements.length === 2, 'Restored 2 placements from cloud');
  assert(controller.getActiveCloudProjectId() === cloudSummary.id, 'Active cloud project id restored');
  assert(!controller.isDirty(), 'Reloaded project is not dirty');

  // Test deleteFromCloud
  await controller.deleteFromCloud(cloudSummary.id);
  assert(controller.getActiveCloudProjectId() === null, 'activeCloudProjectId cleared on delete');
  assert(!mockProjectsDb.has(cloudSummary.id), 'Project deleted from mock server');

  console.log('✓ Test 3 passed.');

  console.log('All Cloud Persistence & Projects Client tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
