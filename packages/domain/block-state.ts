export type BlockStateId = {
  id: string;           // normalized namespaced resource location, lowercase
  props: Readonly<Record<string, string>>; // canonical sorted keys
};

export function blockStateId(id: string, props?: Record<string, string>): BlockStateId {
  const normalizedId = id.toLowerCase();
  const normalizedProps: Record<string, string> = {};
  if (props) {
    for (const key of Object.keys(props).sort()) {
      const value = props[key];
      if (value !== undefined) {
        normalizedProps[key.toLowerCase()] = String(value).toLowerCase();
      }
    }
  }
  return { id: normalizedId, props: normalizedProps as Readonly<Record<string, string>> };
}

export function blockStateEquals(a: BlockStateId, b: BlockStateId): boolean {
  if (a.id !== b.id) return false;
  const aKeys = Object.keys(a.props).sort();
  const bKeys = Object.keys(b.props).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i]!;
    const bkey = bKeys[i]!;
    if (key !== bkey) return false;
    const av = a.props[key];
    const bv = b.props[bkey];
    if (av !== bv) return false;
  }
  return true;
}

export const CANONICAL_AIR: BlockStateId = blockStateId('minecraft:air');

export type AirLikeId = 'minecraft:air' | 'minecraft:cave_air' | 'minecraft:void_air';
export type AirLikeRegistry = Set<string>;

export const VANILLA_AIR_LIKE: AirLikeRegistry = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air',
]);

export function isAirLike(blockId: string, registry: AirLikeRegistry): boolean {
  return registry.has(blockId);
}
