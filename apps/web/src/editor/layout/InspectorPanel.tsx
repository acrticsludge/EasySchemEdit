// apps/web/src/editor/layout/InspectorPanel.tsx
// Right dock panel: selected placement transform, origin editor, rotation/mirror controls, stats.
// S&box style adhering to SUBSPEC-G §6.3, G3.

import React, { useState, useEffect } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { Rotation, MirrorAxis } from '@easyschemedit/ui';

export interface InspectorPanelProps {
  store: EditorSessionStore;
  controllers?: WorkspaceControllers;
  hideHeader?: boolean;
  onCollapse?: () => void;
  className?: string;
  onSelectPlacement?: (id: string | null) => void;
}

export function InspectorPanel({
  store,
  controllers,
  hideHeader = false,
  onCollapse,
  className = '',
  onSelectPlacement,
}: InspectorPanelProps) {
  const snapshot = store.getSnapshot();
  const selectedPlacementId = controllers?.inspector.context().selectedPlacementId ?? null;
  const placement = snapshot.project?.placements.find((p) => p.id === selectedPlacementId);

  // Local state for name input
  const [nameInput, setNameInput] = useState(placement?.name ?? '');
  const [keepBlocksInPlace, setKeepBlocksInPlace] = useState(true);
  const [nudgeStep, setNudgeStep] = useState<1 | 16>(1);

  useEffect(() => {
    setNameInput(placement?.name ?? '');
  }, [placement?.name]);

  if (!placement) {
    return (
      <aside
        className={`editor-inspector-panel ${className}`}
        aria-label="Inspector"
        style={panelContainerStyle}
      >
        {!hideHeader && (
          <div style={panelHeaderStyle}>
            <span style={{ fontWeight: 600, fontSize: '12px', letterSpacing: '0.3px' }}>INSPECTOR</span>
            {onCollapse && (
              <button type="button" onClick={onCollapse} title="Collapse Inspector" style={iconButtonStyle}>
                ▶
              </button>
            )}
          </div>
        )}
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--color-text-secondary, #888888)',
            fontSize: '12px',
          }}
        >
          No placement selected.
          <br />
          <span style={{ fontSize: '11px', marginTop: '6px', display: 'block', color: 'var(--color-text-muted, #666666)' }}>
            Click a placement in the outliner or viewport to inspect and transform.
          </span>
        </div>
      </aside>
    );
  }

  const tx = placement.transform.translation[0];
  const ty = placement.transform.translation[1];
  const tz = placement.transform.translation[2];
  const ox = placement.origin[0] / 2;
  const oy = placement.origin[1] / 2;
  const oz = placement.origin[2] / 2;
  const rot = (placement.transform.rotationY ?? 0) as Rotation;
  const mirror = (placement.transform.mirror ?? 'none') as MirrorAxis;

  const min = placement.volume?.bounds?.min ?? [0, 0, 0];
  const max = placement.volume?.bounds?.maxExclusive ?? [0, 0, 0];
  const w = Math.max(0, max[0] - min[0]);
  const h = Math.max(0, max[1] - min[1]);
  const d = Math.max(0, max[2] - min[2]);
  const nonAirCount = placement.volume?.nonAirCount ?? 0;
  const chunksCount = placement.volume?.chunks?.size ?? 0;

  const handleRenameSubmit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== placement.name) {
      if (controllers) {
        void controllers.renamePlacement(placement.id, trimmed);
      } else {
        void store.execute({
          type: 'placement:rename',
          placementId: placement.id,
          name: trimmed,
        });
      }
    }
  };

  const handleUpdatePosition = (axis: 'x' | 'y' | 'z', value: number) => {
    if (placement.locked) return;
    const newTx = axis === 'x' ? Math.round(value) : tx;
    const newTy = axis === 'y' ? Math.round(value) : ty;
    const newTz = axis === 'z' ? Math.round(value) : tz;

    if (controllers) {
      void controllers.movePlacement(placement.id, [newTx, newTy, newTz]);
    } else {
      void store.execute({
        type: 'placement:move',
        placementId: placement.id,
        translation: [newTx, newTy, newTz],
      });
    }
  };

  const handleUpdateOrigin = (axis: 'x' | 'y' | 'z', value: number) => {
    if (placement.locked) return;
    const newOx = axis === 'x' ? value : ox;
    const newOy = axis === 'y' ? value : oy;
    const newOz = axis === 'z' ? value : oz;

    const halfX = Math.round(newOx * 2);
    const halfY = Math.round(newOy * 2);
    const halfZ = Math.round(newOz * 2);

    if (controllers) {
      void controllers.setPlacementOrigin(placement.id, [halfX, halfY, halfZ], keepBlocksInPlace);
    } else {
      void store.execute({
        type: 'placement:setOrigin',
        placementId: placement.id,
        origin: [halfX, halfY, halfZ],
        keepBlocksInPlace,
      });
    }
  };

  const handleSetRotation = (newRot: Rotation) => {
    if (placement.locked || newRot === rot) return;
    if (controllers) {
      void controllers.rotatePlacement(placement.id, newRot);
    } else {
      void store.execute({
        type: 'placement:rotate',
        placementId: placement.id,
        rotationY: newRot,
      });
    }
  };

  const handleSetMirror = (newMirror: MirrorAxis) => {
    if (placement.locked || newMirror === mirror) return;
    if (controllers) {
      void controllers.mirrorPlacement(placement.id, newMirror);
    } else {
      void store.execute({
        type: 'placement:mirror',
        placementId: placement.id,
        mirror: newMirror,
      });
    }
  };

  const handleNudge = (axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
    if (!placement || placement.locked) return;
    const offset: [number, number, number] = [
      axis === 'x' ? dir * nudgeStep : 0,
      axis === 'y' ? dir * nudgeStep : 0,
      axis === 'z' ? dir * nudgeStep : 0,
    ];
    void store.execute({
      type: 'placement:move',
      placementId: placement.id,
      offset,
    });
  };

  const handleDuplicatePlacement = async () => {
    if (!placement || placement.locked) return;
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
        controllers?.selectPlacement(newId);
        onSelectPlacement?.(newId);
      }
    }
  };

  const handleToggleLock = () => {
    if (!placement) return;
    if (controllers) {
      void controllers.togglePlacementLock(placement.id);
    } else {
      void store.execute({
        type: 'placement:setLocked',
        placementId: placement.id,
        locked: !placement.locked,
      });
    }
  };

  const handleDeletePlacement = () => {
    if (!placement || placement.locked) return;
    void store.execute({
      type: 'placement:delete',
      placementId: placement.id,
    });
    controllers?.selectPlacement(null);
    onSelectPlacement?.(null);
  };

  return (
    <aside
      className={`editor-inspector-panel ${className}`}
      aria-label="Inspector"
      style={panelContainerStyle}
    >
      {/* Header */}
      {!hideHeader && (
        <div style={panelHeaderStyle}>
          <span style={{ fontWeight: 600, fontSize: '12px', letterSpacing: '0.3px' }}>INSPECTOR</span>
          {onCollapse && (
            <button type="button" onClick={onCollapse} title="Collapse Inspector" style={iconButtonStyle}>
              ▶
            </button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {/* Placement Name */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Placement Name</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
            }}
            disabled={placement.locked}
            style={textInputStyle}
          />
        </div>

        {/* Position (World block coordinates) */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={labelStyle}>Position (X, Y, Z)</label>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary, #888888)' }}>Blocks</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            <NumericField
              label="X"
              value={tx}
              step={1}
              disabled={placement.locked}
              onChange={(val) => handleUpdatePosition('x', val)}
            />
            <NumericField
              label="Y"
              value={ty}
              step={1}
              disabled={placement.locked}
              onChange={(val) => handleUpdatePosition('y', val)}
            />
            <NumericField
              label="Z"
              value={tz}
              step={1}
              disabled={placement.locked}
              onChange={(val) => handleUpdatePosition('z', val)}
            />
          </div>

          {/* Quick Nudge (±1 / ±16) Row */}
          <div
            style={{
              marginTop: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px',
              backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
              padding: '4px 6px',
              border: '1px solid #282828',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary, #888888)', marginRight: '2px' }}>
                Nudge
              </span>
              <button
                type="button"
                onClick={() => setNudgeStep(1)}
                title="Nudge step: 1 block"
                style={{
                  ...nudgeStepBtnStyle,
                  backgroundColor: nudgeStep === 1 ? 'var(--color-accent, #4a9eff)' : '#1e1e26',
                  color: nudgeStep === 1 ? '#ffffff' : '#888888',
                  borderColor: nudgeStep === 1 ? 'var(--color-accent, #4a9eff)' : '#333333',
                }}
              >
                ±1
              </button>
              <button
                type="button"
                onClick={() => setNudgeStep(16)}
                title="Nudge step: 16 blocks (Chunk)"
                style={{
                  ...nudgeStepBtnStyle,
                  backgroundColor: nudgeStep === 16 ? 'var(--color-accent, #4a9eff)' : '#1e1e26',
                  color: nudgeStep === 16 ? '#ffffff' : '#888888',
                  borderColor: nudgeStep === 16 ? 'var(--color-accent, #4a9eff)' : '#333333',
                }}
              >
                ±16
              </button>
            </div>

            <div style={{ display: 'flex', gap: '2px' }}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div key={axis} style={{ display: 'flex', gap: '1px' }}>
                  <button
                    type="button"
                    disabled={placement.locked}
                    onClick={() => handleNudge(axis, -1)}
                    title={`Nudge -${nudgeStep} on ${axis.toUpperCase()}`}
                    aria-label={`Nudge -${nudgeStep} on ${axis.toUpperCase()}`}
                    style={{
                      ...nudgeAxisBtnStyle,
                      opacity: placement.locked ? 0.3 : 1,
                      cursor: placement.locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    -{axis.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    disabled={placement.locked}
                    onClick={() => handleNudge(axis, 1)}
                    title={`Nudge +${nudgeStep} on ${axis.toUpperCase()}`}
                    aria-label={`Nudge +${nudgeStep} on ${axis.toUpperCase()}`}
                    style={{
                      ...nudgeAxisBtnStyle,
                      opacity: placement.locked ? 0.3 : 1,
                      cursor: placement.locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    +{axis.toUpperCase()}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Origin / Pivot */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={labelStyle}>Origin / Pivot</label>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary, #888888)' }}>Half-blocks allowed</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            <NumericField
              label="X"
              value={ox}
              step={0.5}
              disabled={placement.locked}
              onChange={(val) => handleUpdateOrigin('x', val)}
            />
            <NumericField
              label="Y"
              value={oy}
              step={0.5}
              disabled={placement.locked}
              onChange={(val) => handleUpdateOrigin('y', val)}
            />
            <NumericField
              label="Z"
              value={oz}
              step={0.5}
              disabled={placement.locked}
              onChange={(val) => handleUpdateOrigin('z', val)}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--color-text-secondary, #a8a8a8)',
              marginTop: '6px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={keepBlocksInPlace}
              onChange={(e) => setKeepBlocksInPlace(e.target.checked)}
              style={{ margin: 0 }}
            />
            Keep blocks in place (offset translation)
          </label>
        </div>

        {/* Rotation */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Rotation Y</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {([0, 90, 180, 270] as const).map((r) => {
              const isActive = rot === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSetRotation(r)}
                  disabled={placement.locked}
                  style={{
                    padding: '5px 0',
                    fontSize: '11px',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'var(--color-accent, #4a9eff)' : 'var(--color-bg-primary, #0d0d0d)',
                    color: isActive ? '#ffffff' : 'var(--color-text-primary, #eaeaea)',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--color-accent, #4a9eff)' : '#333333',
                    borderRadius: '0px',
                    cursor: placement.locked ? 'default' : 'pointer',
                  }}
                >
                  {r}°
                </button>
              );
            })}
          </div>
        </div>

        {/* Mirror */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Mirror</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {(['none', 'x', 'z'] as const).map((m) => {
              const isActive = mirror === m;
              const label = m === 'none' ? 'None' : m.toUpperCase();
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSetMirror(m)}
                  disabled={placement.locked}
                  style={{
                    padding: '5px 0',
                    fontSize: '11px',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'var(--color-accent, #4a9eff)' : 'var(--color-bg-primary, #0d0d0d)',
                    color: isActive ? '#ffffff' : 'var(--color-text-primary, #eaeaea)',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--color-accent, #4a9eff)' : '#333333',
                    borderRadius: '0px',
                    cursor: placement.locked ? 'default' : 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: '#2a2a2a', margin: '14px 0' }} />

        {/* Placement Info / Stats */}
        <div>
          <label style={{ ...labelStyle, marginBottom: '6px' }}>Metadata & Dimensions</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
            <StatRow label="Size (W×H×D)" value={`${w} × ${h} × ${d}`} />
            <StatRow label="Non-Air Blocks" value={nonAirCount.toLocaleString()} />
            <StatRow label="Chunks" value={chunksCount.toString()} />
            <StatRow label="State" value={placement.locked ? 'Locked' : 'Unlocked'} />
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: '#2a2a2a', margin: '14px 0' }} />

        {/* Placement Actions: Duplicate Side-by-Side, Lock, Delete */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ ...labelStyle, marginBottom: '6px' }}>Actions</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              type="button"
              onClick={handleDuplicatePlacement}
              disabled={placement.locked}
              title="Duplicate Side-by-Side (Ctrl+D)"
              aria-label="Duplicate Side-by-Side (Ctrl+D)"
              style={{
                ...actionButtonStyle,
                padding: '6px 10px',
                backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
                border: '1px solid #3b82f660',
                color: '#93c5fd',
                fontWeight: 500,
                cursor: placement.locked ? 'not-allowed' : 'pointer',
                opacity: placement.locked ? 0.4 : 1,
              }}
            >
              ⎘ Duplicate Side-by-Side
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                onClick={handleToggleLock}
                title={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                aria-label={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                style={{
                  ...actionButtonStyle,
                  padding: '5px 8px',
                  backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
                  border: '1px solid #333333',
                  color: placement.locked ? '#eab308' : '#eaeaea',
                  cursor: 'pointer',
                }}
              >
                {placement.locked ? '🔒 Unlock' : '🔓 Lock'}
              </button>
              <button
                type="button"
                onClick={handleDeletePlacement}
                disabled={placement.locked}
                title="Delete Placement"
                aria-label="Delete Placement"
                style={{
                  ...actionButtonStyle,
                  padding: '5px 8px',
                  backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
                  border: '1px solid #ef444440',
                  color: '#ef4444',
                  cursor: placement.locked ? 'not-allowed' : 'pointer',
                  opacity: placement.locked ? 0.4 : 1,
                }}
              >
                ✕ Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NumericField({
  label,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--color-bg-primary, #0d0d0d)',
        border: '1px solid #333333',
        height: '26px',
      }}
    >
      <span
        style={{
          padding: '0 5px',
          fontSize: '10px',
          color: 'var(--color-text-secondary, #888888)',
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const num = parseFloat(e.target.value);
          if (!isNaN(num)) onChange(num);
        }}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          color: '#eaeaea',
          fontSize: '11px',
          outline: 'none',
          textAlign: 'right',
          paddingRight: '4px',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #333333' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + step)}
          style={stepperButtonStyle}
        >
          ▲
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value - step)}
          style={stepperButtonStyle}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '4px 6px',
        background: 'var(--color-bg-primary, #0d0d0d)',
        border: '1px solid #262626',
      }}
    >
      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary, #888888)' }}>{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #eaeaea)' }}>{value}</div>
    </div>
  );
}

const panelContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  backgroundColor: 'var(--color-bg-secondary, #1a1a1a)',
  borderLeft: '1px solid var(--color-border-subtle, #333333)',
  color: 'var(--color-text-primary, #eaeaea)',
  fontSize: '12px',
  overflow: 'hidden',
  userSelect: 'none',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '34px',
  padding: '0 10px',
  borderBottom: '1px solid #2a2a2a',
  backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--color-text-secondary, #a8a8a8)',
  marginBottom: '4px',
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  height: '26px',
  padding: '2px 8px',
  backgroundColor: 'var(--color-bg-primary, #0d0d0d)',
  border: '1px solid #333333',
  color: 'var(--color-text-primary, #eaeaea)',
  fontSize: '12px',
  borderRadius: '0px',
  outline: 'none',
};

const stepperButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: 0,
  width: '14px',
  background: 'transparent',
  border: 'none',
  color: '#888888',
  fontSize: '7px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '24px',
  minHeight: '24px',
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: '0px',
  color: 'var(--color-text-secondary, #a8a8a8)',
  cursor: 'pointer',
  fontSize: '12px',
};

const nudgeStepBtnStyle: React.CSSProperties = {
  padding: '2px 5px',
  fontSize: '10px',
  fontWeight: 600,
  border: '1px solid',
  cursor: 'pointer',
  borderRadius: '0px',
};

const nudgeAxisBtnStyle: React.CSSProperties = {
  padding: '2px 4px',
  fontSize: '9px',
  fontFamily: 'monospace',
  backgroundColor: '#1e1e26',
  border: '1px solid #333333',
  color: '#cbd5e1',
  borderRadius: '0px',
  minWidth: '22px',
  cursor: 'pointer',
};

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  borderRadius: '0px',
  textAlign: 'center',
};
