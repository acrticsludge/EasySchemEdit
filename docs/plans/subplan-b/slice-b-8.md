# Subspec B — Slice b-8: Sponge v3 Adapter

**Goal:** Implement Sponge schematic v3 adapter. Offset is int[3], defined relative to the paste point (paste target + Offset = min corner). Worked example without absolute world coordinates. To be verified with a WorldEdit fixture (to verify).

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/sponge-v3.ts` | Sponge v3 adapter |

## Sponge v3 Structure

```
Root compound "Schematic":
  Version: Int = 3
  DataVersion: Int
  Width: Int
  Height: Int
  Length: Int
  Offset: Int[3]
  Blocks: Compound {
    Palette: List<String>
    Data: Byte[]          // VarInt array
    BlockEntities: List<Compound>
  }
  Entities: List<Compound>
  Biomes: Compound?       // optional
```

## Offset Definition

`Offset` is int[3], relative to the paste point:
- `pasteTarget + Offset = min corner` of the build
- NOT absolute world coordinates

## Worked Example (no absolute world coords)

Paste target at local origin (0, 0, 0). Offset = (-2, 0, -3). Build min corner = (-2, 0, -3). Blocks start at x=-2, z=-3 relative to paste target. No world coordinates involved.

## Acceptance Criteria

- [ ] Sponge v3 detected via root `"Schematic"` compound with `Version=3`
- [ ] Offset is int[3]
- [ ] Offset defined relative to paste point: `pasteTarget + Offset = min corner`
- [ ] Worked example uses relative (not absolute world) coordinates
- [ ] To be verified with WorldEdit fixture (mark: to verify)

## Tests

**File:** `packages/formats/__tests__/slice-b-8-sponge-v3.test.ts`

1. Sponge v3 format detected (root "Schematic" with Version=3)
2. Offset read as int[3]
3. Width/Height/Length read correctly
4. Block palette + VarInt data decoded
5. Block entities, entities, biomes preserved
6. Offset relative-to-paste-point worked example (to verify with fixture)

## Verification Checklist

- [ ] Change does one thing completely (Sponge v3 adapter)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
