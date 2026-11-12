// Slice b-0: types test
import type {
  FormatSignature,
  DetectedFormat,
  FormatDetectionResult,
} from '../types.ts';

// 1. FormatSignature type is exported and usable
const sig: FormatSignature = {
  magic: new Uint8Array([0x1f, 0x8b]),
  offset: 0,
};
console.assert(sig.magic.length === 2, 'magic length');
console.assert(sig.offset === 0, 'offset default');

// mask is optional
const sigNoMask: FormatSignature = { magic: new Uint8Array([0]), offset: 0 };
console.assert(sigNoMask.mask === undefined, 'mask optional');

// 2. DetectedFormat discriminates on kind field
const v3: DetectedFormat = { kind: 'schem-v3', confidence: 'high' };
const v2: DetectedFormat = { kind: 'schem-v2', confidence: 'low' };
const lit: DetectedFormat = { kind: 'litematic', confidence: 'high' };
const legacy: DetectedFormat = { kind: 'schematic-legacy', confidence: 'high' };
const vanilla: DetectedFormat = { kind: 'vanilla-nbt', confidence: 'high' };
const unknown: DetectedFormat = { kind: 'unknown', reason: 'no match' };

console.assert(v3.kind === 'schem-v3', 'schem-v3 kind');
console.assert(v2.kind === 'schem-v2', 'schem-v2 kind');
console.assert(lit.kind === 'litematic', 'litematic kind');
console.assert(legacy.kind === 'schematic-legacy', 'schematic-legacy kind');
console.assert(vanilla.kind === 'vanilla-nbt', 'vanilla-nbt kind');
console.assert(unknown.kind === 'unknown', 'unknown kind');

// 3. FormatDetectionResult has filenameExtension, extensionMatches, decompressionRequired
const result: FormatDetectionResult = {
  format: v3,
  filenameExtension: '.schem',
  extensionMatches: true,
  decompressionRequired: true,
};
console.assert(result.format.kind === 'schem-v3', 'format kind');
console.assert(result.filenameExtension === '.schem', 'filenameExtension');
console.assert(result.extensionMatches === true, 'extensionMatches');
console.assert(result.decompressionRequired === true, 'decompressionRequired');

console.log('All slice b-0 type tests passed.');
