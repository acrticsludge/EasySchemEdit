# Subspec B — Slice b-0: Project Init + Core Types

**Goal:** Set up the `packages/formats` package with core type definitions for format detection. Pure TypeScript, zero Three.js/React/DOM/UI imports. May import from `packages/domain`.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/package.json` | Package manifest, depends on `@easyschemedit/domain` |
| `packages/formats/tsconfig.json` | Strict TypeScript config |
| `packages/formats/types.ts` | Core type definitions |

## Types to Define

```ts
export type FormatSignature = {
  magic: Uint8Array;      // first N bytes used for detection
  mask?: Uint8Array;      // bitmask applied before comparison
  offset: number;         // byte offset where magic starts
};

export type DetectedFormat =
  | { kind: 'schem-v3'; confidence: 'high' | 'low' }
  | { kind: 'schem-v2'; confidence: 'high' | 'low' }
  | { kind: 'litematic'; confidence: 'high' | 'low' }
  | { kind: 'schematic-legacy'; confidence: 'high' | 'low' }
  | { kind: 'unknown'; reason: string };

export type FormatDetectionResult = {
  format: DetectedFormat;
  filenameExtension: string;   // for cross-check, never trusted alone
  extensionMatches: boolean;   // true if extension agrees with signature
  decompressionRequired: boolean; // true if gzip/zlib wrapper detected before NBT
};
```

## Acceptance Criteria

- [ ] `FormatSignature` has `magic`, optional `mask`, `offset`
- [ ] `DetectedFormat` union covers schem-v3, schem-v2, litematic, schematic-legacy, unknown
- [ ] `FormatDetectionResult` includes confidence, extension match flag, decompression flag
- [ ] `packages/formats` has zero imports of Three.js/React/DOM/UI

## Tests

**File:** `packages/formats/__tests__/slice-b-0-types.test.ts`

1. `FormatSignature` type is exported and usable
2. `DetectedFormat` discriminates on `kind` field
3. `FormatDetectionResult` has `filenameExtension`, `extensionMatches`, `decompressionRequired`

## Verification Checklist

- [ ] Change does one thing completely (types only)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
