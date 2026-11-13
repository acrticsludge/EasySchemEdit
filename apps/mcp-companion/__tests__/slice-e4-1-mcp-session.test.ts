// apps/mcp-companion/__tests__/slice-e4-1-mcp-session.test.ts
// Slice E4.1: Wire apps/mcp-companion to EditorSession.
// Validates Zod schemas, two-phase destructive protocol, and execution against live EditorSession.
// Run: node --experimental-strip-types __tests__/slice-e4-1-mcp-session.test.ts

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

function createPopulatedSession(): EditorSession {
  const session = new EditorSession();
  const placement: Placement = {
    id: 'pl-main',
    name: 'Main Castle',
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

  session.execute({ type: 'placement:add', placement });
  session.execute({
    type: 'region:fill',
    bounds: { min: [0, 0, 0], maxExclusive: [4, 4, 4] },
    block: parseBlockState('minecraft:stone'),
  });
  return session;
}

async function createTestHarness(session?: EditorSession, approvedDirs: string[] = ['/workspace/approved']) {
  const customSession = session ?? createPopulatedSession();
  const bus = createCommandBus({ session: customSession, projectId: 'test-proj' });
  const exporter = createMcpExporter({
    approvedDirectories: approvedDirs,
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

  const server = createMcpCompanionServer({ commandBus: bus, exporter });
  const client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server, bus, session: customSession };
}

console.log('=== Slice E4.1 MCP Session Integration Tests ===\n');

// 1. Tool listing
{
  const { client } = await createTestHarness();
  const res = await client.listTools();
  assertEqual(res.tools.length, TOOL_NAMES.length, 'e4.1.1: all 39 tools are registered');

  const names = new Set(res.tools.map((t) => t.name));
  for (const name of TOOL_NAMES) {
    assert(names.has(name), `e4.1.1: tool ${name} is listed`);
  }

  for (const tool of res.tools) {
    assert(typeof tool.description === 'string' && tool.description.length > 0, `e4.1.1: description for ${tool.name}`);
    assertEqual(tool.inputSchema.type, 'object', `e4.1.1: inputSchema.type is object for ${tool.name}`);
  }
}

// 2. Zod validation failure on malformed tool args
{
  const { client } = await createTestHarness();

  // Missing required bounds
  const badBounds = await client.callTool({
    name: 'fill_selection',
    arguments: { worldBounds: [0, 0, 0] }, // requires 6 numbers
  });
  assertEqual(badBounds.isError, true, 'e4.1.2: invalid worldBounds rejected with isError');
  const errPayload = parseContentJson(badBounds);
  assertEqual(errPayload.error.code, 'VALIDATION_FAILED', 'e4.1.2: error code is VALIDATION_FAILED');

  // Missing placementId on rename_placement
  const badRename = await client.callTool({
    name: 'rename_placement',
    arguments: { name: 'New Name' }, // missing placementId
  });
  assertEqual(badRename.isError, true, 'e4.1.2: missing placementId rejected with isError');
}

// 3. Read tools against populated EditorSession
{
  const { client, session } = await createTestHarness();

  // get_project_info
  const infoRes = await client.callTool({ name: 'get_project_info', arguments: {} });
  assertEqual(infoRes.isError, undefined, 'e4.1.3: get_project_info succeeded');
  const info = parseContentJson(infoRes);
  assertEqual(info.placementCount, 1, 'e4.1.3: 1 placement in project info');
  assertEqual(info.revision, session.revision, 'e4.1.3: revision matches session');

  // list_placements
  const listRes = await client.callTool({ name: 'list_placements', arguments: {} });
  const list = parseContentJson(listRes);
  assertEqual(list.total, 1, 'e4.1.3: 1 placement found');
  assertEqual(list.placements[0].id, 'pl-main', 'e4.1.3: placement id is pl-main');
  assertEqual(list.placements[0].nonAirCount, 64, 'e4.1.3: nonAirCount is 64');

  // get_placement
  const getRes = await client.callTool({ name: 'get_placement', arguments: { placementId: 'pl-main' } });
  const p = parseContentJson(getRes);
  assertEqual(p.placement.id, 'pl-main', 'e4.1.3: get_placement id matches');
  assertEqual(p.placement.locked, false, 'e4.1.3: placement is unlocked');

  // get_origin
  const origRes = await client.callTool({ name: 'get_origin', arguments: { placementId: 'pl-main' } });
  const orig = parseContentJson(origRes);
  assertEqual(orig.origin[0], 0, 'e4.1.3: origin x is 0');

  // get_material_list
  const matRes = await client.callTool({ name: 'get_material_list', arguments: {} });
  const mat = parseContentJson(matRes);
  assert(mat !== null, 'e4.1.3: material list returned');

  // detect_conflicts
  const confRes = await client.callTool({ name: 'detect_conflicts', arguments: {} });
  const conf = parseContentJson(confRes);
  assert(conf !== null, 'e4.1.3: detect_conflicts returned');

  // get_history
  const histRes = await client.callTool({ name: 'get_history', arguments: {} });
  const hist = parseContentJson(histRes);
  assert(hist.undoCount >= 2, 'e4.1.3: history undo entries recorded');
}

// 4. Immediate mutation tools mutate EditorSession and increment revision
{
  const { client, session } = await createTestHarness();
  const initialRevision = session.revision;

  // create_selection
  const selRes = await client.callTool({
    name: 'create_selection',
    arguments: { bounds: [0, 0, 0, 8, 8, 8] },
  });
  assertEqual(selRes.isError, false, 'e4.1.4: create_selection succeeded');
  assert(session.revision > initialRevision, 'e4.1.4: revision incremented after selection');

  // rename_placement
  const rev1 = session.revision;
  const renRes = await client.callTool({
    name: 'rename_placement',
    arguments: { placementId: 'pl-main', name: 'Renamed Fortress' },
  });
  assertEqual(renRes.isError, false, 'e4.1.4: rename_placement succeeded');
  assertEqual(session.snapshot().placements[0].name, 'Renamed Fortress', 'e4.1.4: placement was renamed in session');
  assertEqual(session.revision, rev1 + 1, 'e4.1.4: revision incremented by 1');

  // transform_placement
  const rev2 = session.revision;
  const trRes = await client.callTool({
    name: 'transform_placement',
    arguments: { placementId: 'pl-main', translation: [5, 0, 5] },
  });
  assertEqual(trRes.isError, false, 'e4.1.4: transform_placement succeeded');
  assertEqual(session.snapshot().placements[0].transform.translation[0], 5, 'e4.1.4: placement translation applied in session');
  assertEqual(session.revision, rev2 + 1, 'e4.1.4: revision incremented by 1');

  // undo
  const rev3 = session.revision;
  const undoRes = await client.callTool({ name: 'undo', arguments: {} });
  assertEqual(undoRes.isError, false, 'e4.1.4: undo succeeded');
  assertEqual(session.revision, rev3 + 1, 'e4.1.4: undo bumped revision');
  assertEqual(session.snapshot().placements[0].transform.translation[0], 0, 'e4.1.4: translation reverted by undo');

  // redo
  const rev4 = session.revision;
  const redoRes = await client.callTool({ name: 'redo', arguments: {} });
  assertEqual(redoRes.isError, false, 'e4.1.4: redo succeeded');
  assertEqual(session.revision, rev4 + 1, 'e4.1.4: redo bumped revision');
  assertEqual(session.snapshot().placements[0].transform.translation[0], 5, 'e4.1.4: translation re-applied by redo');
}

// 5. Destructive two-phase flow
{
  const { client, session } = await createTestHarness();
  const revBefore = session.revision;

  // Phase 1: dry-run
  const dryCall = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      blockType: 'minecraft:gold_block',
      expectedRevision: revBefore,
      requestId: 'req-fill-two-phase',
      dryRun: true,
    },
  });

  assertEqual(dryCall.isError, false, 'e4.1.5: dry-run call succeeded');
  const dryData = parseContentJson(dryCall);
  assertEqual(dryData.requiresConfirmation, true, 'e4.1.5: requiresConfirmation is true');
  assertEqual(typeof dryData.confirmationToken, 'string', 'e4.1.5: confirmationToken returned');
  assertEqual(dryData.candidateCells, 8, 'e4.1.5: 2x2x2 candidate cells = 8');
  assertEqual(dryData.changedCells, 8, 'e4.1.5: 8 cells would change');
  assertEqual(session.revision, revBefore, 'e4.1.5: session revision is unchanged after dry-run');

  // Phase 2: apply
  const applyCall = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      blockType: 'minecraft:gold_block',
      expectedRevision: revBefore,
      requestId: 'req-fill-two-phase',
      confirmationToken: dryData.confirmationToken,
    },
  });

  assertEqual(applyCall.isError, false, 'e4.1.5: apply call succeeded');
  const applyData = parseContentJson(applyCall);
  assertEqual(applyData.applied, true, 'e4.1.5: operation applied');
  assertEqual(applyData.changedCells, 8, 'e4.1.5: 8 cells changed');
  assertEqual(session.revision, revBefore + 1, 'e4.1.5: session revision incremented by 1');
}

