// apps/web/src/editor/viewport/ClipboardDrawer.tsx
// Windows-style (Win+V) Clipboard History Drawer for the 3D viewport.
// Displays copied/cut regions with isometric thumbnails, dimensions, block count, and quick paste/delete actions.
// Matches dark S&box aesthetic (color-mix(in srgb, var(--ink-800) 95%, transparent), blur(8px), 1px solid var(--ink-800), var(--ok) / var(--signal) accents).

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
        additions[entry.id] = renderClipboardPreviewDataUrl(entry, 160);
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
            backgroundColor: 'color-mix(in srgb, var(--ink-800) 95%, transparent)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid var(--ink-800)',
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
              borderBottom: '1px solid var(--ink-800)',
              backgroundColor: 'var(--ink-900)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--signal)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                Clipboard History
              </span>
              {entries.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: 'var(--ink-800)',
                    color: 'var(--text-dim)',
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
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
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
                  color: 'var(--text-dim)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
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
                  color: 'var(--text-faint)',
                  gap: '8px',
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink-800)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-dim)' }}>
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
                      backgroundColor: isActive ? 'var(--ink-800)' : 'var(--ink-800)',
                      border: isActive ? '1px solid var(--ok)' : '1px solid var(--ink-800)',
                      borderRadius: '6px',
                      transition: 'border-color 0.12s, background-color 0.12s',
                    }}
                  >
                    {/* Isometric Thumbnail */}
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        flexShrink: 0,
                        backgroundColor: 'var(--ink-900)',
                        border: '1px solid var(--ink-800)',
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
                            width: '48px',
                            height: '48px',
                            objectFit: 'contain',
                            imageRendering: 'auto',
                          }}
                        />
                      ) : (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--signal)"
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
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {dims.width} × {dims.height} × {dims.depth}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        {blockCount.toLocaleString()} {blockCount === 1 ? 'block' : 'blocks'}
                      </div>
                      <div
                        style={{
                          fontSize: '9px',
                          color: 'var(--text-faint)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{formatTimeAgo(entry.createdAt)}</span>
                        <span>•</span>
                        <span
                          style={{
                            color: entry.scope === 'effective-composite' ? 'var(--signal)' : 'var(--signal)',
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
                          border: isActive ? '1px solid var(--ok)' : '1px solid var(--ink-800)',
                          backgroundColor: isActive ? 'var(--ok)' : 'var(--ink-800)',
                          color: isActive ? 'var(--ink-900)' : 'var(--text)',
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
                          color: 'var(--text-faint)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          lineHeight: 1,
                        }}
                        title="Delete from clipboard"
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
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
          backgroundColor: isOpen ? 'var(--ink-800)' : 'color-mix(in srgb, var(--ink-800) 95%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: isOpen ? '1px solid var(--signal)' : '1px solid var(--ink-800)',
          borderRadius: '6px',
          color: isOpen ? 'var(--signal)' : 'var(--text)',
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
            e.currentTarget.style.borderColor = 'var(--signal)';
            e.currentTarget.style.backgroundColor = 'var(--ink-800)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--ink-800)';
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--ink-800) 95%, transparent)';
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
              backgroundColor: 'var(--ok)',
              color: 'var(--ink-900)',
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
