// apps/web/src/editor/panels/ConflictsPanel.tsx
// Conflicts Panel React component (Slice E3.8, SUBSPEC-D §2.5, SUBSPEC-G §6.4).
// Displays overlap diagnostics, real conflicts vs identical overlaps, overlay mode toggle,
// sequential conflict navigation (camera fly), and per-conflict / global resolution actions.

import React, { useState, useEffect, useCallback } from 'react';
import type { ConflictEntry } from '@easyschemedit/operations';
import type {
  ConflictsPanelController,
  OverlayMode,
  ConflictStats,
} from './panels-controller.ts';

export interface ConflictsPanelProps {
  controller: ConflictsPanelController;
  onOpenBake?: () => void;
  className?: string;
}

export function ConflictsPanel({ controller, onOpenBake, className }: ConflictsPanelProps): React.ReactElement {
  const [, setTick] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const forceUpdate = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    controller.setActive(true);
    const unsub = controller.subscribe(forceUpdate);
    void controller.refresh();
    return () => {
      controller.setActive(false);
      unsub();
    };
  }, [controller, forceUpdate]);

  const stats: ConflictStats = controller.getStats();
  const overlayMode: OverlayMode = controller.getOverlayMode();
  const conflictList: ConflictEntry[] = controller.getConflictList();
  const activeIndex = controller.getActiveIndex();

  const handleKeepWinner = async (entry: ConflictEntry, winnerId: string) => {
    const key = `${entry.position.join(',')}-${winnerId}`;
    setResolvingId(key);
    try {
      await controller.resolveKeepWinner(entry, winnerId);
    } finally {
      setResolvingId(null);
    }
  };

  const handleHideLosers = async (entry: ConflictEntry, winnerId: string) => {
    const key = `hide-${entry.position.join(',')}-${winnerId}`;
    setResolvingId(key);
    try {
      await controller.resolveHideLosers(entry, winnerId);
    } finally {
      setResolvingId(null);
    }
  };

  const handleBakeAll = async () => {
    if (onOpenBake) {
      onOpenBake();
    } else {
      await controller.resolveBakeAll();
    }
  };

  return (
    <div
      className={`conflicts-panel ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg-secondary, var(--ink-850))',
        color: 'var(--color-text-primary, var(--text))',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Header / Stats Toolbar ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--color-bg-tertiary, var(--ink-700))',
          borderBottom: '1px solid var(--color-border-subtle, var(--line-strong))',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '13px', letterSpacing: '0.02em' }}>
            Conflicts & Overlaps
          </span>

          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: stats.realConflicts > 0 ? 'color-mix(in srgb, var(--danger) 20%, transparent)' : 'color-mix(in srgb, var(--ok) 20%, transparent)',
              color: stats.realConflicts > 0 ? 'var(--danger)' : 'var(--ok)',
              border: `1px solid ${stats.realConflicts > 0 ? 'var(--danger)' : 'var(--ok)'}`,
            }}
          >
            {stats.realConflicts} Conflict{stats.realConflicts === 1 ? '' : 's'}
          </span>

          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'color-mix(in srgb, var(--warn) 15%, transparent)',
              color: 'var(--warn)',
              border: '1px solid var(--warn)',
            }}
          >
            {stats.identicalOverlaps} Identical
          </span>

          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              backgroundColor: 'color-mix(in srgb, var(--text-faint) 20%, transparent)',
              color: 'var(--text-dim)',
              border: '1px solid var(--line-strong)',
            }}
          >
            Total: {stats.totalOverlaps}
          </span>
        </div>

        {/* Global Bake Action */}
        <button
          type="button"
          onClick={() => void handleBakeAll()}
          disabled={stats.totalOverlaps === 0}
          style={{
            padding: '4px 12px',
            backgroundColor: stats.totalOverlaps > 0 ? 'var(--color-accent, var(--signal))' : 'var(--line-strong)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            fontSize: '12px',
            cursor: stats.totalOverlaps > 0 ? 'pointer' : 'not-allowed',
            opacity: stats.totalOverlaps > 0 ? 1 : 0.6,
          }}
        >
          Bake All Overlaps
        </button>
      </header>

      {/* ── Sub-toolbar: Overlay Mode & Navigation ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: 'var(--ink-800)',
          borderBottom: '1px solid var(--ink-700)',
          fontSize: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {/* Overlay Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-dim)' }}>Overlay:</span>
          {(['off', 'conflicts-only', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => controller.setOverlayMode(mode)}
              style={{
                padding: '3px 8px',
                borderRadius: '3px',
                border: overlayMode === mode ? '1px solid var(--signal)' : '1px solid var(--line-strong)',
                backgroundColor: overlayMode === mode ? 'var(--signal-wash)' : 'var(--ink-700)',
                color: overlayMode === mode ? 'var(--signal)' : 'var(--text)',
                fontWeight: overlayMode === mode ? 600 : 400,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {mode === 'off' ? 'Off' : mode === 'conflicts-only' ? 'Conflicts Only' : 'All Overlaps'}
            </button>
          ))}
        </div>

        {/* Conflict Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => controller.prev()}
            disabled={conflictList.length <= 1}
            style={{
              padding: '2px 8px',
              backgroundColor: 'var(--ink-700)',
              color: conflictList.length > 1 ? 'var(--text)' : 'var(--text-faint)',
              border: '1px solid var(--line-strong)',
              borderRadius: '3px',
              fontSize: '11px',
              cursor: conflictList.length > 1 ? 'pointer' : 'default',
            }}
            title="Previous Conflict"
          >
            ◀ Prev
          </button>

          <span style={{ color: 'var(--text)', fontSize: '11px', minWidth: '80px', textAlign: 'center' }}>
            {conflictList.length === 0
              ? 'No conflicts'
              : `${activeIndex + 1} of ${conflictList.length}`}
          </span>

          <button
            type="button"
            onClick={() => controller.next()}
            disabled={conflictList.length <= 1}
            style={{
              padding: '2px 8px',
              backgroundColor: 'var(--ink-700)',
              color: conflictList.length > 1 ? 'var(--text)' : 'var(--text-faint)',
              border: '1px solid var(--line-strong)',
              borderRadius: '3px',
              fontSize: '11px',
              cursor: conflictList.length > 1 ? 'pointer' : 'default',
            }}
            title="Next Conflict"
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* ── Conflict Items List / Table ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {conflictList.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 16px',
              color: 'var(--text-dim)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
              {overlayMode === 'off' ? 'Conflict overlay is off' : 'No conflicts detected'}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {overlayMode === 'off'
                ? 'Enable "Conflicts Only" or "All Overlaps" above to inspect scene overlaps.'
                : 'All multi-placement block positions have distinct or non-colliding bounds.'}
            </div>
          </div>
        ) : (
          conflictList.map((entry, index) => {
            const isSelected = index === activeIndex;
            const isConflict = entry.category === 'state-conflict';
            const topPlacementId = entry.winningOwner ?? entry.owners[entry.owners.length - 1];
            const bottomPlacementId = entry.owners[0];

            return (
              <div
                key={`conflict-${index}-${entry.position.join(',')}`}
                onClick={() => controller.jumpTo(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? 'color-mix(in srgb, var(--signal) 15%, transparent)' : 'var(--ink-700)',
                  border: isSelected ? '1px solid var(--signal)' : '1px solid var(--line-strong)',
                  cursor: 'pointer',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: Position and Category Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isConflict ? 'var(--danger)' : 'var(--warn)',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>
                      [{entry.position[0]}, {entry.position[1]}, {entry.position[2]}]
                    </div>
                    <div style={{ fontSize: '11px', color: isConflict ? 'var(--danger)' : 'var(--warn)' }}>
                      {isConflict ? 'State Conflict' : 'Identical Overlap'}
                    </div>
                  </div>
                </div>

                {/* Center: Owners info */}
                <div style={{ flex: 1, minWidth: '180px', fontSize: '11px', color: 'var(--text)' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Owners: </span>
                    {entry.owners.map((owner, i) => (
                      <span key={owner}>
                        {i > 0 && ', '}
                        <strong style={{ color: owner === topPlacementId ? 'var(--signal)' : 'var(--text)' }}>
                          {owner}
                          {owner === topPlacementId ? ' (top)' : ''}
                        </strong>
                      </span>
                    ))}
                  </div>
                  {entry.currentState && (
                    <div style={{ color: 'var(--text-dim)', marginTop: '2px' }}>
                      Block: <code style={{ color: 'var(--signal)' }}>{entry.currentState.id}</code>
                    </div>
                  )}
                </div>

                {/* Right: Resolution Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {topPlacementId && (
                    <button
                      type="button"
                      disabled={resolvingId !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleKeepWinner(entry, topPlacementId);
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: 'var(--signal-wash)',
                        color: 'var(--signal)',
                        border: '1px solid var(--signal)',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: resolvingId !== null ? 'wait' : 'pointer',
                      }}
                      title="Keep block in top placement and delete from overlapping placements"
                    >
                      Keep Top
                    </button>
                  )}

                  {bottomPlacementId && bottomPlacementId !== topPlacementId && (
                    <button
                      type="button"
                      disabled={resolvingId !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleKeepWinner(entry, bottomPlacementId);
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: 'var(--ink-700)',
                        color: 'var(--text)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: '3px',
                        fontSize: '11px',
                        cursor: resolvingId !== null ? 'wait' : 'pointer',
                      }}
                      title="Keep block in bottom placement and delete from top placements"
                    >
                      Keep Bottom
                    </button>
                  )}

                  {topPlacementId && (
                    <button
                      type="button"
                      disabled={resolvingId !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleHideLosers(entry, topPlacementId);
                      }}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: 'var(--ink-700)',
                        color: 'var(--text-dim)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: '3px',
                        fontSize: '11px',
                        cursor: resolvingId !== null ? 'wait' : 'pointer',
                      }}
                      title="Hide non-winning placements"
                    >
                      Hide Losers
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
