// apps/web/src/editor/tools/BlockPickerPanel.tsx
// React UI panel for 1.21.11 block search, block state property editor, and region operation toolbar.
// Connects SelectionToolController, RegionToolsController, and BrowserAssetManager to EditorSessionStore (SUBSPEC-D §7).

import React, { useState, useMemo, useCallback } from 'react';
import type { Bounds3i, Vec3i } from '@easyschemedit/domain';
import {
  editorSessionStore,
  useEditorSession,
  type EditorSessionStore,
} from '../session-store.ts';
import {
  SelectionToolController,
  type SelectionDimensions,
} from './selection-tool.ts';
import {
  RegionToolsController,
  DEFAULT_1_21_11_BLOCKS,
  formatBlockStateString,
  parseBlockStateString,
  toBlockStateId,
} from './region-tools.ts';

export interface BlockPickerPanelProps {
  store?: EditorSessionStore;
  selectionTool?: SelectionToolController;
  regionTools?: RegionToolsController;
  availableBlocks?: string[];
  initialSelectedBlock?: string;
  onSelectBlock?: (blockState: string) => void;
  className?: string;
}

const COMMON_PROPERTY_KEYS = [
  'facing',
  'axis',
  'half',
  'waterlogged',
  'lit',
  'open',
  'powered',
  'shape',
  'type',
  'snowy',
];

const COMMON_PROPERTY_VALUES: Record<string, string[]> = {
  facing: ['north', 'south', 'east', 'west', 'up', 'down'],
  axis: ['x', 'y', 'z'],
  half: ['top', 'bottom', 'upper', 'lower'],
  waterlogged: ['true', 'false'],
  lit: ['true', 'false'],
  open: ['true', 'false'],
  powered: ['true', 'false'],
  shape: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
};

