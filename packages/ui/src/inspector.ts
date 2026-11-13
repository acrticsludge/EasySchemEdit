// packages/ui/src/inspector.ts
// Inspector model: context-sensitive, placement origin/transform, numeric inputs,
// block picker, property editor, warnings. Pure TypeScript.
// SUBSPEC-G §6.3 (Inspector, G3).

// ============================================================================
// Types
// ============================================================================

export type MirrorAxis = 'none' | 'x' | 'z';
export type Rotation = 0 | 90 | 180 | 270;

export type Transform = {
  x: number; // integer
  y: number; // integer
  z: number; // integer
  originX: number; // integer or half-integer
  originY: number;
  originZ: number;
  rotation: Rotation;
  mirror: MirrorAxis;
};

export type BlockStateProperty = {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  values?: string[];
  version: number;
};

export type BlockStateMetadata = {
  blockId: string;
  version: number;
  properties: BlockStateProperty[];
};

export type InspectorContext = {
  activeTool: string | null;
  selectedPlacementId: string | null;
  placementTransform?: Transform;
  blockId?: string;
  blockState?: Record<string, unknown>;
  blockMetadata?: BlockStateMetadata;
  fidelityWarnings?: string[];
};

export type NumericInput = {
  value: number;
  min?: number;
  max?: number;
  step: number;
  integerOnly: boolean;
  halfIntegerAllowed: boolean;
  // Both direct typing and steppers are available.
  allowDirectTyping: boolean;
  allowStepper: boolean;
};

export type InspectorView = {
  context: InspectorContext;
  hasSelection: boolean;
  origin: { x: NumericInput; y: NumericInput; z: NumericInput } | null;
  transform: {
    position: { x: NumericInput; y: NumericInput; z: NumericInput };
    rotation: Rotation;
    mirror: MirrorAxis;
  } | null;
  blockPicker: {
    query: string;
    results: string[];
    recentlyUsed: string[];
    palette: string[];
  };
  properties: { key: string; value: unknown; known: boolean; type?: string }[];
  warnings: { control: string; message: string }[];
};

export type Inspector = {
  context(): InspectorContext;
  setContext(ctx: InspectorContext): void;
  setActiveTool(tool: string | null): void;
  setSelection(id: string | null): void;
  setPlacementTransform(t: Transform): void;
  setBlockId(id: string | null): void;
  setBlockState(state: Record<string, unknown> | undefined): void;
  setBlockMetadata(meta: BlockStateMetadata | undefined): void;
  setFidelityWarnings(warnings: string[]): void;
  view(): InspectorView;
  // Numeric input helpers.
  validatePosition(value: number): number; // integer
  validateOrigin(value: number): number; // integer or half-integer
  setRotation(r: number): Rotation;
  setMirror(m: string): MirrorAxis;
  // Block picker.
  searchBlocks(query: string, allBlocks: string[]): string[];
  markBlockUsed(blockId: string): void;
  addToPalette(blockId: string): void;
  removeFromPalette(blockId: string): void;
  // Stepper helpers.
  stepUp(input: NumericInput): number;
  stepDown(input: NumericInput): number;
  directType(input: NumericInput, raw: string): number | null;
};

// ============================================================================
// Helpers
// ============================================================================

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

function clampRotation(r: number): Rotation {
  const normalized = ((r % 360) + 360) % 360;
  // Snap to nearest allowed.
  let best: Rotation = 0;
  let bestDist = Infinity;
  for (const allowed of ROTATIONS) {
    const dist = Math.min(Math.abs(normalized - allowed), 360 - Math.abs(normalized - allowed));
    if (dist < bestDist) {
      bestDist = dist;
      best = allowed;
    }
  }
  return best;
}

function isHalfInteger(v: number): boolean {
  return Number.isFinite(v) && (v * 2) % 1 === 0;
}

function makeNumericInput(
  value: number,
  integerOnly: boolean,
  halfIntegerAllowed: boolean,
  step: number,
): NumericInput {
  return {
    value,
    step,
    integerOnly,
    halfIntegerAllowed,
    allowDirectTyping: true,
    allowStepper: true,
  };
}

// ============================================================================
// Factory
// ============================================================================

