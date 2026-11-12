# Subspec B — Slice b-12: Snapshot Types

**Goal:** Snapshot types: ancillary data per placement; positions as Vec3i tuples; `nbt: NbtTag`; `targetDataVersion: number`; add `vanilla-nbt` to `DetectedFormat`; `chunkViews` keyed by `placementId` + `chunkKey` (nested Map or tuple, not colon string). Copy-then-transfer: main thread keeps live data; copy; transfer the copy; worker returns new buffers.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/snapshot.ts` | Snapshot types + copy-then-transfer contract |

## Snapshot Types

Ancillary data lives per placement (not global):

```ts
export type PlacementAncillary = {
  blockEntities: Map<string, { position: Vec3i; nbt: NbtTag }>;
  entities: Array<{ id: string; position: Vec3i; rotation: Vec3i; nbt: NbtTag }>;
  biomes?: { palette: string[]; indices: Uint8Array | Uint16Array | Uint32Array; bounds: Bounds3i };
  pendingTicks: Array<{ position: Vec3i; blockState: BlockStateId; tickDelay: number }>;
  tombstones: Set<string>;
};
```

`chunkViews`: nested Map keyed by placementId + chunkKey (not colon string):

```ts
chunkViews: Map<string, Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>>;
// outer key: placementId; inner key: chunkKey (tuple "cx_cy_cz" or structured key)
```

## Copy-Then-Transfer Contract

1. Main thread keeps live data
2. Copy data to transferable buffer
3. Transfer the copy to worker
4. Worker returns new buffers (not the originals)

```ts
export function copyThenTransfer<T>(data: T, transferables: ArrayBufferLike[]): { copy: T; transferred: ArrayBufferLike[] };
```

## Acceptance Criteria

- [ ] Ancillary data per placement (block entities, entities, biomes, ticks, tombstones)
- [ ] Positions as `Vec3i` tuples
- [ ] `nbt: NbtTag` (not `unknown`)
- [ ] `targetDataVersion: number` (not string or optional)
- [ ] `vanilla-nbt` added to `DetectedFormat`
- [ ] `chunkViews` keyed by `placementId` + `chunkKey` (nested Map, not colon string)
- [ ] Copy-then-transfer: main keeps live; copy; transfer copy; worker returns new buffers

## Tests

**File:** `packages/formats/__tests__/slice-b-12-snapshot.test.ts`

1. Ancillary data per placement
2. Positions as Vec3i tuples
3. `nbt: NbtTag` type
4. `targetDataVersion: number`
5. `vanilla-nbt` in `DetectedFormat`
6. `chunkViews` nested Map (placementId → chunkKey → data)
7. Copy-then-transfer contract

## Verification Checklist

- [ ] Change does one thing completely (snapshot types + copy-then-transfer)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
