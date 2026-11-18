// apps/web/src/editor/layout/OutlinerPanel.tsx
// Left outliner dock panel: import groups, placement list, visibility/lock/duplicate/delete toggles.
// Precision-instrument styling; logic adheres to SUBSPEC-G section 6.2, G2.

import React, { useState, useMemo } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { Placement } from '@easyschemedit/domain';
import { Icon } from '../ui/index.ts';

export interface OutlinerPanelProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  onCollapse?: () => void;
  className?: string;
  onSelectPlacement?: (id: string | null) => void;
  selectedPlacementId?: string | null;
}

export function OutlinerPanel({
  store,
  controllers,
  onCollapse,
  className = '',
  onSelectPlacement,
  selectedPlacementId: propSelectedId,
}: OutlinerPanelProps) {
  const [filterText, setFilterText] = useState('');
  const snapshot = store.getSnapshot();
  const placements = snapshot.project?.placements ?? [];
  const importGroups = snapshot.project?.importGroups ?? [];
  const selectedPlacementId = propSelectedId !== undefined
    ? propSelectedId
    : (controllers?.inspector.context().selectedPlacementId ?? null);

  // Filtered placements
  const filteredPlacements = useMemo(() => {
    if (!filterText.trim()) return placements;
    const lower = filterText.toLowerCase();
    return placements.filter((p) => p.name.toLowerCase().includes(lower) || p.id.toLowerCase().includes(lower));
  }, [placements, filterText]);

  const handleSelectPlacement = (id: string) => {
    const nextId = id === selectedPlacementId ? null : id;
    if (nextId === null) {
      controllers?.selectPlacement(null);
      controllers?.outliner.clearSelection?.();
      onSelectPlacement?.(null);
    } else {
      controllers?.selectPlacement(nextId);
      controllers?.outliner.select(nextId, 'replace');
      onSelectPlacement?.(nextId);
    }
  };

  const handleToggleVisibility = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (controllers) {
      void controllers.togglePlacementVisibility(id);
    } else {
      const p = placements.find((x) => x.id === id);
      if (p) {
        void store.execute({
          type: 'placement:setHidden',
          placementId: id,
          hidden: p.visible,
          visible: !p.visible,
        });
      }
    }
  };

  const handleToggleLock = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (controllers) {
      void controllers.togglePlacementLock(id);
    } else {
      const p = placements.find((x) => x.id === id);
      if (p) {
        void store.execute({
          type: 'placement:setLocked',
          placementId: id,
          locked: !p.locked,
        });
      }
    }
  };

  const handleDeletePlacement = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void store.execute({
      type: 'placement:delete',
      placementId: id,
    });
    if (selectedPlacementId === id) {
      controllers?.selectPlacement(null);
      controllers?.outliner.clearSelection?.();
      onSelectPlacement?.(null);
    }
  };

  const handleDuplicatePlacement = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const p = placements.find((x) => x.id === id);
    if (!p || p.locked) return;
    const minX = p.volume?.bounds?.min?.[0] ?? 0;
    const maxX = p.volume?.bounds?.maxExclusive?.[0] ?? 1;
    const width = Math.max(1, maxX - minX) + 1;
    const res = await store.execute({
      type: 'placement:duplicate',
      placementId: id,
      offset: [width, 0, 0],
    });
    if (res.ok) {
      const newId = (res as any).changed?.placementIds?.[0] ?? (res as any).data?.changed?.placementIds?.[0];
      if (newId) {
        controllers?.selectPlacement(newId);
        controllers?.outliner.select(newId, 'replace');
        onSelectPlacement?.(newId);
      }
    }
  };

  return (
    <aside
      className={`editor-outliner-panel ${className}`}
      aria-label="Hierarchy Outliner"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--ink-850)',
        borderRight: '1px solid var(--line)',
        color: 'var(--text)',
        fontSize: '12px',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '32px',
          padding: '0 12px',
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--ink-900)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={panelTitleStyle}>OUTLINER</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: 'var(--ink-800)',
              border: '1px solid var(--line)',
              color: 'var(--text-dim)',
            }}
            title="Precedence: top placements override lower placements when overlapping"
          >
            Top wins
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse Outliner"
              aria-label="Collapse Outliner"
              style={iconButtonStyle}
            >
              <Icon name="chevronLeft" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search / Filter Box */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--line)' }}>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter placements..."
          style={{
            width: '100%',
            height: '28px',
            padding: '0 8px',
            backgroundColor: 'var(--ink-900)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
            fontSize: '12px',
          }}
        />
      </div>

      {/* Placements List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        role="tree"
        aria-label="Placements"
      >
        {filteredPlacements.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-dim)',
            }}
          >
            {placements.length === 0
              ? 'No placements yet. Import a schematic (.schem / .litematic) to begin.'
              : 'No matching placements found.'}
          </div>
        ) : (
          filteredPlacements.map((placement, index) => {
            const isSelected = selectedPlacementId === placement.id;
            const min = placement.volume?.bounds?.min ?? [0, 0, 0];
            const max = placement.volume?.bounds?.maxExclusive ?? [0, 0, 0];
            const w = Math.max(0, max[0] - min[0]);
            const h = Math.max(0, max[1] - min[1]);
            const d = Math.max(0, max[2] - min[2]);

            return (
              <div
                key={placement.id}
                role="treeitem"
                aria-selected={isSelected}
                onClick={() => handleSelectPlacement(placement.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: '28px',
                  padding: '0 8px',
                  backgroundColor: isSelected ? 'var(--signal-wash)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--signal)' : '3px solid transparent',
                  borderBottom: '1px solid var(--line)',
                  cursor: 'pointer',
                  opacity: placement.visible ? 1 : 0.5,
                }}
              >
                {/* Left: Precedence Index, Visibility, Lock, Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      ...numericStyle,
                      color: 'var(--text-faint)',
                      width: '16px',
                      textAlign: 'right',
                    }}
                  >
                    {index + 1}
                  </span>

                  {/* Visibility Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleVisibility(e, placement.id)}
                    title={placement.visible ? 'Hide Placement' : 'Show Placement'}
                    aria-label={placement.visible ? 'Hide Placement' : 'Show Placement'}
                    style={{
                      ...iconButtonStyle,
                      color: placement.visible ? 'var(--text-dim)' : 'var(--text-faint)',
                    }}
                  >
                    <Icon name={placement.visible ? 'eye' : 'eyeOff'} size={16} />
                  </button>

                  {/* Lock Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleLock(e, placement.id)}
                    title={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                    aria-label={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                    style={{
                      ...iconButtonStyle,
                      color: placement.locked ? 'var(--warn)' : 'var(--text-faint)',
                    }}
                  >
                    <Icon name={placement.locked ? 'lock' : 'unlock'} size={16} />
                  </button>

                  {/* Placement Name */}
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: isSelected ? 600 : 400,
                      color: 'var(--text)',
                    }}
                    title={placement.name}
                  >
                    {placement.name}
                  </span>
                </div>

                {/* Right: Dimensions & Quick Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <span
                    style={{
                      ...numericStyle,
                      color: 'var(--text-dim)',
                      marginRight: '4px',
                    }}
                  >
                    {w} x {h} x {d}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => handleDuplicatePlacement(e, placement.id)}
                    title="Duplicate Side-by-Side (Ctrl+D)"
                    aria-label="Duplicate Side-by-Side (Ctrl+D)"
                    disabled={placement.locked}
                    style={{
                      ...iconButtonStyle,
                      color: 'var(--text-dim)',
                      opacity: placement.locked ? 0.3 : 0.7,
                    }}
                  >
                    <Icon name="duplicate" size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeletePlacement(e, placement.id)}
                    title="Delete Placement"
                    aria-label="Delete Placement"
                    disabled={placement.locked}
                    style={{
                      ...iconButtonStyle,
                      color: 'var(--danger)',
                      opacity: placement.locked ? 0.3 : 0.7,
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Panel Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '24px',
          padding: '0 8px',
          borderTop: '1px solid var(--line)',
          fontSize: '11px',
          color: 'var(--text-faint)',
          backgroundColor: 'var(--ink-900)',
        }}
      >
        <span>
          <span style={numericStyle}>{placements.length}</span> {placements.length === 1 ? 'placement' : 'placements'}
        </span>
        {selectedPlacementId && <span><span style={numericStyle}>1</span> selected</span>}
      </div>
    </aside>
  );
}

const numericStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
  fontSize: '12px',
  color: 'var(--text)',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
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
  color: 'var(--text-dim)',
  cursor: 'pointer',
};
