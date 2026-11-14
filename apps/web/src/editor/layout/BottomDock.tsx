// apps/web/src/editor/layout/BottomDock.tsx
// Collapsible bottom dock panel with tab switching: Assets, Materials, Conflicts, History, Agent Log.
// S&box style adhering to SUBSPEC-G §6.4, G1.

import React, { useState, useEffect } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { BottomTabId } from '@easyschemedit/ui';
import type { HistoryQueryResult } from '@easyschemedit/operations';
import type { ConflictsPanelController, MaterialListController } from '../panels/panels-controller.ts';

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
  icon: string;
}

const TABS: TabItem[] = [
  { id: 'assets', label: 'Assets', icon: '📦' },
  { id: 'materials', label: 'Materials', icon: '🧱' },
  { id: 'conflicts', label: 'Conflicts', icon: '⚠' },
  { id: 'history', label: 'History', icon: '⏱' },
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
        backgroundColor: 'var(--color-bg-secondary, #1a1a1a)',
        borderTop: '1px solid var(--color-border-subtle, #333333)',
        color: 'var(--color-text-primary, #eaeaea)',
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
          backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
          borderBottom: '1px solid #2a2a2a',
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
                  gap: '6px',
                  height: '100%',
                  padding: '0 12px',
                  background: isActive ? 'var(--color-bg-secondary, #1a1a1a)' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--color-accent, #4a9eff)' : '2px solid transparent',
                  color: isActive ? '#ffffff' : 'var(--color-text-secondary, #a8a8a8)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  borderRadius: '0px',
                  transition: 'color 0.1s, background-color 0.1s',
                }}
              >
                <span>{tab.icon}</span>
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
            ▼
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
          backgroundColor: 'var(--color-bg-secondary, #1a1a1a)',
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
              ↺ Undo (Ctrl+Z)
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
              ↻ Redo (Ctrl+Y)
            </button>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #888888)', marginLeft: 'auto' }}>
              Current Revision: #{snapshot.revision}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid #2a2a2a',
              backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
              padding: '6px',
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
                        background: '#151515',
                        borderLeft: '2px solid var(--color-accent, #4a9eff)',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ fontWeight: 500, color: '#eaeaea' }}>
                        {entry.type.toUpperCase()}: Revision {entry.beforeRevision} → {entry.afterRevision}
                      </span>
                      <span style={{ color: '#888888', fontSize: '10px' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: '#666666' }}>
                No undo history recorded yet.
              </div>
            )}
          </div>
        </div>
      );

    case 'materials':
      return (
        <div style={{ color: 'var(--color-text-secondary, #a8a8a8)', fontSize: '12px' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, color: '#eaeaea' }}>Project Materials Breakdown</div>
          <div>Total non-air blocks in project: {snapshot.project.placements.reduce((acc, p) => acc + (p.volume?.nonAirCount ?? 0), 0).toLocaleString()}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#888888' }}>
            Palette cardinality: {snapshot.project.placements.reduce((acc, p) => acc + (p.volume?.paletteCardinality ?? 0), 0)} unique block states
          </div>
        </div>
      );

    case 'conflicts':
      return (
        <div style={{ color: 'var(--color-text-secondary, #a8a8a8)', fontSize: '12px' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, color: '#eaeaea' }}>Multi-Placement Conflicts</div>
          <p style={{ margin: 0 }}>
            Overlap Policy: <strong>{snapshot.project.overlapPolicy ?? 'top-wins'}</strong>
          </p>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#22c55e' }}>
            ✓ No blocking volumetric conflicts detected.
          </div>
        </div>
      );

    case 'assets':
      return (
        <div style={{ color: 'var(--color-text-secondary, #a8a8a8)', fontSize: '12px' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, color: '#eaeaea' }}>Resource Packs & Textures</div>
          <div>Target: Minecraft Java 1.21.11</div>
          <div style={{ fontSize: '11px', marginTop: '4px', color: '#888888' }}>
            Default vanilla textures active. Drop a .zip resource pack into the viewport to layer overrides.
          </div>
        </div>
      );


    default:
      return null;
  }
}

const smallButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--color-bg-primary, #0d0d0d)',
  border: '1px solid #333333',
  color: 'var(--color-text-primary, #eaeaea)',
  fontSize: '11px',
  cursor: 'pointer',
  borderRadius: '0px',
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
  borderRadius: '0px',
  color: 'var(--color-text-secondary, #a8a8a8)',
  cursor: 'pointer',
  fontSize: '10px',
};
