# Subspec A — Slice 11: Validation Rules

**Goal:** Implement safe-integer validation, palette thresholds, origin/translation rejection, and the `ENGINE_OFF_GRID_TRANSFORM` error.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/validation.ts` | Validation rules + error codes |

## Validation Rules

```ts
export class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function validateTranslation(translation: Vec3i): void {
  for (const c of translation) {
    if (!Number.isInteger(c) || !Number.isSafeInteger(c)) {
      throw new ValidationError('ENGINE_OFF_GRID_TRANSFORM', `Fractional translation component: ${c}`);
    }
  }
}

export function validateVolumeBounds(min: Vec3i, maxExclusive: Vec3i): void {
  for (let i = 0; i < 3; i++) {
    const size = maxExclusive[i] - min[i];
    if (size <= 0 || !Number.isSafeInteger(size)) {
      throw new ValidationError('INTEGER_OVERFLOW', `Invalid dimension on axis ${i}: ${size}`);
    }
  }
  const totalCells = BigInt(maxExclusive[0] - min[0]) *
    BigInt(maxExclusive[1] - min[1]) *
    BigInt(maxExclusive[2] - min[2]);
  if (totalCells > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError('INTEGER_OVERFLOW', `Total cells exceeds MAX_SAFE_INTEGER`);
  }
}

export function validatePaletteSize(paletteSize: number): 'Uint8Array' | 'Uint16Array' {
  if (paletteSize <= 256) return 'Uint8Array';
  return 'Uint16Array'; // per-chunk max is 4096 entries; Uint32 not used for chunks
}
```

## Acceptance Criteria

- [ ] Fractional `translation` rejected with `ENGINE_OFF_GRID_TRANSFORM`; never silently snapped
- [ ] `volume.bounds.size` per axis > 0 and `< Number.MAX_SAFE_INTEGER`
- [ ] `totalCells` validated with BigInt multiplication before conversion to number
- [ ] Palette index overflow beyond `Uint32Array` range is hard rejection
- [ ] Mixed-type lists rejected (acceptance item 12): validation function rejects lists containing mixed tag types
- [ ] Zero-size/empty placements allowed: EMPTY_VOLUME/DIMENSION code, not INTEGER_OVERFLOW

## Tests

**File:** `packages/domain/__tests__/slice-11-validation.test.ts`

1. `validateTranslation([1.5, 0, 0])` throws `ENGINE_OFF_GRID_TRANSFORM`
2. `validateTranslation([1, 0, 0])` does not throw
3. Volume with `maxExclusive - min = 0` on any axis throws `INTEGER_OVERFLOW`
4. Volume with total cells > MAX_SAFE_INTEGER throws `INTEGER_OVERFLOW`
5. `validatePaletteSize(200)` returns `'Uint8Array'`
6. `validatePaletteSize(300)` returns `'Uint16Array'`
7. Mixed-type list (byte + int in same list) rejected with `NBT_MIXED_TYPE_LIST`
8. Zero-size placement accepted with `ENGINE_EMPTY_VOLUME`, not `INTEGER_OVERFLOW`

## Verification Checklist

- [ ] Change does one thing completely (validation rules)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
