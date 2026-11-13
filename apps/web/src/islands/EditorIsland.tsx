// apps/web/src/islands/EditorIsland.tsx
// Integrated EasySchemEdit v1 workspace component connecting all editor modules and runtime.

'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import '../editor/design-tokens.css';
import {
  createEditorRuntime,
  WorkspaceShell,
  ViewportCanvas,
  AssetLoadPanel,
  ImportDialog,
  ExportDialog,
  BakeDialog,
  ProjectDialog,
  MaterialListPanel,
  ConflictsPanel,
  AgentLogPanel,
  BlockPickerPanel,
  TransformControls,
  LibraryPanel,
  type VoxelHit,
} from '../editor/index.ts';

export default function EditorIsland() {
  const runtime = useMemo(() => createEditorRuntime(), []);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isBakeOpen, setIsBakeOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);

  // Crash recovery check on mount
  useEffect(() => {
    const currentProjectId = runtime.store.getSnapshot().project.id;
    runtime.persistence.checkCrashRecovery(currentProjectId).then((recovered) => {
      if (recovered) {
        console.info('Restored project from crash recovery snapshot.');
      }
    }).catch((err) => {
      console.warn('Crash recovery check failed:', err);
    });

    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  const handleVoxelClick = useCallback((hit: VoxelHit, event: React.MouseEvent) => {
    runtime.selectionTool.setCorner1(hit.position);
  }, [runtime]);

  const handleVoxelHover = useCallback((hit: VoxelHit | null) => {
    // Optional hover feedback
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceShell
        store={runtime.store}
        controllers={runtime.workspace}
        onImport={() => setIsImportOpen(true)}
        onExport={() => setIsExportOpen(true)}
        onBake={() => setIsBakeOpen(true)}
        onSave={() => runtime.persistence.saveCurrentProject()}
        viewportSlot={
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <ViewportCanvas
              session={runtime.store.session}
              assetSource={runtime.assetManager.getAssetSource()}
              uvLookup={runtime.assetManager.getUvLookup()}
              onVoxelClick={handleVoxelClick}
              onVoxelHover={handleVoxelHover}
            />
            <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
              <BlockPickerPanel
                onSelectBlock={(blockId) => {
                  runtime.regionTools.fill(blockId);
                }}
              />
            </div>
            <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
              <TransformControls
                controller={runtime.placementOps}
              />
            </div>
            <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10, maxHeight: 300, overflowY: 'auto' }}>
              <LibraryPanel
                controller={runtime.persistence}
              />
            </div>
          </div>
        }
        tabSlots={{
          assets: <AssetLoadPanel manager={runtime.assetManager} />,
          materials: <MaterialListPanel controller={runtime.materialListController} />,
          conflicts: <ConflictsPanel controller={runtime.conflictsController} onOpenBake={() => setIsBakeOpen(true)} />,
          'agent-log': <AgentLogPanel client={runtime.mcpClient} session={runtime.store.session} />,
        }}
      />

      {/* Modals */}
      {isImportOpen && (
        <ImportDialog
          controller={runtime.importWorkflow}
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
        />
      )}

      {isExportOpen && (
        <ExportDialog
          controller={runtime.persistence}
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
        />
      )}

      {isBakeOpen && (
        <BakeDialog
          controller={runtime.bakeController}
          isOpen={isBakeOpen}
          onClose={() => setIsBakeOpen(false)}
        />
      )}

      {isProjectOpen && (
        <ProjectDialog
          controller={runtime.persistence}
          isOpen={isProjectOpen}
          onClose={() => setIsProjectOpen(false)}
        />
      )}
    </div>
  );
}
