import type { BlockStateId } from './block-state.ts';
import type { Diagnostic } from './shared-types.ts';
import { ERROR_CODES, type ErrorCodeEntry } from './error-codes.ts';

// ============================================================================
// Slice 6: BlockStateTransformRegistry (bijective table)
// ============================================================================

export type BlockStateTransformHandler = {
  canHandle(blockId: string): boolean;
  rotate(
    blockState: BlockStateId,
    degrees: 90 | 180 | 270,
  ): { kind: 'ok'; result: BlockStateId } | { kind: 'unsupported'; reason: string };
  mirror(
    blockState: BlockStateId,
    plane: 'x' | 'z',
  ): { kind: 'ok'; result: BlockStateId } | { kind: 'unsupported'; reason: string };
};

export class BlockStateTransformRegistry {
  private handlers = new Map<string, BlockStateTransformHandler>();

  register(pattern: string, handler: BlockStateTransformHandler): void {
    this.handlers.set(pattern, handler);
  }

  get(blockId: string): BlockStateTransformHandler | undefined {
    return this.handlers.get(blockId);
  }

  transformRotate(
    blockState: BlockStateId,
    degrees: 90 | 180 | 270,
  ): { result: BlockStateId; warnings: Diagnostic[] } {
    const handler = this.handlers.get(blockState.id);
    if (!handler || !handler.canHandle(blockState.id)) {
      return { result: blockState, warnings: [] };
    }
    const res = handler.rotate(blockState, degrees);
    if (res.kind === 'unsupported') {
      return { result: blockState, warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }] };
    }
    return { result: res.result, warnings: [] };
  }

  transformMirror(
    blockState: BlockStateId,
    plane: 'x' | 'z',
  ): { result: BlockStateId; warnings: Diagnostic[] } {
    const handler = this.handlers.get(blockState.id);
    if (!handler || !handler.canHandle(blockState.id)) {
      return { result: blockState, warnings: [] };
    }
    const res = handler.mirror(blockState, plane);
    if (res.kind === 'unsupported') {
      return { result: blockState, warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }] };
    }
    return { result: res.result, warnings: [] };
  }
}

// ============================================================================
// Slice 6.5: More orientation handlers
// ============================================================================

// Facing direction rotation (90° clockwise about Y: north→west→south→east→north)
const facingRotate: Record<string, Record<90 | 180 | 270, string>> = {
  north: { 90: 'west', 180: 'south', 270: 'east' },
  east: { 90: 'north', 180: 'west', 270: 'south' },
  south: { 90: 'east', 180: 'north', 270: 'west' },
  west: { 90: 'south', 180: 'east', 270: 'north' },
  up: { 90: 'up', 180: 'up', 270: 'up' },
  down: { 90: 'down', 180: 'down', 270: 'down' },
};

const facingMirrorX: Record<string, string> = {
  north: 'north', south: 'south', east: 'west', west: 'east', up: 'up', down: 'down',
};
const facingMirrorZ: Record<string, string> = {
  north: 'south', south: 'north', east: 'east', west: 'west', up: 'up', down: 'down',
};

// Stair shape: rotation does NOT change, mirror swaps left/right
const stairMirrorSwap: Record<string, string> = {
  inner_left: 'inner_right', inner_right: 'inner_left',
  outer_left: 'outer_right', outer_right: 'outer_left',
};

// Rail shape: rotation does NOT change run axis
const railRotate: Record<string, Record<90 | 180 | 270, string>> = {
  north_south: { 90: 'east_west', 180: 'north_south', 270: 'east_west' },
  east_west: { 90: 'north_south', 180: 'east_west', 270: 'north_south' },
  ascending_north: { 90: 'ascending_east', 180: 'ascending_south', 270: 'ascending_west' },
  ascending_south: { 90: 'ascending_west', 180: 'ascending_north', 270: 'ascending_east' },
  ascending_east: { 90: 'ascending_south', 180: 'ascending_west', 270: 'ascending_north' },
  ascending_west: { 90: 'ascending_north', 180: 'ascending_east', 270: 'ascending_south' },
};

// Door hinge: rotation does NOT change, mirror swaps
const hingeMirrorSwap: Record<string, string> = { left: 'right', right: 'left' };

// Chest type: rotation does NOT change, mirror swaps
const chestTypeMirrorSwap: Record<string, string> = { left: 'right', right: 'left' };

function blockStateWithProp(
  state: BlockStateId,
  key: string,
  value: string,
): BlockStateId {
  return {
    id: state.id,
    props: { ...state.props, [key]: value } as Readonly<Record<string, string>>,
  };
}