export function createInspector(initial?: InspectorContext): Inspector {
  let ctx: InspectorContext = initial ?? {
    activeTool: null,
    selectedPlacementId: null,
  };

  const recentlyUsed: string[] = [];
  const palette: string[] = [];
  let blockQuery = '';

  function context(): InspectorContext {
    return { ...ctx, placementTransform: ctx.placementTransform ? { ...ctx.placementTransform } : undefined, blockState: ctx.blockState ? { ...ctx.blockState } : undefined, fidelityWarnings: ctx.fidelityWarnings ? [...ctx.fidelityWarnings] : undefined };
  }

  function setContext(c: InspectorContext): void {
    ctx = { ...c };
  }

  function setActiveTool(tool: string | null): void {
    ctx = { ...ctx, activeTool: tool };
  }

  function setSelection(id: string | null): void {
    ctx = { ...ctx, selectedPlacementId: id };
  }

  function setPlacementTransform(t: Transform): void {
    ctx = { ...ctx, placementTransform: { ...t } };
  }

  function setBlockId(id: string | null): void {
    ctx = { ...ctx, blockId: id ?? undefined };
  }

  function setBlockState(state: Record<string, unknown> | undefined): void {
    ctx = { ...ctx, blockState: state ? { ...state } : undefined };
  }

  function setBlockMetadata(meta: BlockStateMetadata | undefined): void {
    ctx = { ...ctx, blockMetadata: meta ? { ...meta, properties: meta.properties.map((p) => ({ ...p })) } : undefined };
  }

  function setFidelityWarnings(warnings: string[]): void {
    ctx = { ...ctx, fidelityWarnings: [...warnings] };
  }

  function validatePosition(value: number): number {
    return Math.trunc(value);
  }

  function validateOrigin(value: number): number {
    if (isHalfInteger(value)) return value;
    // Snap to nearest half-integer.
    return Math.round(value * 2) / 2;
  }

  function setRotation(r: number): Rotation {
    return clampRotation(r);
  }

  function setMirror(m: string): MirrorAxis {
    if (m === 'x' || m === 'z' || m === 'none') return m;
    return 'none';
  }

  function searchBlocks(query: string, allBlocks: string[]): string[] {
    blockQuery = query;
    const q = query.toLowerCase();
    return allBlocks.filter((b) => b.toLowerCase().includes(q));
  }

  function markBlockUsed(blockId: string): void {
    const idx = recentlyUsed.indexOf(blockId);
    if (idx !== -1) recentlyUsed.splice(idx, 1);
    recentlyUsed.unshift(blockId);
    if (recentlyUsed.length > 20) recentlyUsed.pop();
  }

  function addToPalette(blockId: string): void {
    if (!palette.includes(blockId)) palette.push(blockId);
  }

  function removeFromPalette(blockId: string): void {
    const idx = palette.indexOf(blockId);
    if (idx !== -1) palette.splice(idx, 1);
  }

  function stepUp(input: NumericInput): number {
    return input.value + input.step;
  }

  function stepDown(input: NumericInput): number {
    return input.value - input.step;
  }

  function directType(input: NumericInput, raw: string): number | null {
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    if (input.integerOnly && !Number.isInteger(num)) {
      if (input.halfIntegerAllowed && isHalfInteger(num)) {
        // allowed
      } else {
        return null;
      }
    }
    return num;
  }

  function view(): InspectorView {
    const hasSelection = ctx.selectedPlacementId !== null;
    const t = ctx.placementTransform;

    let origin: InspectorView['origin'] = null;
    let transform: InspectorView['transform'] = null;

    if (hasSelection && t) {
      origin = {
        x: makeNumericInput(t.originX, false, true, 0.5),
        y: makeNumericInput(t.originY, false, true, 0.5),
        z: makeNumericInput(t.originZ, false, true, 0.5),
      };
      transform = {
        position: {
          x: makeNumericInput(t.x, true, false, 1),
          y: makeNumericInput(t.y, true, false, 1),
          z: makeNumericInput(t.z, true, false, 1),
        },
        rotation: t.rotation,
        mirror: t.mirror,
      };
    }

    // Properties: known from metadata, unknown as raw.
    const properties: InspectorView['properties'] = [];
    const meta = ctx.blockMetadata;
    const state = ctx.blockState ?? {};
    const knownKeys = new Set(meta?.properties.map((p) => p.key) ?? []);
    for (const prop of meta?.properties ?? []) {
      properties.push({
        key: prop.key,
        value: state[prop.key],
        known: true,
        type: prop.type,
      });
    }
    for (const key of Object.keys(state)) {
      if (!knownKeys.has(key)) {
        properties.push({ key, value: state[key], known: false });
      }
    }

    // Warnings adjacent to affected controls.
    const warnings: InspectorView['warnings'] = (ctx.fidelityWarnings ?? []).map((w) => ({
      control: 'general',
      message: w,
    }));

    // Block picker results.
    const blockResults = ctx.blockId ? [ctx.blockId] : [];

    return {
      context: context(),
      hasSelection,
      origin,
      transform,
      blockPicker: {
        query: blockQuery,
        results: blockResults,
        recentlyUsed: [...recentlyUsed],
        palette: [...palette],
      },
      properties,
      warnings,
    };
  }

  return {
    context,
    setContext,
    setActiveTool,
    setSelection,
    setPlacementTransform,
    setBlockId,
    setBlockState,
    setBlockMetadata,
    setFidelityWarnings,
    view,
    validatePosition,
    validateOrigin,
    setRotation,
    setMirror,
    searchBlocks,
    markBlockUsed,
    addToPalette,
    removeFromPalette,
    stepUp,
    stepDown,
    directType,
  };
}
