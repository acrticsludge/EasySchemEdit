// apps/web/src/editor/layout/Toolbar.tsx
// Top workspace toolbar: tool selector, undo/redo, file operations, and viewport overlay toggles.
// S&box dark aesthetic adhering to SUBSPEC-G §6.1, §1.5 design tokens.

import React from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { AuthUser } from '../../client/auth-client.ts';

export interface ToolbarProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  onImport?: () => void;
  onExport?: () => void;
  onBake?: () => void;
  onSave?: () => void;
  onOpenProjects?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  authUser?: AuthUser | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  activeOverlays?: {
    chunk?: boolean;
    section?: boolean;
    block?: boolean;
    conflicts?: boolean;
  };
  onToggleOverlay?: (overlay: 'chunk' | 'section' | 'block' | 'conflicts') => void;
  className?: string;
}

interface ToolDefinition {
  id: string;
  label: string;
  shortcut?: string;
  icon: string;
  category: 'pointer' | 'region';
}

const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Select Placement', shortcut: '1', icon: '⬚', category: 'pointer' },
  { id: 'move', label: 'Move Placement', shortcut: 'W', icon: '✥', category: 'pointer' },
];

export function Toolbar({
  store,
  controllers,
  onImport,
  onExport,
  onBake,
  onSave,
  onOpenProjects,
  isDirty = false,
  isSaving = false,
  authUser,
  onSignIn,
  onSignOut,
  activeOverlays = { chunk: false, section: false, block: false, conflicts: true },
  onToggleOverlay,
  className = '',
}: ToolbarProps) {
  const snapshot = store.getSnapshot();
  const selectedTool = snapshot.selectedTool;
  const canUndo = snapshot.canUndo;
  const canRedo = snapshot.canRedo;
  const projectName = snapshot.project?.name || 'Untitled Schematic';

  const handleSelectTool = (toolId: string) => {
    const nextTool = toolId === 'move' && selectedTool === toolId ? 'select' : toolId;
    store.setSelectedTool(nextTool);
    controllers?.statusBar.setToolMode(nextTool);
  };

  const handleUndo = () => {
    if (canUndo) void store.undo();
  };

  const handleRedo = () => {
    if (canRedo) void store.redo();
  };

  return (
    <header
      className={`editor-toolbar ${className}`}
      role="toolbar"
      aria-label="Editor Toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '40px',
        padding: '0 12px',
        backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
        borderBottom: '1px solid var(--color-border-subtle, #333333)',
        color: 'var(--color-text-primary, #eaeaea)',
        fontSize: '12px',
        userSelect: 'none',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      {/* Left: Brand / Project Title & File Operations */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
          <span
            style={{
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: 'var(--color-accent, #4a9eff)',
              fontSize: '13px',
            }}
          >
            EasySchemEdit
          </span>
          <span
            style={{
              color: 'var(--color-text-secondary, #a8a8a8)',
              maxWidth: '160px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={projectName}
          >
            / {projectName}{isDirty ? ' *' : ''}
          </span>
        </div>

        <div style={{ width: '1px', height: '18px', backgroundColor: '#333333', margin: '0 4px' }} />

        {/* Undo / Redo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '0px',
              color: canUndo ? 'var(--color-text-primary, #eaeaea)' : 'var(--color-text-muted, #666666)',
              cursor: canUndo ? 'pointer' : 'default',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            ↺
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="Redo"
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '0px',
              color: canRedo ? 'var(--color-text-primary, #eaeaea)' : 'var(--color-text-muted, #666666)',
              cursor: canRedo ? 'pointer' : 'default',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            ↻
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', backgroundColor: '#333333', margin: '0 4px' }} />

        {/* File actions */}
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            style={actionButtonStyle}
            title="Import Schematic (.schem / .litematic)"
          >
            Import
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            style={actionButtonStyle}
            title="Export Schematic (Ctrl+E)"
          >
            Export
          </button>
        )}
        {onBake && (
          <button
            type="button"
            onClick={onBake}
            style={actionButtonStyle}
            title="Bake Placements into World"
          >
            Bake
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            style={actionButtonStyle}
            title="Save Project (Ctrl+S)"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        )}
        {onOpenProjects && (
          <button
            type="button"
            onClick={onOpenProjects}
            style={actionButtonStyle}
            title="Saved Cloud Projects"
          >
            Projects
          </button>
        )}
      </div>

      {/* Center: Tools Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'var(--color-bg-secondary, #1a1a1a)',
          padding: '2px 4px',
          border: '1px solid #2a2a2a',
        }}
      >
        {TOOLS.map((tool) => {
          const isActive = selectedTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleSelectTool(tool.id)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                background: isActive ? 'var(--color-bg-tertiary, #252525)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'var(--color-accent, #4a9eff)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--color-text-secondary, #a8a8a8)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                borderRadius: '0px',
                transition: 'background 0.1s, border-color 0.1s',
              }}
            >
              <span style={{ fontSize: '13px' }}>{tool.icon}</span>
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Viewport Overlays Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #a8a8a8)' }}>Overlays:</span>
        <OverlayToggle
          label="Chunk"
          active={Boolean(activeOverlays.chunk)}
          onClick={() => onToggleOverlay?.('chunk')}
        />
        <OverlayToggle
          label="Section"
          active={Boolean(activeOverlays.section)}
          onClick={() => onToggleOverlay?.('section')}
        />
        <OverlayToggle
          label="Block"
          active={Boolean(activeOverlays.block)}
          onClick={() => onToggleOverlay?.('block')}
        />
        <OverlayToggle
          label="Conflicts"
          active={Boolean(activeOverlays.conflicts)}
          onClick={() => onToggleOverlay?.('conflicts')}
          color="#ef4444"
        />

        <div style={{ width: '1px', height: '18px', backgroundColor: '#333333', margin: '0 4px' }} />

        {/* User Auth Info / Actions */}
        {authUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-text-secondary, #a8a8a8)',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`Logged in as ${authUser.username}`}
            >
              👤 {authUser.username}
            </span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                style={{
                  ...actionButtonStyle,
                  padding: '3px 7px',
                  fontSize: '11px',
                  color: 'var(--color-text-muted, #888888)',
                }}
                title="Sign Out"
              >
                Sign Out
              </button>
            )}
          </div>
        ) : (
          onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              style={{
                ...actionButtonStyle,
                padding: '3px 8px',
                fontSize: '11px',
                color: 'var(--color-accent, #4a9eff)',
                borderColor: 'var(--color-accent, #4a9eff)',
              }}
              title="Sign in to save and open cloud projects"
            >
              Sign In
            </button>
          )
        )}
      </div>
    </header>
  );
}

function OverlayToggle({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  const activeColor = color ?? 'var(--color-accent, #4a9eff)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '3px 7px',
        fontSize: '11px',
        background: active ? 'rgba(74, 158, 255, 0.15)' : 'transparent',
        border: '1px solid',
        borderColor: active ? activeColor : '#444444',
        color: active ? '#ffffff' : 'var(--color-text-muted, #888888)',
        cursor: 'pointer',
        borderRadius: '0px',
      }}
    >
      {label}
    </button>
  );
}

const actionButtonStyle: React.CSSProperties = {
  padding: '4px 9px',
  background: 'var(--color-bg-secondary, #1a1a1a)',
  border: '1px solid #444444',
  color: 'var(--color-text-primary, #eaeaea)',
  fontSize: '12px',
  cursor: 'pointer',
  borderRadius: '0px',
};
