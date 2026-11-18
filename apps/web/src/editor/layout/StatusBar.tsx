// apps/web/src/editor/layout/StatusBar.tsx
// Bottom status bar footer: cursor world coordinates, tool mode, revision, save status, FPS.
// Precision-instrument chrome (SPEC.ui-precision-instrument.md §4).

import React from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import { Icon } from '../ui/index.ts';

export interface StatusBarProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  fps?: number;
  hoveredBlockName?: string | null;
  cursorCoordinates?: { x: number; y: number; z: number } | null;
  isDirty?: boolean;
  className?: string;
}

export function StatusBar({
  store,
  controllers,
  fps = 60,
  hoveredBlockName = null,
  cursorCoordinates = null,
  isDirty = false,
  className = '',
}: StatusBarProps) {
  const snapshot = store.getSnapshot();
  const toolMode = snapshot.selectedTool || 'select';
  const revision = snapshot.revision;
  const placementCount = snapshot.project?.placements.length ?? 0;
  const statusMessage = snapshot.statusMessage;

  // Use controller coordinates or prop
  const controllerCoords = controllers?.statusBar.state().coordinates;
  const coords = cursorCoordinates ?? controllerCoords;

  return (
    <footer
      className={`editor-status-bar ${className}`}
      role="status"
      aria-label="Status Bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '24px',
        padding: '0 12px',
        backgroundColor: 'var(--ink-850)',
        borderTop: '1px solid var(--line)',
        color: 'var(--text)',
        fontSize: '12px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: Coordinates & Tool & Hovered Block */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '130px' }}>
          <span style={labelStyle}>POS:</span>
          <span style={coords ? monoStyle : { ...monoStyle, color: 'var(--text-faint)' }}>
            {coords ? `${coords.x}, ${coords.y}, ${coords.z}` : 'n/a'}
          </span>
        </div>

        <div style={dividerStyle} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={labelStyle}>TOOL:</span>
          <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>
            {toolMode}
          </span>
        </div>

        {hoveredBlockName && (
          <>
            <div style={dividerStyle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={labelStyle}>BLOCK:</span>
              <span style={{ color: 'var(--text)' }}>{hoveredBlockName}</span>
            </div>
          </>
        )}
      </div>

      {/* Center: System Notification / Status Message */}
      <div
        style={{
          flex: 1,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '0 12px',
          color: statusMessage ? 'var(--text)' : 'var(--text-faint)',
        }}
      >
        {statusMessage || ''}
      </div>

      {/* Right: Revision, Placements, Save Status, FPS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>
          <span style={monoStyle}>{placementCount}</span> {placementCount === 1 ? 'placement' : 'placements'}
        </span>

        <div style={dividerStyle} />

        <span style={monoStyle}>r{revision}</span>

        <div style={dividerStyle} />

        {/* Save indicator reflects the real dirty state */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: isDirty ? 'var(--warn)' : 'var(--ok)',
          }}
        >
          <Icon name={isDirty ? 'warning' : 'check'} size={12} />
          <span>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
        </div>

        <div style={dividerStyle} />

        {/* FPS */}
        <span style={{ ...monoStyle, color: fps < 30 ? 'var(--danger)' : 'var(--text)' }}>
          {Math.round(fps)} FPS
        </span>
      </div>
    </footer>
  );
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: '11px',
  letterSpacing: '0.08em',
};

const monoStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
  fontSize: '12px',
  color: 'var(--text)',
};

const dividerStyle: React.CSSProperties = {
  width: '1px',
  height: '12px',
  backgroundColor: 'var(--line)',
  flexShrink: 0,
};
