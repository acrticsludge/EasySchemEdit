# Subspec B — Slice b-1: Format Detection

**Goal:** Implement format detection algorithm: gzip magic detection, NBT structure inspection, extension mismatch handling. Mandatory order per SUBSPEC-B §2.1.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/format-detection.ts` | Format detection implementation |

## Functions to Define

```ts
import type { FormatDetectionResult, DetectedFormat, FormatSignature } from './types.ts';

export function detectFormat(bytes: Uint8Array, filenameExtension: string): FormatDetectionResult;
```

## Detection Algorithm (mandatory order)

1. Read the first 2 bytes. If they match gzip magic `1f 8b`, mark `decompressionRequired = true` and decompress with a bounded decompressor.
2. After decompression (or on raw bytes if not compressed), inspect the NBT structure:
   - Root compound with `Width`, `Height`, `Length`, `Palette`, `BlockStates`, `Offset` → `.schem` v3.
   - Root compound with `Version`, `Regions` → `.litematic`.
   - Root compound with `Materials`, `Blocks`, `Data` → legacy `.schematic`.
   - Root compound with `size`, `palette`, `blocks`, `DataVersion` → vanilla `.nbt`.
   - Otherwise → `unknown`.
3. Compare `filenameExtension` to detected format. If they disagree, emit `FORMAT_EXTENSION_MISMATCH` (warning) but still import using detected format.

## Acceptance Criteria

- [ ] Gzip magic `1f 8b` detected → `decompressionRequired = true`
- [ ] `.schem` v3 detected via `Width`/`Height`/`Length`/`Palette`/`BlockStates`/`Offset`
- [ ] `.litematic` detected via `Version`/`Regions`
- [ ] Legacy `.schematic` detected via `Materials`/`Blocks`/`Data`
- [ ] Vanilla `.nbt` detected via `size`/`palette`/`blocks`/`DataVersion`
- [ ] Extension mismatch → warning, import proceeds using detected format

## Tests

**File:** `packages/formats/__tests__/slice-b-1-format-detection.test.ts`

1. Gzip magic bytes detected → `decompressionRequired = true`
2. Schem-v3 NBT structure detected
3. Litematic NBT structure detected
4. Legacy .schematic NBT structure detected
5. Vanilla .nbt structure detected
6. Extension mismatch produces warning but import proceeds

## Verification Checklist

- [ ] Change does one thing completely (format detection)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
