# Subspec B — Slice b-9: inspect() Header-Only Import Preview

**Goal:** Make `inspect()` header-only: `nonAirBlockCount` optional/absent unless cheaply available. Async, takes services.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/inspect.ts` | Header-only import preview |

## inspect() Signature

```ts
export async function inspect(
  bytes: Uint8Array,
  services: NbtServices,
): Promise<{
  format: DetectedFormat;
  dimensions?: { width: number; height: number; length: number };
  nonAirBlockCount?: number;   // optional, absent unless cheaply available
  paletteSize?: number;
  regionCount?: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
}>;
```

## Behavior

- Reads only enough to determine format and dimensions
- No full decompression of block data
- `nonAirBlockCount` optional — absent unless cheaply available from header
- Async (takes `services` for potential decompression)

## Acceptance Criteria

- [ ] `inspect()` is async and takes `services`
- [ ] `nonAirBlockCount` optional/absent unless cheaply available
- [ ] Header-only: no full block data decompression
- [ ] Returns `format`, `dimensions?`, `fileSizeBytes`, `compressedSizeBytes`

## Tests

**File:** `packages/formats/__tests__/slice-b-9-inspect.test.ts`

1. `inspect()` is async
2. Takes `services` parameter
3. Returns format without full decompression
4. `nonAirBlockCount` absent when not cheaply available
5. `fileSizeBytes` and `compressedSizeBytes` always present

## Verification Checklist

- [ ] Change does one thing completely (inspect header-only preview)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
