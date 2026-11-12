# Subspec E — Slice e-6: Texture Atlas Generation

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.2 (TextureData), §4 (Texture filtering), §4 (Atlas generation)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement texture atlas generation types: TextureAtlas, AtlasPage, AtlasEntry, AtlasConfig, AtlasResult. These are pure type definitions for atlas page packing, gutter computation, and mip level computation.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/texture-atlas.ts` | create | `TextureAtlas`, `AtlasPage`, `AtlasEntry`, `AtlasConfig`, `AtlasResult` types |

## Types / APIs

```ts
export type TextureAtlas = {
  id: string;
  pages: AtlasPage[];
  config: AtlasConfig;
  totalPages: number;
};

export type AtlasPage = {
  id: string;
  width: number;              // page width in pixels (max 4096)
  height: number;             // page height in pixels (max 4096)
  entries: Map<string, AtlasEntry>;
  usedRects: { x: number; y: number; w: number; h: number }[];
  remainingSpace: number;     // bytes of unused space
};

export type AtlasEntry = {
  textureId: string;
  x: number;                  // page-relative X
  y: number;                  // page-relative Y
  width: number;
  height: number;
  uvs: { u1: number; v1: number; u2: number; v2: number }; // normalized UV coords
  mipLevels: number;          // number of mip levels generated
};

export type AtlasConfig = {
  maxPageSize: number;        // 4096 (default)
  gutterPx: number;           // 8 (minimum gutter between textures)
  mipSafeGutter: boolean;     // scale gutters for higher mip levels
  paddingPx: number;          // internal padding within each texture
  powerOfTwo: boolean;        // force POT dimensions
};

export type AtlasResult = {
  atlas: TextureAtlas;
  packedTextures: number;     // count of textures successfully packed
  unpackedTextures: string[]; // texture IDs that didn't fit
  diagnostics: Diagnostic[];
  memoryBytes: number;        // total GPU memory used
};
```

Key rules:
- Maximum atlas size: 4096×4096 (GPU-dependent, configurable)
- If textures exceed atlas capacity: split into multiple atlas pages
- Mip-safe gutters: 8px minimum between textures at mip level 0; scaled for higher mip levels

## Acceptance criteria

1. `TextureAtlas` has id, pages, config, totalPages
2. `AtlasPage` has id, width, height, entries, usedRects, remainingSpace
3. `AtlasEntry` has textureId, x, y, width, height, uvs, mipLevels
4. `AtlasConfig` has maxPageSize, gutterPx, mipSafeGutter, paddingPx, powerOfTwo
5. `AtlasResult` has atlas, packedTextures, unpackedTextures, diagnostics, memoryBytes
6. Atlas pages max 4096×4096
7. Textures exceeding capacity split into multiple pages
8. Mip-safe gutters: 8px minimum at mip level 0, scaled for higher mip levels

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-6-texture-atlas.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
