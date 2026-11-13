// apps/web/src/editor/panels/MaterialListPanel.tsx
// Material List Panel React component (Slice E3.8, SUBSPEC-D §2.4, §5.7, SUBSPEC-G §6.4).
// Displays material counts with mode toggle (Effective Composite vs Per-Placement),
// search filter, sorting, stack/shulker conversions, row hover, and CSV/JSON export.

import React, { useState, useEffect, useCallback } from 'react';
import type {
  MaterialListController,
  MaterialListMode,
  SortOrder,
  MaterialItem,
} from './panels-controller.ts';

export interface MaterialListPanelProps {
  controller: MaterialListController;
  placements?: Array<{ id: string; name: string }>;
  onHoverBlock?: (blockId: string | null) => void;
  className?: string;
}

export function MaterialListPanel({
  controller,
  placements,
  onHoverBlock,
  className,
}: MaterialListPanelProps): React.ReactElement {
  const [, setTick] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<'csv' | 'json' | null>(null);

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

  const mode = controller.getMode();
  const placementId = controller.getPlacementId();
  const searchQuery = controller.getSearchQuery();
  const sortOrder = controller.getSortOrder();
  const items = controller.getFilteredItems();
  const totalFilteredBlocks = controller.getTotalFilteredBlocks();
  const totalBlocks = controller.getTotalBlocks();
  const totalTypes = controller.getTotalTypes();

  const handleCopyCsv = async () => {
    const csv = controller.toCsv();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(csv);
      }
      setCopyFeedback('csv');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy CSV:', err);
    }
  };

  const handleCopyJson = async () => {
    const json = controller.toJson();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(json);
      }
      setCopyFeedback('json');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  return (
    <div
      className={`material-list-panel ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--color-bg-secondary, #18181b)',
        color: 'var(--color-text-primary, #f4f4f5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Header Toolbar ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--color-bg-tertiary, #27272a)',
          borderBottom: '1px solid var(--color-border-subtle, #3f3f46)',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Mode toggle & Placement selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Materials</span>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', backgroundColor: '#18181b', borderRadius: '4px', padding: '2px' }}>
            <button
              type="button"
              onClick={() => void controller.setMode('effective')}
              style={{
                padding: '3px 10px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: mode === 'effective' ? '#2563eb' : 'transparent',
                color: mode === 'effective' ? '#ffffff' : '#a1a1aa',
                fontWeight: mode === 'effective' ? 600 : 400,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Effective Composite
            </button>
            <button
              type="button"
              onClick={() => void controller.setMode('perPlacement')}
              style={{
                padding: '3px 10px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: mode === 'perPlacement' ? '#2563eb' : 'transparent',
                color: mode === 'perPlacement' ? '#ffffff' : '#a1a1aa',
                fontWeight: mode === 'perPlacement' ? 600 : 400,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Per-Placement
            </button>
          </div>

          {/* Placement selector dropdown when in perPlacement mode */}
          {mode === 'perPlacement' && placements && placements.length > 0 && (
            <select
              value={placementId ?? ''}
              onChange={(e) => void controller.setPlacementId(e.target.value ? e.target.value : undefined)}
              style={{
                padding: '3px 8px',
                backgroundColor: '#27272a',
                color: '#f4f4f5',
                border: '1px solid #3f3f46',
                borderRadius: '4px',
                fontSize: '11px',
              }}
            >
              <option value="">All Placements</option>
              {placements.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Summary Badge */}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              border: '1px solid #2563eb',
            }}
          >
            {totalBlocks} Blocks ({totalTypes} Types)
          </span>
        </div>

        {/* Right: Export buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => void handleCopyCsv()}
            style={{
              padding: '4px 10px',
              backgroundColor: copyFeedback === 'csv' ? '#16a34a' : '#27272a',
              color: '#f4f4f5',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {copyFeedback === 'csv' ? '✓ Copied CSV' : 'Copy CSV'}
          </button>

          <button
            type="button"
            onClick={() => void handleCopyJson()}
            style={{
              padding: '4px 10px',
              backgroundColor: copyFeedback === 'json' ? '#16a34a' : '#27272a',
              color: '#f4f4f5',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {copyFeedback === 'json' ? '✓ Copied JSON' : 'Copy JSON'}
          </button>
        </div>
      </header>

      {/* ── Sub-toolbar: Search & Sort ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: '#202023',
          borderBottom: '1px solid #333338',
          fontSize: '12px',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '320px' }}>
          <span style={{ color: '#a1a1aa' }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => controller.setSearchQuery(e.target.value)}
            placeholder="Filter blocks (e.g. stone)..."
            style={{
              width: '100%',
              padding: '4px 8px',
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              color: '#f4f4f5',
              fontSize: '11px',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => controller.setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#a1a1aa' }}>Sort by:</span>
          <select
            value={sortOrder}
            onChange={(e) => controller.setSortOrder(e.target.value as SortOrder)}
            style={{
              padding: '3px 8px',
              backgroundColor: '#27272a',
              color: '#f4f4f5',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            <option value="count-desc">Count (High to Low)</option>
            <option value="count-asc">Count (Low to High)</option>
            <option value="id-asc">Block Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── Material Table ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px 12px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--color-bg-secondary, #18181b)',
                borderBottom: '1px solid #3f3f46',
                color: '#a1a1aa',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                zIndex: 1,
              }}
            >
              <th style={{ padding: '8px 6px' }}>Block ID</th>
              <th style={{ padding: '8px 6px', textAlign: 'right' }}>Count</th>
              <th style={{ padding: '8px 6px', textAlign: 'right' }}>Stacks (64)</th>
              <th style={{ padding: '8px 6px', textAlign: 'right' }}>Shulker Boxes</th>
              <th style={{ padding: '8px 6px', textAlign: 'right' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: '#71717a',
                  }}
                >
                  {searchQuery ? `No blocks matching "${searchQuery}"` : 'No materials found in current selection.'}
                </td>
              </tr>
            ) : (
              items.map((item: MaterialItem) => (
                <tr
                  key={item.blockId}
                  onMouseEnter={() => onHoverBlock?.(item.blockId)}
                  onMouseLeave={() => onHoverBlock?.(null)}
                  style={{
                    borderBottom: '1px solid #27272a',
                    cursor: 'default',
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#27272a';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {/* Block ID */}
                  <td style={{ padding: '6px 6px', fontFamily: 'monospace', color: '#93c5fd' }}>
                    {item.blockId}
                  </td>

                  {/* Count */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600, color: '#f4f4f5' }}>
                    {item.count.toLocaleString()}
                  </td>

                  {/* Stacks */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: '#d4d4d8' }}>
                    {item.stacks > 0 ? (
                      <>
                        <span style={{ fontWeight: 500, color: '#e4e4e7' }}>{item.stacks} st</span>
                        {item.remainder > 0 && <span style={{ color: '#a1a1aa' }}> + {item.remainder}</span>}
                      </>
                    ) : (
                      <span style={{ color: '#a1a1aa' }}>{item.remainder}</span>
                    )}
                  </td>

                  {/* Shulker Boxes (1728 blocks) */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: '#a1a1aa' }}>
                    {item.shulkerBoxes >= 0.01 ? `${item.shulkerBoxes} SB` : '< 0.01 SB'}
                  </td>

                  {/* Percentage */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: '#a1a1aa' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '4px',
                          backgroundColor: '#3f3f46',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, item.percentage)}%`,
                            height: '100%',
                            backgroundColor: '#3b82f6',
                          }}
                        />
                      </div>
                      <span style={{ minWidth: '42px', textAlign: 'right' }}>
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
