// apps/mcp-companion/src/tools/clipboard.ts
// MCP clipboard tool types (SUBSPEC-F §2.3).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i } from '../../../../packages/domain/types.ts';

// ============================================================================
// Clipboard Tool Types
// ============================================================================

export type ClipboardTool =
  | 'copy'
  | 'cut'
  | 'paste';

// ============================================================================
// Clipboard Tool Result
// ============================================================================

export type ClipboardToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedCells: number;
  affectedBounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  warnings: string[];
  error?: ClipboardToolError;
};

export type ClipboardToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
};

// ============================================================================
// Copy Result
// ============================================================================

export type CopyResult = {
  projectId: string;
  clipboardId: string;
  blockCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
};

// ============================================================================
// Cut Result
// ============================================================================

export type CutResult = {
  projectId: string;
  clipboardId: string;
  blockCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  removedBlocks: number;
};

// ============================================================================
// Paste Result
// ============================================================================

export type PasteResult = {
  projectId: string;
  clipboardId: string;
  targetPosition: [number, number, number];
  changedCells: number;
  affectedBounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
};

// ============================================================================
// Clipboard Tool Result Map
// ============================================================================

export type ClipboardToolResultMap = {
  copy: CopyResult;
  cut: CutResult;
  paste: PasteResult;
};