// 6. Rejections: stale revision, bad token, locked placement, over-limit bounds, path traversal
{
  const { client, session } = await createTestHarness();

  // Stale revision
  const staleRes = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      expectedRevision: 9999,
      requestId: 'req-stale',
      dryRun: true,
    },
  });
  const staleData = parseContentJson(staleRes);
  assertEqual(staleData.error.code, 'STALE_REVISION', 'e4.1.6: stale revision rejected with STALE_REVISION');

  // Invalid confirmation token
  const badTokenRes = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 2, 2, 2],
      expectedRevision: session.revision,
      requestId: 'req-unbound',
      confirmationToken: 'ct-nonexistent-token',
    },
  });
  const badTokenData = parseContentJson(badTokenRes);
  assert(
    badTokenData.error.code === 'DRY_RUN_REQUIRED' || badTokenData.error.code === 'TOKEN_INVALID',
    'e4.1.6: invalid token rejected',
  );

  // Locked placement rejection
  await client.callTool({
    name: 'set_placement_lock',
    arguments: { placementId: 'pl-main', locked: true },
  });
  assertEqual(session.snapshot().placements[0].locked, true, 'e4.1.6: placement is now locked');

  // Attempting to delete locked placement
  const deleteLocked = await client.callTool({
    name: 'delete_placement',
    arguments: {
      placementId: 'pl-main',
      expectedRevision: session.revision,
      requestId: 'req-del-locked',
      dryRun: true,
    },
  });
  const delData = parseContentJson(deleteLocked);
  assert(
    delData.warnings.some((w: any) => w.code === 'LOCKED_PLACEMENT'),
    'e4.1.6: delete on locked placement rejected with LOCKED_PLACEMENT warning',
  );

  // Over-limit bounds rejection (candidate cells > 1,000,000)
  const overLimit = await client.callTool({
    name: 'fill_selection',
    arguments: {
      operation: 'fill',
      worldBounds: [0, 0, 0, 101, 101, 101], // 101^3 = 1,030,301 > 1,000,000
      expectedRevision: session.revision,
      requestId: 'req-overlimit',
      dryRun: true,
    },
  });
  const overData = parseContentJson(overLimit);
  assertEqual(overData.error?.code, 'OVER_LIMIT', 'e4.1.6: oversized bounds rejected with OVER_LIMIT');

  // Path sandbox rejection on export_schematic
  const pathTraversal = await client.callTool({
    name: 'export_schematic',
    arguments: {
      filePath: '../secret/escape.vxproj',
      expectedRevision: session.revision,
      requestId: 'req-traversal',
      dryRun: true,
    },
  });
  assertEqual(pathTraversal.isError, true, 'e4.1.6: path traversal rejected with isError');
  const traversalData = parseContentJson(pathTraversal);
  assertEqual(traversalData.error.code, 'PATH_TRAVERSAL', 'e4.1.6: error code is PATH_TRAVERSAL');
}

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