export const BlockPickerPanel: React.FC<BlockPickerPanelProps> = ({
  store = editorSessionStore,
  selectionTool: propSelectionTool,
  regionTools: propRegionTools,
  availableBlocks,
  initialSelectedBlock = 'minecraft:stone',
  onSelectBlock,
  className = '',
}) => {
  // Subscribe to reactive session state (revision, undo/redo availability)
  const sessionState = useEditorSession(store);

  // Initialize controllers
  const selectionTool = useMemo(
    () => propSelectionTool ?? new SelectionToolController(store),
    [propSelectionTool, store]
  );

  const regionTools = useMemo(
    () => propRegionTools ?? new RegionToolsController(store, selectionTool),
    [propRegionTools, store, selectionTool]
  );

  // Block search & selection state
  const [searchTerm, setSearchTerm] = useState('');
  const initialParsed = useMemo(
    () => parseBlockStateString(initialSelectedBlock),
    [initialSelectedBlock]
  );
  const [selectedBaseId, setSelectedBaseId] = useState(initialParsed.baseId);
  const [properties, setProperties] = useState<Record<string, string>>({
    ...initialParsed.properties,
  });

  // Property addition state
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropValue, setNewPropValue] = useState('');

  // Region operation parameters
  const [replaceMatcher, setReplaceMatcher] = useState('minecraft:stone');
  const [preserveProperties, setPreserveProperties] = useState(false);
  const [shellThickness, setShellThickness] = useState(1);
  const [includeTop, setIncludeTop] = useState(true);
  const [includeBottom, setIncludeBottom] = useState(true);
  const [moveOffset, setMoveOffset] = useState<Vec3i>([0, 1, 0]);
  const [pasteTarget, setPasteTarget] = useState<Vec3i>([0, 0, 0]);
  const [skipAir, setSkipAir] = useState(false);

  // Status & progress
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Compute merged available blocks
  const allBlocks = useMemo(() => {
    const list =
      availableBlocks && availableBlocks.length > 0
        ? [...availableBlocks]
        : [...DEFAULT_1_21_11_BLOCKS];
    const unique = Array.from(new Set(list));
    unique.sort();
    return unique;
  }, [availableBlocks]);

  // Filtered blocks based on search term
  const filteredBlocks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allBlocks.slice(0, 80);
    return allBlocks
      .filter((b) => b.toLowerCase().includes(term))
      .slice(0, 80);
  }, [allBlocks, searchTerm]);

  // Current canonical block state string
  const currentBlockStateString = useMemo(() => {
    return formatBlockStateString(selectedBaseId, properties);
  }, [selectedBaseId, properties]);

  // Notify parent of block selection change
  const handleSelectBaseBlock = useCallback(
    (blockId: string) => {
      setSelectedBaseId(blockId);
      const formatted = formatBlockStateString(blockId, properties);
      onSelectBlock?.(formatted);
    },
    [properties, onSelectBlock]
  );

  const handleAddProperty = useCallback(() => {
    const k = newPropKey.trim().toLowerCase();
    const v = newPropValue.trim().toLowerCase();
    if (!k || !v) return;

    const nextProps = { ...properties, [k]: v };
    setProperties(nextProps);
    setNewPropKey('');
    setNewPropValue('');

    const formatted = formatBlockStateString(selectedBaseId, nextProps);
    onSelectBlock?.(formatted);
  }, [newPropKey, newPropValue, properties, selectedBaseId, onSelectBlock]);

  const handleRemoveProperty = useCallback(
    (keyToRemove: string) => {
      const nextProps = { ...properties };
      delete nextProps[keyToRemove];
      setProperties(nextProps);

      const formatted = formatBlockStateString(selectedBaseId, nextProps);
      onSelectBlock?.(formatted);
    },
    [properties, selectedBaseId, onSelectBlock]
  );

  // Active bounds & dimensions
  const activeBounds = selectionTool.getActiveBounds();
  const dimensions: SelectionDimensions | null = activeBounds
    ? selectionTool.getDimensions(activeBounds)
    : null;

  // Region operation execution wrapper
  const executeOperation = async (
    name: string,
    action: () => Promise<{ ok: boolean; error?: { message: string }; changedCells?: number }>
  ) => {
    setIsExecuting(true);
    setStatusMessage(`Executing ${name}...`);
    try {
      const result = await action();
      if (result.ok) {
        const count = result.changedCells !== undefined ? ` (${result.changedCells} cells changed)` : '';
        setStatusMessage(`✓ ${name} succeeded${count}`);
      } else {
        setStatusMessage(`✕ ${name} failed: ${result.error?.message ?? 'Unknown error'}`);
      }
    } catch (err: any) {
      setStatusMessage(`✕ ${name} error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className={`easy-schem-block-picker-panel ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'transparent',
        color: 'var(--text)',
        padding: '12px',
        borderRadius: 0,
        border: 'none',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '8px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--signal)' }}>
          Block & Region Tools
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            disabled={!sessionState.canUndo || isExecuting}
            onClick={() => store.undo()}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid var(--line-strong)',
              background: sessionState.canUndo ? 'var(--ink-700)' : 'var(--ink-850)',
              color: sessionState.canUndo ? 'var(--text)' : 'var(--text-faint)',
              cursor: sessionState.canUndo ? 'pointer' : 'default',
            }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!sessionState.canRedo || isExecuting}
            onClick={() => store.redo()}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid var(--line-strong)',
              background: sessionState.canRedo ? 'var(--ink-700)' : 'var(--ink-850)',
              color: sessionState.canRedo ? 'var(--text)' : 'var(--text-faint)',
              cursor: sessionState.canRedo ? 'pointer' : 'default',
            }}
          >
            Redo
          </button>
        </div>
      </div>

      {/* Active Selection Info */}
      <div
        style={{
          background: 'var(--ink-900)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-dim)', fontSize: '11px', marginBottom: '4px' }}>
          ACTIVE CUBOID SELECTION
        </div>
        {activeBounds && dimensions ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>
                Min: [{activeBounds.min.join(', ')}]
              </span>
              <span>
                Max: [{activeBounds.maxExclusive.join(', ')}]
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--ok)',
                marginTop: '4px',
              }}
            >
              <span>
                Size: {dimensions.width} × {dimensions.height} × {dimensions.length}
              </span>
              <span>Volume: {dimensions.volume.toLocaleString()} blocks</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px' }}>
            No active selection. Set corners or select a placement.
          </div>
        )}
      </div>

      {/* 1.21.11 Block Search & Palette */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <label htmlFor="block-search" style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
            1.21.11 Block Selector
          </label>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
            {allBlocks.length} available
          </span>
        </div>
        <input
          id="block-search"
          type="text"
          placeholder="Search blocks (e.g. stone, planks, copper)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: '4px',
            border: '1px solid var(--line-strong)',
            background: 'var(--ink-900)',
            color: 'var(--text)',
            fontSize: '12px',
            boxSizing: 'border-box',
            marginBottom: '6px',
          }}
        />
        <div
          style={{
            maxHeight: '120px',
            overflowY: 'auto',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            background: 'var(--ink-900)',
          }}
        >
          {filteredBlocks.map((b) => {
            const isSelected = b === selectedBaseId;
            return (
              <div
                key={b}
                onClick={() => handleSelectBaseBlock(b)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--signal-wash)' : 'transparent',
                  color: isSelected ? 'var(--signal)' : 'var(--text)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {b}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Block & Property Editor */}
      <div
        style={{
          background: 'var(--ink-900)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>
          BLOCK STATE PROPERTIES
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: 'var(--signal)',
            background: 'var(--ink-850)',
            padding: '5px 8px',
            borderRadius: '4px',
            marginBottom: '8px',
            wordBreak: 'break-all',
          }}
        >
          {currentBlockStateString}
        </div>

        {/* Property list */}
        {Object.keys(properties).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {Object.entries(properties).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--ink-850)',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
              >
                <span>
                  <strong style={{ color: 'var(--signal)' }}>{k}</strong> ={' '}
                  <span style={{ color: 'var(--warn)' }}>{v}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveProperty(k)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '0 4px',
                  }}
                  title="Remove property"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Property Inputs */}
        <div style={{ display: 'flex', gap: '4px', minWidth: 0 }}>
          <input
            type="text"
            placeholder="key (e.g. facing)"
            value={newPropKey}
            list="common-prop-keys"
            onChange={(e) => setNewPropKey(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid var(--line-strong)',
              background: 'var(--ink-850)',
              color: 'var(--text)',
            }}
          />
          <datalist id="common-prop-keys">
            {COMMON_PROPERTY_KEYS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>

          <input
            type="text"
            placeholder="value (e.g. north)"
            value={newPropValue}
            list={COMMON_PROPERTY_VALUES[newPropKey] ? `val-${newPropKey}` : undefined}
            onChange={(e) => setNewPropValue(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid var(--line-strong)',
              background: 'var(--ink-850)',
              color: 'var(--text)',
            }}
          />
          {COMMON_PROPERTY_VALUES[newPropKey] && (
            <datalist id={`val-${newPropKey}`}>
              {COMMON_PROPERTY_VALUES[newPropKey].map((val) => (
                <option key={val} value={val} />
              ))}
            </datalist>
          )}

          <button
            type="button"
            onClick={handleAddProperty}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid var(--signal)',
              background: 'var(--signal)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Region Action Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
          Region Operations
        </div>

        {/* Fill, Hollow, Walls, Delete */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() =>
              executeOperation('Fill', () =>
                regionTools.fill(toBlockStateId(currentBlockStateString))
              )
            }
            style={{
              padding: '7px',
              background: 'var(--ok)',
              border: '1px solid var(--ok)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '12px',
            }}
          >
            Fill Region
          </button>

          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() =>
              executeOperation('Walls', () =>
                regionTools.walls(toBlockStateId(currentBlockStateString), {
                  includeTop,
                  includeBottom,
                })
              )
            }
            style={{
              padding: '7px',
              background: 'var(--signal)',
              border: '1px solid var(--signal)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '12px',
            }}
          >
            Walls
          </button>

          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() =>
              executeOperation('Hollow', () =>
                regionTools.hollow({ shellThickness })
              )
            }
            style={{
              padding: '7px',
              background: 'var(--signal)',
              border: '1px solid var(--signal)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '12px',
            }}
          >
            Hollow ({shellThickness})
          </button>

          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() =>
              executeOperation('Delete Region', () => regionTools.deleteRegion())
            }
            style={{
              padding: '7px',
              background: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontWeight: 600,
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '12px',
            }}
          >
            Delete
          </button>
        </div>

        {/* Replace section */}
        <div
          style={{
            background: 'var(--ink-900)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>
            REPLACE REGION
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', minWidth: 0 }}>
            <input
              type="text"
              placeholder="Find matcher (e.g. minecraft:stone)"
              value={replaceMatcher}
              onChange={(e) => setReplaceMatcher(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '5px 8px',
                fontSize: '11px',
                borderRadius: '3px',
                border: '1px solid var(--line-strong)',
                background: 'var(--ink-850)',
                color: 'var(--text)',
              }}
            />
            <button
              type="button"
              disabled={isExecuting || !activeBounds}
              onClick={() =>
                executeOperation('Replace', () =>
                  regionTools.replace(
                    replaceMatcher,
                    toBlockStateId(currentBlockStateString),
                    { preserveProperties }
                  )
                )
              }
              style={{
                flexShrink: 0,
                padding: '5px 12px',
                background: 'var(--warn)',
                border: '1px solid var(--warn)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: '11px',
                cursor: activeBounds ? 'pointer' : 'not-allowed',
                opacity: activeBounds ? 1 : 0.5,
              }}
            >
              Replace
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-dim)' }}>
            <input
              type="checkbox"
              checked={preserveProperties}
              onChange={(e) => setPreserveProperties(e.target.checked)}
            />
            Preserve compatible block properties
          </label>
        </div>

        {/* Clipboard & Move Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() => executeOperation('Copy', () => regionTools.copy())}
            style={{
              padding: '6px',
              background: 'var(--ink-700)',
              border: '1px solid var(--line-strong)',
              borderRadius: '4px',
              color: 'var(--text)',
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '11px',
            }}
          >
            📋 Copy
          </button>

          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() => executeOperation('Cut', () => regionTools.cut())}
            style={{
              padding: '6px',
              background: 'var(--ink-700)',
              border: '1px solid var(--line-strong)',
              borderRadius: '4px',
              color: 'var(--text)',
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
              fontSize: '11px',
            }}
          >
            ✂️ Cut
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={() =>
              executeOperation('Paste', () =>
                regionTools.paste(pasteTarget, { skipAir })
              )
            }
            style={{
              padding: '6px',
              background: 'var(--ink-700)',
              border: '1px solid var(--line-strong)',
              borderRadius: '4px',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            📥 Paste
          </button>
        </div>

        {/* Move Region Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minWidth: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Offset:</span>
          {(['dx', 'dy', 'dz'] as const).map((axis, i) => (
            <input
              key={axis}
              type="number"
              value={moveOffset[i]}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 0;
                const next: [number, number, number] = [moveOffset[0], moveOffset[1], moveOffset[2]];
                next[i] = val;
                setMoveOffset(next as unknown as Vec3i);
              }}
              style={{
                width: '45px',
                minWidth: 0,
                padding: '4px',
                fontSize: '11px',
                background: 'var(--ink-900)',
                color: 'var(--text)',
                border: '1px solid var(--line-strong)',
                borderRadius: '3px',
                textAlign: 'center',
              }}
            />
          ))}
          <button
            type="button"
            disabled={isExecuting || !activeBounds}
            onClick={() =>
              executeOperation('Move Region', () =>
                regionTools.moveRegion(moveOffset)
              )
            }
            style={{
              flexShrink: 0,
              padding: '5px 8px',
              fontSize: '11px',
              background: 'var(--ink-700)',
              border: '1px solid var(--ink-700)',
              borderRadius: '3px',
              color: 'var(--text)',
              cursor: activeBounds ? 'pointer' : 'not-allowed',
              opacity: activeBounds ? 1 : 0.5,
            }}
          >
            Move Region
          </button>
        </div>
      </div>

      {/* Status Bar */}
      {statusMessage && (
        <div
          style={{
            fontSize: '11px',
            padding: '6px 8px',
            borderRadius: '4px',
            background: statusMessage.startsWith('✓')
              ? 'color-mix(in srgb, var(--ok) 22%, var(--ink-900))'
              : statusMessage.startsWith('✕')
              ? 'color-mix(in srgb, var(--danger) 22%, var(--ink-900))'
              : 'color-mix(in srgb, var(--signal) 16%, var(--ink-900))',
            color: statusMessage.startsWith('✓')
              ? 'var(--ok)'
              : statusMessage.startsWith('✕')
              ? 'var(--danger)'
              : 'var(--signal)',
          }}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
