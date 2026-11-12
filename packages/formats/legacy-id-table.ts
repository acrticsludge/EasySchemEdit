// Subspec B — Slice b-10: Legacy ID Table
// Keyed by (id, data) with AddBlocks support → BlockStateId with properties
// MIT-licensed source preferred (e.g. PrismarineJS minecraft-data)
// No CC BY-SA content
export type LegacyIdEntry = {
  id: number;
  data: number;
  blockState: { id: string; props: Readonly<Record<string, string>> };
  version: string; // MC version this mapping applies to
};

const LEGACY_ID_TABLE_INTERNAL = new Map<string, LegacyIdEntry>();

// Seed with a small set of common mappings (MIT-licensed source: PrismarineJS minecraft-data)
// License: MIT — see legacy-id-table.source.md for attribution
function seedTable(): void {
  const seeds: LegacyIdEntry[] = [
    { id: 0, data: 0, blockState: { id: 'minecraft:air', props: {} }, version: '1.21' },
    { id: 1, data: 0, blockState: { id: 'minecraft:stone', props: {} }, version: '1.21' },
    { id: 2, data: 0, blockState: { id: 'minecraft:grass', props: {} }, version: '1.21' },
    { id: 3, data: 0, blockState: { id: 'minecraft:dirt', props: {} }, version: '1.21' },
    { id: 4, data: 0, blockState: { id: 'minecraft:cobblestone', props: {} }, version: '1.21' },
    { id: 5, data: 0, blockState: { id: 'minecraft:oak_planks', props: {} }, version: '1.21' },
    { id: 6, data: 0, blockState: { id: 'minecraft:sapling', props: { tree: 'oak', stage: '0' } }, version: '1.21' },
    { id: 7, data: 0, blockState: { id: 'minecraft:bedrock', props: {} }, version: '1.21' },
    { id: 8, data: 0, blockState: { id: 'minecraft:water', props: { level: '0' } }, version: '1.21' },
    { id: 9, data: 0, blockState: { id: 'minecraft:lava', props: { level: '0' } }, version: '1.21' },
  ];
  for (const entry of seeds) {
    LEGACY_ID_TABLE_INTERNAL.set(`${entry.id}:${entry.data}`, entry);
  }
}

seedTable();

export const LEGACY_ID_TABLE: ReadonlyMap<string, LegacyIdEntry> = LEGACY_ID_TABLE_INTERNAL;

export function addLegacyIdMappings(entries: LegacyIdEntry[]): void {
  for (const entry of entries) {
    LEGACY_ID_TABLE_INTERNAL.set(`${entry.id}:${entry.data}`, entry);
  }
}

export function lookupLegacyId(id: number, data: number): LegacyIdEntry | undefined {
  return LEGACY_ID_TABLE_INTERNAL.get(`${id}:${data}`);
}

export function legacyIdToBlockStateId(id: number, data: number): { id: string; props: Readonly<Record<string, string>> } | undefined {
  const entry = lookupLegacyId(id, data);
  return entry?.blockState;
}
