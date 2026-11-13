// apps/web/src/editor/layout/OutlinerPanel.tsx
// Left outliner dock panel: import groups, placement list, visibility/lock toggles, precedence hierarchy.
// S&box style adhering to SUBSPEC-G §6.2, G2.

import React, { useState, useMemo } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { Placement } from '@easyschemedit/domain';

export interface OutlinerPanelProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  onCollapse?: () => void;
  className?: string;
  onSelectPlacement?: (id: string | null) => void;
}

export function OutlinerPanel({
  store,
  controllers,
  onCollapse,
  className = '',
  onSelectPlacement,
}: OutlinerPanelProps) {
  const [filterText, setFilterText] = useState('');
  const snapshot = store.getSnapshot();
  const placements = snapshot.project?.placements ?? [];
  const importGroups = snapshot.project?.importGroups ?? [];
  const selectedPlacementId = controllers?.inspector.context().selectedPlacementId ?? null;

  // Filtered placements
  const filteredPlacements = useMemo(() => {
    if (!filterText.trim()) return placements;
    const lower = filterText.toLowerCase();
    return placements.filter((p) => p.name.toLowerCase().includes(lower) || p.id.toLowerCase().includes(lower));
  }, [placements, filterText]);

  const handleSelectPlacement = (id: string) => {
    controllers?.selectPlacement(id);
    controllers?.outliner.select(id, 'replace');
    onSelectPlacement?.(id);
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
        backgroundColor: 'var(--color-bg-secondary, #1a1a1a)',
        borderRight: '1px solid var(--color-border-subtle, #333333)',
        color: 'var(--color-text-primary, #eaeaea)',
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
          height: '34px',
          padding: '0 10px',
          borderBottom: '1px solid #2a2a2a',
          backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px', letterSpacing: '0.3px' }}>OUTLINER</span>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 5px',
              backgroundColor: '#2a2a2a',
              color: 'var(--color-text-secondary, #a8a8a8)',
              borderRadius: '0px',
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
              ◀
            </button>
          )}
        </div>
      </div>

      {/* Search / Filter Box */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #282828' }}>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter placements…"
          style={{
            width: '100%',
            height: '24px',
            padding: '2px 8px',
            backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
            border: '1px solid #3a3a3a',
            color: 'var(--color-text-primary, #eaeaea)',
            fontSize: '12px',
            borderRadius: '0px',
            outline: 'none',
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
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--color-text-secondary, #a8a8a8)',
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
                  padding: '2px 8px',
                  backgroundColor: isSelected
                    ? 'rgba(74, 158, 255, 0.2)'
                    : index % 2 === 0
                    ? 'transparent'
                    : 'rgba(255, 255, 255, 0.015)',
                  borderLeft: isSelected ? '3px solid var(--color-accent, #4a9eff)' : '3px solid transparent',
                  borderBottom: '1px solid #222222',
                  cursor: 'pointer',
                  opacity: placement.visible ? 1 : 0.5,
                }}
              >
                {/* Left: Precedence Index, Visibility, Lock, Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-muted, #666666)',
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
                      color: placement.visible ? '#eaeaea' : '#666666',
                    }}
                  >
                    {placement.visible ? '👁' : '—'}
                  </button>

                  {/* Lock Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleLock(e, placement.id)}
                    title={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                    aria-label={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                    style={{
                      ...iconButtonStyle,
                      color: placement.locked ? '#eab308' : '#666666',
                    }}
                  >
                    {placement.locked ? '🔒' : '🔓'}
                  </button>

                  {/* Placement Name */}
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? '#ffffff' : 'var(--color-text-primary, #eaeaea)',
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
                      fontSize: '10px',
                      color: 'var(--color-text-secondary, #888888)',
                      marginRight: '2px',
                    }}
                  >
                    {w}×{h}×{d}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => handleDuplicatePlacement(e, placement.id)}
                    title="Duplicate Side-by-Side (Ctrl+D)"
                    aria-label="Duplicate Side-by-Side (Ctrl+D)"
                    disabled={placement.locked}
                    style={{
                      ...iconButtonStyle,
                      opacity: placement.locked ? 0.3 : 0.7,
                    }}
                  >
                    ⎘
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeletePlacement(e, placement.id)}
                    title="Delete Placement"
                    aria-label="Delete Placement"
                    disabled={placement.locked}
                    style={{
                      ...iconButtonStyle,
                      color: '#ef4444',
                      opacity: placement.locked ? 0.3 : 0.7,
                    }}
                  >
                    ✕
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
          borderTop: '1px solid #282828',
          fontSize: '11px',
          color: 'var(--color-text-secondary, #888888)',
          backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        }}
      >
        <span>
          {placements.length} {placements.length === 1 ? 'placement' : 'placements'}
        </span>
        {selectedPlacementId && <span>1 selected</span>}
      </div>
    </aside>
  );
}

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
  fontSize: '12px',
};
