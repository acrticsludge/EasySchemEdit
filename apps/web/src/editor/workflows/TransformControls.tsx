// apps/web/src/editor/workflows/TransformControls.tsx
// Transform Controls React Panel & Gizmo Inspector (Slice E3.6, SUBSPEC-D §§3–5, SUBSPEC-G §6.1).
// Provides axis nudges, quick rotation/mirror, origin pivot editing, group transforms,
// and placement lock/hide/duplicate/delete actions.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Placement, Vec3Half, Vec3i } from '@easyschemedit/domain';
import {
  editorSessionStore,
  useEditorSession,
  EditorSessionStore,
} from '../session-store.ts';
import {
  PlacementOperationsController,
  type RotationY,
  type MirrorAxis,
} from './placement-ops.ts';

export interface TransformControlsProps {
  controller?: PlacementOperationsController;
  store?: EditorSessionStore;
  placementId?: string;
  selectedPlacementIds?: string[];
  className?: string;
  onClose?: () => void;
}

export function TransformControls({
  controller: propController,
  store = editorSessionStore,
  placementId,
  selectedPlacementIds,
  className,
  onClose,
}: TransformControlsProps): React.ReactElement {
  const sessionState = useEditorSession(store);
  const controller = useMemo(
    () => propController ?? new PlacementOperationsController(store),
    [propController, store]
  );

  // Determine active placement(s)
  const effectivePlacementIds = useMemo(() => {
    if (placementId) return [placementId];
    if (selectedPlacementIds && selectedPlacementIds.length > 0) return selectedPlacementIds;
    // Fall back to first placement if available
    const placements = sessionState.project.placements;
    return placements.length > 0 ? [placements[0]!.id] : [];
  }, [placementId, selectedPlacementIds, sessionState.project.placements]);

  const isGroup = effectivePlacementIds.length > 1;

  const currentPlacement = useMemo(() => {
    if (isGroup || effectivePlacementIds.length === 0) return null;
    return sessionState.project.placements.find((p) => p.id === effectivePlacementIds[0]) ?? null;
  }, [isGroup, effectivePlacementIds, sessionState.project.placements]);

  const groupPlacements = useMemo(() => {
    if (!isGroup) return [];
    return sessionState.project.placements.filter((p) => effectivePlacementIds.includes(p.id));
  }, [isGroup, effectivePlacementIds, sessionState.project.placements]);

  const anyLockedInGroup = useMemo(
    () => groupPlacements.some((p) => p.locked),
    [groupPlacements]
  );

  // Local state
  const [nudgeStep, setNudgeStep] = useState<1 | 16>(1);
  const [keepBlocksInPlace, setKeepBlocksInPlace] = useState(true);
  const [originX, setOriginX] = useState('0');
  const [originY, setOriginY] = useState('0');
  const [originZ, setOriginZ] = useState('0');
  const [originError, setOriginError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  // Sync origin inputs when active placement changes
  useEffect(() => {
    if (currentPlacement) {
      setOriginX((currentPlacement.origin[0] / 2).toString());
      setOriginY((currentPlacement.origin[1] / 2).toString());
      setOriginZ((currentPlacement.origin[2] / 2).toString());
      setNameValue(currentPlacement.name);
      setOriginError(null);
    }
  }, [currentPlacement?.id, currentPlacement?.origin, currentPlacement?.name]);

  // Handlers for single placement
  const handleNudge = useCallback(
    async (delta: Vec3i) => {
      if (!currentPlacement || currentPlacement.locked) return;
      await controller.nudgePlacement(currentPlacement.id, delta);
    },
    [controller, currentPlacement]
  );

  const handleRotateStep = useCallback(
    async (dir: 'cw' | 'ccw') => {
      if (!currentPlacement || currentPlacement.locked) return;
      await controller.rotatePlacementStep(currentPlacement.id, dir);
    },
    [controller, currentPlacement]
  );

  const handleRotate180 = useCallback(async () => {
    if (!currentPlacement || currentPlacement.locked) return;
    const current = currentPlacement.transform.rotationY ?? 0;
    const next: RotationY = ((current + 180) % 360) as RotationY;
    await controller.rotatePlacement(currentPlacement.id, next);
  }, [controller, currentPlacement]);

  const handleMirror = useCallback(
    async (mirror: MirrorAxis) => {
      if (!currentPlacement || currentPlacement.locked) return;
      await controller.mirrorPlacement(currentPlacement.id, mirror);
    },
    [controller, currentPlacement]
  );

  const handleApplyOrigin = useCallback(async () => {
    if (!currentPlacement || currentPlacement.locked) return;
    setOriginError(null);

    const x = parseFloat(originX);
    const y = parseFloat(originY);
    const z = parseFloat(originZ);

    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      setOriginError('Invalid number coordinates');
      return;
    }

    const halfX = Math.round(x * 2);
    const halfY = Math.round(y * 2);
    const halfZ = Math.round(z * 2);

    const originVec: Vec3Half = [halfX, halfY, halfZ];
    const res = await controller.setPlacementOrigin(
      currentPlacement.id,
      originVec,
      keepBlocksInPlace
    );

    if (!res.ok) {
      if (res.error?.code === 'ENGINE_OFF_GRID_TRANSFORM') {
        setOriginError('Half-block (.5) origin off-grid under integer translation');
      } else {
        setOriginError(res.error?.message ?? 'Failed to set origin');
      }
    }
  }, [controller, currentPlacement, originX, originY, originZ, keepBlocksInPlace]);

  const handleCenterOrigin = useCallback(async () => {
    if (!currentPlacement || currentPlacement.locked) return;
    setOriginError(null);
    const res = await controller.centerPlacementOrigin(
      currentPlacement.id,
      keepBlocksInPlace
    );
    if (!res.ok) {
      setOriginError(res.error?.message ?? 'Failed to center origin');
    }
  }, [controller, currentPlacement, keepBlocksInPlace]);

  const handleRenameSubmit = useCallback(async () => {
    if (!currentPlacement || currentPlacement.locked) {
      setEditingName(false);
      return;
    }
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== currentPlacement.name) {
      await controller.renamePlacement(currentPlacement.id, trimmed);
    }
    setEditingName(false);
  }, [controller, currentPlacement, nameValue]);

  // Group handlers
  const handleGroupNudge = useCallback(
    async (delta: Vec3i) => {
      if (anyLockedInGroup || effectivePlacementIds.length === 0) return;
      await controller.transformGroup(effectivePlacementIds, { translation: delta });
    },
    [controller, anyLockedInGroup, effectivePlacementIds]
  );

  const handleGroupRotate = useCallback(
    async (rot: RotationY) => {
      if (anyLockedInGroup || effectivePlacementIds.length === 0) return;
      await controller.transformGroup(effectivePlacementIds, { rotationY: rot });
    },
    [controller, anyLockedInGroup, effectivePlacementIds]
  );

  const handleGroupMirror = useCallback(
    async (mirror: MirrorAxis) => {
      if (anyLockedInGroup || effectivePlacementIds.length === 0) return;
      await controller.transformGroup(effectivePlacementIds, { mirror });
    },
    [controller, anyLockedInGroup, effectivePlacementIds]
  );

  // Group pivot display
  const groupPivotDisplay = useMemo(() => {
    if (!isGroup) return null;
    const pivot = controller.computeGroupPivot(effectivePlacementIds);
    if (!pivot) return '[0, 0, 0]';
    return `[${(pivot[0] / 2).toFixed(1)}, ${(pivot[1] / 2).toFixed(1)}, ${(pivot[2] / 2).toFixed(1)}]`;
  }, [isGroup, controller, effectivePlacementIds]);

  if (!isGroup && !currentPlacement) {
    return (
      <div
        className={className}
        data-testid="transform-controls"
        style={{
          padding: '12px',
          background: 'transparent',
          color: '#a1a1aa',
          borderRadius: 0,
          border: 'none',
          fontSize: '13px',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ margin: 0 }}>No placement selected</p>
      </div>
    );
  }

  const isLocked = !isGroup && (currentPlacement?.locked ?? false);

  return (
    <div
      className={className}
      data-testid="transform-controls"
      role="region"
      aria-label="Placement Transform Controls"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px',
        background: 'transparent',
        color: '#fafafa',
        borderRadius: 0,
        border: 'none',
        fontSize: '13px',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #27272a',
          paddingBottom: '10px',
        }}
      >
        {isGroup ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
              Group Transform
            </div>
            <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
              {groupPlacements.length} placements selected
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {editingName ? (
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
                style={{
                  background: '#27272a',
                  color: '#fafafa',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '13px',
                  width: '100%',
                }}
              />
            ) : (
              <span
                onClick={() => !isLocked && setEditingName(true)}
                title={isLocked ? 'Locked' : 'Click to rename'}
                style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: isLocked ? 'default' : 'pointer',
                  borderBottom: isLocked ? 'none' : '1px dashed #52525b',
                }}
              >
                {currentPlacement?.name}
              </span>
            )}
            {isLocked && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                }}
              >
                Locked
              </span>
            )}
            {!currentPlacement?.visible && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  background: 'rgba(161, 161, 170, 0.2)',
                  color: '#a1a1aa',
                  border: '1px solid #52525b',
                  borderRadius: '4px',
                }}
              >
                Hidden
              </span>
            )}
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px 6px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Group Transform View */}
      {isGroup ? (
        <div data-testid="group-transform-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {anyLockedInGroup && (
            <div
              style={{
                padding: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              ⚠️ One or more selected placements are locked. Unlock to transform.
            </div>
          )}

          {/* Group Pivot */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa' }}>
            <span>Group Pivot:</span>
            <span style={{ fontFamily: 'monospace', color: '#fafafa' }}>{groupPivotDisplay}</span>
          </div>

          {/* Step Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Nudge Step:</span>
            <button
              type="button"
              onClick={() => setNudgeStep(1)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #3f3f46',
                background: nudgeStep === 1 ? '#3b82f6' : '#27272a',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              1 Block
            </button>
            <button
              type="button"
              onClick={() => setNudgeStep(16)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #3f3f46',
                background: nudgeStep === 16 ? '#3b82f6' : '#27272a',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              16 (Chunk)
            </button>
          </div>

          {/* Group Nudge Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([-nudgeStep, 0, 0])}
              style={buttonStyle(anyLockedInGroup)}
            >
              -{nudgeStep}X
            </button>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([0, -nudgeStep, 0])}
              style={buttonStyle(anyLockedInGroup)}
            >
              -{nudgeStep}Y
            </button>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([0, 0, -nudgeStep])}
              style={buttonStyle(anyLockedInGroup)}
            >
              -{nudgeStep}Z
            </button>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([nudgeStep, 0, 0])}
              style={buttonStyle(anyLockedInGroup)}
            >
              +{nudgeStep}X
            </button>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([0, nudgeStep, 0])}
              style={buttonStyle(anyLockedInGroup)}
            >
              +{nudgeStep}Y
            </button>
            <button
              type="button"
              disabled={anyLockedInGroup}
              onClick={() => handleGroupNudge([0, 0, nudgeStep])}
              style={buttonStyle(anyLockedInGroup)}
            >
              +{nudgeStep}Z
            </button>
          </div>

          {/* Group Rotate & Mirror */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Rotate & Mirror Group:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={anyLockedInGroup}
                onClick={() => handleGroupRotate(90)}
                style={buttonStyle(anyLockedInGroup, { flex: 1 })}
              >
                90° CW
              </button>
              <button
                type="button"
                disabled={anyLockedInGroup}
                onClick={() => handleGroupRotate(270)}
                style={buttonStyle(anyLockedInGroup, { flex: 1 })}
              >
                90° CCW
              </button>
              <button
                type="button"
                disabled={anyLockedInGroup}
                onClick={() => handleGroupRotate(180)}
                style={buttonStyle(anyLockedInGroup, { flex: 1 })}
              >
                180°
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={anyLockedInGroup}
                onClick={() => handleGroupMirror('x')}
                style={buttonStyle(anyLockedInGroup, { flex: 1 })}
              >
                Mirror X
              </button>
              <button
                type="button"
                disabled={anyLockedInGroup}
                onClick={() => handleGroupMirror('z')}
                style={buttonStyle(anyLockedInGroup, { flex: 1 })}
              >
                Mirror Z
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Single Placement View */
        <>
          {/* World Position Display */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#a1a1aa',
            }}
          >
            <span>Translation:</span>
            <span style={{ fontFamily: 'monospace', color: '#fafafa' }}>
              [{currentPlacement?.transform.translation.join(', ')}]
            </span>
          </div>

          {/* Step Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Nudge Step:</span>
            <button
              type="button"
              onClick={() => setNudgeStep(1)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #3f3f46',
                background: nudgeStep === 1 ? '#3b82f6' : '#27272a',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              1 Block
            </button>
            <button
              type="button"
              onClick={() => setNudgeStep(16)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #3f3f46',
                background: nudgeStep === 16 ? '#3b82f6' : '#27272a',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              16 (Chunk)
            </button>
          </div>

          {/* Axis Nudge Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button
              type="button"
              data-testid="nudge-x-minus"
              disabled={isLocked}
              onClick={() => handleNudge([-nudgeStep, 0, 0])}
              style={buttonStyle(isLocked)}
            >
              -{nudgeStep}X
            </button>
            <button
              type="button"
              data-testid="nudge-y-minus"
              disabled={isLocked}
              onClick={() => handleNudge([0, -nudgeStep, 0])}
              style={buttonStyle(isLocked)}
            >
              -{nudgeStep}Y
            </button>
            <button
              type="button"
              data-testid="nudge-z-minus"
              disabled={isLocked}
              onClick={() => handleNudge([0, 0, -nudgeStep])}
              style={buttonStyle(isLocked)}
            >
              -{nudgeStep}Z
            </button>
            <button
              type="button"
              data-testid="nudge-x-plus"
              disabled={isLocked}
              onClick={() => handleNudge([nudgeStep, 0, 0])}
              style={buttonStyle(isLocked)}
            >
              +{nudgeStep}X
            </button>
            <button
              type="button"
              data-testid="nudge-y-plus"
              disabled={isLocked}
              onClick={() => handleNudge([0, nudgeStep, 0])}
              style={buttonStyle(isLocked)}
            >
              +{nudgeStep}Y
            </button>
            <button
              type="button"
              data-testid="nudge-z-plus"
              disabled={isLocked}
              onClick={() => handleNudge([0, 0, nudgeStep])}
              style={buttonStyle(isLocked)}
            >
              +{nudgeStep}Z
            </button>
          </div>

          {/* Quick Rotate & Mirror */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#a1a1aa' }}>Rotation:</span>
              <span style={{ fontWeight: 600 }}>{currentPlacement?.transform.rotationY ?? 0}°</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                data-testid="rotate-cw"
                disabled={isLocked}
                onClick={() => handleRotateStep('cw')}
                style={buttonStyle(isLocked, { flex: 1 })}
              >
                90° CW
              </button>
              <button
                type="button"
                data-testid="rotate-ccw"
                disabled={isLocked}
                onClick={() => handleRotateStep('ccw')}
                style={buttonStyle(isLocked, { flex: 1 })}
              >
                90° CCW
              </button>
              <button
                type="button"
                data-testid="rotate-180"
                disabled={isLocked}
                onClick={handleRotate180}
                style={buttonStyle(isLocked, { flex: 1 })}
              >
                180°
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: '#a1a1aa' }}>Mirror:</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {currentPlacement?.transform.mirror ?? 'none'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                data-testid="mirror-none"
                disabled={isLocked}
                onClick={() => handleMirror('none')}
                style={buttonStyle(
                  isLocked,
                  currentPlacement?.transform.mirror === 'none'
                    ? { flex: 1, borderColor: '#3b82f6', color: '#60a5fa' }
                    : { flex: 1 }
                )}
              >
                None
              </button>
              <button
                type="button"
                data-testid="mirror-x"
                disabled={isLocked}
                onClick={() => handleMirror('x')}
                style={buttonStyle(
                  isLocked,
                  currentPlacement?.transform.mirror === 'x'
                    ? { flex: 1, borderColor: '#3b82f6', color: '#60a5fa' }
                    : { flex: 1 }
                )}
              >
                Mirror X
              </button>
              <button
                type="button"
                data-testid="mirror-z"
                disabled={isLocked}
                onClick={() => handleMirror('z')}
                style={buttonStyle(
                  isLocked,
                  currentPlacement?.transform.mirror === 'z'
                    ? { flex: 1, borderColor: '#3b82f6', color: '#60a5fa' }
                    : { flex: 1 }
                )}
              >
                Mirror Z
              </button>
            </div>
          </div>

          {/* Origin Pivot Editor */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              paddingTop: '8px',
              borderTop: '1px solid #27272a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Origin Pivot (Local):</span>
              <button
                type="button"
                data-testid="center-origin"
                disabled={isLocked}
                onClick={handleCenterOrigin}
                style={{
                  background: 'transparent',
                  border: '1px solid #3f3f46',
                  color: isLocked ? '#52525b' : '#38bdf8',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                }}
              >
                Center Origin
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', color: '#71717a' }}>X</label>
                <input
                  type="number"
                  step="0.5"
                  data-testid="origin-x"
                  disabled={isLocked}
                  value={originX}
                  onChange={(e) => setOriginX(e.target.value)}
                  style={inputStyle(isLocked)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', color: '#71717a' }}>Y</label>
                <input
                  type="number"
                  step="0.5"
                  data-testid="origin-y"
                  disabled={isLocked}
                  value={originY}
                  onChange={(e) => setOriginY(e.target.value)}
                  style={inputStyle(isLocked)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', color: '#71717a' }}>Z</label>
                <input
                  type="number"
                  step="0.5"
                  data-testid="origin-z"
                  disabled={isLocked}
                  value={originZ}
                  onChange={(e) => setOriginZ(e.target.value)}
                  style={inputStyle(isLocked)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleApplyOrigin}
                  style={buttonStyle(isLocked, { padding: '4px 10px', height: '28px' })}
                >
                  Apply
                </button>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                color: '#a1a1aa',
                cursor: 'pointer',
                marginTop: '2px',
              }}
            >
              <input
                type="checkbox"
                data-testid="keep-blocks-in-place"
                checked={keepBlocksInPlace}
                onChange={(e) => setKeepBlocksInPlace(e.target.checked)}
              />
              Keep blocks in place (adjust translation)
            </label>

            {originError && (
              <div
                style={{
                  fontSize: '11px',
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #ef4444',
                }}
              >
                {originError}
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Bar (Lock / Hide / Duplicate / Delete) */}
      {!isGroup && currentPlacement && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            paddingTop: '10px',
            borderTop: '1px solid #27272a',
          }}
        >
          <button
            type="button"
            data-testid="btn-lock"
            onClick={() => controller.setPlacementLocked(currentPlacement.id, !currentPlacement.locked)}
            style={{
              ...buttonStyle(false),
              color: currentPlacement.locked ? '#f87171' : '#a1a1aa',
              borderColor: currentPlacement.locked ? '#ef4444' : '#3f3f46',
            }}
          >
            {currentPlacement.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            data-testid="btn-hide"
            onClick={() => controller.setPlacementHidden(currentPlacement.id, currentPlacement.visible)}
            style={{
              ...buttonStyle(false),
              color: !currentPlacement.visible ? '#fbbf24' : '#a1a1aa',
            }}
          >
            {currentPlacement.visible ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            data-testid="btn-duplicate"
            disabled={isLocked}
            onClick={() => controller.duplicatePlacement(currentPlacement.id, [1, 0, 1])}
            style={buttonStyle(isLocked)}
          >
            Duplicate
          </button>
          <button
            type="button"
            data-testid="btn-delete"
            disabled={isLocked}
            onClick={() => controller.deletePlacement(currentPlacement.id)}
            style={{
              ...buttonStyle(isLocked),
              color: isLocked ? '#52525b' : '#ef4444',
              borderColor: isLocked ? '#27272a' : '#ef4444',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function buttonStyle(disabled: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #3f3f46',
    background: '#27272a',
    color: disabled ? '#52525b' : '#fafafa',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    opacity: disabled ? 0.6 : 1,
    transition: 'background 0.1s, border-color 0.1s',
    ...extra,
  };
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid #3f3f46',
    background: '#18181b',
    color: disabled ? '#52525b' : '#fafafa',
    fontSize: '12px',
    fontFamily: 'monospace',
  };
}
