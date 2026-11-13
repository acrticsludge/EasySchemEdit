// apps/web/src/editor/runtime.ts
// Pure-TS runtime factory for EasySchemEdit editor workspace.
// Separated from .tsx exports so Node --experimental-strip-types can run tests cleanly.

import { EditorSessionStore } from './session-store.ts';
import { createWorkspaceControllers, type StorageLike } from './layout/layout-bridge.ts';
import { BrowserAssetManager } from './assets/asset-manager.ts';
import { ImportWorkflowController } from './workflows/import-workflow.ts';
import { PlacementOperationsController } from './workflows/placement-ops.ts';
import { SelectionToolController } from './tools/selection-tool.ts';
import { RegionToolsController } from './tools/region-tools.ts';
import { ConflictsPanelController, BakeController, MaterialListController } from './panels/panels-controller.ts';
import { ProjectPersistenceController } from './persistence/persistence-controller.ts';
import { McpBridgeClient } from './mcp/mcp-bridge-client.ts';
import type { Project } from '@easyschemedit/domain';

export interface EditorRuntimeOptions {
  initialProject?: Project;
  storage?: StorageLike;
  assetManagerOptions?: any;
  autoLoadAssets?: boolean;
}

export interface EditorRuntime {
  store: EditorSessionStore;
  workspace: ReturnType<typeof createWorkspaceControllers>;
  assetManager: BrowserAssetManager;
  importWorkflow: ImportWorkflowController;
  placementOps: PlacementOperationsController;
  selectionTool: SelectionToolController;
  regionTools: RegionToolsController;
  conflictsController: ConflictsPanelController;
  bakeController: BakeController;
  materialListController: MaterialListController;
  persistence: ProjectPersistenceController;
  mcpClient: McpBridgeClient;
  dispose(): void;
}

/**
  * Instantiates and wires all editor session stores, controllers, managers, and MCP client.
  */
export function createEditorRuntime(options?: EditorRuntimeOptions): EditorRuntime {
  const store = new EditorSessionStore(options?.initialProject);
  const workspace = createWorkspaceControllers(store, options?.storage);
  const assetManager = new BrowserAssetManager(options?.assetManagerOptions);
  const importWorkflow = new ImportWorkflowController(store);
  const placementOps = new PlacementOperationsController(store);
  const selectionTool = new SelectionToolController(store);
  const regionTools = new RegionToolsController(store, selectionTool);
  const conflictsController = new ConflictsPanelController(store, 'conflicts-only', { active: false });
  const bakeController = new BakeController(store);
  const materialListController = new MaterialListController(store, { active: false });
  const persistence = new ProjectPersistenceController(store);
  const mcpClient = new McpBridgeClient({ session: store.session });

  // Wire autosave on session change
  const unsubscribeStore = store.subscribe(() => {
    persistence.scheduleAutosave();
  });

  if (options?.autoLoadAssets !== false) {
    // Kick off non-blocking asset manifest load
    assetManager.autoLoad().catch((err) => {
      console.warn('Failed to auto-load asset pack:', err);
    });
  }

  return {
    store,
    workspace,
    assetManager,
    importWorkflow,
    placementOps,
    selectionTool,
    regionTools,
    conflictsController,
    bakeController,
    materialListController,
    persistence,
    mcpClient,
    dispose() {
      unsubscribeStore();
      persistence.dispose();
      mcpClient.disconnect();
      conflictsController.dispose();
      materialListController.dispose();
    },
  };
}
