// apps/web/src/editor/layout/WorkspaceShell.tsx
// S&box-style workspace layout shell: Toolbar top, Outliner left, Viewport center,
// Inspector right, BottomDock bottom, StatusBar footer.
// Resizable panels with drag dividers, collapsible docks, and keyboard shortcut scoping.
// SUBSPEC-G §6.1, G1.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import { useEditorSession } from '../session-store.ts';
import type { WorkspaceControllers, StorageLike } from './layout-bridge.ts';
import { createWorkspaceControllers } from './layout-bridge.ts';
import { Toolbar, type ToolbarProps } from './Toolbar.tsx';
import type { AuthUser } from '../../client/auth-client.ts';
import { OutlinerPanel } from './OutlinerPanel.tsx';
import { BottomDock } from './BottomDock.tsx';
import { StatusBar } from './StatusBar.tsx';
import { SelectedPlacementBar } from '../viewport/SelectedPlacementBar.tsx';
import type { BottomTabId, KeyDescriptor } from '@easyschemedit/ui';
import type { ConflictsPanelController, MaterialListController } from '../panels/panels-controller.ts';

export type RightDockTabId = 'inspector' | 'tools' | 'transform' | 'library';

export interface WorkspaceShellProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  conflictsController?: ConflictsPanelController;
  materialListController?: MaterialListController;
  storage?: StorageLike;
  viewportSlot: React.ReactNode;
  tabSlots?: Partial<Record<BottomTabId, React.ReactNode>>;
  rightDockSlots?: {
    tools?: React.ReactNode;
    transform?: React.ReactNode;
    library?: React.ReactNode;
  };
  onImport?: () => void;
  onExport?: () => void;
  onBake?: () => void;
  onSave?: () => void;
  onOpenProjects?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  authUser?: AuthUser | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  activeOverlays?: ToolbarProps['activeOverlays'];
  onToggleOverlay?: ToolbarProps['onToggleOverlay'];
  fps?: number;
  hoveredBlockName?: string | null;
  cursorCoordinates?: { x: number; y: number; z: number } | null;
  className?: string;
  selectedPlacementId?: string | null;
  onSelectPlacement?: (id: string | null) => void;
  nudgeStep?: 1 | 16;
  onNudgeStepChange?: (step: 1 | 16) => void;
}

