// apps/web/src/editor/viewport/SelectedPlacementBar.tsx
// Sleek floating action bar for the selected placement at the bottom-center of the 3D viewport.
// Quick access to Move Gizmo (W), Rotate 90° (E), Nudge (±1/±16 on X/Y/Z), Duplicate Side-by-Side (Ctrl+D), and Delete (Del).

import React, { useState, useEffect, useCallback } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import { useEditorSession } from '../session-store.ts';
import type { Placement } from '@easyschemedit/domain';

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
        bottom: '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        backgroundColor: '#1e1e26f0',
        backdropFilter: 'blur(8px)',
        border: '1px solid #2a2a38',
        borderRadius: '4px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4)',
        color: '#eaeaea',
        fontSize: '11px',
        userSelect: 'none',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Placement Name + Coordinates Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
        <span
          style={{
            fontWeight: 600,
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#ffffff',
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
              fontFamily: 'monospace',
              fontSize: '10px',
              backgroundColor: '#2a2a38',
              color: '#93c5fd',
              padding: '2px 5px',
              borderRadius: '2px',
              border: '1px solid #3b82f640',
              cursor: placement.locked ? 'default' : 'pointer',
              userSelect: 'none',
            }}
            title={placement.locked ? 'World Coordinates (X, Y, Z) [Locked]' : 'Click to edit coordinates (X, Y, Z)'}
          >
            ({tx}, {ty}, {tz})
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: '#93c5fd' }}>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: '#93c5fd' }}>
              Y
              <input
                type="number"
                value={editY}
                onChange={(e) => setEditY(e.target.value)}
                onKeyDown={handleCoordKeyDown}
                style={coordInputStyle}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: '#93c5fd' }}>
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
              style={coordBtnStyle}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={cancelEditingCoords}
              title="Cancel (Esc)"
              aria-label="Cancel coordinates edit"
              style={{ ...coordBtnStyle, color: '#f87171' }}
            >
              ✕
            </button>
          </div>
        )}
        {placement.locked && (
          <span style={{ fontSize: '10px', color: '#eab308' }} title="Placement is locked">
            🔒
          </span>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Move Gizmo Button */}
      <button
        type="button"
        onClick={handleSelectMove}
        title={isMoveActive ? 'Exit Move Gizmo (W)' : 'Move Gizmo (W)'}
        aria-label={isMoveActive ? 'Exit Move Gizmo (W)' : 'Move Gizmo (W)'}
        style={{
          ...actionButtonStyle,
          backgroundColor: isMoveActive ? '#3b82f6' : '#2a2a38',
          color: isMoveActive ? '#ffffff' : '#eaeaea',
          borderColor: isMoveActive ? '#60a5fa' : '#3a3a4c',
          fontWeight: isMoveActive ? 600 : 400,
        }}
      >
        ✥ Move (W)
      </button>

      {/* Rotate +90 Button */}
      <button
        type="button"
        onClick={handleRotate}
        disabled={placement.locked}
        title="Rotate +90° (E)"
        aria-label="Rotate +90° (E)"
        style={{
          ...actionButtonStyle,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        ↻ Rotate 90° (E)
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
          backgroundColor: isMirrorX ? '#3b82f6' : '#2a2a38',
          color: isMirrorX ? '#ffffff' : '#eaeaea',
          borderColor: isMirrorX ? '#60a5fa' : '#3a3a4c',
          fontWeight: isMirrorX ? 600 : 400,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        Flip X
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
          backgroundColor: isMirrorZ ? '#3b82f6' : '#2a2a38',
          color: isMirrorZ ? '#ffffff' : '#eaeaea',
          borderColor: isMirrorZ ? '#60a5fa' : '#3a3a4c',
          fontWeight: isMirrorZ ? 600 : 400,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        Flip Z
      </button>

      <div style={dividerStyle} />

      {/* Step Toggle & Nudge Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div style={{ display: 'flex', border: '1px solid #3a3a4c', borderRadius: '2px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => handleStepChange(1)}
            title="Step: 1 block"
            style={{
              ...toggleStepButtonStyle,
              backgroundColor: step === 1 ? '#3b82f6' : '#1e1e26',
              color: step === 1 ? '#ffffff' : '#888899',
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
              backgroundColor: step === 16 ? '#3b82f6' : '#1e1e26',
              color: step === 16 ? '#ffffff' : '#888899',
            }}
          >
            16
          </button>
        </div>

        {/* Nudge Buttons on X, Y, Z */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} style={{ display: 'flex', gap: '1px' }}>
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
                -{axis.toUpperCase()}
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
                +{axis.toUpperCase()}
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
            padding: '0 6px',
            fontSize: '10px',
            opacity: placement.locked ? 0.4 : 1,
            cursor: placement.locked ? 'not-allowed' : 'pointer',
          }}
        >
          ⊞ Chunk
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Duplicate Side-by-Side Button */}
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={placement.locked}
        title="Duplicate Side-by-Side (Ctrl+D)"
        aria-label="Duplicate Side-by-Side (Ctrl+D)"
        style={{
          ...actionButtonStyle,
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        ⎘ Duplicate Side-by-Side (Ctrl+D)
      </button>

      {/* Delete Button */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={placement.locked}
        title="Delete Placement (Del)"
        aria-label="Delete Placement (Del)"
        style={{
          ...actionButtonStyle,
          color: '#ef4444',
          borderColor: '#ef444440',
          opacity: placement.locked ? 0.4 : 1,
          cursor: placement.locked ? 'not-allowed' : 'pointer',
        }}
      >
        ✕ Delete
      </button>
    </div>
  );
}

const dividerStyle: React.CSSProperties = {
  width: '1px',
  height: '16px',
  backgroundColor: '#2a2a38',
  margin: '0 2px',
};

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '24px',
  padding: '0 8px',
  backgroundColor: '#2a2a38',
  border: '1px solid #3a3a4c',
  borderRadius: '3px',
  color: '#eaeaea',
  fontSize: '11px',
  cursor: 'pointer',
  transition: 'background-color 0.1s, border-color 0.1s',
};

const toggleStepButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '22px',
  padding: '0 6px',
  border: 'none',
  fontSize: '10px',
  fontWeight: 600,
  cursor: 'pointer',
};

const nudgeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  padding: '0 5px',
  backgroundColor: '#2a2a38',
  border: '1px solid #3a3a4c',
  borderRadius: '2px',
  color: '#cbd5e1',
  fontSize: '10px',
  fontFamily: 'monospace',
  cursor: 'pointer',
};

const coordInputStyle: React.CSSProperties = {
  width: '42px',
  height: '20px',
  backgroundColor: '#14141c',
  color: '#ffffff',
  border: '1px solid #3b82f6',
  borderRadius: '2px',
  padding: '0 3px',
  fontSize: '10px',
  fontFamily: 'monospace',
  textAlign: 'center',
  outline: 'none',
};

const coordBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '20px',
  minWidth: '20px',
  padding: '0 4px',
  backgroundColor: '#2a2a38',
  border: '1px solid #3a3a4c',
  borderRadius: '2px',
  color: '#4ade80',
  fontSize: '10px',
  cursor: 'pointer',
};
