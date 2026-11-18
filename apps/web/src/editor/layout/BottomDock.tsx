// apps/web/src/editor/layout/BottomDock.tsx
// Collapsible bottom dock panel with tab switching: Assets, Materials, Conflicts, History, Agent Log.
// Precision-instrument chrome (SPEC.ui-precision-instrument.md §4).

import React, { useState, useEffect } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { BottomTabId } from '@easyschemedit/ui';
import type { HistoryQueryResult } from '@easyschemedit/operations';
import type { ConflictsPanelController, MaterialListController } from '../panels/panels-controller.ts';
import { Icon, type IconName } from '../ui/index.ts';

export interface BottomDockProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  conflictsController?: ConflictsPanelController;
  materialListController?: MaterialListController;
  tabSlots?: Partial<Record<BottomTabId, React.ReactNode>>;
  onCollapse?: () => void;
  className?: string;
}

interface TabItem {
  id: BottomTabId;
  label: string;
  icon: IconName;
}

const TABS: TabItem[] = [
  { id: 'assets', label: 'Assets', icon: 'box' },
  { id: 'materials', label: 'Materials', icon: 'layers' },
  { id: 'conflicts', label: 'Conflicts', icon: 'conflict' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'agent-log', label: 'AI / MCP', icon: 'agent' },
];

export function BottomDock({
  store,
  controllers,
  conflictsController,
  materialListController,
  tabSlots = {},
  onCollapse,
  className = '',
}: BottomDockProps) {
  const snapshot = store.getSnapshot();
  const activeTab: BottomTabId =
    (snapshot.activeBottomTab as BottomTabId) ||
    controllers?.bottomPanels.activeTab() ||
    'assets';

  const [historyData, setHistoryData] = useState<HistoryQueryResult | null>(null);

  // Sync active controllers to prevent eager scans when closed
  useEffect(() => {
    conflictsController?.setActive(activeTab === 'conflicts');
    materialListController?.setActive(activeTab === 'materials');
    return () => {
      conflictsController?.setActive(false);
      materialListController?.setActive(false);
    };
  }, [activeTab, conflictsController, materialListController]);

  // When History tab is active, query history stack
  useEffect(() => {
    if (activeTab === 'history') {
      let isMounted = true;
      void store.query<HistoryQueryResult>({ type: 'getHistory' }).then((res) => {
        if (isMounted) setHistoryData(res);
      });
      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, snapshot.revision, store]);

  const handleSelectTab = (tabId: BottomTabId) => {
    if (controllers) {
      controllers.bottomPanels.setActiveTab(tabId);
    } else {
      store.setActiveBottomTab(tabId);
    }
  };

  return (
    <div
      className={`editor-bottom-dock ${className}`}
      aria-label="Bottom Dock"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--ink-850)',
        borderTop: '1px solid var(--line-strong)',
        color: 'var(--text)',
        fontSize: '12px',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Dock Tab Bar */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '28px',
          padding: '0 8px',
          backgroundColor: 'var(--ink-900)',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  height: '100%',
                  padding: '0 var(--space-2)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--signal)' : '2px solid transparent',
                  color: isActive ? 'var(--text)' : 'var(--text-dim)',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  borderRadius: '0',
                  transition: 'color 0.12s ease-out, border-color 0.12s ease-out',
                }}
              >
                <Icon name={tab.icon} size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse Bottom Dock"
            aria-label="Collapse Bottom Dock"
            style={iconButtonStyle}
          >
            <Icon name="chevronDown" size={14} />
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div
        role="tabpanel"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 12px',
          backgroundColor: 'var(--ink-850)',
        }}
      >
        {tabSlots[activeTab] ? (
          tabSlots[activeTab]
        ) : (
          <DefaultTabContent activeTab={activeTab} store={store} historyData={historyData} />
        )}
      </div>
    </div>
  );
}

function DefaultTabContent({
  activeTab,
  store,
  historyData,
}: {
  activeTab: BottomTabId;
  store: EditorSessionStore;
  historyData: HistoryQueryResult | null;
}) {
  const snapshot = store.getSnapshot();

  switch (activeTab) {
    case 'history':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={() => void store.undo()}
              disabled={!snapshot.canUndo}
              style={{
                ...smallButtonStyle,
                opacity: snapshot.canUndo ? 1 : 0.5,
              }}
            >
              <Icon name="undo" size={14} />
              Undo (Ctrl+Z)
            </button>
            <button
              type="button"
              onClick={() => void store.redo()}
              disabled={!snapshot.canRedo}
              style={{
                ...smallButtonStyle,
                opacity: snapshot.canRedo ? 1 : 0.5,
              }}
            >
              <Icon name="redo" size={14} />
              Redo (Ctrl+Y)
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
              Current Revision: #{snapshot.revision}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--ink-900)',
              padding: '8px',
            }}
          >
            {historyData && historyData.undoStack.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {historyData.undoStack
                  .slice()
                  .reverse()
                  .map((entry, idx) => (
                    <div
                      key={entry.id ?? idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        background: 'var(--ink-800)',
                        borderLeft: '2px solid var(--line-strong)',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {entry.type.toUpperCase()}: Revision {entry.beforeRevision} to {entry.afterRevision}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-faint)' }}>
                No undo history recorded yet.
              </div>
            )}
          </div>
        </div>
      );

    case 'materials':
      return (
        <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text)' }}>Project Materials Breakdown</div>
          <div>Total non-air blocks in project: {snapshot.project.placements.reduce((acc, p) => acc + (p.volume?.nonAirCount ?? 0), 0).toLocaleString()}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-dim)' }}>
            Palette cardinality: {snapshot.project.placements.reduce((acc, p) => acc + (p.volume?.paletteCardinality ?? 0), 0)} unique block states
          </div>
        </div>
      );

    case 'conflicts':
      return (
        <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text)' }}>Multi-Placement Conflicts</div>
          <p style={{ margin: 0 }}>
            Overlap Policy: <strong>{snapshot.project.overlapPolicy ?? 'top-wins'}</strong>
          </p>
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon name="check" size={12} />
            No blocking volumetric conflicts detected.
          </div>
        </div>
      );

    case 'assets':
      return (
        <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text)' }}>Resource Packs & Textures</div>
          <div>Target: Minecraft Java 1.21.11</div>
          <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-dim)' }}>
            Default vanilla textures active. Drop a .zip resource pack into the viewport to layer overrides.
          </div>
        </div>
      );

    case 'agent-log':
      return (
        <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text)' }}>AI & MCP Companion Bridge</div>
          <p style={{ margin: 0 }}>
            Connect Claude, Cursor, Antigravity or Windsurf via the MCP companion bridge or Account API Key.
          </p>
        </div>
      );


    default:
      return null;
  }
}

const smallButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  background: 'var(--ink-900)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  fontSize: '11px',
  cursor: 'pointer',
  borderRadius: '0',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '24px',
  minHeight: '24px',
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: '0',
  color: 'var(--text-dim)',
  cursor: 'pointer',
};
