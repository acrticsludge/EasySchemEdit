// apps/web/src/editor/viewport/RegionContextMenu.tsx
// Compact dark S&box-styled right-click context menu for selected Pos1..Pos2 regions.

import React, { useState, useEffect, useRef } from 'react';
import type { Bounds3i } from '@easyschemedit/domain';

export interface RegionContextMenuProps {
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  bounds: Bounds3i;
  defaultBlockId?: string;
  hasClipboard?: boolean;
  regionCount?: number;
  onFill: (blockId: string) => void;
  onReplace: (fromId: string, toId: string) => void;
  onWalls: (blockId: string) => void;
  onHollow: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onDeselect: () => void;
  onDeselectAll?: () => void;
  onClose: () => void;
}

type InlineMode = 'none' | 'fill' | 'replace' | 'walls';

export const RegionContextMenu: React.FC<RegionContextMenuProps> = ({
  x,
  y,
  containerWidth,
  containerHeight,
  bounds,
  defaultBlockId = 'minecraft:stone',
  hasClipboard = false,
  regionCount = 0,
  onFill,
  onReplace,
  onWalls,
  onHollow,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onDeselect,
  onDeselectAll,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [inlineMode, setInlineMode] = useState<InlineMode>('none');
  const [fillBlock, setFillBlock] = useState<string>(defaultBlockId);
  const [replaceFromBlock, setReplaceFromBlock] = useState<string>('minecraft:stone');
  const [replaceToBlock, setReplaceToBlock] = useState<string>(defaultBlockId || 'minecraft:cobblestone');
  const [wallsBlock, setWallsBlock] = useState<string>(defaultBlockId);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handlePointerDownOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDownOutside, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
    };
  }, [onClose]);

  const dx = Math.max(0, bounds.maxExclusive[0] - bounds.min[0]);
  const dy = Math.max(0, bounds.maxExclusive[1] - bounds.min[1]);
  const dz = Math.max(0, bounds.maxExclusive[2] - bounds.min[2]);
  const totalVolume = dx * dy * dz;

  // Clamping to stay inside the viewport container
  const hasMultiple = regionCount > 1 && !!onDeselectAll;
  const estimatedMenuWidth = 260;
  const estimatedMenuHeight = inlineMode === 'none' ? (hasMultiple ? 395 : 360) : 420;
  const clampedX = Math.max(8, Math.min(x, containerWidth - estimatedMenuWidth - 8));
  const clampedY = Math.max(8, Math.min(y, containerHeight - estimatedMenuHeight - 8));

  const handleApplyFill = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = fillBlock.trim() || 'minecraft:stone';
    onFill(id);
    onClose();
  };

  const handleApplyReplace = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fromId = replaceFromBlock.trim() || 'minecraft:stone';
    const toId = replaceToBlock.trim() || 'minecraft:air';
    onReplace(fromId, toId);
    onClose();
  };

  const handleApplyWalls = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = wallsBlock.trim() || 'minecraft:stone';
    onWalls(id);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: clampedX,
        top: clampedY,
        width: `${estimatedMenuWidth}px`,
        backgroundColor: '#181a20',
        border: '1px solid #2a2f3a',
        borderRadius: '8px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '6px 0',
        color: '#e2e8f0',
        fontSize: '12px',
        zIndex: 1000,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with region bounds & volume */}
      <div
        style={{
          padding: '6px 12px 8px 12px',
          borderBottom: '1px solid #2a2f3a',
          marginBottom: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '11px', color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Region ({dx} × {dy} × {dz})
          </span>
          <span
            style={{
              fontSize: '10px',
              backgroundColor: '#262a36',
              padding: '1px 5px',
              borderRadius: '3px',
              color: '#38bdf8',
              fontWeight: 600,
            }}
          >
            {totalVolume.toLocaleString()} blk
          </span>
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
          [{bounds.min[0]},{bounds.min[1]},{bounds.min[2]}] → [{bounds.maxExclusive[0] - 1},{bounds.maxExclusive[1] - 1},{bounds.maxExclusive[2] - 1}]
        </div>
      </div>

      {/* Fill Action */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => setInlineMode(inlineMode === 'fill' ? 'none' : 'fill')}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
              <path d="m5 2 5 5" />
              <path d="M2 13h15" />
              <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
            </svg>
            Fill...
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{inlineMode === 'fill' ? '▲' : '▶'}</span>
        </button>

        {inlineMode === 'fill' && (
          <form
            onSubmit={handleApplyFill}
            style={{
              padding: '6px 8px',
              backgroundColor: '#1f232d',
              borderRadius: '6px',
              margin: '2px 0 4px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                autoFocus
                type="text"
                placeholder="minecraft:stone"
                value={fillBlock}
                onChange={(e) => setFillBlock(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={applyBtnStyle}>
                Apply
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Replace Action */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => setInlineMode(inlineMode === 'replace' ? 'none' : 'replace')}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 3h5v5" />
              <path d="M4 20L21 3" />
              <path d="M21 16v5h-5" />
              <path d="M15 15l6 6" />
              <path d="M4 4l5 5" />
            </svg>
            Replace...
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{inlineMode === 'replace' ? '▲' : '▶'}</span>
        </button>

        {inlineMode === 'replace' && (
          <form
            onSubmit={handleApplyReplace}
            style={{
              padding: '6px 8px',
              backgroundColor: '#1f232d',
              borderRadius: '6px',
              margin: '2px 0 4px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#94a3b8', width: '32px' }}>From:</span>
              <input
                type="text"
                placeholder="minecraft:stone"
                value={replaceFromBlock}
                onChange={(e) => setReplaceFromBlock(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#94a3b8', width: '32px' }}>To:</span>
              <input
                type="text"
                placeholder="minecraft:dirt"
                value={replaceToBlock}
                onChange={(e) => setReplaceToBlock(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" style={{ ...applyBtnStyle, width: '100%', marginTop: '2px' }}>
              Replace Blocks
            </button>
          </form>
        )}
      </div>

      {/* Walls Action */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => setInlineMode(inlineMode === 'walls' ? 'none' : 'walls')}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
              <path d="M9 3v6" />
              <path d="M15 9v6" />
              <path d="M9 15v6" />
            </svg>
            Walls...
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{inlineMode === 'walls' ? '▲' : '▶'}</span>
        </button>

        {inlineMode === 'walls' && (
          <form
            onSubmit={handleApplyWalls}
            style={{
              padding: '6px 8px',
              backgroundColor: '#1f232d',
              borderRadius: '6px',
              margin: '2px 0 4px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                autoFocus
                type="text"
                placeholder="minecraft:stone"
                value={wallsBlock}
                onChange={(e) => setWallsBlock(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={applyBtnStyle}>
                Apply
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Hollow Action */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => {
            onHollow();
            onClose();
          }}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="2 2" />
            </svg>
            Hollow Region
          </span>
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: '#2a2f3a', margin: '4px 0' }} />

      {/* Copy */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => {
            onCopy();
            onClose();
          }}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            Copy Region
          </span>
        </button>
      </div>

      {/* Cut */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => {
            onCut();
            onClose();
          }}
          style={menuItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3" />
              <path d="M8.12 8.12 12 12" />
              <path d="M20 4 8.12 15.88" />
              <circle cx="6" cy="18" r="3" />
              <path d="M14.8 14.8 20 20" />
            </svg>
            Cut Region
          </span>
        </button>
      </div>

      {/* Paste */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          disabled={!hasClipboard}
          onClick={() => {
            if (!hasClipboard) return;
            onPaste();
            onClose();
          }}
          style={{
            ...menuItemStyle,
            opacity: hasClipboard ? 1 : 0.4,
            cursor: hasClipboard ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (hasClipboard) e.currentTarget.style.backgroundColor = '#262a36';
          }}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
            Paste at Pos 1
          </span>
        </button>
      </div>

      {/* Delete Blocks */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => {
            onDelete();
            onClose();
          }}
          style={{
            ...menuItemStyle,
            color: '#f87171',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3b181e';
            e.currentTarget.style.color = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#f87171';
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete Blocks
          </span>
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: '#2a2f3a', margin: '4px 0' }} />

      {/* Deselect Region */}
      <div style={{ padding: '0 4px' }}>
        <button
          type="button"
          onClick={() => {
            onDeselect();
            onClose();
          }}
          style={{
            ...menuItemStyle,
            color: '#94a3b8',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            Deselect Region
          </span>
        </button>
      </div>

      {/* Deselect All (when regionCount > 1) */}
      {regionCount > 1 && onDeselectAll && (
        <div style={{ padding: '0 4px' }}>
          <button
            type="button"
            onClick={() => {
              onDeselectAll();
              onClose();
            }}
            style={{
              ...menuItemStyle,
              color: '#94a3b8',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#262a36')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" strokeDasharray="3 3" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
              Deselect All ({regionCount})
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: '#e2e8f0',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.12s ease',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  backgroundColor: '#13151b',
  border: '1px solid #333948',
  borderRadius: '4px',
  color: '#f1f5f9',
  fontSize: '11px',
  fontFamily: 'monospace',
  outline: 'none',
};

const applyBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  backgroundColor: '#2563eb',
  border: 'none',
  borderRadius: '4px',
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.12s ease',
};