export function WorkspaceShell({
  store,
  controllers: providedControllers,
  conflictsController,
  materialListController,
  storage,
  viewportSlot,
  tabSlots,
  onImport,
  onExport,
  onBake,
  onSave,
  onOpenProjects,
  isDirty,
  isSaving,
  authUser,
  onSignIn,
  onSignOut,
  activeOverlays,
  onToggleOverlay,
  fps = 60,
  hoveredBlockName = null,
  cursorCoordinates = null,
  className = '',
  selectedPlacementId: controlledSelectedPlacementId,
  onSelectPlacement,
  nudgeStep,
  onNudgeStepChange,
}: WorkspaceShellProps) {
  // Sync with store state
  const sessionSnap = useEditorSession(store);

  // Initialize or memoize controllers
  const controllers = useMemo(() => {
    if (providedControllers) return providedControllers;
    const defaultStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return createWorkspaceControllers(store, defaultStorage);
  }, [store, providedControllers, storage]);

  // Layout state trigger
  const [layoutVersion, setLayoutVersion] = useState(0);
  const forceLayoutUpdate = useCallback(() => {
    setLayoutVersion((v) => v + 1);
  }, []);

  const inspectorSelectedId = controllers?.inspector.context().selectedPlacementId ?? null;
  const [localSelectedPlacementId, setLocalSelectedPlacementId] = useState<string | null>(inspectorSelectedId);

  useEffect(() => {
    setLocalSelectedPlacementId(controllers?.inspector.context().selectedPlacementId ?? null);
  }, [controllers, sessionSnap.revision]);

  useEffect(() => {
    if (controlledSelectedPlacementId !== undefined) {
      if (controllers?.inspector.context().selectedPlacementId !== controlledSelectedPlacementId) {
        controllers?.selectPlacement(controlledSelectedPlacementId);
      }
    }
  }, [controllers, controlledSelectedPlacementId]);

  const effectiveSelectedId = controlledSelectedPlacementId !== undefined
    ? controlledSelectedPlacementId
    : localSelectedPlacementId;
  const selectedPlacement = sessionSnap.project?.placements.find((p) => p.id === effectiveSelectedId);

  const handleSelectPlacement = useCallback(
    (id: string | null) => {
      controllers.selectPlacement(id);
      setLocalSelectedPlacementId(id);
      onSelectPlacement?.(id);
      forceLayoutUpdate();
    },
    [controllers, onSelectPlacement, forceLayoutUpdate]
  );

  const layoutState = controllers.layout.state();
  const leftPanel = layoutState.panels.find((p) => p.id === 'hierarchy');
  const bottomPanel = layoutState.panels.find((p) => p.id === 'bottom-dock');

  const leftWidth = leftPanel?.collapsed ? 28 : (leftPanel?.width ?? 260);
  const bottomHeight = bottomPanel?.collapsed ? 28 : (bottomPanel?.height ?? 220);

  // --------------------------------------------------------------------------
  // Divider Drag Resizing
  // --------------------------------------------------------------------------
  const [activeResizing, setActiveResizing] = useState<'left' | 'bottom' | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialWidth: number; initialHeight: number }>({
    startX: 0,
    startY: 0,
    initialWidth: 0,
    initialHeight: 0,
  });

  const handleStartResize = (panel: 'left' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    setActiveResizing(panel);

    const initialW = leftPanel?.width ?? 260;
    const initialH = bottomPanel?.height ?? 220;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: initialW,
      initialHeight: initialH,
    };
  };

  useEffect(() => {
    if (!activeResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowSize = {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 720,
      };

      if (activeResizing === 'left') {
        const deltaX = e.clientX - dragStartRef.current.startX;
        controllers.layout.resizePanel('hierarchy', { width: deltaX }, windowSize);
        dragStartRef.current.startX = e.clientX;
        forceLayoutUpdate();
      } else if (activeResizing === 'bottom') {
        // Dragging bottom border up increases height
        const deltaY = dragStartRef.current.startY - e.clientY;
        controllers.layout.resizePanel('bottom-dock', { height: deltaY }, windowSize);
        dragStartRef.current.startY = e.clientY;
        forceLayoutUpdate();
      }
    };

    const handleMouseUp = () => {
      setActiveResizing(null);
      controllers.persistLayout();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResizing, controllers, forceLayoutUpdate]);

  // --------------------------------------------------------------------------
  // Keyboard Shortcut Listener
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inTextInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      const descriptor: KeyDescriptor = {
        key: e.key.toLowerCase(),
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      };

      const action = controllers.shortcuts.handleKeydown(descriptor, { inTextInput });
      if (action) {
        e.preventDefault();
        forceLayoutUpdate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [controllers, forceLayoutUpdate]);

  return (
    <div
      className={`editor-workspace ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        color: 'var(--color-text-primary, #eaeaea)',
        overflow: 'hidden',
        position: 'relative',
        userSelect: activeResizing ? 'none' : 'auto',
      }}
    >
      {/* 1. Top Toolbar */}
      <Toolbar
        store={store}
        controllers={controllers}
        onImport={onImport}
        onExport={onExport}
        onBake={onBake}
        onSave={onSave}
        onOpenProjects={onOpenProjects}
        isDirty={isDirty}
        isSaving={isSaving}
        authUser={authUser}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        activeOverlays={activeOverlays}
        onToggleOverlay={onToggleOverlay}
      />

      {/* 2. Middle Region: Left Dock + Viewport + Right Dock */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left: Outliner */}
        <div
          style={{
            width: `${leftWidth}px`,
            minWidth: leftPanel?.collapsed ? '28px' : '120px',
            maxWidth: '500px',
            height: '100%',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {leftPanel?.collapsed ? (
            <CollapsedBar
              label="OUTLINER"
              onClick={() => {
                controllers.layout.expandPanel('hierarchy');
                forceLayoutUpdate();
              }}
            />
          ) : (
            <OutlinerPanel
              store={store}
              controllers={controllers}
              selectedPlacementId={effectiveSelectedId}
              onSelectPlacement={handleSelectPlacement}
              onCollapse={() => {
                controllers.layout.collapsePanel('hierarchy');
                forceLayoutUpdate();
              }}
            />
          )}
        </div>

        {/* Divider Left */}
        {!leftPanel?.collapsed && (
          <div
            onMouseDown={(e) => handleStartResize('left', e)}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize outliner"
            style={{
              width: '4px',
              height: '100%',
              cursor: 'col-resize',
              backgroundColor: activeResizing === 'left' ? 'var(--color-accent, #4a9eff)' : 'transparent',
              zIndex: 10,
              flexShrink: 0,
              transition: 'background-color 0.1s',
            }}
          />
        )}

        {/* Center: 3D Viewport (Dominant) */}
        <div
          style={{
            flex: 1,
            minWidth: '200px',
            minHeight: '180px',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#050505',
          }}
        >
          {viewportSlot}
          {selectedPlacement && (
            <SelectedPlacementBar
              store={store}
              placement={selectedPlacement}
              onSelectPlacement={handleSelectPlacement}
              step={nudgeStep}
              onStepChange={onNudgeStepChange}
            />
          )}
        </div>
      </div>

      {/* Divider Bottom */}
      {!bottomPanel?.collapsed && (
        <div
          onMouseDown={(e) => handleStartResize('bottom', e)}
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize bottom dock"
          style={{
            height: '4px',
            width: '100%',
            cursor: 'row-resize',
            backgroundColor: activeResizing === 'bottom' ? 'var(--color-accent, #4a9eff)' : 'transparent',
            zIndex: 10,
            flexShrink: 0,
            transition: 'background-color 0.1s',
          }}
        />
      )}

      {/* 3. Bottom Dock */}
      <div
        style={{
          height: `${bottomHeight}px`,
          minHeight: bottomPanel?.collapsed ? '28px' : '80px',
          maxHeight: '500px',
          width: '100%',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {bottomPanel?.collapsed ? (
          <CollapsedHorizontalBar
            label="BOTTOM DOCK (Assets | Materials | Conflicts | History)"
            onClick={() => {
              controllers.layout.expandPanel('bottom-dock');
              forceLayoutUpdate();
            }}
          />
        ) : (
          <BottomDock
            store={store}
            controllers={controllers}
            conflictsController={conflictsController}
            materialListController={materialListController}
            tabSlots={tabSlots}
            onCollapse={() => {
              controllers.layout.collapsePanel('bottom-dock');
              forceLayoutUpdate();
            }}
          />
        )}
      </div>

      {/* 4. Bottom Status Bar */}
      <StatusBar
        store={store}
        controllers={controllers}
        fps={fps}
        hoveredBlockName={hoveredBlockName}
        cursorCoordinates={cursorCoordinates}
      />
    </div>
  );
}

function CollapsedBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      title={`Click to expand ${label}`}
      aria-label={`Expand ${label}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '100%',
        backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        borderRight: '1px solid #2a2a2a',
        borderLeft: '1px solid #2a2a2a',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: '10px',
          letterSpacing: '1px',
          color: 'var(--color-text-secondary, #888888)',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function CollapsedHorizontalBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      title="Click to expand bottom dock"
      aria-label="Expand bottom dock"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '28px',
        padding: '0 12px',
        backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        borderTop: '1px solid #2a2a2a',
        cursor: 'pointer',
        fontSize: '11px',
        color: 'var(--color-text-secondary, #888888)',
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: '10px' }}>▲ Expand</span>
    </div>
  );
}
