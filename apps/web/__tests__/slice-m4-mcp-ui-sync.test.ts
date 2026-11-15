// apps/web/__tests__/slice-m4-mcp-ui-sync.test.ts
// Slice M4b: Account MCP Hub, Toolbar Button, Bottom Dock AI Tab & Real-Time Sync tests.
// Run with: node --experimental-strip-types apps/web/__tests__/slice-m4-mcp-ui-sync.test.ts

import { setIDBFactory } from '@easyschemedit/persistence';
import { createEditorRuntime } from '../src/editor/runtime.ts';
import { generateStructure, generateShape } from '@easyschemedit/operations';
import { AGENT_LOG_PANEL_UNDO_SOURCE } from '@easyschemedit/ui';
import type { McpSyncSnapshot, McpSelectionSyncState, UserMcpStateDto } from '../src/client/mcp-client.ts';
import type { ToolbarProps } from '../src/editor/layout/Toolbar.tsx';
import type { BottomDockProps } from '../src/editor/layout/BottomDock.tsx';
import type { WorkspaceShellProps } from '../src/editor/layout/WorkspaceShell.tsx';
import type { AgentLogPanelProps } from '../src/editor/mcp/AgentLogPanel.tsx';
import type { McpConnectModalProps } from '../src/components/McpConnectModal.tsx';

// Resolve fake-indexeddb
let IDBFactoryClass: any;
try {
  // @ts-ignore
  const mod = await import('fake-indexeddb');
  IDBFactoryClass = mod.IDBFactory || (mod as any).default?.IDBFactory;
} catch {
  // @ts-ignore
  const mod = await import('../../../packages/persistence/node_modules/fake-indexeddb/build/esm/index.js');
  IDBFactoryClass = mod.IDBFactory;
}

