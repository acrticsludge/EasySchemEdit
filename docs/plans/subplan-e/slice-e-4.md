# Subspec E — Slice e-4: Resource-pack Inheritance + Weighted Model Selection

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §3.2 (Resource-pack inheritance), §2.1 (ModelReference weight field)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement resource-pack inheritance and weighted model selection types: PackLayer, PackResolutionResult, TextureVariable, WeightedModelSelection. These are pure type definitions for pack merging, texture variable resolution, and deterministic model selection.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/pack-resolution.ts` | create | `PackLayer`, `PackResolutionResult`, `TextureVariable`, `WeightedModelSelection`, `PackMergeStrategy` types |

## Types / APIs

```ts
export type PackLayer = {
  id: string;
  priority: number;          // 0 = vanilla base, higher = overrides
  source: ResourcePackSource;
  models: Map<string, BlockModel>;
  textures: Map<string, TextureData>;
  blockStates: Map<string, BlockStateDefinition>;
  active: boolean;
};

export type PackResolutionResult = {
  resolvedModels: Map<string, BlockModel>;
  resolvedTextures: Map<string, TextureData>;
  resolvedBlockStates: Map<string, BlockStateDefinition>;
  layerPriorities: string[]; // layer IDs in priority order (low to high)
  diagnostics: Diagnostic[];
};

export type TextureVariable = {
  name: string;              // e.g. "#side", "#top"
  source: string;            // texture slot name or variable reference
  resolved?: string;         // resolved texture ID after inheritance
};

export type WeightedModelSelection = {
  modelId: string;
  weight: number;            // relative weight (default 1)
  cumulativeWeight: number;  // precomputed for deterministic selection
};

export type PackMergeStrategy = 'override' | 'merge' | 'deep-merge';
```

## Acceptance criteria

1. `PackLayer` has id, priority, source, models, textures, blockStates, active
2. `PackResolutionResult` has resolvedModels, resolvedTextures, resolvedBlockStates, layerPriorities, diagnostics
3. `TextureVariable` has name, source, resolved?
4. `WeightedModelSelection` has modelId, weight, cumulativeWeight
5. `PackMergeStrategy` is 'override' | 'merge' | 'deep-merge'
6. Pack resolution follows priority order: vanilla base (0) → user packs (higher wins)
7. Texture variable resolution: #variable in model → parent chain → grandparent → missing texture fallback
8. Weighted model selection is deterministic across chunk rebuilds

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-4-pack-resolution.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
