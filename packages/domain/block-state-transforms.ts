// packages/domain/block-state-transforms.ts
// Slice 6 & 6.5: BlockStateTransformRegistry (bijective tables for rotation and mirror)

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
  north: 'north',
  south: 'south',
  east: 'west',
  west: 'east',
  up: 'up',
  down: 'down',
};

const facingMirrorZ: Record<string, string> = {
  north: 'south',
  south: 'north',
  east: 'east',
  west: 'west',
  up: 'up',
  down: 'down',
};

// Stair shape: rotation does NOT change, mirror swaps left/right
const stairMirrorSwap: Record<string, string> = {
  inner_left: 'inner_right',
  inner_right: 'inner_left',
  outer_left: 'outer_right',
  outer_right: 'outer_left',
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

const railMirrorX: Record<string, string> = {
  north_west: 'north_east',
  north_east: 'north_west',
  south_west: 'south_east',
  south_east: 'south_west',
  ascending_west: 'ascending_east',
  ascending_east: 'ascending_west',
};

const railMirrorZ: Record<string, string> = {
  north_west: 'south_west',
  south_west: 'north_west',
  north_east: 'south_east',
  south_east: 'north_east',
  ascending_north: 'ascending_south',
  ascending_south: 'ascending_north',
};

// Door hinge: rotation does NOT change, mirror swaps
const hingeMirrorSwap: Record<string, string> = { left: 'right', right: 'left' };

// Chest type: rotation does NOT change, mirror swaps
const chestTypeMirrorSwap: Record<string, string> = { left: 'right', right: 'left' };

export function transformStateRotate(
  blockState: BlockStateId,
  degrees: 90 | 180 | 270,
): { kind: 'ok'; result: BlockStateId } | { kind: 'unsupported'; reason: string } {
  const props = { ...blockState.props };

  // 1. facing
  if (props.facing !== undefined) {
    const nextFacing = facingRotate[props.facing]?.[degrees];
    if (!nextFacing) {
      return { kind: 'unsupported', reason: `Unknown facing value '${props.facing}'` };
    }
    props.facing = nextFacing;
  }

  // 2. axis (undirected)
  if (props.axis !== undefined) {
    if (degrees === 90 || degrees === 270) {
      if (props.axis === 'x') props.axis = 'z';
      else if (props.axis === 'z') props.axis = 'x';
    }
  }

  // 3. shape (rail / stair)
  if (props.shape !== undefined) {
    if (railRotate[props.shape]) {
      props.shape = railRotate[props.shape][degrees];
    }
    // Stair shapes remain unchanged by rotation
  }

  // 4. rotation (0..15 integer compass rotation)
  if (props.rotation !== undefined) {
    const r = parseInt(props.rotation, 10);
    if (Number.isNaN(r) || r < 0 || r > 15) {
      return { kind: 'unsupported', reason: `Unknown rotation value '${props.rotation}'` };
    }
    const shift = degrees === 90 ? 12 : degrees === 180 ? 8 : 4;
    props.rotation = String((r + shift) % 16);
  }

  // 5. connection properties (north, east, south, west)
  const hasConnections =
    props.north !== undefined ||
    props.east !== undefined ||
    props.south !== undefined ||
    props.west !== undefined;

  if (hasConnections) {
    const n = props.north;
    const e = props.east;
    const s = props.south;
    const w = props.west;

    if (degrees === 90) {
      if (w !== undefined) props.south = w;
      if (n !== undefined) props.west = n;
      if (e !== undefined) props.north = e;
      if (s !== undefined) props.east = s;
    } else if (degrees === 180) {
      if (n !== undefined) props.south = n;
      if (s !== undefined) props.north = s;
      if (e !== undefined) props.west = e;
      if (w !== undefined) props.east = w;
    } else {
      // 270
      if (w !== undefined) props.north = w;
      if (s !== undefined) props.west = s;
      if (e !== undefined) props.south = e;
      if (n !== undefined) props.east = n;
    }
  }

  return {
    kind: 'ok',
    result: { id: blockState.id, props: props as Readonly<Record<string, string>> },
  };
}

export function transformStateMirror(
  blockState: BlockStateId,
  plane: 'x' | 'z',
): { kind: 'ok'; result: BlockStateId } | { kind: 'unsupported'; reason: string } {
  const props = { ...blockState.props };

  // 1. facing
  if (props.facing !== undefined) {
    const nextFacing =
      plane === 'x' ? facingMirrorX[props.facing] : facingMirrorZ[props.facing];
    if (!nextFacing) {
      return { kind: 'unsupported', reason: `Unknown facing value '${props.facing}'` };
    }
    props.facing = nextFacing;
  }

  // 2. shape
  if (props.shape !== undefined) {
    if (stairMirrorSwap[props.shape]) {
      props.shape = stairMirrorSwap[props.shape];
    } else if (plane === 'x' && railMirrorX[props.shape]) {
      props.shape = railMirrorX[props.shape];
    } else if (plane === 'z' && railMirrorZ[props.shape]) {
      props.shape = railMirrorZ[props.shape];
    }
  }

  // 3. hinge
  if (props.hinge !== undefined && hingeMirrorSwap[props.hinge]) {
    props.hinge = hingeMirrorSwap[props.hinge];
  }

  // 4. type (double chests)
  if (props.type !== undefined && chestTypeMirrorSwap[props.type]) {
    props.type = chestTypeMirrorSwap[props.type];
  }

  // 5. rotation (0..15 compass rotation)
  if (props.rotation !== undefined) {
    const r = parseInt(props.rotation, 10);
    if (Number.isNaN(r) || r < 0 || r > 15) {
      return { kind: 'unsupported', reason: `Unknown rotation value '${props.rotation}'` };
    }
    const nextR = plane === 'x' ? (16 - r) % 16 : (8 - r + 16) % 16;
    props.rotation = String(nextR);
  }

  // 6. connection properties (north, east, south, west)
  const hasConnections =
    props.north !== undefined ||
    props.east !== undefined ||
    props.south !== undefined ||
    props.west !== undefined;

  if (hasConnections) {
    const n = props.north;
    const e = props.east;
    const s = props.south;
    const w = props.west;

    if (plane === 'x') {
      // Flips east <-> west
      if (w !== undefined) props.east = w;
      if (e !== undefined) props.west = e;
    } else {
      // Flips north <-> south
      if (n !== undefined) props.south = n;
      if (s !== undefined) props.north = s;
    }
  }

  return {
    kind: 'ok',
    result: { id: blockState.id, props: props as Readonly<Record<string, string>> },
  };
}

export function makeVanillaHandler(blockId: string): BlockStateTransformHandler {
  return {
    canHandle: (id: string) => id.toLowerCase() === blockId.toLowerCase(),
    rotate: (state, degrees) => transformStateRotate(state, degrees),
    mirror: (state, plane) => transformStateMirror(state, plane),
  };
}

export class BlockStateTransformRegistry {
  private handlers = new Map<string, BlockStateTransformHandler>();

  register(pattern: string, handler: BlockStateTransformHandler): void {
    this.handlers.set(pattern.toLowerCase(), handler);
  }

  get(blockId: string): BlockStateTransformHandler | undefined {
    return this.handlers.get(blockId.toLowerCase());
  }

  transformRotate(
    blockState: BlockStateId,
    degrees: 90 | 180 | 270,
  ): { result: BlockStateId; warnings: Diagnostic[] } {
    const handler = this.handlers.get(blockState.id.toLowerCase());
    if (handler && handler.canHandle(blockState.id)) {
      const res = handler.rotate(blockState, degrees);
      if (res.kind === 'unsupported') {
        return {
          result: blockState,
          warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }],
        };
      }
      return { result: res.result, warnings: [] };
    }

    // Custom mod namespace check: pass unknown non-vanilla blocks through unchanged
    const lowerId = blockState.id.toLowerCase();
    const isVanilla = lowerId.startsWith('minecraft:') || !lowerId.includes(':');
    if (!isVanilla) {
      return { result: blockState, warnings: [] };
    }

    // Generic vanilla fallback
    const res = transformStateRotate(blockState, degrees);
    if (res.kind === 'unsupported') {
      return {
        result: blockState,
        warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }],
      };
    }
    return { result: res.result, warnings: [] };
  }

  transformMirror(
    blockState: BlockStateId,
    plane: 'x' | 'z',
  ): { result: BlockStateId; warnings: Diagnostic[] } {
    const handler = this.handlers.get(blockState.id.toLowerCase());
    if (handler && handler.canHandle(blockState.id)) {
      const res = handler.mirror(blockState, plane);
      if (res.kind === 'unsupported') {
        return {
          result: blockState,
          warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }],
        };
      }
      return { result: res.result, warnings: [] };
    }

    // Custom mod namespace check: pass unknown non-vanilla blocks through unchanged
    const lowerId = blockState.id.toLowerCase();
    const isVanilla = lowerId.startsWith('minecraft:') || !lowerId.includes(':');
    if (!isVanilla) {
      return { result: blockState, warnings: [] };
    }

    // Generic vanilla fallback
    const res = transformStateMirror(blockState, plane);
    if (res.kind === 'unsupported') {
      return {
        result: blockState,
        warnings: [{ code: 'ENGINE_INVARIANT_VIOLATION', severity: 'warning', message: res.reason }],
      };
    }
    return { result: res.result, warnings: [] };
  }
}