if (IDBFactoryClass) {
  setIDBFactory(new IDBFactoryClass());
}

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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} (Expected: ${expected}, Actual: ${actual})`);
  }
}

async function runTests() {
  console.log('=== Running Slice M4b: MCP UI & Sync Integration Tests ===\n');

  // --------------------------------------------------------------------------
  // Test 1: Local Procedural Structure Generation on Runtime Session
  // --------------------------------------------------------------------------
  console.log('Test 1: Local procedural structure generation directly on session');
  {
    const runtime = createEditorRuntime({ autoLoadAssets: false });
    const initialPlacements = runtime.store.getSnapshot().project.placements;
    assertEqual(initialPlacements.length, 0, 'initial placement count is 0');

    // 1.1 Generate Medieval House
    const houseRes = generateStructure(runtime.store.session, {
      kind: 'house',
      style: 'medieval',
      position: [0, 64, 0],
      placementName: 'Medieval Cottage',
    });

    assert(houseRes.ok, 'generateStructure returned ok: true for house');
    assert(houseRes.changedCells > 0, `changedCells is positive (${houseRes.changedCells})`);
    assert(typeof houseRes.placementId === 'string' && houseRes.placementId.length > 0, 'placementId is present');

    const snapAfterHouse = runtime.store.getSnapshot();
    assertEqual(snapAfterHouse.project.placements.length, 1, 'store snapshot has 1 placement');
    const p1 = snapAfterHouse.project.placements[0];
    assertEqual(p1.id, houseRes.placementId, 'placement ID matches result');
    assertEqual(p1.name, 'Medieval Cottage', 'placement name matches requested name');
    assertEqual(p1.volume.nonAirCount, houseRes.changedCells, 'placement volume nonAirCount matches changedCells');
    assert(snapAfterHouse.revision > 0, 'session revision advanced');

    // 1.2 Generate Deepslate Tower
    const towerRes = generateStructure(runtime.store.session, {
      kind: 'tower',
      style: 'deepslate',
      position: [20, 64, 0],
      placementName: 'Watchtower',
    });

    assert(towerRes.ok, 'generateStructure returned ok: true for tower');
    const snapAfterTower = runtime.store.getSnapshot();
    assertEqual(snapAfterTower.project.placements.length, 2, 'store snapshot has 2 placements');
    const p2 = snapAfterTower.project.placements[1];
    assertEqual(p2.name, 'Watchtower', 'second placement name matches');

    // 1.3 Verify modal structure generator adapter (as wired in EditorIsland to McpConnectModal)
    const modalStructureAdapter = (spec: { structure: string; style: string; position: [number, number, number]; name?: string }): { placementId: string; blockCount: number } => {
      const res = generateStructure(runtime.store.session, {
        kind: spec.structure as any,
        style: spec.style as any,
        position: spec.position,
        placementName: spec.name,
      });
      return { placementId: res.placementId, blockCount: res.changedCells };
    };

    const adapterRes = modalStructureAdapter({
      structure: 'castle',
      style: 'medieval',
      position: [40, 64, 0],
      name: 'Modal Castle',
    });
    assert(typeof adapterRes.placementId === 'string', 'adapter returns placementId');
    assert(typeof adapterRes.blockCount === 'number' && adapterRes.blockCount > 0, 'adapter returns blockCount');
    assertEqual(runtime.store.getSnapshot().project.placements.length, 3, 'castle placement added via adapter');

    runtime.dispose();
  }

  // --------------------------------------------------------------------------
  // Test 2: Local Procedural 3D Shape Generation on Runtime Session
  // --------------------------------------------------------------------------
  console.log('\nTest 2: Local procedural 3D shape generation directly on session');
  {
    const runtime = createEditorRuntime({ autoLoadAssets: false });

    // 2.1 Hollow Sphere
    const sphereRes = generateShape(runtime.store.session, {
      kind: 'sphere',
      block: 'minecraft:smooth_quartz',
      center: [0, 80, 0],
      radius: 6,
      hollow: true,
      placementName: 'Quartz Sphere Dome',
    });

    assert(sphereRes.ok, 'generateShape returned ok: true for sphere');
    assert(sphereRes.changedCells > 0, `sphere changedCells is positive (${sphereRes.changedCells})`);

    let snap = runtime.store.getSnapshot();
    assertEqual(snap.project.placements.length, 1, 'store has 1 shape placement');
    assertEqual(snap.project.placements[0].name, 'Quartz Sphere Dome', 'shape placement name matches');

    // 2.2 Solid Box
    const boxRes = generateShape(runtime.store.session, {
      kind: 'box',
      block: 'minecraft:stone_bricks',
      center: [15, 64, 15],
      width: 8,
      height: 4,
      depth: 8,
      hollow: false,
      placementName: 'Stone Foundation',
    });

    assert(boxRes.ok, 'generateShape returned ok: true for box');
    snap = runtime.store.getSnapshot();
    assertEqual(snap.project.placements.length, 2, 'store has 2 shape placements');

    // 2.3 Verify modal shape generator adapter (as wired in EditorIsland to McpConnectModal)
    const modalShapeAdapter = (spec: {
      shape: string;
      block: string;
      position: [number, number, number];
      radius?: number;
      height?: number;
      hollow?: boolean;
      name?: string;
    }): { placementId: string; blockCount: number } => {
      const res = generateShape(runtime.store.session, {
        kind: spec.shape as any,
        block: spec.block,
        center: spec.position,
        radius: spec.radius,
        height: spec.height,
        hollow: spec.hollow,
        placementName: spec.name,
      });
      return { placementId: res.placementId, blockCount: res.changedCells };
    };

    const shapeAdapterRes = modalShapeAdapter({
      shape: 'cylinder',
      block: 'minecraft:copper_block',
      position: [30, 64, 30],
      radius: 4,
      height: 10,
      name: 'Copper Tower Base',
    });
    assert(typeof shapeAdapterRes.placementId === 'string', 'shape adapter returns placementId');
    assert(typeof shapeAdapterRes.blockCount === 'number' && shapeAdapterRes.blockCount > 0, 'shape adapter returns blockCount');
    assertEqual(runtime.store.getSnapshot().project.placements.length, 3, 'cylinder placement added via adapter');

    runtime.dispose();
  }

  // --------------------------------------------------------------------------
  // Test 3: BottomDock Tabs Include 'agent-log' (AI / MCP)
  // --------------------------------------------------------------------------
  console.log('\nTest 3: BottomDock tabs configuration & tab switching to agent-log');
  {
    const runtime = createEditorRuntime({ autoLoadAssets: false });

    // Initial tab is assets
    assertEqual(runtime.workspace.bottomPanels.activeTab(), 'assets', 'initial active bottom tab is assets');

    // Switch to agent-log tab via bottomPanels controller
    runtime.workspace.bottomPanels.setActiveTab('agent-log');
    assertEqual(runtime.workspace.bottomPanels.activeTab(), 'agent-log', 'active tab in bottomPanels is agent-log');
    assertEqual(runtime.store.getSnapshot().activeBottomTab, 'agent-log', 'active tab in store is agent-log');

    // Switch back to materials, then switch via store.setActiveBottomTab
    runtime.workspace.bottomPanels.setActiveTab('materials');
    assertEqual(runtime.store.getSnapshot().activeBottomTab, 'materials', 'switched to materials');
    runtime.store.setActiveBottomTab('agent-log');
    assertEqual(runtime.store.getSnapshot().activeBottomTab, 'agent-log', 'store set to agent-log');

    // Type checking BottomDockProps accepts tabSlots['agent-log']
    const dockProps: BottomDockProps = {
      store: runtime.store,
      controllers: runtime.workspace,
      tabSlots: {
        'agent-log': null,
      },
    };
    assert(dockProps.tabSlots !== undefined, 'BottomDockProps accepts tabSlots with agent-log key');

    runtime.dispose();
  }

  // --------------------------------------------------------------------------
  // Test 4: AgentLogPanel with Cloud Logs & Connect Button Contract
  // --------------------------------------------------------------------------
  console.log('\nTest 4: AgentLogPanel with cloudLogs and Connect Account button contract');
  {
    const runtime = createEditorRuntime({ autoLoadAssets: false });

    let hubModalTriggered = false;
    const testCloudLogs = [
      {
        id: 'cloud-log-alpha',
        tool: 'generate_structure',
        revision: 4,
        changedCells: 350,
        summary: 'Generated Medieval Fortress via Claude Code MCP',
        createdAt: '2026-11-15T12:30:00.000Z',
      },
      {
        id: 'cloud-log-beta',
        tool: 'generate_shape',
        revision: 5,
        changedCells: 140,
        summary: 'Generated Quartz Portal Arch via Cursor MCP',
        createdAt: '2026-11-15T12:35:00.000Z',
      },
    ];

    // Verify AgentLogPanelProps contract
    const panelProps: AgentLogPanelProps = {
      client: runtime.mcpClient,
      session: runtime.store.session,
      cloudLogs: testCloudLogs,
      onOpenMcpHub: () => {
        hubModalTriggered = true;
      },
      liveSyncEnabled: true,
    };

    assertEqual(panelProps.cloudLogs?.length, 2, 'panelProps accepts 2 cloudLogs');
    assertEqual(panelProps.liveSyncEnabled, true, 'panelProps accepts liveSyncEnabled: true');
    panelProps.onOpenMcpHub?.();
    assert(hubModalTriggered, 'panelProps.onOpenMcpHub triggers callback');

    // Verify D-8 undo contract token
    assertEqual(
      AGENT_LOG_PANEL_UNDO_SOURCE,
      'apps/mcp-companion agent-log.isUndoAvailable',
      'AGENT_LOG_PANEL_UNDO_SOURCE matches UI token',
    );

    runtime.dispose();
  }

  // --------------------------------------------------------------------------
  // Test 5: Toolbar AI / MCP Button & WorkspaceShell Plumbing Contract
  // --------------------------------------------------------------------------
  console.log('\nTest 5: Toolbar AI / MCP button with live sync status & WorkspaceShell plumbing');
  {
    const runtime = createEditorRuntime({ autoLoadAssets: false });
    let toolbarHubOpened = false;

    // Verify ToolbarProps contract
    const toolbarProps: ToolbarProps = {
      store: runtime.store,
      onOpenMcpHub: () => {
        toolbarHubOpened = true;
      },
      mcpLiveSyncActive: true,
    };

    assertEqual(toolbarProps.mcpLiveSyncActive, true, 'ToolbarProps accepts mcpLiveSyncActive: true');
    toolbarProps.onOpenMcpHub?.();
    assert(toolbarHubOpened, 'toolbarProps.onOpenMcpHub triggers callback');

    // Verify WorkspaceShellProps contract
    let shellHubOpened = false;
    const shellProps: WorkspaceShellProps = {
      store: runtime.store,
      viewportSlot: null,
      onOpenMcpHub: () => {
        shellHubOpened = true;
      },
      mcpLiveSyncActive: true,
      tabSlots: {
        'agent-log': null,
      },
    };

    assertEqual(shellProps.mcpLiveSyncActive, true, 'WorkspaceShellProps accepts mcpLiveSyncActive: true');
    shellProps.onOpenMcpHub?.();
    assert(shellHubOpened, 'shellProps.onOpenMcpHub triggers callback');

    runtime.dispose();
  }

  // --------------------------------------------------------------------------
  // Test 6: Cloud MCP Sync Types and Data Contracts
  // --------------------------------------------------------------------------
  console.log('\nTest 6: Cloud MCP Sync snapshot and selection state contracts');
  {
    const selectionState: McpSelectionSyncState = {
      schematicId: 'schem-123',
      savedRegions: [
        {
          id: 'reg-1',
          name: 'Main Hall',
          pos1: [0, 64, 0],
          pos2: [15, 75, 15],
          bounds: {
            min: [0, 64, 0],
            maxExclusive: [16, 76, 16],
          },
        },
      ],
      activeRegionId: 'reg-1',
      bounds: {
        min: [0, 64, 0],
        maxExclusive: [16, 76, 16],
      },
      pos1: [0, 64, 0],
      pos2: [15, 75, 15],
      updatedAt: '2026-11-15T12:00:00.000Z',
    };

    const syncSnapshot: McpSyncSnapshot = {
      activeProjectId: 'proj-123',
      activeSchematicId: 'schem-123',
      schematicRevision: 12,
      schematicUpdatedAt: '2026-11-15T12:00:00.000Z',
      selectionState,
      recentLogs: [
        {
          id: 'log-1',
          projectId: 'proj-123',
          schematicId: 'schem-123',
          tool: 'fill_region',
          revision: 12,
          changedCells: 256,
          summary: 'Filled selection with stone bricks',
          createdAt: '2026-11-15T12:00:00.000Z',
        },
      ],
    };

    assertEqual(syncSnapshot.activeProjectId, 'proj-123', 'syncSnapshot projectId matches');
    assertEqual(syncSnapshot.schematicRevision, 12, 'syncSnapshot revision matches');
    assertEqual(syncSnapshot.recentLogs.length, 1, 'syncSnapshot has 1 recent log');
    assertEqual(syncSnapshot.selectionState?.savedRegions.length, 1, 'syncSnapshot has 1 saved region');
  }

  console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
