// apps/web/src/editor/layout/InspectorPanel.tsx
// Right dock panel: selected placement transform, origin editor, rotation/mirror controls, stats.
// Precision-instrument styling; logic adheres to SUBSPEC-G section 6.3, G3.

import React, { useState, useEffect } from 'react';
import type { EditorSessionStore } from '../session-store.ts';
import type { WorkspaceControllers } from './layout-bridge.ts';
import type { Rotation, MirrorAxis } from '@easyschemedit/ui';
import { Icon } from '../ui/index.ts';

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
            <span style={panelTitleStyle}>INSPECTOR</span>
            {onCollapse && (
              <button type="button" onClick={onCollapse} title="Collapse Inspector" style={iconButtonStyle}>
                <Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
        )}
        <div
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: '12px',
          }}
        >
          No placement selected.
          <br />
          <span style={{ fontSize: '11px', marginTop: '8px', display: 'block', color: 'var(--text-faint)' }}>
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
          <span style={panelTitleStyle}>INSPECTOR</span>
          {onCollapse && (
            <button type="button" onClick={onCollapse} title="Collapse Inspector" style={iconButtonStyle}>
              <Icon name="chevronRight" size={16} />
            </button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {/* Placement Name */}
        <div style={{ marginBottom: '12px' }}>
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
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={labelStyle}>Position (X, Y, Z)</label>
            <span style={unitStyle}>Blocks</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
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

          {/* Quick Nudge (1 / 16) Row */}
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px',
              backgroundColor: 'var(--ink-900)',
              padding: '4px 8px',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={unitStyle}>Nudge</span>
              <button
                type="button"
                onClick={() => setNudgeStep(1)}
                title="Nudge step: 1 block"
                style={{
                  ...nudgeStepBtnStyle,
                  backgroundColor: nudgeStep === 1 ? 'var(--signal-wash)' : 'var(--ink-800)',
                  color: nudgeStep === 1 ? 'var(--signal)' : 'var(--text-dim)',
                  borderColor: nudgeStep === 1 ? 'var(--signal)' : 'var(--line)',
                  fontWeight: nudgeStep === 1 ? 600 : 400,
                }}
              >
                1
              </button>
              <button
                type="button"
                onClick={() => setNudgeStep(16)}
                title="Nudge step: 16 blocks (Chunk)"
                style={{
                  ...nudgeStepBtnStyle,
                  backgroundColor: nudgeStep === 16 ? 'var(--signal-wash)' : 'var(--ink-800)',
                  color: nudgeStep === 16 ? 'var(--signal)' : 'var(--text-dim)',
                  borderColor: nudgeStep === 16 ? 'var(--signal)' : 'var(--line)',
                  fontWeight: nudgeStep === 16 ? 600 : 400,
                }}
              >
                16
              </button>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div key={axis} style={{ display: 'flex', gap: '2px' }}>
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
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={labelStyle}>Origin / Pivot</label>
            <span style={unitStyle}>Half-blocks allowed</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
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
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-dim)',
              marginTop: '8px',
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
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={labelStyle}>Rotation Y</label>
            <span style={unitStyle}>degrees</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {([0, 90, 180, 270] as const).map((r) => {
              const isActive = rot === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSetRotation(r)}
                  disabled={placement.locked}
                  title={`${r} degrees`}
                  style={{
                    ...numericSegmentStyle,
                    height: '28px',
                    backgroundColor: isActive ? 'var(--signal-wash)' : 'var(--ink-900)',
                    color: isActive ? 'var(--signal)' : 'var(--text)',
                    borderColor: isActive ? 'var(--signal)' : 'var(--line)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: placement.locked ? 'default' : 'pointer',
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mirror */}
        <div style={{ marginBottom: '12px' }}>
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
                    ...numericSegmentStyle,
                    height: '28px',
                    backgroundColor: isActive ? 'var(--signal-wash)' : 'var(--ink-900)',
                    color: isActive ? 'var(--signal)' : 'var(--text)',
                    borderColor: isActive ? 'var(--signal)' : 'var(--line)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: placement.locked ? 'default' : 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--line)', margin: '12px 0' }} />

        {/* Placement Info / Stats */}
        <div>
          <label style={{ ...labelStyle, marginBottom: '8px' }}>Metadata & Dimensions</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px' }}>
            <StatRow label="Size (W x H x D)" value={`${w} x ${h} x ${d}`} />
            <StatRow label="Non-Air Blocks" value={nonAirCount.toLocaleString()} />
            <StatRow label="Chunks" value={chunksCount.toString()} />
            <StatRow label="State" value={placement.locked ? 'Locked' : 'Unlocked'} />
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--line)', margin: '12px 0' }} />

        {/* Placement Actions: Duplicate Side-by-Side, Lock, Delete */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ ...labelStyle, marginBottom: '8px' }}>Actions</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              type="button"
              onClick={handleDuplicatePlacement}
              disabled={placement.locked}
              title="Duplicate Side-by-Side (Ctrl+D)"
              aria-label="Duplicate Side-by-Side (Ctrl+D)"
              style={{
                ...actionButtonStyle,
                padding: '8px',
                backgroundColor: 'var(--ink-900)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
                cursor: placement.locked ? 'not-allowed' : 'pointer',
                opacity: placement.locked ? 0.4 : 1,
              }}
            >
              <Icon name="duplicate" size={16} /> Duplicate Side-by-Side
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <button
                type="button"
                onClick={handleToggleLock}
                title={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                aria-label={placement.locked ? 'Unlock Placement' : 'Lock Placement'}
                style={{
                  ...actionButtonStyle,
                  padding: '4px 8px',
                  backgroundColor: 'var(--ink-900)',
                  border: '1px solid var(--line)',
                  color: placement.locked ? 'var(--warn)' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <Icon name={placement.locked ? 'unlock' : 'lock'} size={16} /> {placement.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                onClick={handleDeletePlacement}
                disabled={placement.locked}
                title="Delete Placement"
                aria-label="Delete Placement"
                style={{
                  ...actionButtonStyle,
                  padding: '4px 8px',
                  backgroundColor: 'var(--ink-900)',
                  border: '1px solid var(--line)',
                  color: 'var(--danger)',
                  cursor: placement.locked ? 'not-allowed' : 'pointer',
                  opacity: placement.locked ? 0.4 : 1,
                }}
              >
                <Icon name="trash" size={16} /> Delete
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
        background: 'var(--ink-900)',
        border: '1px solid var(--line)',
        height: '28px',
      }}
    >
      <span
        style={{
          padding: '0 4px',
          fontSize: '11px',
          color: 'var(--text-faint)',
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
          ...numericStyle,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          textAlign: 'right',
          paddingRight: '4px',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--line)' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + step)}
          style={stepperButtonStyle}
          aria-label="Step up"
        >
          <Icon name="chevronUp" size={12} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value - step)}
          style={stepperButtonStyle}
          aria-label="Step down"
        >
          <Icon name="chevronDown" size={12} />
        </button>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '4px 8px',
        background: 'var(--ink-900)',
        border: '1px solid var(--line)',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{label}</div>
      <div style={{ ...numericStyle, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const numericStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
  fontSize: '12px',
  color: 'var(--text)',
};

const panelContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  backgroundColor: 'var(--ink-850)',
  borderLeft: '1px solid var(--line)',
  color: 'var(--text)',
  fontSize: '12px',
  overflow: 'hidden',
  userSelect: 'none',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '32px',
  padding: '0 12px',
  borderBottom: '1px solid var(--line)',
  backgroundColor: 'var(--ink-900)',
  flexShrink: 0,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: '4px',
};

const unitStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-faint)',
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  height: '28px',
  padding: '0 8px',
  backgroundColor: 'var(--ink-900)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  fontSize: '12px',
};

const numericSegmentStyle: React.CSSProperties = {
  ...numericStyle,
  border: '1px solid',
  cursor: 'pointer',
};

const stepperButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: 0,
  width: '14px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
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
  color: 'var(--text-dim)',
  cursor: 'pointer',
};

const nudgeStepBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  border: '1px solid',
  cursor: 'pointer',
  fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
};

const nudgeAxisBtnStyle: React.CSSProperties = {
  ...numericStyle,
  padding: '4px',
  backgroundColor: 'var(--ink-800)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  minWidth: '28px',
  cursor: 'pointer',
};

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontSize: '12px',
  textAlign: 'center',
};
