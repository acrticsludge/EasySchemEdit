// apps/web/src/editor/viewport/ClipboardDrawer.tsx
// Windows-style (Win+V) Clipboard History Drawer for the 3D viewport.
// Displays copied/cut regions with isometric thumbnails, dimensions, block count, and quick paste/delete actions.
// Matches dark S&box aesthetic (#181a20f2, blur(8px), 1px solid #2a2f3a, #14f195 / #4a9eff accents).

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ClipboardEntry } from '@easyschemedit/operations';
import {
  renderClipboardPreviewDataUrl,
  getClipboardDimensions,
  getClipboardBlockCount,
} from './clipboard-preview.ts';

export interface ClipboardDrawerProps {
  entries: ClipboardEntry[];
  activePasteEntryId?: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectPasteEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onClearAll?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Just now';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ClipboardDrawer: React.FC<ClipboardDrawerProps> = ({
  entries,
  activePasteEntryId,
  isOpen,
  onToggleOpen,
  onSelectPasteEntry,
  onDeleteEntry,
  onClearAll,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cache thumbnail previews by entry ID so rendering is only done once per copy
  const [previewCache, setPreviewCache] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let hasNew = false;
    const additions: Record<string, string | null> = {};

    for (const entry of entries) {
      if (!entry?.id) continue;
      if (!(entry.id in previewCache)) {
        additions[entry.id] = renderClipboardPreviewDataUrl(entry, 48);
        hasNew = true;
      }
    }

    if (hasNew) {
      setPreviewCache((prev) => ({ ...prev, ...additions }));
    }
  }, [entries, previewCache]);

  // Close on Escape or click outside when open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onToggleOpen();
      }
    };

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onToggleOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, [isOpen, onToggleOpen]);

  // Sort newest first
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [entries]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        zIndex: 22,
        userSelect: 'none',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        ...style,
      }}
    >
      {/* Expanded Windows-style Win+V Clipboard Popup */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Clipboard History"
          style={{
            position: 'absolute',
            bottom: '44px',
            left: '0',
            width: '280px',
            maxHeight: '340px',
            backgroundColor: '#181a20f2',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid #2a2f3a',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #2a2f3a',
              backgroundColor: '#12141a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4a9eff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                Clipboard History
              </span>
              {entries.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: '#262a36',
                    color: '#94a3b8',
                    padding: '1px 6px',
                    borderRadius: '10px',
                  }}
                >
                  {entries.length}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {onClearAll && entries.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                  title="Clear all clipboard entries"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={onToggleOpen}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                title="Close drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* List Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '280px',
            }}
          >
            {sortedEntries.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: '#64748b',
                  gap: '8px',
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#333948"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>
                  Clipboard is empty
                </div>
                <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
                  Copy or cut blocks using <b>Ctrl+C</b> or <b>Ctrl+X</b> to store them here.
                </div>
              </div>
            ) : (
              sortedEntries.map((entry) => {
                const dims = getClipboardDimensions(entry);
                const blockCount = getClipboardBlockCount(entry);
                const isActive = activePasteEntryId === entry.id;
                const preview = previewCache[entry.id];

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      backgroundColor: isActive ? '#1c2430' : '#1c1f28',
                      border: isActive ? '1px solid #14f195' : '1px solid #2a2f3a',
                      borderRadius: '6px',
                      transition: 'border-color 0.12s, background-color 0.12s',
                    }}
                  >
                    {/* Isometric Thumbnail */}
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        flexShrink: 0,
                        backgroundColor: '#0e1015',
                        border: '1px solid #252a36',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {preview ? (
                        <img
                          src={preview}
                          alt="Block preview"
                          style={{
                            width: '42px',
                            height: '42px',
                            objectFit: 'contain',
                            imageRendering: 'pixelated',
                          }}
                        />
                      ) : (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#4a9eff"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.29 7 12 12 20.71 7" />
                          <line x1="12" y1="22" x2="12" y2="12" />
                        </svg>
                      )}
                    </div>

                    {/* Metadata */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#f1f5f9',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {dims.width} × {dims.height} × {dims.depth}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {blockCount.toLocaleString()} {blockCount === 1 ? 'block' : 'blocks'}
                      </div>
                      <div
                        style={{
                          fontSize: '9px',
                          color: '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{formatTimeAgo(entry.createdAt)}</span>
                        <span>•</span>
                        <span
                          style={{
                            color: entry.scope === 'effective-composite' ? '#4a9eff' : '#a78bfa',
                          }}
                        >
                          {entry.scope === 'effective-composite' ? 'composite' : 'single'}
                        </span>
                      </div>
                    </div>

                    {/* Actions: Paste & Delete */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        alignItems: 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPasteEntry(entry.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: isActive ? '1px solid #14f195' : '1px solid #363d4e',
                          backgroundColor: isActive ? '#14f195' : '#272d3b',
                          color: isActive ? '#090a0f' : '#e2e8f0',
                          transition: 'all 0.12s ease',
                          outline: 'none',
                        }}
                        title={isActive ? 'Active for pasting (Ctrl+V)' : 'Select for paste'}
                      >
                        {isActive ? 'Active' : 'Paste'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteEntry(entry.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          lineHeight: 1,
                        }}
                        title="Delete from clipboard"
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Compact Collapsed / Anchor Toggle Button (36×36px) */}
      <button
        type="button"
        onClick={onToggleOpen}
        title={
          isOpen
            ? 'Close Clipboard History'
            : `Clipboard History (Win+V) - ${entries.length} items`
        }
        aria-expanded={isOpen}
        style={{
          width: '36px',
          height: '36px',
          backgroundColor: isOpen ? '#252a36' : '#181a20f2',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: isOpen ? '1px solid #4a9eff' : '1px solid #2a2f3a',
          borderRadius: '6px',
          color: isOpen ? '#4a9eff' : '#e2e8f0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          transition: 'all 0.15s ease',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#4a9eff';
            e.currentTarget.style.backgroundColor = '#222631';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#2a2f3a';
            e.currentTarget.style.backgroundColor = '#181a20f2';
          }
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>

        {/* Count Badge when entries > 0 */}
        {entries.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#14f195',
              color: '#090a0f',
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '8px',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
            }}
          >
            {entries.length > 99 ? '99+' : entries.length}
          </span>
        )}
      </button>
    </div>
  );
};
