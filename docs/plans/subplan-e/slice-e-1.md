# Subspec E — Slice e-1: Resource Pack Types

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.1 (Resource pack types)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement resource pack types: AssetProfile, ResourcePackSource, ResourcePack, BlockModel, ModelElement, ModelFace, TextureData, BlockStateDefinition, ModelReference, MultipartEntry. These are pure type definitions.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/resource-pack-types.ts` | create | AssetProfile, ResourcePackSource, ResourcePack, BlockModel, ModelElement, ModelFace, TextureData, BlockStateDefinition, ModelReference, MultipartEntry types |

## Types / APIs

```ts
export type AssetProfile = {
  id: string;
  minecraftVersion: string;
  packFormat: number;
  displayName: string;
  pinned: boolean;
};

export type ResourcePackSource =
  | { kind: 'vanilla-runtime'; version: string; assetHash: string }
  | { kind: 'manual-jar'; filename: string; jarHash: string }
  | { kind: 'user-pack'; path: string; priority: number };

export type ResourcePack = {
  source: ResourcePackSource;
  models: Map<string, BlockModel>;
  textures: Map<string, TextureData>;
  blockStates: Map<string, BlockStateDefinition>;
  priority: number;
  loaded: boolean;
  diagnostics: Diagnostic[];
};

export type BlockModel = {
  id: string;
  elements?: ModelElement[];
  parent?: string;
  textures: Record<string, string>;
  ambientOcclusion?: boolean;
  guiLight?: 'front' | 'side';
  display?: Record<string, ModelDisplay>;
};

export type ModelElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: { angle: number; axis: 'x' | 'y' | 'z'; origin: [number, number, number] };
  shade?: boolean;
  faces: Record<string, ModelFace>;
};

export type ModelFace = {
  texture: string;
  uv?: [number, number, number, number];
  cullface?: string;
  rotation?: 0 | 90 | 180 | 270;
  tintindex?: number;
};

export type TextureData = {
  id: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  mipLevels: Uint8ClampedArray[];
};

export type BlockStateDefinition = {
  variants?: Record<string, ModelReference | ModelReference[]>;
  multipart?: MultipartEntry[];
};

export type ModelReference = {
  model: string;
  x?: 0 | 90 | 180 | 270;
  y?: 0 | 90 | 180 | 270;
  uvlock?: boolean;
  weight?: number;
};

export type MultipartEntry = {
  apply: ModelReference | ModelReference[];
  when?: Record<string, string | string[]>;
};
```

Key decisions:
- `ResourcePackSource` is a discriminated union on `kind`
- `Diagnostic` type from SUBSPEC-E (imported from domain or defined locally)
- `ModelDisplay` type needed for `BlockModel.display`
- All types are pure — no Three.js imports

## Acceptance criteria

1. `AssetProfile` has id, minecraftVersion, packFormat, displayName, pinned
2. `ResourcePackSource` is a discriminated union with kind: 'vanilla-runtime' | 'manual-jar' | 'user-pack'
3. `ResourcePack` has source, models, textures, blockStates, priority, loaded, diagnostics
4. `BlockModel` has id, optional elements/parent/display, required textures
5. `ModelElement` has from, to, optional rotation/shade, required faces
6. `ModelFace` has texture, optional uv/cullface/rotation/tintindex
7. `TextureData` has id, width, height, pixels (Uint8ClampedArray), mipLevels
8. `BlockStateDefinition` has optional variants/multipart
9. `ModelReference` has model, optional x/y/uvlock/weight
10. `MultipartEntry` has apply, optional when
11. `packages/renderer` imports only from `@easyschemedit/domain`

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-1-resource-pack.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