export const REGISTRY = new BlockStateTransformRegistry();

// Register core vanilla handlers
REGISTRY.register('minecraft:oak_stairs', makeVanillaHandler('minecraft:oak_stairs'));
REGISTRY.register('minecraft:oak_door', makeVanillaHandler('minecraft:oak_door'));
REGISTRY.register('minecraft:oak_fence', makeVanillaHandler('minecraft:oak_fence'));
REGISTRY.register('minecraft:chest', makeVanillaHandler('minecraft:chest'));

export function validateBijectivity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const stairs: BlockStateId = {
    id: 'minecraft:oak_stairs',
    props: { facing: 'north', shape: 'inner_left' } as Readonly<Record<string, string>>,
  };
  const door: BlockStateId = {
    id: 'minecraft:oak_door',
    props: { facing: 'north', hinge: 'left' } as Readonly<Record<string, string>>,
  };
  const rail: BlockStateId = {
    id: 'minecraft:oak_rail',
    props: { shape: 'north_south' } as Readonly<Record<string, string>>,
  };
  const fence: BlockStateId = {
    id: 'minecraft:oak_fence',
    props: { facing: 'north' } as Readonly<Record<string, string>>,
  };
  const chest: BlockStateId = {
    id: 'minecraft:chest',
    props: { type: 'left' } as Readonly<Record<string, string>>,
  };

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
