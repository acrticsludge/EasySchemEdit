// apps/web/__tests__/slice-e2-explorer.test.ts
// Tests for Slice E-2: ProjectExplorer, schematic cloud operations, and session replacement.

import {
  listWorkspaceTree,
  createCloudProject,
  createSchematic,
  saveSchematicArchive,
  loadSchematicArchive,
  getSchematic,
  renameSchematic,
  deleteSchematic,
  type WorkspaceProjectNode,
  type CloudSchematicSummary,
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

console.log('Running Slice E-2 Project Explorer & Schematic Persistence Tests...');

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

interface MockSchematicRecord {
  id: string;
  projectId: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  archiveBytes: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
}

interface MockProjectRecord {
  id: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  schematics: Map<string, MockSchematicRecord>;
}

const mockProjects = new Map<string, MockProjectRecord>();

function setupMockApi() {
  (globalThis as any).fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const method = init?.method?.toUpperCase() || 'GET';

    // 1. GET /api/workspace
    if (urlStr === '/api/workspace' && method === 'GET') {
      const tree: WorkspaceProjectNode[] = Array.from(mockProjects.values()).map((p) => ({
        id: p.id,
        name: p.name,
        revision: p.revision,
        placementCount: p.placementCount,
        sizeBytes: p.sizeBytes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        schematics: Array.from(p.schematics.values()).map((s) => ({
          id: s.id,
          projectId: s.projectId,
          name: s.name,
          revision: s.revision,
          placementCount: s.placementCount,
          sizeBytes: s.sizeBytes,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      }));
      return new Response(JSON.stringify({ projects: tree }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. POST /api/projects
    if (urlStr === '/api/projects' && method === 'POST') {
      let name = 'Untitled Project';
      try {
        const body = JSON.parse(init?.body as string);
        if (body?.name) name = body.name;
      } catch {}
      const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const rec: MockProjectRecord = {
        id,
        name,
        revision: 1,
        placementCount: 0,
        sizeBytes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schematics: new Map(),
      };
      mockProjects.set(id, rec);
      return new Response(JSON.stringify({ project: { ...rec, schematics: undefined } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. POST /api/projects/:projectId/schematics
    const createSchemMatch = urlStr.match(/^\/api\/projects\/([^/]+)\/schematics$/);
    if (createSchemMatch && method === 'POST') {
      const projectId = decodeURIComponent(createSchemMatch[1]);
      const proj = mockProjects.get(projectId);
      if (!proj) {
        return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });
      }

      const sId = `schem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      let name = 'Untitled Schematic';
      let archiveBytes: Uint8Array | null = null;
      let revision = 1;
      let placementCount = 0;

      const headers = (init?.headers as Record<string, string>) || {};
      if (headers['X-Schematic-Name']) {
        name = decodeURIComponent(headers['X-Schematic-Name']);
      }
      if (headers['X-Revision']) {
        revision = parseInt(headers['X-Revision'], 10);
      }
      if (headers['X-Placement-Count']) {
        placementCount = parseInt(headers['X-Placement-Count'], 10);
      }

      if (init?.body instanceof Uint8Array) {
        archiveBytes = init.body;
      }

      const sRec: MockSchematicRecord = {
        id: sId,
        projectId,
        name,
        revision,
        placementCount,
        sizeBytes: archiveBytes ? archiveBytes.byteLength : 0,
        archiveBytes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      proj.schematics.set(sId, sRec);
      return new Response(JSON.stringify({ schematic: sRec }), { status: 201 });
    }

    // 4. GET /api/schematics/:id
    const getSchemMatch = urlStr.match(/^\/api\/schematics\/([^/]+)$/);
    if (getSchemMatch && method === 'GET') {
      const sId = decodeURIComponent(getSchemMatch[1]);
      for (const p of mockProjects.values()) {
        const s = p.schematics.get(sId);
        if (s) {
          return new Response(JSON.stringify({ schematic: s }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ error: 'Schematic not found' }), { status: 404 });
    }

    // 5. GET /api/schematics/:id/archive
    const getArchiveMatch = urlStr.match(/^\/api\/schematics\/([^/]+)\/archive$/);
    if (getArchiveMatch && method === 'GET') {
      const sId = decodeURIComponent(getArchiveMatch[1]);
      for (const p of mockProjects.values()) {
        const s = p.schematics.get(sId);
        if (s && s.archiveBytes) {
          return new Response(s.archiveBytes as any, {
            status: 200,
            headers: { 'Content-Type': 'application/zip' },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'Archive not found' }), { status: 404 });
    }

    // 6. PUT /api/schematics/:id/archive
    if (getArchiveMatch && method === 'PUT') {
      const sId = decodeURIComponent(getArchiveMatch[1]);
      for (const p of mockProjects.values()) {
        const s = p.schematics.get(sId);
        if (s) {
          const headers = (init?.headers as Record<string, string>) || {};
          if (headers['X-Schematic-Name']) {
            s.name = decodeURIComponent(headers['X-Schematic-Name']);
          }
          if (headers['X-Revision']) {
            s.revision = parseInt(headers['X-Revision'], 10);
          }
          if (headers['X-Placement-Count']) {
            s.placementCount = parseInt(headers['X-Placement-Count'], 10);
          }
          if (init?.body instanceof Uint8Array) {
            s.archiveBytes = init.body;
            s.sizeBytes = init.body.byteLength;
          }
          s.updatedAt = new Date().toISOString();
          return new Response(JSON.stringify({ schematic: s }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ error: 'Schematic not found' }), { status: 404 });
    }

    // 7. PATCH /api/schematics/:id
    if (getSchemMatch && method === 'PATCH') {
      const sId = decodeURIComponent(getSchemMatch[1]);
      const body = JSON.parse(init?.body as string);
      for (const p of mockProjects.values()) {
        const s = p.schematics.get(sId);
        if (s) {
          if (body?.name) s.name = body.name;
          s.updatedAt = new Date().toISOString();
          return new Response(JSON.stringify({ schematic: s }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ error: 'Schematic not found' }), { status: 404 });
    }

    // 8. DELETE /api/schematics/:id
    if (getSchemMatch && method === 'DELETE') {
      const sId = decodeURIComponent(getSchemMatch[1]);
      for (const p of mockProjects.values()) {
        if (p.schematics.delete(sId)) {
          return new Response(JSON.stringify({ ok: true, id: sId }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ error: 'Schematic not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };
}

function createSampleProject(name = 'Test Document'): Project {
  return {
    schemaVersion: 1,
    id: 'proj-root',
    name,
    placements: [makeTestPlacement('test-p1', 'Sample Block')],
    importGroups: [],
    overlapPolicy: 'top-wins',
    conflictOverlay: 'off',
    metadata: {
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    revision: 1,
  };
}

async function runTests() {
  setupMockApi();

  console.log('Test 1: Workspace tree and schematic CRUD operations via client...');
  const proj = await createCloudProject('Redstone Circuits');
  assert(proj.name === 'Redstone Circuits', 'Project created with correct name');

  const sampleDoc = createSampleProject('alu.schem');
  const bytes = packVxprojArchive(sampleDoc);

  const schem = await createSchematic(proj.id, 'alu.schem', bytes, {
    revision: 1,
    placementCount: 1,
  });
  assert(schem.name === 'alu.schem', 'Schematic created with correct name');
  assert(schem.projectId === proj.id, 'Schematic assigned to project');

  const tree = await listWorkspaceTree();
  assert(tree.length === 1, '1 project in tree');
  assert(tree[0].schematics.length === 1, '1 schematic in project');
  assert(tree[0].schematics[0].id === schem.id, 'Schematic ID matches');

  console.log('Test 2: ProjectPersistenceController active schematic tracking & pack/unpack...');
  const store = new EditorSessionStore(sampleDoc);
  const controller = new ProjectPersistenceController(store);

  assert(controller.getActiveCloudSchematicId() === null, 'Initial active schematic ID is null');
  controller.setActiveCloudSchematicId(schem.id);
  assert(controller.getActiveCloudSchematicId() === schem.id, 'Active schematic ID updated');

  const packedBytes = controller.packCurrentProjectBytes();
  assert(packedBytes.byteLength > 0, 'Packed project bytes is non-empty');

  const unpacked = controller.loadProjectFromBytes(packedBytes);
  assert(unpacked.name === sampleDoc.name, 'Unpacked project matches name');
  assert(unpacked.placements.length === 1, 'Unpacked project matches placement count');

  console.log('Test 3: saveSchematicToCloud & openSchematicFromCloud...');
  // Modify store state to simulate changes
  const modifiedDoc = createSampleProject('alu-v2.schem');
  modifiedDoc.placements.push(makeTestPlacement('test-p2', 'Gold Block'));

  await controller.replaceProjectInSession(modifiedDoc);
  assert(!controller.isDirty(), 'Controller marked clean after replaceProjectInSession');
  assert(store.getSnapshot().project.placements.length === 2, 'Session has 2 placements now');

  const savedSummary = await controller.saveSchematicToCloud(schem.id, 'alu-updated.schem');
  assert(savedSummary.name === 'alu-updated.schem', 'Saved schematic has new name');
  assert(savedSummary.placementCount === 2, 'Saved schematic reflects 2 placements');

  // Verify opening from cloud restores state
  const reopened = await controller.openSchematicFromCloud(schem.id);
  assert(reopened.placements.length === 2, 'Reopened schematic restored 2 placements');
  assert(controller.getActiveCloudSchematicId() === schem.id, 'Active cloud schematic ID preserved');

  console.log('Test 4: Rename and delete schematic...');
  const renamed = await renameSchematic(schem.id, 'alu-final.schem');
  assert(renamed.name === 'alu-final.schem', 'Renamed successfully');

  await deleteSchematic(schem.id);
  const treeAfterDelete = await listWorkspaceTree();
  assert(treeAfterDelete[0].schematics.length === 0, 'Schematic deleted from tree');

  controller.dispose();
  console.log('✓ All Slice E-2 Project Explorer & Schematic Persistence tests passed!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