export function makeVanillaHandler(blockId: string): BlockStateTransformHandler {
  return {
    canHandle: (id: string) => id === blockId,
    rotate: (state, degrees) => {
      const props = { ...state.props };
      const facing = props.facing;
      if (facing && facingRotate[facing]) {
        props.facing = facingRotate[facing][degrees];
      }
      if (props.axis) {
        // axis is undirected: rotation swaps x↔z for 90/270, y stays
        if (degrees === 90 || degrees === 270) {
          if (props.axis === 'x') props.axis = 'z';
          else if (props.axis === 'z') props.axis = 'x';
        }
      }
      if (props.shape && railRotate[props.shape]) {
        props.shape = railRotate[props.shape][degrees];
      }
      // Stair shape, hinge: unchanged by rotation
      return { kind: 'ok', result: { id: state.id, props: props as Readonly<Record<string, string>> } };
    },
    mirror: (state, plane) => {
      const props = { ...state.props };
      const facing = props.facing;
      if (facing) {
        props.facing = plane === 'x' ? facingMirrorX[facing] ?? facing : facingMirrorZ[facing] ?? facing;
      }
      if (props.shape && stairMirrorSwap[props.shape]) {
        props.shape = stairMirrorSwap[props.shape];
      }
      if (props.hinge && hingeMirrorSwap[props.hinge]) {
        props.hinge = hingeMirrorSwap[props.hinge];
      }
      if (props.type && chestTypeMirrorSwap[props.type]) {
        props.type = chestTypeMirrorSwap[props.type];
      }
      // Rail run axis unchanged by mirror
      return { kind: 'ok', result: { id: state.id, props: props as Readonly<Record<string, string>> } };
    },
  };
}

export const REGISTRY = new BlockStateTransformRegistry();

// Register core vanilla handlers
REGISTRY.register('minecraft:oak_stairs', makeVanillaHandler('minecraft:oak_stairs'));
REGISTRY.register('minecraft:oak_door', makeVanillaHandler('minecraft:oak_door'));
REGISTRY.register('minecraft:oak_fence', makeVanillaHandler('minecraft:oak_fence'));
REGISTRY.register('minecraft:chest', makeVanillaHandler('minecraft:chest'));

export function validateBijectivity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ops: Array<{ name: string; fn: (s: BlockStateId) => BlockStateId }> = [];

  const stairs: BlockStateId = { id: 'minecraft:oak_stairs', props: { facing: 'north', shape: 'inner_left' } as Readonly<Record<string, string>> };
  const door: BlockStateId = { id: 'minecraft:oak_door', props: { facing: 'north', hinge: 'left' } as Readonly<Record<string, string>> };
  const rail: BlockStateId = { id: 'minecraft:oak_rail', props: { shape: 'north_south' } as Readonly<Record<string, string>> };
  const fence: BlockStateId = { id: 'minecraft:oak_fence', props: { facing: 'north' } as Readonly<Record<string, string>> };
  const chest: BlockStateId = { id: 'minecraft:chest', props: { type: 'left' } as Readonly<Record<string, string>> };

  const states = [stairs, door, rail, fence, chest];

  // 90°⁻¹ = 270°
  for (const s of states) {
    const r90 = REGISTRY.transformRotate(s, 90).result;
    const back = REGISTRY.transformRotate(r90, 270).result;
    if (back.id !== s.id) errors.push(`90°⁻¹≠270° for ${s.id}`);
    const propsMatch = Object.keys(s.props).every((k) => s.props[k] === back.props[k]);
    if (!propsMatch) errors.push(`90°⁻¹≠270° props for ${s.id}`);
  }

  // mirror² = identity
  for (const plane of ['x', 'z'] as const) {
    for (const s of states) {
      const m1 = REGISTRY.transformMirror(s, plane).result;
      const m2 = REGISTRY.transformMirror(m1, plane).result;
      if (m2.id !== s.id) errors.push(`mirror²≠identity for ${s.id} plane=${plane}`);
      const propsMatch = Object.keys(s.props).every((k) => s.props[k] === m2.props[k]);
      if (!propsMatch) errors.push(`mirror²≠identity props for ${s.id} plane=${plane}`);
    }
  }

  // Rotation does NOT change stair shape or hinge
  for (const deg of [90, 180, 270] as const) {
    const r = REGISTRY.transformRotate(stairs, deg).result;
    if (r.props.shape !== 'inner_left') errors.push(`rotation changes stair shape at ${deg}°`);
    const d = REGISTRY.transformRotate(door, deg).result;
    if (d.props.hinge !== 'left') errors.push(`rotation changes hinge at ${deg}°`);
  }

  // Mirror swaps stair shape and hinge
  const mStairs = REGISTRY.transformMirror(stairs, 'x').result;
  if (mStairs.props.shape !== 'inner_right') errors.push('mirror does not swap stair shape');
  const mDoor = REGISTRY.transformMirror(door, 'x').result;
  if (mDoor.props.hinge !== 'right') errors.push('mirror does not swap hinge');

  return { ok: errors.length === 0, errors };
}
