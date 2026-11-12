# Subspec B — Slice b-14: Fixtures and Tests

**Goal:** Define which real files the user must supply for fixture-based checks. Fuzz and golden round-trip only for exportable formats (v3, litematic). One fuzz/golden slice, not two. Mark fixture-based checks as "to verify".

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/__tests__/fixtures/README.md` | Lists required real fixture files |
| `packages/formats/__tests__/fuzz-golden.test.ts` | Combined fuzz + golden round-trip tests |

## Required Real Fixture Files (user must supply)

The following real files must be supplied by the user — do not synthesize:

| Fixture | Format | Purpose | Status |
|---------|--------|---------|--------|
| Sponge v3 `.schem` | schem-v3 | Sponge v3 adapter test | to verify |
| Litematic multi-region `.litematic` | litematic | Multi-region eligibility, golden round-trip | to verify |
| Legacy `.schematic` | schematic-legacy | Convert-on-import test | to verify |
| Vanilla `.nbt` | vanilla-nbt | Vanilla .nbt convert-on-import test | to verify |

## Fuzz Tests

- Only for exportable formats: v3, litematic
- Random byte mutations of valid files
- Safety limits must not be bypassed by malformed input
- Parser never crashes on invalid input (throws typed errors)

## Golden Round-Trip Tests

- Only for exportable formats: v3, litematic
- Import real fixture → export → import again → data matches
- Block entities, entities, biomes, ticks preserved

## Combined Test File

One test file (`fuzz-golden.test.ts`), not two separate slices.

## Acceptance Criteria

- [ ] Fixture README lists required real files (user-supplied, not synthesized)
- [ ] Fuzz tests for v3 and litematic only
- [ ] Golden round-trip for v3 and litematic only
- [ ] One combined fuzz/golden test file
- [ ] Fixture-based checks marked "to verify" (not claimed verified)

## Tests

**File:** `packages/formats/__tests__/fuzz-golden.test.ts`

1. Fuzz: 1000 random mutations of v3 files, all handled gracefully
2. Fuzz: 1000 random mutations of litematic files, all handled gracefully
3. Golden round-trip: v3 fixture import → export → import preserves data
4. Golden round-trip: litematic fixture import → export → import preserves data
5. Fixture-based checks marked "to verify"

## Verification Checklist

- [ ] Change does one thing completely (fixtures + fuzz + golden round-trip)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
