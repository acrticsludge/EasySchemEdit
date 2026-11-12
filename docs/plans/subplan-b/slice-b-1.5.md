# Subspec B — Slice b-1.5: Format Detection

**Goal:** Implement format detection: gzip magic detection, NBT structure inspection, extension mismatch handling. Mandatory order per SUBSPEC-B §2.1.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/format-detection.ts` | Format detection implementation |

## Detection Algorithm (mandatory order)

1. Read first 2 bytes. If gzip magic `1f 8b`, mark `decompressionRequired = true` and decompress with bounded decompressor.
2. After decompression (or raw bytes), inspect NBT structure:
   - Root compound `"Schematic"` with `Version=3`, `DataVersion`, `Width`/`Height`/`Length`, `Offset`, `Blocks`, `Entities`, `Biomes` → Sponge v3.
   - Root compound with `Palette` (compound: state string → int) + `BlockData` (VarInt bytes) → Sponge v2.
   - Root compound with `Materials`, `Blocks`, `Data` → legacy `.schematic`.
   - Root compound with `size`, `palette`, `blocks`, `DataVersion` → vanilla `.nbt`.
   - Otherwise → `unknown`.
3. Compare `filenameExtension` to detected format. Disagreement → `FORMAT_EXTENSION_MISMATCH` warning but import proceeds using detected format.

## Functions to Define

```ts
export function detectFormat(bytes: Uint8Array, filenameExtension: string): FormatDetectionResult;
```

## Acceptance Criteria

- [ ] Gzip magic `1f 8b` → `decompressionRequired = true`
- [ ] Sponge v3 detected via root `"Schematic"` compound with `Version=3`
- [ ] Sponge v2 detected via root `Palette` compound + `BlockData` VarInt bytes
- [ ] Legacy `.schematic` detected via `Materials`/`Blocks`/`Data`
- [ ] Vanilla `.nbt` detected via `size`/`palette`/`blocks`/`DataVersion`
- [ ] Extension mismatch → warning, import proceeds using detected format

## Tests

**File:** `packages/formats/__tests__/slice-b-1.5-format-detection.test.ts`

1. Gzip magic bytes detected → `decompressionRequired = true`
2. Sponge v3 NBT structure detected
3. Sponge v2 NBT structure detected (Palette compound + BlockData VarInt)
4. Legacy `.schematic` NBT structure detected
5. Vanilla `.nbt` structure detected
6. Extension mismatch produces warning but import proceeds

## Verification Checklist

- [ ] Change does one thing completely (format detection)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
