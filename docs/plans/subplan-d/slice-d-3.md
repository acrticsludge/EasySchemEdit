# Subspec D — Slice d-3: Clipboard Operations

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Copy/Cut/Paste operations), §4.4 (Effective-composite vs source-placement copy), §4.5 (Cut semantics), §4.6 (Clipboard lifecycle), §4.6.1 (Paste refinements)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement clipboard operations: copy, cut, paste with paste refinements. Session-scoped clipboard with serialization for MCP transfer. Supports effective-composite and source-placement copy scopes, paste at original position, skip air, preview only, rotation/mirror at paste time.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/clipboard.ts` | create | `ClipboardEntry`, `ClipboardData`, `ClipboardManager` class with copy/cut/paste methods |

## Types / APIs

```ts
export interface ClipboardData {
  blocks: Array<{ localPos: Vec3i; state: BlockStateId }>;
  blockEntities: Map<string, unknown>;
  entities: unknown[];
  biomes: unknown;
  anchor: Vec3i;       // minimum corner of copied selection
  bounds: Bounds3i;    // copied region bounds
}

export interface ClipboardEntry {
  id: string;
  data: ClipboardData;
  createdAt: number;
  sourceProjectId: string;
  scope: 'effective-composite' | 'source-placement';
}

export interface PasteOptions {
  targetPosition: Vec3i;
  intoPlacementId?: string;
  overrideAir?: boolean;
  pasteAtOriginalPosition?: boolean;
  skipAir?: boolean;
  previewOnly?: boolean;
  rotationY?: 0 | 90 | 180 | 270;
  mirror?: 'none' | 'x' | 'z';
}

export class ClipboardManager {
  copy(project: Project, selection: SelectionState, bounds: Bounds3i, scope: 'effective-composite' | 'source-placement'): ClipboardEntry;
  cut(project: Project, selection: SelectionState, bounds: Bounds3i, options?: CutOptions): { entry: ClipboardEntry; result: RegionOperationResult };
  paste(project: Project, entry: ClipboardEntry, options: PasteOptions): PasteResult;
  serialize(entry: ClipboardEntry): Uint8Array;
  deserialize(data: Uint8Array): ClipboardEntry;
}
```

## Acceptance criteria

1. Copy creates clipboard entry with blocks, anchor, bounds from selection
2. Copy scope: effective-composite (default) or source-placement
3. Cut copies then removes source blocks; hidden/locked placements excluded by default
4. Paste aligns clipboard anchor to targetPosition
5. pasteAtOriginalPosition: pastes at original copy location, ignores targetPosition
6. skipAir: air blocks not written to target
7. previewOnly: ghost preview, no commit, no revision increment
8. rotationY/mirror applied at paste time before placement
9. overrideAir: air cells record erase tombstones
10. Serialize/deserialize round-trip preserves all data

## Tests

No test file yet — verification via typecheck. Test file `slice-d-3-clipboard.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
