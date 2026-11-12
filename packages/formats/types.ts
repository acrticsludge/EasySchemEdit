// Subspec B — Slice b-0: Project Init + Core Types
// Pure TypeScript, zero Three.js/React/DOM/UI imports. May import from @easyschemedit/domain.

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
  | { kind: 'vanilla-nbt'; confidence: 'high' | 'low' }
  | { kind: 'unknown'; reason: string };

export type FormatDetectionResult = {
  format: DetectedFormat;
  filenameExtension: string;   // for cross-check, never trusted alone
  extensionMatches: boolean;   // true if extension agrees with signature
  decompressionRequired: boolean; // true if gzip/zlib wrapper detected before NBT
};
