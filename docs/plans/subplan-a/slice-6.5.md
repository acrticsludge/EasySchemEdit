# Subspec A — Slice 6.5: More Orientation Handlers

**Goal:** Add additional vanilla block-state orientation handlers beyond the core table: `rotation` 0-15, boolean side props, `face`+`facing`, chest `type`, rail `ascending`/`curved`, bed/door/trapdoor/stairs/torch-wall variants. Unknown blocks pass through unchanged; strict mode refuses, permissive warns.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/block-state-transforms.ts` | Additional orientation handlers |

## Handlers to Add

### `rotation` 0-15 (signs, banners)
- Rotation: applies same matrix logic as facing (north→west→south→east→north)
- Mirror x/z: swaps appropriate rotation values

### Boolean side props: `north`, `east`, `south`, `west`
- Applies to: fences, panes, walls, redstone, vines, etc.
- Rotation: permutes sides according to R matrix (north↔west↔south↔east↔north)
- Mirror x/z: swaps appropriate sides

### Button/Lever/Grindstone: `face`+`facing`
- `face`: `floor`, `wall`, `ceiling`
- `facing`: direction on face
- Rotation: affects both face and facing per R matrix

### Chest: `type` left/right
- Rotation: unchanged
- Mirror x/z: swaps left/right (chirality)

### Rail: `shape` ascending/curved variants
- `ascending=north/south/east/west`
- `curved=north/east/south/west` (actually curved doesn't exist in vanilla, use `shape`)
- Rotation: transforms according to R matrix
- Mirror: transforms according to mirror plane

### Bed, Door, Trapdoor, Stairs, Torch-Wall
- Bed: `facing` (direction head points), `part` (head/foot)
- Door: `facing`, `half` (upper/lower), `hinge` (left/right)
- Trapdoor: `facing`, `half` (top/bottom)
- Stairs: `facing`, `half`, `shape` (inner/outer corner)
- Torch-wall: `facing` (wall attachment)

## Chirality Rule (acceptance item 11)

- **Rotation** does NOT change stair shape or door hinge
- **Mirror** swaps left/right (stair corner shape, chest type, door hinge)
- Mirror twice = identity

## Strict vs Permissive

- Strict mode: unknown modded block with directional properties → error, operation refused
- Permissive mode: unknown blocks pass through unchanged; warning diagnostic emitted

## Tests

**File:** `packages/domain/__tests__/slice-6.5-orientation-handlers.test.ts`

1. Sign `rotation=0` rotated 90° → `rotation=4` (or equivalent per matrix)
2. Fence `north=true` rotated 90° → `west=true`, others false
3. Chest `type=left` mirrored X → `type=right`
4. Stair `shape=inner_left` rotated 90° → `shape=inner_left` (unchanged)
5. Stair `shape=inner_left` mirrored X → `shape=inner_right`
6. Unknown block passes through unchanged (permissive mode)
7. Unknown block throws error (strict mode)

## Verification Checklist

- [ ] Change does one thing completely (additional orientation handlers)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
