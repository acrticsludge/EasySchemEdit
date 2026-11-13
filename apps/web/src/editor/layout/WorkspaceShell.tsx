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
import { OutlinerPanel } from './OutlinerPanel.tsx';
import { InspectorPanel } from './InspectorPanel.tsx';
import { BottomDock } from './BottomDock.tsx';
import { StatusBar } from './StatusBar.tsx';
import type { BottomTabId, KeyDescriptor } from '@easyschemedit/ui';

export type RightDockTabId = 'inspector' | 'tools' | 'transform' | 'library';

export interface WorkspaceShellProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
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
  activeOverlays?: ToolbarProps['activeOverlays'];
  onToggleOverlay?: ToolbarProps['onToggleOverlay'];
  fps?: number;
  hoveredBlockName?: string | null;
  cursorCoordinates?: { x: number; y: number; z: number } | null;
  className?: string;
}

export function WorkspaceShell({
  store,
  controllers: providedControllers,
  storage,
  viewportSlot,
  tabSlots,
  rightDockSlots,
  onImport,
  onExport,
  onBake,
  onSave,
  activeOverlays,
  onToggleOverlay,
  fps = 60,
  hoveredBlockName = null,
  cursorCoordinates = null,
  className = '',
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

  const layoutState = controllers.layout.state();
  const leftPanel = layoutState.panels.find((p) => p.id === 'hierarchy');
  const rightPanel = layoutState.panels.find((p) => p.id === 'inspector');
  const bottomPanel = layoutState.panels.find((p) => p.id === 'bottom-dock');

  const leftWidth = leftPanel?.collapsed ? 28 : (leftPanel?.width ?? 260);
  const rightWidth = rightPanel?.collapsed ? 28 : (rightPanel?.width ?? 320);
  const bottomHeight = bottomPanel?.collapsed ? 28 : (bottomPanel?.height ?? 220);

  const [rightDockTab, setRightDockTab] = useState<RightDockTabId>('inspector');

  useEffect(() => {
    const activeTool = sessionSnap.selectedTool;
    if (rightDockSlots) {
      if (['cuboid', 'cuboid-select', 'fill', 'replace', 'walls', 'hollow', 'delete', 'delete-region', 'paste'].includes(activeTool) && rightDockSlots.tools) {
        setRightDockTab('tools');
      } else if (['move', 'rotate'].includes(activeTool) && rightDockSlots.transform) {
        setRightDockTab('transform');
      }
    }
  }, [sessionSnap.selectedTool, rightDockSlots]);

  // --------------------------------------------------------------------------
  // Divider Drag Resizing
  // --------------------------------------------------------------------------
  const [activeResizing, setActiveResizing] = useState<'left' | 'right' | 'bottom' | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialWidth: number; initialHeight: number }>({
    startX: 0,
    startY: 0,
    initialWidth: 0,
    initialHeight: 0,
  });

  const handleStartResize = (panel: 'left' | 'right' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    setActiveResizing(panel);

    const initialW = panel === 'left' ? (leftPanel?.width ?? 260) : (rightPanel?.width ?? 320);
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
      } else if (activeResizing === 'right') {
        // Dragging right border to the left increases width
        const deltaX = dragStartRef.current.startX - e.clientX;
        controllers.layout.resizePanel('inspector', { width: deltaX }, windowSize);
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
        </div>

        {/* Divider Right */}
        {!rightPanel?.collapsed && (
          <div
            onMouseDown={(e) => handleStartResize('right', e)}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize inspector"
            style={{
              width: '4px',
              height: '100%',
              cursor: 'col-resize',
              backgroundColor: activeResizing === 'right' ? 'var(--color-accent, #4a9eff)' : 'transparent',
              zIndex: 10,
              flexShrink: 0,
              transition: 'background-color 0.1s',
            }}
          />
        )}

        {/* Right: Inspector */}
        <div
          style={{
            width: `${rightWidth}px`,
            minWidth: rightPanel?.collapsed ? '28px' : '160px',
            maxWidth: '600px',
            height: '100%',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {rightPanel?.collapsed ? (
            <CollapsedBar
              label="INSPECTOR / TOOLS"
              onClick={() => {
                controllers.layout.expandPanel('inspector');
                forceLayoutUpdate();
              }}
            />
          ) : rightDockSlots ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: 'var(--color-bg-surface, #141414)', borderLeft: '1px solid var(--color-border, #222)' }}>
              {/* Tab Header */}
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border, #222)', background: 'var(--color-bg-alt, #1a1a1a)', flexShrink: 0, overflowX: 'auto' }}>
                {(['inspector', 'tools', 'transform', 'library'] as RightDockTabId[]).map((tabId) => {
                  if (tabId !== 'inspector' && !rightDockSlots[tabId as keyof typeof rightDockSlots]) return null;
                  const isActive = rightDockTab === tabId;
                  return (
                    <button
                      key={tabId}
                      onClick={() => setRightDockTab(tabId)}
                      style={{
                        padding: '8px 12px',
                        background: isActive ? 'var(--color-bg-surface, #141414)' : 'transparent',
                        color: isActive ? 'var(--color-accent, #4a9eff)' : 'var(--color-text-secondary, #aaa)',
                        border: 'none',
                        borderBottom: isActive ? '2px solid var(--color-accent, #4a9eff)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: isActive ? 600 : 400,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tabId}
                    </button>
                  );
                })}
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => {
                    controllers.layout.collapsePanel('inspector');
                    forceLayoutUpdate();
                  }}
                  title="Collapse Right Dock"
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary, #aaa)', cursor: 'pointer', padding: '8px 10px', fontSize: '10px' }}
                >
                  ▶
                </button>
              </div>
              {/* Tab Content */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {rightDockTab === 'inspector' && (
                  <InspectorPanel
                    store={store}
                    controllers={controllers}
                    onCollapse={() => {
                      controllers.layout.collapsePanel('inspector');
                      forceLayoutUpdate();
                    }}
                  />
                )}
                {rightDockTab === 'tools' && rightDockSlots.tools}
                {rightDockTab === 'transform' && rightDockSlots.transform}
                {rightDockTab === 'library' && rightDockSlots.library}
              </div>
            </div>
          ) : (
            <InspectorPanel
              store={store}
              controllers={controllers}
              onCollapse={() => {
                controllers.layout.collapsePanel('inspector');
                forceLayoutUpdate();
              }}
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
            label="BOTTOM DOCK (Assets | Materials | Conflicts | History | Agent Log)"
            onClick={() => {
              controllers.layout.expandPanel('bottom-dock');
              forceLayoutUpdate();
            }}
          />
        ) : (
          <BottomDock
            store={store}
            controllers={controllers}
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
