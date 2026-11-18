// apps/web/src/editor/viewport/SelectedPlacementBar.tsx
// Floating action bar for the selected placement at the bottom-center of the 3D viewport.
// Quick access to Move (W), Rotate 90 degrees (E), Nudge (1/16 on X/Y/Z), Duplicate (Ctrl+D), Delete (Del).

import React, { useState, useEffect, useCallback } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import { useEditorSession } from '../session-store.ts';
import type { Placement } from '@easyschemedit/domain';
import { Icon } from '../ui/index.ts';

export interface SelectedPlacementBarProps {
  store: EditorSessionStore;
  placement: Placement;
  onSelectPlacement?: (id: string | null) => void;
  className?: string;
  step?: 1 | 16;
  onStepChange?: (step: 1 | 16) => void;
}

export function SelectedPlacementBar({
  store,
  placement,
  onSelectPlacement,
  className = '',
  step: stepProp,
  onStepChange,
}: SelectedPlacementBarProps) {
  const sessionSnap = useEditorSession(store);
  const [localStep, setLocalStep] = useState<1 | 16>(1);
  const step = stepProp !== undefined ? stepProp : localStep;

  const handleStepChange = useCallback((nextStep: 1 | 16) => {
    setLocalStep(nextStep);
    onStepChange?.(nextStep);
  }, [onStepChange]);

  const tx = placement.transform.translation[0];
  const ty = placement.transform.translation[1];
  const tz = placement.transform.translation[2];
  const isMoveActive = sessionSnap.selectedTool === 'move';

  // Coordinate inline editing state
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [editX, setEditX] = useState<string>(String(tx));
  const [editY, setEditY] = useState<string>(String(ty));
  const [editZ, setEditZ] = useState<string>(String(tz));

  useEffect(() => {
    setIsEditingCoords(false);
  }, [placement.id, placement.locked]);

  const startEditingCoords = useCallback(() => {
    if (placement.locked) return;
    setEditX(String(tx));
    setEditY(String(ty));
    setEditZ(String(tz));
    setIsEditingCoords(true);
  }, [placement.locked, tx, ty, tz]);

  const cancelEditingCoords = useCallback(() => {
    setIsEditingCoords(false);
  }, []);

  const commitEditingCoords = useCallback(async () => {
    if (placement.locked) {
      setIsEditingCoords(false);
      return;
    }
    const nx = Math.round(Number(editX));
    const ny = Math.round(Number(editY));
    const nz = Math.round(Number(editZ));
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
      const dx = nx - tx;
      const dy = ny - ty;
      const dz = nz - tz;
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        await store.execute({
          type: 'placement:move',
          placementId: placement.id,
          offset: [dx, dy, dz],
        });
      }
    }
    setIsEditingCoords(false);
  }, [placement.locked, placement.id, editX, editY, editZ, tx, ty, tz, store]);

  const handleCoordKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEditingCoords();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditingCoords();
    }
  }, [commitEditingCoords, cancelEditingCoords]);

  const handleSelectMove = useCallback(() => {
    if (sessionSnap.selectedTool === 'move') {
      store.setSelectedTool('select');
    } else {
      store.setSelectedTool('move');
    }
  }, [sessionSnap.selectedTool, store]);

  const handleRotate = useCallback(async () => {
    if (placement.locked) return;
    const currentRot = (placement.transform.rotationY ?? 0) as 0 | 90 | 180 | 270;
    const nextRot = ((currentRot + 90) % 360) as 0 | 90 | 180 | 270;
    await store.execute({
      type: 'placement:rotate',
      placementId: placement.id,
      rotationY: nextRot,
    });
  }, [placement, store]);

  const handleMirror = useCallback(async (axis: 'x' | 'z') => {
    if (placement.locked) return;
    const cur = placement.transform.mirror ?? 'none';
    const nextMirror: 'none' | 'x' | 'z' = cur === axis ? 'none' : axis;
    await store.execute({
      type: 'placement:mirror',
      placementId: placement.id,
      mirror: nextMirror,
    });
  }, [placement, store]);

  const handleSnapToChunk = useCallback(async () => {
    if (placement.locked) return;
    const targetX = Math.round(tx / 16) * 16;
    const targetZ = Math.round(tz / 16) * 16;
    const dx = targetX - tx;
    const dz = targetZ - tz;
    if (dx !== 0 || dz !== 0) {
      await store.execute({
        type: 'placement:move',
        placementId: placement.id,
        offset: [dx, 0, dz],
      });
    }
  }, [placement, tx, tz, store]);

  const isMirrorX = (placement.transform.mirror ?? 'none') === 'x';
  const isMirrorZ = (placement.transform.mirror ?? 'none') === 'z';

  const handleNudge = useCallback(async (axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
    if (placement.locked) return;
    const offset: [number, number, number] = [
      axis === 'x' ? dir * step : 0,
      axis === 'y' ? dir * step : 0,
      axis === 'z' ? dir * step : 0,
    ];
    await store.execute({
      type: 'placement:move',
      placementId: placement.id,
      offset,
    });
  }, [placement, step, store]);

  const handleDuplicate = useCallback(async () => {
    if (placement.locked) return;
    const minX = placement.volume?.bounds?.min?.[0] ?? 0;
    const maxX = placement.volume?.bounds?.maxExclusive?.[0] ?? 1;
    const width = Math.max(1, maxX - minX) + 1;
    const res = await store.execute({
      type: 'placement:duplicate',
      placementId: placement.id,
      offset: [width, 0, 0],
    });
    if (res.ok) {
      const newId = (res as any).changed?.placementIds?.[0] ?? (res as any).data?.changed?.placementIds?.[0];
      if (newId) {
        onSelectPlacement?.(newId);
      }
    }
  }, [placement, store, onSelectPlacement]);

  const handleDelete = useCallback(async () => {
    if (placement.locked) return;
    await store.execute({
      type: 'placement:delete',
      placementId: placement.id,
    });
    onSelectPlacement?.(null);
  }, [placement, store, onSelectPlacement]);

  // Keyboard shortcut listener when bar is mounted for the selected placement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inTextInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;
      if (inTextInput) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'd') {
        e.preventDefault();
        void handleDuplicate();
      } else if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void handleDelete();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && key === 'w') {
        handleSelectMove();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && key === 'e') {
        void handleRotate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDuplicate, handleDelete, handleSelectMove, handleRotate]);

  return (
    <div
      className={`selected-placement-bar ${className}`}
      role="toolbar"
      aria-label="Selected Placement Actions"
      style={{
        position: 'absolute',
        bottom: 'var(--space-3)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        backgroundColor: 'var(--ink-800)',
        border: '1px solid var(--line)',
        maxWidth: 'calc(100% - 24px)',
        overflowX: 'auto',
        color: 'var(--text)',
        fontSize: '12px',
        userSelect: 'none',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      <style>{`
        @media (max-width: 1279px) {
          .selected-placement-bar .spb-label { display: none; }
        }
      `}</style>

      {/* Placement Name + Coordinates Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginRight: 'var(--space-1)' }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: '13px',
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--text)',
          }}
          title={placement.name}
        >
          {placement.name}
        </span>
        {!isEditingCoords ? (
          <span
            onClick={!placement.locked ? startEditingCoords : undefined}
            role={!placement.locked ? 'button' : undefined}
            tabIndex={!placement.locked ? 0 : undefined}
            onKeyDown={
              !placement.locked
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      startEditingCoords();
                    }
                  }
                : undefined
            }
            style={{
              ...numericStyle,
              backgroundColor: 'var(--ink-900)',
              color: 'var(--text)',
              padding: 'var(--space-1) var(--space-2)',
              border: '1px solid var(--line)',
              cursor: placement.locked ? 'default' : 'pointer',
              userSelect: 'none',
            }}
            title={placement.locked ? 'World Coordinates (X, Y, Z) [Locked]' : 'Click to edit coordinates (X, Y, Z)'}
          >
            ({tx}, {ty}, {tz})
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '10px', color: 'var(--text-dim)' }}>
              X
              <input
                type="number"
                value={editX}
                onChange={(e) => setEditX(e.target.value)}
                onKeyDown={handleCoordKeyDown}
                autoFocus
                style={coordInputStyle}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '10px', color: 'var(--text-dim)' }}>
              Y
              <input
                type="number"
                value={editY}
                onChange={(e) => setEditY(e.target.value)}
                onKeyDown={handleCoordKeyDown}
                style={coordInputStyle}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '10px', color: 'var(--text-dim)' }}>
              Z
              <input
                type="number"
                value={editZ}
                onChange={(e) => setEditZ(e.target.value)}
                onKeyDown={handleCoordKeyDown}
                style={coordInputStyle}
              />
            </label>
            <button
              type="button"
              onClick={() => void commitEditingCoords()}
              title="Apply coordinates (Enter)"
              aria-label="Apply coordinates"
              style={{ ...coordBtnStyle, color: 'var(--ok)' }}
            >
              <Icon name="check" size={14} />
            </button>
            <button
              type="button"
              onClick={cancelEditingCoords}
              title="Cancel (Esc)"
              aria-label="Cancel coordinates edit"
              style={{ ...coordBtnStyle, color: 'var(--danger)' }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {placement.locked && (
          <span style={{ color: 'var(--warn)', display: 'inline-flex' }} title="Placement is locked">
            <Icon name="lock" size={14} />
          </span>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Move Gizmo Button */}
      <button
        type="button"
        onClick={handleSelectMove}
        title="Move (W)"
        aria-label={isMoveActive ? 'Exit Move Gizmo (W)' : 'Move Gizmo (W)'}
        style={{
          ...actionButtonStyle,
          backgroundColor: isMoveActive ? 'var(--signal-wash)' : 'var(--ink-700)',
          color: isMoveActive ? 'var(--signal)' : 'var(--text)',
          borderColor: isMoveActive ? 'var(--signal)' : 'var(--line)',
          fontWeight: isMoveActive ? 600 : 400,
        }}
      >
        <Icon name="move" size={16} /> <span className="spb-label">Move</span>
      </button>

      {/* Rotate +90 Button */}
      <button
        type="button"
        onClick={handleRotate}
        disabled={placement.locked}
        title="Rotate (E)"
        aria-label="Rotate (E)"
        style={{
          ...actionButtonStyle,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="rotate" size={16} /> <span className="spb-label">Rotate</span>
      </button>

      {/* Mirror X / Flip X */}
      <button
        type="button"
        onClick={() => void handleMirror('x')}
        disabled={placement.locked}
        title="Mirror / Flip along X axis"
        aria-label="Mirror X"
        style={{
          ...actionButtonStyle,
          backgroundColor: isMirrorX ? 'var(--signal-wash)' : 'var(--ink-700)',
          color: isMirrorX ? 'var(--signal)' : 'var(--text)',
          borderColor: isMirrorX ? 'var(--signal)' : 'var(--line)',
          fontWeight: isMirrorX ? 600 : 400,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="flip" size={16} /> <span className="spb-label">Flip </span>X
      </button>

      {/* Mirror Z / Flip Z */}
      <button
        type="button"
        onClick={() => void handleMirror('z')}
        disabled={placement.locked}
        title="Mirror / Flip along Z axis"
        aria-label="Mirror Z"
        style={{
          ...actionButtonStyle,
          backgroundColor: isMirrorZ ? 'var(--signal-wash)' : 'var(--ink-700)',
          color: isMirrorZ ? 'var(--signal)' : 'var(--text)',
          borderColor: isMirrorZ ? 'var(--signal)' : 'var(--line)',
          fontWeight: isMirrorZ ? 600 : 400,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="flip" size={16} /> <span className="spb-label">Flip </span>Z
      </button>

      <div style={dividerStyle} />

      {/* Step Toggle & Nudge Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <span className="spb-label" style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Step</span>
        <div style={{ display: 'flex', border: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => handleStepChange(1)}
            title="Step: 1 block"
            style={{
              ...toggleStepButtonStyle,
              backgroundColor: step === 1 ? 'var(--signal-wash)' : 'transparent',
              color: step === 1 ? 'var(--signal)' : 'var(--text-dim)',
              borderColor: step === 1 ? 'var(--signal)' : 'transparent',
              fontWeight: step === 1 ? 600 : 400,
            }}
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleStepChange(16)}
            title="Step: 16 blocks (Chunk)"
            style={{
              ...toggleStepButtonStyle,
              backgroundColor: step === 16 ? 'var(--signal-wash)' : 'transparent',
              color: step === 16 ? 'var(--signal)' : 'var(--text-dim)',
              borderColor: step === 16 ? 'var(--signal)' : 'transparent',
              fontWeight: step === 16 ? 600 : 400,
            }}
          >
            16
          </button>
        </div>

        {/* Nudge Buttons on X, Y, Z */}
        <div style={{ display: 'flex', gap: 'var(--space-0h)' }}>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} style={{ display: 'flex', gap: 'var(--space-0h)' }}>
              <button
                type="button"
                disabled={placement.locked}
                onClick={() => handleNudge(axis, -1)}
                title={`Nudge -${step} on ${axis.toUpperCase()}`}
                aria-label={`Nudge -${step} on ${axis.toUpperCase()}`}
                style={{
                  ...nudgeButtonStyle,
                  opacity: placement.locked ? 0.4 : 1,
                  cursor: placement.locked ? 'not-allowed' : 'pointer',
                }}
              >
                <Icon name="chevronLeft" size={12} /><span className="spb-label">{axis.toUpperCase()}</span>
              </button>
              <button
                type="button"
                disabled={placement.locked}
                onClick={() => handleNudge(axis, 1)}
                title={`Nudge +${step} on ${axis.toUpperCase()}`}
                aria-label={`Nudge +${step} on ${axis.toUpperCase()}`}
                style={{
                  ...nudgeButtonStyle,
                  opacity: placement.locked ? 0.4 : 1,
                  cursor: placement.locked ? 'not-allowed' : 'pointer',
                }}
              >
                <span className="spb-label">{axis.toUpperCase()}</span><Icon name="chevronRight" size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Snap to Chunk Button */}
        <button
          type="button"
          onClick={() => void handleSnapToChunk()}
          disabled={placement.locked}
          title="Snap X/Z to nearest 16-block chunk"
          aria-label="Snap to Chunk"
          style={{
            ...actionButtonStyle,
            padding: '0 var(--space-2)',
            fontSize: '10px',
            opacity: placement.locked ? 0.4 : 1,
            cursor: placement.locked ? 'not-allowed' : 'pointer',
          }}
        >
          <Icon name="grid" size={16} /> <span className="spb-label">Chunk</span>
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Duplicate Side-by-Side Button */}
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={placement.locked}
        title="Duplicate (Ctrl+D)"
        aria-label="Duplicate Side-by-Side (Ctrl+D)"
        style={{
          ...actionButtonStyle,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="duplicate" size={16} /> <span className="spb-label">Duplicate</span>
      </button>

      {/* Delete Button */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={placement.locked}
        title="Delete (Del)"
        aria-label="Delete Placement (Del)"
        style={{
          ...actionButtonStyle,
          color: 'var(--danger)',
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        <Icon name="trash" size={16} /> <span className="spb-label">Delete</span>
      </button>
    </div>
  );
}

const numericStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
  fontSize: '12px',
  color: 'var(--text)',
};

const dividerStyle: React.CSSProperties = {
  width: '1px',
  height: '16px',
  backgroundColor: 'var(--line)',
  margin: '0 var(--space-1)',
  flexShrink: 0,
};

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  height: '24px',
  padding: '0 var(--space-2)',
  backgroundColor: 'var(--ink-700)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  flexShrink: 0,
};

const toggleStepButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  padding: '0 var(--space-2)',
  border: '1px solid',
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
  fontSize: '12px',
  cursor: 'pointer',
};

const nudgeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-0h)',
  height: '24px',
  padding: '0 var(--space-1)',
  backgroundColor: 'var(--ink-700)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  ...numericStyle,
  cursor: 'pointer',
};

const coordInputStyle: React.CSSProperties = {
  width: '48px',
  height: '26px',
  backgroundColor: 'var(--ink-900)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  padding: '0 var(--space-1)',
  ...numericStyle,
  textAlign: 'center',
};

const coordBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  minWidth: '24px',
  padding: '0 var(--space-1)',
  backgroundColor: 'var(--ink-700)',
  border: '1px solid var(--line)',
  cursor: 'pointer',
};
