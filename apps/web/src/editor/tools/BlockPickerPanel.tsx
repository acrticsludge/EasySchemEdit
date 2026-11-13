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
        background: '#18181b',
        color: '#f4f4f5',
        padding: '14px',
        borderRadius: '8px',
        border: '1px solid #27272a',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        width: '100%',
        maxWidth: '440px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #27272a',
          paddingBottom: '8px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#60a5fa' }}>
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
              border: '1px solid #3f3f46',
              background: sessionState.canUndo ? '#27272a' : '#18181b',
              color: sessionState.canUndo ? '#fafafa' : '#71717a',
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
              border: '1px solid #3f3f46',
              background: sessionState.canRedo ? '#27272a' : '#18181b',
              color: sessionState.canRedo ? '#fafafa' : '#71717a',
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
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div style={{ fontWeight: 600, color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>
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
                color: '#34d399',
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
          <div style={{ color: '#71717a', fontStyle: 'italic', fontSize: '12px' }}>
            No active selection. Set corners or select a placement.
          </div>
        )}
      </div>

      {/* 1.21.11 Block Search & Palette */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <label htmlFor="block-search" style={{ fontWeight: 600, color: '#e4e4e7', fontSize: '12px' }}>
            1.21.11 Block Selector
          </label>
          <span style={{ fontSize: '11px', color: '#71717a' }}>
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
            border: '1px solid #3f3f46',
            background: '#09090b',
            color: '#fafafa',
            fontSize: '12px',
            boxSizing: 'border-box',
            marginBottom: '6px',
          }}
        />
        <div
          style={{
            maxHeight: '120px',
            overflowY: 'auto',
            border: '1px solid #27272a',
            borderRadius: '4px',
            background: '#09090b',
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
                  background: isSelected ? '#1e3a8a' : 'transparent',
                  color: isSelected ? '#93c5fd' : '#d4d4d8',
                  borderBottom: '1px solid #18181b',
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
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '11px', color: '#a1a1aa', marginBottom: '6px' }}>
          BLOCK STATE PROPERTIES
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#38bdf8',
            background: '#18181b',
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
                  background: '#18181b',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  fontSize: '11px',
                }}
              >
                <span>
                  <strong style={{ color: '#c084fc' }}>{k}</strong> ={' '}
                  <span style={{ color: '#fde047' }}>{v}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveProperty(k)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
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
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            placeholder="key (e.g. facing)"
            value={newPropKey}
            list="common-prop-keys"
            onChange={(e) => setNewPropKey(e.target.value)}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid #3f3f46',
              background: '#18181b',
              color: '#fafafa',
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
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid #3f3f46',
              background: '#18181b',
              color: '#fafafa',
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
              padding: '4px 10px',
              fontSize: '11px',
              borderRadius: '3px',
              border: '1px solid #3b82f6',
              background: '#2563eb',
              color: '#ffffff',
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
        <div style={{ fontWeight: 600, color: '#e4e4e7', fontSize: '12px' }}>
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
              background: '#15803d',
              border: '1px solid #16a34a',
              borderRadius: '4px',
              color: '#ffffff',
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
              background: '#0369a1',
              border: '1px solid #0284c7',
              borderRadius: '4px',
              color: '#ffffff',
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
              background: '#6d28d9',
              border: '1px solid #7c3aed',
              borderRadius: '4px',
              color: '#ffffff',
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
              background: '#b91c1c',
              border: '1px solid #dc2626',
              borderRadius: '4px',
              color: '#ffffff',
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
            background: '#09090b',
            border: '1px solid #27272a',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#a1a1aa' }}>
            REPLACE REGION
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Find matcher (e.g. minecraft:stone)"
              value={replaceMatcher}
              onChange={(e) => setReplaceMatcher(e.target.value)}
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: '11px',
                borderRadius: '3px',
                border: '1px solid #3f3f46',
                background: '#18181b',
                color: '#fafafa',
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
                padding: '5px 12px',
                background: '#d97706',
                border: '1px solid #f59e0b',
                borderRadius: '4px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '11px',
                cursor: activeBounds ? 'pointer' : 'not-allowed',
                opacity: activeBounds ? 1 : 0.5,
              }}
            >
              Replace
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#a1a1aa' }}>
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
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              color: '#fafafa',
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
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              color: '#fafafa',
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
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              color: '#fafafa',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            📥 Paste
          </button>
        </div>

        {/* Move Region Controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Offset:</span>
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
                padding: '4px',
                fontSize: '11px',
                background: '#09090b',
                color: '#fafafa',
                border: '1px solid #3f3f46',
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
              flex: 1,
              padding: '5px 8px',
              fontSize: '11px',
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '3px',
              color: '#fafafa',
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
              ? '#064e3b'
              : statusMessage.startsWith('✕')
              ? '#7f1d1d'
              : '#1e293b',
            color: statusMessage.startsWith('✓')
              ? '#6ee7b7'
              : statusMessage.startsWith('✕')
              ? '#fca5a5'
              : '#93c5fd',
          }}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
