// packages/formats/src/index.ts
// Public API for the formats package.

export { detectFormat } from './format-detection.ts';
export { decodeNbtFromBytes } from './nbts.ts';
export type { DetectedFormat, FormatDetectionResult } from './types.ts';