// apps/mcp-companion/__tests__/slice-m3-companion-builds.test.ts
// Slice M3: MCP Companion integration tests for procedural builds, voxel ops,
// multi-region selection, autoConfirm, and cloud proxy mode.
// Run: node --experimental-strip-types __tests__/slice-m3-companion-builds.test.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpCompanionServer } from '../src/server.ts';
import { createCommandBus, parseBlockState } from '../src/command-bus.ts';
import { TOOL_NAMES } from '../src/tool-schemas.ts';
import { createMcpExporter } from '../src/mcp-export.ts';
import { EditorSession } from '../../../packages/operations/src/session.ts';
import type { Placement } from '../../../packages/domain/placement.ts';

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
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function getContentText(res: unknown): string {
  const content = (res as any)?.content;
  if (Array.isArray(content) && content.length > 0) {
    return content[0].text ?? '';
  }
  return '';
}

function parseContentJson<T = any>(res: unknown): T {
  const text = getContentText(res);
  return text ? JSON.parse(text) : ({} as T);
}

function createSamplePlacement(id: string): Placement {
  return {
    id,
    name: `Placement ${id}`,
    volume: {
      bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
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

async function createHarness(opts?: { session?: EditorSession; cloudConfig?: any }) {
  const session = opts?.session ?? new EditorSession();
  const bus = createCommandBus({ session, projectId: 'test-m3' });
  const exporter = createMcpExporter({
    approvedDirectories: ['/workspace/approved'],
    services: {
      realpath: (p) => p,
      exists: () => false,
      writeTemp: (t) => t,
      readTemp: () => new ArrayBuffer(0),
      rename: () => {},
      remove: () => {},
      sha256: () => 'sum',
      canonicalizeAfterWrite: (p) => p,
      maxExportBytes: 1024 * 1024,
    },
  });

  const server = createMcpCompanionServer({
    commandBus: bus,
    exporter,
    cloudConfig: opts?.cloudConfig,
  });

  const client = new Client({ name: 'm3-test-client', version: '0.1.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server, bus, session };
}

console.log('=== Slice M3: MCP Companion Builds, Voxel Ops & Cloud Proxy Tests ===\n');

// 1. Tool Listing covers all tools
{
  const { client } = await createHarness();
  const res = await client.listTools();
  assertEqual(res.tools.length, TOOL_NAMES.length, 'm3.1: all tools listed');

  const names = new Set(res.tools.map((t) => t.name));
  assert(names.has('generate_structure'), 'm3.1: has generate_structure');
  assert(names.has('generate_shape'), 'm3.1: has generate_shape');
  assert(names.has('build_blueprint'), 'm3.1: has build_blueprint');
  assert(names.has('set_block'), 'm3.1: has set_block');
  assert(names.has('set_blocks'), 'm3.1: has set_blocks');
  assert(names.has('get_block'), 'm3.1: has get_block');
  assert(names.has('inspect_region'), 'm3.1: has inspect_region');
  assert(names.has('list_selections'), 'm3.1: has list_selections');
  assert(names.has('select_region'), 'm3.1: has select_region');
  assert(names.has('remove_region'), 'm3.1: has remove_region');
  assert(names.has('stack_region'), 'm3.1: has stack_region');
  assert(names.has('copy_paste_region'), 'm3.1: has copy_paste_region');
  assert(names.has('get_account_info'), 'm3.1: has get_account_info');
}

// 2. Procedural Builds: generate_structure (house, tower)
{
  const { client, session } = await createHarness();

  // House
  const houseRes = await client.callTool({
    name: 'generate_structure',
    arguments: {
      kind: 'house',
      position: [0, 0, 0],
      style: 'medieval',
      placementName: 'Medieval Cottage',
    },
  });
  assertEqual(houseRes.isError, false, 'm3.2: generate_structure house succeeded');
  const houseData = parseContentJson(houseRes);
  assertEqual(houseData.applied, true, 'm3.2: house applied');
  assert(houseData.changedCells > 50, 'm3.2: house generated cells');
  assertEqual(session.snapshot().placements.length, 1, 'm3.2: placement created for house');

  // Tower
  const towerRes = await client.callTool({
    name: 'generate_structure',
    arguments: {
      kind: 'tower',
      position: [20, 0, 0],
      style: 'desert',
      placementName: 'Sandstone Tower',
    },
  });
  assertEqual(towerRes.isError, false, 'm3.2: generate_structure tower succeeded');
  const towerData = parseContentJson(towerRes);
  assertEqual(towerData.applied, true, 'm3.2: tower applied');
  assert(towerData.changedCells > 50, 'm3.2: tower generated cells');
  assertEqual(session.snapshot().placements.length, 2, 'm3.2: second placement created');
}

// 3. 3D Geometric Shapes: generate_shape (sphere, cylinder)
{
  const { client, session } = await createHarness();

  // Sphere
  const sphereRes = await client.callTool({
    name: 'generate_shape',
    arguments: {
      kind: 'sphere',
      center: [10, 10, 10],
      radius: 4,
      block: 'minecraft:gold_block',
      hollow: true,
      placementName: 'Gold Sphere',
    },
  });
  assertEqual(sphereRes.isError, false, 'm3.3: generate_shape sphere succeeded');
  const sphereData = parseContentJson(sphereRes);
  assertEqual(sphereData.applied, true, 'm3.3: sphere applied');
  assert(sphereData.changedCells > 20, 'm3.3: sphere has voxels');

  // Cylinder
  const cylRes = await client.callTool({
    name: 'generate_shape',
    arguments: {
      kind: 'cylinder',
      center: [30, 0, 30],
      radius: 3,
      height: 8,
      axis: 'y',
      block: 'minecraft:iron_block',
      placementName: 'Iron Column',
    },
  });
  assertEqual(cylRes.isError, false, 'm3.3: generate_shape cylinder succeeded');
  const cylData = parseContentJson(cylRes);
  assertEqual(cylData.applied, true, 'm3.3: cylinder applied');
  assert(cylData.changedCells > 30, 'm3.3: cylinder has voxels');
}

// 4. Blueprints: build_blueprint
{
  const { client, session } = await createHarness();
  const bpRes = await client.callTool({
    name: 'build_blueprint',
    arguments: {
      name: 'Pillar and Arch',
      origin: [0, 0, 0],
      placementName: 'Blueprint Arch',
      steps: [
        {
          kind: 'cylinder',
          center: [0, 0, 0],
          radius: 1,
          height: 6,
          axis: 'y',
          block: 'minecraft:quartz_pillar',
        },
        {
          kind: 'cylinder',
          center: [6, 0, 0],
          radius: 1,
          height: 6,
          axis: 'y',
          block: 'minecraft:quartz_pillar',
        },
        {
          kind: 'box',
          from: [0, 6, 0],
          to: [6, 6, 0],
          block: 'minecraft:chiseled_quartz_block',
        },
      ],
    },
  });
  assertEqual(bpRes.isError, false, 'm3.4: build_blueprint succeeded');
  const bpData = parseContentJson(bpRes);
  assertEqual(bpData.applied, true, 'm3.4: blueprint applied');
  assert(bpData.changedCells > 15, 'm3.4: blueprint voxels placed');
}

// 5. Voxel Ops: set_block, set_blocks, get_block, inspect_region
{
  const { client, session } = await createHarness();

  // set_block
  const setRes = await client.callTool({
    name: 'set_block',
    arguments: {
      pos: [5, 2, 5],
      block: 'minecraft:diamond_block',
      placementName: 'Single Block',
    },
  });
  assertEqual(setRes.isError, false, 'm3.5: set_block succeeded');
  const setData = parseContentJson(setRes);
  assertEqual(setData.applied, true, 'm3.5: set_block applied');

  // get_block
  const getRes = await client.callTool({
    name: 'get_block',
    arguments: { pos: [5, 2, 5] },
  });
  assert(!getRes.isError, 'm3.5: get_block succeeded');
  const getData = parseContentJson(getRes);
  assertEqual(getData.block, 'minecraft:diamond_block', 'm3.5: block is diamond_block');

  // set_blocks (batch)
  const batchRes = await client.callTool({
    name: 'set_blocks',
    arguments: {
      voxels: [
        { pos: [10, 0, 10], block: 'minecraft:emerald_block' },
        { pos: [11, 0, 10], block: 'minecraft:emerald_block' },
        { pos: [12, 0, 10], block: 'minecraft:emerald_block' },
      ],
      placementName: 'Batch Emeralds',
    },
  });
  assertEqual(Boolean(batchRes.isError), false, 'm3.5: set_blocks succeeded');
  const batchData = parseContentJson(batchRes);
  assertEqual(batchData.applied, true, 'm3.5: batch applied');
  assertEqual(batchData.changedCells, 3, 'm3.5: 3 cells changed in batch');

  // inspect_region
  const inspectRes = await client.callTool({
    name: 'inspect_region',
    arguments: {
      worldBounds: [9, 0, 9, 14, 2, 12],
    },
  });
  assert(!inspectRes.isError, 'm3.5: inspect_region succeeded');
  const inspectData = parseContentJson(inspectRes);
  assertEqual(inspectData.nonAirCount, 3, 'm3.5: 3 non-air blocks inspected');
  assertEqual(inspectData.countsByBlock['minecraft:emerald_block'], 3, 'm3.5: count matches');
}

// 6. Placement transforms: offset in transform_placement, duplicate_placement, create_placement
{
  const session = new EditorSession();
  session.execute({ type: 'placement:add', placement: createSamplePlacement('pl-transform') });
  const { client } = await createHarness({ session });

  // transform_placement with offset
  const trRes = await client.callTool({
    name: 'transform_placement',
    arguments: {
      placementId: 'pl-transform',
      offset: [10, 5, -2],
    },
  });
  assertEqual(trRes.isError, false, 'm3.6: transform_placement with offset succeeded');
  const p = session.snapshot().placements.find((pl) => pl.id === 'pl-transform');
  assertEqual(p?.transform.translation[0], 10, 'm3.6: x offset applied');
  assertEqual(p?.transform.translation[1], 5, 'm3.6: y offset applied');
  assertEqual(p?.transform.translation[2], -2, 'm3.6: z offset applied');

  // duplicate_placement
  const dupRes = await client.callTool({
    name: 'duplicate_placement',
    arguments: {
      placementId: 'pl-transform',
      offset: [20, 0, 0],
    },
  });
  assertEqual(dupRes.isError, false, 'm3.6: duplicate_placement succeeded');
  assertEqual(session.snapshot().placements.length, 2, 'm3.6: placement duplicated');

  // create_placement
  const crRes = await client.callTool({
    name: 'create_placement',
    arguments: {
      name: 'Fresh Canvas',
      translation: [100, 0, 100],
    },
  });
  assertEqual(crRes.isError, false, 'm3.6: create_placement succeeded');
  assertEqual(session.snapshot().placements.length, 3, 'm3.6: third placement created');
}

// 7. Stacking & Copy-Pasting: stack_region and copy_paste_region
{
  const { client, session } = await createHarness();
  // Place initial block
  await client.callTool({
    name: 'set_block',
    arguments: { pos: [0, 0, 0], block: 'minecraft:obsidian' },
  });

  // stack_region 3 times along Y
  const stackRes = await client.callTool({
    name: 'stack_region',
    arguments: {
      worldBounds: [0, 0, 0, 1, 1, 1],
      offset: [0, 1, 0],
      count: 3,
    },
  });
  assertEqual(stackRes.isError, false, 'm3.7: stack_region succeeded');
  const stackData = parseContentJson(stackRes);
  assertEqual(stackData.applied, true, 'm3.7: stack applied');
  assertEqual(stackData.changedCells, 3, 'm3.7: 3 stacked cells placed');

  // Verify stacked blocks exist
  const b1 = await client.callTool({ name: 'get_block', arguments: { pos: [0, 1, 0] } });
  assertEqual(parseContentJson(b1).block, 'minecraft:obsidian', 'm3.7: stacked y=1 exists');
  const b2 = await client.callTool({ name: 'get_block', arguments: { pos: [0, 2, 0] } });
  assertEqual(parseContentJson(b2).block, 'minecraft:obsidian', 'm3.7: stacked y=2 exists');
  const b3 = await client.callTool({ name: 'get_block', arguments: { pos: [0, 3, 0] } });
  assertEqual(parseContentJson(b3).block, 'minecraft:obsidian', 'm3.7: stacked y=3 exists');

  // copy_paste_region
  const cpRes = await client.callTool({
    name: 'copy_paste_region',
    arguments: {
      sourceBounds: [0, 0, 0, 1, 4, 1],
      targetOrigin: [50, 0, 50],
    },
  });
  assertEqual(cpRes.isError, false, 'm3.7: copy_paste_region succeeded');
  const cpData = parseContentJson(cpRes);
  assertEqual(cpData.applied, true, 'm3.7: copy_paste applied');
  assertEqual(cpData.changedCells, 4, 'm3.7: 4 cells pasted');

  const pastedBlock = await client.callTool({ name: 'get_block', arguments: { pos: [50, 0, 50] } });
  assertEqual(parseContentJson(pastedBlock).block, 'minecraft:obsidian', 'm3.7: pasted block found at target');
}

// 8. Multi-Region Selections: create_selection, list_selections, select_region, remove_region
{
  const { client } = await createHarness();

  // Create R1
  const sel1 = await client.callTool({
    name: 'create_selection',
    arguments: { bounds: [0, 0, 0, 10, 10, 10], name: 'Base Hall' },
  });
  assertEqual(sel1.isError, false, 'm3.8: create_selection 1 succeeded');

  // Create R2
  const sel2 = await client.callTool({
    name: 'create_selection',
    arguments: { bounds: [10, 0, 10, 20, 20, 20], name: 'Upper Tower' },
  });
  assertEqual(sel2.isError, false, 'm3.8: create_selection 2 succeeded');

  // list_selections
  const listSel = await client.callTool({ name: 'list_selections', arguments: {} });
  const listData = parseContentJson(listSel);
  assertEqual(listData.total, 2, 'm3.8: 2 saved regions');
  assertEqual(listData.activeRegionId, 'Upper Tower', 'm3.8: Upper Tower is active');

  // select_region to switch back to first
  const swRes = await client.callTool({
    name: 'select_region',
    arguments: { id: 'Base Hall' },
  });
  assertEqual(swRes.isError, false, 'm3.8: select_region succeeded');

  const listSel2 = await client.callTool({ name: 'list_selections', arguments: {} });
  assertEqual(parseContentJson(listSel2).activeRegionId, 'Base Hall', 'm3.8: active switched to Base Hall');

  // remove_region
  const remRes = await client.callTool({
    name: 'remove_region',
    arguments: { id: 'Base Hall' },
  });
  assertEqual(remRes.isError, false, 'm3.8: remove_region succeeded');
  const listSel3 = await client.callTool({ name: 'list_selections', arguments: {} });
  assertEqual(parseContentJson(listSel3).total, 1, 'm3.8: 1 region remaining');
}

// 9. autoConfirm: true on confirmation-required tools
{
  const session = new EditorSession();
  session.execute({ type: 'placement:add', placement: createSamplePlacement('pl-confirm') });
  const { client } = await createHarness({ session });

  // Standard call without autoConfirm returns dry-run
  const dryCall = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      blockType: 'minecraft:gold_block',
    },
  });
  const dryData = parseContentJson(dryCall);
  assertEqual(dryData.requiresConfirmation, true, 'm3.9: standard call requires confirmation');
  assert(dryData.confirmationToken !== undefined, 'm3.9: token returned');

  // Call WITH autoConfirm: true immediately applies!
  const autoCall = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      blockType: 'minecraft:gold_block',
      autoConfirm: true,
    },
  });
  assertEqual(autoCall.isError, false, 'm3.9: autoConfirm fill succeeded');
  const autoData = parseContentJson(autoCall);
  assertEqual(autoData.applied, true, 'm3.9: autoConfirm applied is true');
  assertEqual(autoData.changedCells, 8, 'm3.9: 8 cells changed');

  // autoConfirm on delete_placement
  const delCall = await client.callTool({
    name: 'delete_placement',
    arguments: {
      placementId: 'pl-confirm',
      autoConfirm: true,
    },
  });
  assertEqual(delCall.isError, false, 'm3.9: autoConfirm delete_placement succeeded');
  assertEqual(parseContentJson(delCall).applied, true, 'm3.9: placement deleted via autoConfirm');
  assertEqual(session.snapshot().placements.length, 0, 'm3.9: session has 0 placements');
}

