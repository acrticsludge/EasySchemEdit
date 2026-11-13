// apps/web/src/editor/layout/StatusBar.tsx
// Bottom status bar footer: cursor world coordinates, tool mode, revision, save status, FPS.
// S&box style adhering to SUBSPEC-G §6.5, G6.

import React from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';

export interface StatusBarProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  fps?: number;
  hoveredBlockName?: string | null;
  cursorCoordinates?: { x: number; y: number; z: number } | null;
  className?: string;
}

export function StatusBar({
  store,
  controllers,
  fps = 60,
  hoveredBlockName = null,
  cursorCoordinates = null,
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
        padding: '0 10px',
        backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        borderTop: '1px solid var(--color-border-subtle, #333333)',
        color: 'var(--color-text-secondary, #a8a8a8)',
        fontSize: '11px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: Coordinates & Tool & Hovered Block */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '130px' }}>
          <span style={{ color: 'var(--color-text-muted, #666666)' }}>POS:</span>
          <span style={{ color: coords ? 'var(--color-text-primary, #eaeaea)' : '#666666', fontFamily: 'monospace' }}>
            {coords ? `${coords.x}, ${coords.y}, ${coords.z}` : '—'}
          </span>
        </div>

        <div style={{ width: '1px', height: '12px', backgroundColor: '#2a2a2a' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--color-text-muted, #666666)' }}>TOOL:</span>
          <span style={{ color: 'var(--color-text-primary, #eaeaea)', textTransform: 'capitalize' }}>
            {toolMode}
          </span>
        </div>

        {hoveredBlockName && (
          <>
            <div style={{ width: '1px', height: '12px', backgroundColor: '#2a2a2a' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--color-text-muted, #666666)' }}>BLOCK:</span>
              <span style={{ color: 'var(--color-accent, #4a9eff)' }}>{hoveredBlockName}</span>
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
          color: statusMessage ? 'var(--color-accent-hover, #6ab0ff)' : '#555555',
        }}
      >
        {statusMessage || ''}
      </div>

      {/* Right: Revision, Placements, Save Status, FPS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>
          {placementCount} {placementCount === 1 ? 'placement' : 'placements'}
        </span>

        <div style={{ width: '1px', height: '12px', backgroundColor: '#2a2a2a' }} />

        <span style={{ fontFamily: 'monospace' }}>r{revision}</span>

        <div style={{ width: '1px', height: '12px', backgroundColor: '#2a2a2a' }} />

        {/* Save indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
            }}
          />
          <span>Saved</span>
        </div>

        <div style={{ width: '1px', height: '12px', backgroundColor: '#2a2a2a' }} />

        {/* FPS */}
        <span
          style={{
            fontFamily: 'monospace',
            color: fps < 30 ? '#ef4444' : 'var(--color-text-secondary, #888888)',
          }}
        >
          {Math.round(fps)} FPS
        </span>
      </div>
    </footer>
  );
}
