import { clampInt, clampRenderSize } from '../src/server/mcp-server.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Cloud MCP request-size clamp tests...');

// clampInt caps oversized values, floors fractions, and keeps defaults for invalid input.
assert(clampInt(200000, 512, 1, 4096) === 4096, 'maxBlocks must be capped at 4096');
assert(clampInt(12.9, 512, 1, 4096) === 12, 'numeric values must be floored');
assert(clampInt(-5, 512, 1, 4096) === 1, 'values below min must be raised to min');
assert(clampInt(undefined, 256, 1, 4096) === 256, 'absent values must use the fallback');
assert(clampInt('200000', 512, 1, 4096) === 512, 'non-number values must use the fallback');
assert(clampInt(Number.NaN, 512, 1, 4096) === 512, 'non-finite values must use the fallback');
assert(clampInt(Number.POSITIVE_INFINITY, 512, 1, 4096) === 512, 'infinite values must use the fallback');

// clampRenderSize keeps documented defaults, caps each dimension, and enforces the pixel budget.
const defaults = clampRenderSize(undefined, undefined);
assert(defaults.width === 680 && defaults.height === 360, 'absent dimensions must keep 680x360 defaults');
const invalid = clampRenderSize('bad', 'bad');
assert(invalid.width === 680 && invalid.height === 360, 'invalid dimensions must keep 680x360 defaults');
const huge = clampRenderSize(200000, 200000);
assert(huge.width <= 1280 && huge.height <= 1280, 'dimensions must be capped at 1280');
assert(huge.width * huge.height <= 1280 * 720, 'render pixel budget must be respected');
const skewed = clampRenderSize(5000, 100);
assert(skewed.width <= 1280 && skewed.height <= 1280, 'skewed dimensions must be capped');
assert(skewed.width * skewed.height <= 1280 * 720, 'skewed render must respect pixel budget');

console.log('All clamp tests passed.');