// 10. Cloud Account Remote Proxy Mode
{
  let interceptedRequest: any = null;
  const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    interceptedRequest = {
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                proxied: true,
                cloudStatus: 'success',
                message: 'Executed on Cloud Account',
              }),
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const { client } = await createHarness({
    cloudConfig: {
      apiKey: 'test-secret-cloud-key-12345',
      serverUrl: 'https://cloud.easyschemedit.com',
      fetchFn: mockFetch as any,
    },
  });

  const proxiedRes = await client.callTool({
    name: 'generate_structure',
    arguments: { kind: 'castle', style: 'medieval' },
  });

  assertEqual(proxiedRes.isError, undefined, 'm3.10: proxied call returned without error');
  const proxiedData = parseContentJson(proxiedRes);
  assertEqual(proxiedData.proxied, true, 'm3.10: response came from cloud proxy');
  assertEqual(interceptedRequest?.url, 'https://cloud.easyschemedit.com/api/mcp', 'm3.10: endpoint matches');
  assertEqual(interceptedRequest?.headers?.Authorization, 'Bearer test-secret-cloud-key-12345', 'm3.10: Bearer key sent');
  assertEqual(interceptedRequest?.body?.params?.name, 'generate_structure', 'm3.10: tool name sent');
}

// 11. Account and Workspace Tools
{
  const { client } = await createHarness();

  // get_account_info
  const accRes = await client.callTool({ name: 'get_account_info', arguments: {} });
  const accData = parseContentJson(accRes);
  assertEqual(accData.authenticated, true, 'm3.11: account authenticated');

  // list_workspace
  const wsRes = await client.callTool({ name: 'list_workspace', arguments: {} });
  const wsData = parseContentJson(wsRes);
  assert(Array.isArray(wsData.projects), 'm3.11: projects list returned');

  // create_project & rename_project
  const cpRes = await client.callTool({ name: 'create_project', arguments: { name: 'My New Castle' } });
  assertEqual(Boolean(cpRes.isError), false, 'm3.11: create_project succeeded');

  const renRes = await client.callTool({ name: 'rename_project', arguments: { name: 'Fortress Alpha' } });
  assertEqual(Boolean(renRes.isError), false, 'm3.11: rename_project succeeded');

  // list_schematics
  const schRes = await client.callTool({ name: 'list_schematics', arguments: {} });
  assert(!schRes.isError, 'm3.11: list_schematics succeeded');
}

console.log(`\n=== Slice M3 Test Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
