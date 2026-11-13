// apps/web/src/editor/panels/BakeDialog.tsx
// Modal dialog for multi-placement Bake operation (Slice E3.8, SUBSPEC-D §2.4, SUBSPEC-G §6.4).
// Allows configuring overlap policy, in-place vs new placement, target placement list,
// and enforces atomic commit with full undo support.

import React, { useState, useEffect } from 'react';
import type { BakeController, OverlapPolicy } from './panels-controller.ts';

export interface BakeDialogProps {
  controller: BakeController;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function BakeDialog({ controller, isOpen, onClose, className }: BakeDialogProps): React.ReactElement | null {
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<string[]>([]);
  const [createNewPlacement, setCreateNewPlacement] = useState<boolean>(false);
  const [newPlacementName, setNewPlacementName] = useState<string>('Baked Result');
  const [overlapPolicy, setOverlapPolicy] = useState<OverlapPolicy>('top-wins');
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      const opts = controller.getOptions();
      const available = controller.getAvailablePlacements();
      setSelectedPlacementIds(opts.placementIds ?? available.map((p) => p.id));
      setCreateNewPlacement(opts.createNewPlacement ?? false);
      setNewPlacementName(opts.newPlacementName ?? 'Baked Result');
      setOverlapPolicy(opts.overlapPolicy ?? 'top-wins');
      setErrorMessage(null);
    }
  }, [isOpen, controller]);

  if (!isOpen) return null;

  const availablePlacements = controller.getAvailablePlacements();
  const lockedSelected = availablePlacements.filter(
    (p) => selectedPlacementIds.includes(p.id) && p.locked
  );

  const isInvalid = selectedPlacementIds.length < 2 || lockedSelected.length > 0;

  const handleTogglePlacement = (id: string) => {
    setSelectedPlacementIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedPlacementIds(availablePlacements.map((p) => p.id));
  };

  const handleExecuteBake = async () => {
    if (isInvalid || isExecuting) return;
    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const result = await controller.executeBake({
        placementIds: selectedPlacementIds,
        createNewPlacement,
        newPlacementName: newPlacementName.trim() || 'Baked Result',
        overlapPolicy,
      });

      if (!result.ok) {
        setErrorMessage(result.error?.message ?? 'Bake operation failed');
      } else {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected bake error');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="bake-dialog-title"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExecuting) {
          onClose();
        }
      }}
    >
      <div
        className={`bake-dialog ${className ?? ''}`}
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderBottom: '1px solid #3f3f46',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>⚡</span>
            <h2 id="bake-dialog-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              Bake Placements
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
          <p style={{ margin: 0, color: '#a1a1aa', fontSize: '12px', lineHeight: 1.5 }}>
            Consolidates overlapping voxel geometry into a static composite layer. Competing cells are resolved
            according to the chosen precedence policy.
          </p>

          {/* Overlap Policy Selector */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>
              Overlap Precedence Policy
            </label>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="overlapPolicy"
                  value="top-wins"
                  checked={overlapPolicy === 'top-wins'}
                  onChange={() => setOverlapPolicy('top-wins')}
                />
                <span>Top-wins (Higher layer overrides)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="overlapPolicy"
                  value="bottom-wins"
                  checked={overlapPolicy === 'bottom-wins'}
                  onChange={() => setOverlapPolicy('bottom-wins')}
                />
                <span>Bottom-wins (Lower layer overrides)</span>
              </label>
            </div>
          </div>

          {/* Bake Destination */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>
              Destination
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bakeMode"
                  checked={!createNewPlacement}
                  onChange={() => setCreateNewPlacement(false)}
                />
                <div>
                  <span style={{ fontWeight: 500 }}>Replace in-place</span>
                  <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                    Modifies existing placements directly by writing effective voxels.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bakeMode"
                  checked={createNewPlacement}
                  onChange={() => setCreateNewPlacement(true)}
                />
                <div>
                  <span style={{ fontWeight: 500 }}>Create new baked placement</span>
                  <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                    Creates a new consolidated placement, leaving source placements intact.
                  </div>
                </div>
              </label>

              {createNewPlacement && (
                <div style={{ marginLeft: '24px', marginTop: '4px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#a1a1aa', marginBottom: '4px' }}>
                    Placement Name:
                  </label>
                  <input
                    type="text"
                    value={newPlacementName}
                    onChange={(e) => setNewPlacementName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      backgroundColor: '#27272a',
                      border: '1px solid #3f3f46',
                      borderRadius: '4px',
                      color: '#f4f4f5',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Baked Result"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Target Placements Checklist */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontWeight: 600, fontSize: '12px' }}>
                Target Placements ({selectedPlacementIds.length} of {availablePlacements.length})
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Select All
              </button>
            </div>

            <div
              style={{
                maxHeight: '140px',
                overflowY: 'auto',
                backgroundColor: '#202023',
                border: '1px solid #333338',
                borderRadius: '4px',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {availablePlacements.map((p) => {
                const isSelected = selectedPlacementIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleTogglePlacement(p.id)}
                      />
                      <span style={{ fontSize: '12px', fontWeight: isSelected ? 500 : 400 }}>
                        {p.name}
                      </span>
                      {p.locked && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#f87171',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                          }}
                        >
                          Locked
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#71717a' }}>
                      {p.nonAirCount} voxels
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Validation & Error Messages */}
          {selectedPlacementIds.length < 2 && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                border: '1px solid #ca8a04',
                borderRadius: '4px',
                color: '#facc15',
                fontSize: '12px',
              }}
            >
              ⚠ Baking requires at least 2 placements selected.
            </div>
          )}

          {lockedSelected.length > 0 && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #dc2626',
                borderRadius: '4px',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              ✕ Cannot bake locked placement(s): {lockedSelected.map((p) => p.name).join(', ')}. Unlock them first.
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #dc2626',
                borderRadius: '4px',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              ✕ {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderTop: '1px solid #3f3f46',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            style={{
              padding: '6px 14px',
              backgroundColor: '#3f3f46',
              color: '#f4f4f5',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleExecuteBake()}
            disabled={isInvalid || isExecuting}
            style={{
              padding: '6px 16px',
              backgroundColor: isInvalid || isExecuting ? '#3f3f46' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isInvalid || isExecuting ? 'not-allowed' : 'pointer',
              opacity: isInvalid || isExecuting ? 0.6 : 1,
            }}
          >
            {isExecuting ? 'Baking…' : 'Bake Placements'}
          </button>
        </footer>
      </div>
    </div>
  );
}
