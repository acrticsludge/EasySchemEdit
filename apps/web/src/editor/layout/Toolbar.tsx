// apps/web/src/editor/layout/Toolbar.tsx
// Top workspace toolbar: tool selector, undo/redo, file operations, and viewport overlay toggles.
// Precision-instrument chrome (SPEC.ui-precision-instrument.md §4).

import React, { useState } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { AuthUser } from '../../client/auth-client.ts';
import { Icon, type IconName } from '../ui/index.ts';

export interface ToolbarProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  onImport?: () => void;
  onExport?: () => void;
  onBake?: () => void;
  onSave?: () => void;
  onOpenProjects?: () => void;
  onOpenMcpHub?: () => void;
  mcpLiveSyncActive?: boolean;
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
  icon: IconName;
  category: 'pointer' | 'region';
}

const TOOLS: ToolDefinition[] = [
  { id: 'select', label: 'Select', shortcut: '1', icon: 'select', category: 'pointer' },
  { id: 'move', label: 'Move', shortcut: 'W', icon: 'move', category: 'pointer' },
];

export function Toolbar({
  store,
  controllers,
  onImport,
  onExport,
  onBake,
  onSave,
  onOpenProjects,
  onOpenMcpHub,
  mcpLiveSyncActive = false,
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
        backgroundColor: 'var(--ink-850)',
        borderBottom: '1px solid var(--line-strong)',
        color: 'var(--text)',
        fontSize: '12px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <style>{`
        .editor-toolbar { gap: 12px; padding: 0 12px; }
        .editor-toolbar .etb-group,
        .editor-toolbar .etb-brand,
        .editor-toolbar .etb-auth { gap: 8px; }
        .editor-toolbar .etb-brand { margin-right: 4px; }
        .editor-toolbar .etb-tools { gap: 4px; padding: 4px; }
        .editor-toolbar .etb-tool-button { padding: 4px 8px; }
        .editor-toolbar .etb-separator {
          width: 1px;
          height: 18px;
          background-color: var(--line-strong);
          margin: 0 4px;
          flex-shrink: 0;
        }
        .editor-toolbar .etb-file-icon { display: none; }
        .editor-toolbar .etb-overlays-label {
          font-size: 11px;
          color: var(--text-faint);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        @media (max-width: 1279px) {
          .editor-toolbar { gap: 4px; padding: 0 8px; }
          .editor-toolbar .etb-group,
          .editor-toolbar .etb-brand,
          .editor-toolbar .etb-auth { gap: 4px; }
          .editor-toolbar .etb-brand { margin-right: 0; }
          .editor-toolbar .etb-tools { gap: 2px; padding: 2px; }
          .editor-toolbar .etb-separator { margin: 0; }
          .editor-toolbar .etb-file-icon { display: inline-flex; }
          .editor-toolbar .etb-label,
          .editor-toolbar .etb-overlays-label { display: none; }
          .editor-toolbar .etb-tool-button { padding: 4px; }
        }
      `}</style>

      {/* Left: Brand / Project Title & File Operations */}
      <div className="etb-group etb-group-left" style={{ display: 'flex', alignItems: 'center' }}>
        <div className="etb-brand" style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: 'var(--text)',
              fontSize: '13px',
            }}
          >
            EasySchemEdit
          </span>
          <span
            style={{
              color: 'var(--text-dim)',
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

        <div className="etb-separator" />

        {/* Undo / Redo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            style={{
              ...iconButtonStyle,
              color: canUndo ? 'var(--text)' : 'var(--text-faint)',
              cursor: canUndo ? 'pointer' : 'default',
            }}
          >
            <Icon name="undo" size={16} />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="Redo"
            style={{
              ...iconButtonStyle,
              color: canRedo ? 'var(--text)' : 'var(--text-faint)',
              cursor: canRedo ? 'pointer' : 'default',
            }}
          >
            <Icon name="redo" size={16} />
          </button>
        </div>

        <div className="etb-separator" />

        {/* File actions share a neutral style with a clear --ink-700 hover */}
        {onImport && (
          <FileActionButton icon="import" onClick={onImport} aria-label="Import Schematic" title="Import Schematic (.schem / .litematic)">
            Import
          </FileActionButton>
        )}
        {onExport && (
          <FileActionButton icon="export" onClick={onExport} aria-label="Export Schematic" title="Export Schematic (Ctrl+E)">
            Export
          </FileActionButton>
        )}
        {onBake && (
          <FileActionButton icon="bake" onClick={onBake} aria-label="Bake Placements into World" title="Bake Placements into World">
            Bake
          </FileActionButton>
        )}
        {onSave && (
          <FileActionButton icon="save" onClick={onSave} disabled={isSaving} aria-label="Save Project" title="Save Project (Ctrl+S)">
            {isSaving ? 'Saving...' : 'Save'}
          </FileActionButton>
        )}
        {onOpenProjects && (
          <FileActionButton icon="projects" onClick={onOpenProjects} aria-label="Saved Cloud Projects" title="Saved Cloud Projects">
            Projects
          </FileActionButton>
        )}
      </div>

      {/* Center: Tools Selector */}
      <div
        className="etb-tools"
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--ink-900)',
          border: '1px solid var(--line-strong)',
        }}
      >
        {TOOLS.map((tool) => {
          const isActive = selectedTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleSelectTool(tool.id)}
              className="etb-tool-button"
              aria-label={`${tool.label} Placement`}
              title={`${tool.label} Placement${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                height: '24px',
                background: isActive ? 'var(--signal-wash)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'var(--signal)' : 'transparent',
                color: isActive ? 'var(--signal)' : 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 400,
                borderRadius: '0',
                transition: 'background-color 0.12s ease-out, border-color 0.12s ease-out, color 0.12s ease-out',
              }}
            >
              <Icon name={tool.icon} size={16} />
              <span className="etb-label">{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Viewport Overlays Toggles, MCP bridge, auth */}
      <div className="etb-group etb-group-right" style={{ display: 'flex', alignItems: 'center' }}>
        <span className="etb-overlays-label">Overlays:</span>
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
          marker="danger"
        />

        {onOpenMcpHub && (
          <button
            type="button"
            onClick={onOpenMcpHub}
            aria-label="AI and MCP Hub"
            style={{
              ...neutralButtonStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              fontSize: '11px',
            }}
            title="Account MCP Hub & AI Builder (Cursor, Claude, Antigravity, Windsurf)"
          >
            <Icon name="agent" size={14} />
            <span>AI / MCP</span>
            {mcpLiveSyncActive && (
              <span
                title="Live sync active"
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ok)',
                }}
              />
            )}
          </button>
        )}

        <div className="etb-separator" />

        {/* User Auth Info / Actions */}
        {authUser ? (
          <div className="etb-auth" style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-dim)',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`Logged in as ${authUser.username}`}
            >
              {authUser.username}
            </span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                style={{ ...neutralButtonStyle, padding: '3px 7px', fontSize: '11px', color: 'var(--text-dim)' }}
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
              style={{ ...neutralButtonStyle, padding: '3px 8px', fontSize: '11px' }}
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

function FileActionButton({
  children,
  icon,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      {...rest}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...fileActionStyle,
        backgroundColor: hovered ? 'var(--ink-700)' : 'transparent',
        ...style,
      }}
    >
      <span className="etb-file-icon"><Icon name={icon} size={14} /></span>
      <span className="etb-label">{children}</span>
    </button>
  );
}

function OverlayToggle({
  label,
  active,
  onClick,
  marker = 'signal',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  marker?: 'signal' | 'danger';
}) {
  const activeColor = marker === 'danger' ? 'var(--danger)' : 'var(--signal)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '3px 7px',
        fontSize: '11px',
        background: active && marker === 'signal' ? 'var(--signal-wash)' : 'transparent',
        border: '1px solid',
        borderColor: active ? activeColor : 'var(--line)',
        color: active ? activeColor : 'var(--text-dim)',
        cursor: 'pointer',
        borderRadius: '0',
        transition: 'color 0.12s ease-out, border-color 0.12s ease-out, background-color 0.12s ease-out',
      }}
    >
      {label}
    </button>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  padding: 0,
  background: 'transparent',
  border: '1px solid transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  borderRadius: '0',
};

const fileActionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  borderRadius: '0',
  transition: 'background-color 0.12s ease-out',
};

const neutralButtonStyle: React.CSSProperties = {
  ...fileActionStyle,
  backgroundColor: 'var(--ink-800)',
  borderColor: 'var(--line-strong)',
};
