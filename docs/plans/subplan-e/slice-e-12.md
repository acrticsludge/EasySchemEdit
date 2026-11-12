# Subspec E — Slice e-12: Resource-pack Manager UI

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §6.5 (Resource-pack manager), §2.1 (ResourcePack types)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement resource-pack manager types: PackManagerState, PackEntry, PackCompatibility, PackDiagnostics, PackAction. These are pure type definitions for pack enable/disable, reorder, inspect, compatibility, diagnostics.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/pack-manager.ts` | create | `PackManagerState`, `PackEntry`, `PackCompatibility`, `PackDiagnostics`, `PackAction` types |

## Types / APIs

```ts
export type PackAction = 'enable' | 'disable' | 'add' | 'remove' | 'reorder' | 'setPriority';

export type PackDiagnostics = {
  missingTextures: string[];      // texture IDs referenced but not found
  invalidJSON: string[];          // files with invalid JSON
  oversizedImages: string[];      // image files exceeding size limit
  incompatibleFormat: boolean;    // pack format doesn't match pinned version
  warnings: string[];             // general warnings
};

export type PackCompatibility = {
  compatible: boolean;            // pack format matches pinned version
  packFormat: number;             // pack's format version
  pinnedFormat: number;           // pinned version's format
  reason?: string;                // reason for incompatibility
};

export type PackEntry = {
  id: string;                     // unique pack identifier
  name: string;                   // display name
  source: ResourcePackSource;     // source type and details
  enabled: boolean;               // pack is active/enabled
  priority: number;               // priority order (higher = overrides lower)
  loaded: boolean;                // pack has been loaded
  diagnostics: PackDiagnostics;   // pack diagnostics
  compatibility: PackCompatibility; // format compatibility check
  modelCount: number;             // number of models in pack
  textureCount: number;           // number of textures in pack
  blockStateCount: number;        // number of block state definitions
};

export type PackManagerState = {
  packs: PackEntry[];             // all packs in priority order
  activePackId: string | null;    // currently inspected pack
  showManager: boolean;           // manager UI is open
  defaultPackId: string;          // pinned default pack (1.21.11)
  autoLoadAssets: boolean;        // auto-download assets on startup
};
```

Key rules:
- Enable/disable individual packs
- Reorder packs (drag or up/down buttons)
- Inspect pack contents (models, textures, blockstates)
- Compatibility check: pack format vs pinned version
- Diagnostics: missing textures, invalid JSON, oversized images
- Add/remove user packs
- Priority order visible and editable

## Acceptance criteria

1. `PackEntry` has id, name, source, enabled, priority, loaded, diagnostics, compatibility, modelCount, textureCount, blockStateCount
2. `PackDiagnostics` has missingTextures, invalidJSON, oversizedImages, incompatibleFormat, warnings
3. `PackCompatibility` has compatible, packFormat, pinnedFormat, reason?
4. `PackManagerState` has packs, activePackId, showManager, defaultPackId, autoLoadAssets
5. `PackAction` is 'enable' | 'disable' | 'add' | 'remove' | 'reorder' | 'setPriority'
6. Packs ordered by priority (higher = overrides lower)
7. Default pack (1.21.11) pinned and cannot be disabled
8. Compatibility check compares pack format vs pinned version

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-12-pack-manager.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
