# Subspec B — Slice b-10: Legacy ID Table

**Goal:** Legacy ID table keyed by `(id, data)` with AddBlocks support → `BlockStateId` with properties. Prefer MIT-licensed source (e.g. PrismarineJS minecraft-data). Don't use CC BY-SA content. Remove unrelated .nbt palette note.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/legacy-id-table.ts` | Legacy ID → block state mapping |
| `packages/formats/legacy-id-table.source.md` | Source attribution + license |

## Legacy ID Table

```ts
export type LegacyIdEntry = {
  id: number;
  data: number;
  blockState: BlockStateId;  // {Name, Properties}
  version: string;           // MC version this mapping applies to
};

export const LEGACY_ID_TABLE: Map<string, LegacyIdEntry>;  // key: "${id}:${data}"

// AddBlocks support: additional mappings loaded at runtime
export function addLegacyIdMappings(entries: LegacyIdEntry[]): void;
```

## Source Selection

Preferred: PrismarineJS `minecraft-data` (MIT license).
Do NOT use: CC BY-SA content (e.g. Minecraft Wiki without compatible license).

## License Check

Document chosen source and license in `legacy-id-table.source.md`. Verify MIT or compatible before committing.

## Acceptance Criteria

- [ ] Legacy ID table keyed by `(id, data)` → `BlockStateId` with properties
- [ ] AddBlocks support for runtime mapping additions
- [ ] MIT-licensed source preferred (e.g. PrismarineJS minecraft-data)
- [ ] No CC BY-SA content
- [ ] License documented in `legacy-id-table.source.md`
- [ ] Unrelated .nbt palette note removed

## Tests

**File:** `packages/formats/__tests__/slice-b-10-legacy-id.test.ts`

1. Legacy ID table maps common (id, data) pairs to BlockStateId
2. Key format is `${id}:${data}`
3. `addLegacyIdMappings` adds entries at runtime
4. Source is MIT-licensed (documented)

## Verification Checklist

- [ ] Change does one thing completely (legacy-ID block table + license check)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
