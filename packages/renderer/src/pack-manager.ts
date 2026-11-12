// packages/renderer/src/pack-manager.ts
// Resource-pack manager types (SUBSPEC-E §6.5, §2.1).
// Pure TypeScript, zero Three.js imports.
// Imports ResourcePackSource, Diagnostic from domain/renderer via relative paths.

import type { Diagnostic } from '../../domain/shared-types.ts';
import type { ResourcePackSource } from './resource-pack-types.ts';

// ============================================================================
// Pack Action
// ============================================================================

export type PackAction =
  | 'enable'
  | 'disable'
  | 'add'
  | 'remove'
  | 'reorder'
  | 'setPriority';

// ============================================================================
// Pack Diagnostics
// ============================================================================

export type PackDiagnostics = {
  missingTextures: string[];      // texture IDs referenced but not found
  invalidJSON: string[];          // files with invalid JSON
  oversizedImages: string[];      // image files exceeding size limit
  incompatibleFormat: boolean;    // pack format doesn't match pinned version
  warnings: string[];             // general warnings
};

// ============================================================================
// Pack Compatibility
// ============================================================================

export type PackCompatibility = {
  compatible: boolean;            // pack format matches pinned version
  packFormat: number;             // pack's format version
  pinnedFormat: number;           // pinned version's format
  reason?: string;                // reason for incompatibility
};

// ============================================================================
// Pack Entry
// ============================================================================

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

// ============================================================================
// Pack Manager State
// ============================================================================

export type PackManagerState = {
  packs: PackEntry[];             // all packs in priority order
  activePackId: string | null;    // currently inspected pack
  showManager: boolean;           // manager UI is open
  defaultPackId: string;          // pinned default pack (1.21.11)
  autoLoadAssets: boolean;        // auto-download assets on startup
};
