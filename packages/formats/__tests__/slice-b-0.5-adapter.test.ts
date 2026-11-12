// Slice b-0.5: adapter interface + reports test
import type {
  FormatAdapter,
  ImportResult,
  ExportResult,
  ImportOptions,
  ExportTarget,
  ExportOptions,
  ProjectSnapshot,
} from '../adapter.ts';
import type { ImportReport, ExportReport, ExportValidationResult } from '../reports.ts';
import type { FormatDetectionResult, DetectedFormat } from '../types.ts';
import type {
  BlockStateId,
  Bounds3i,
  Vec3Half,
} from '../../domain/types.ts';
import type { Placement } from '../../domain/placement.ts';
import type { Transform } from '../../domain/coordinates.ts';
import type { Diagnostic } from '../../domain/shared-types.ts';
import type { NbtTag } from '../../domain/nbt.ts';

// 1. FormatAdapter interface is exported and structurally typed
const adapter: FormatAdapter = {
  formatId: 'schem-v3',
  detect: (_bytes: Uint8Array): FormatDetectionResult => ({
    format: { kind: 'schem-v3', confidence: 'high' },
    filenameExtension: '.schem',
    extensionMatches: true,
    decompressionRequired: false,
  }),
  import: async (_bytes: Uint8Array, _options: ImportOptions): Promise<ImportResult> => ({
    placements: [],
    importGroups: [],
    report: {} as ImportReport,
    normalizedImport: false,
  }),
  export: async (
    _snapshot: ProjectSnapshot,
    _target: ExportTarget,
    _options: ExportOptions,
  ): Promise<ExportResult> => ({
    bytes: new Uint8Array(),
    filename: 'test.schem',
    report: {} as ExportReport,
  }),
};
console.assert(adapter.formatId === 'schem-v3', 'formatId');
console.assert(typeof adapter.detect === 'function', 'detect');
console.assert(typeof adapter.import === 'function', 'import');
console.assert(typeof adapter.export === 'function', 'export');

// 2. ExportTarget union discriminates on kind field
const placementTarget: ExportTarget = { kind: 'placement', placementId: 'p1' };
const importGroupTarget: ExportTarget = { kind: 'importGroup', importGroupId: 'g1' };
const compositeTarget: ExportTarget = { kind: 'composite', includeHidden: false };
const selectionTarget: ExportTarget = {
  kind: 'selection',
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  includeHidden: true,
};
console.assert(placementTarget.kind === 'placement', 'placement kind');
console.assert(importGroupTarget.kind === 'importGroup', 'importGroup kind');
console.assert(compositeTarget.kind === 'composite', 'composite kind');
console.assert(selectionTarget.kind === 'selection', 'selection kind');

// 3. ProjectSnapshot.chunkViews is a nested Map<string, Map<string, ...>>
const chunkViews: ProjectSnapshot['chunkViews'] = new Map();
const inner = new Map<string, { indices: Uint16Array; palette: BlockStateId[] }>();
inner.set('0_0_0', { indices: new Uint16Array([0]), palette: [] });
chunkViews.set('placement-1', inner);
console.assert(chunkViews.get('placement-1')?.get('0_0_0')?.indices instanceof Uint16Array, 'chunkViews nested Map');

// 4. ExportOptions has targetDataVersion, onProgress, signal
const opts: ExportOptions = {
  strict: true,
  confirmLossy: false,
  includeRegionMetadata: true,
  trimOuterAir: true,
  bakeTransforms: true,
  targetDataVersion: 3522,
  onProgress: (done, total) => {
    console.assert(done >= 0, 'done >= 0');
    console.assert(total > 0, 'total > 0');
  },
  signal: new AbortController().signal,
};
console.assert(opts.targetDataVersion === 3522, 'targetDataVersion');
console.assert(typeof opts.onProgress === 'function', 'onProgress');
console.assert(opts.signal instanceof AbortSignal, 'signal');

// 5. Error classes
import { ExportError, NbtSafetyError } from '../errors.ts';
const ee = new ExportError('EXPORT_DIMENSION_LIMIT', 'dim too big', { width: 70000 });
console.assert(ee.code === 'EXPORT_DIMENSION_LIMIT', 'ExportError code');
console.assert(ee.name === 'ExportError', 'ExportError name');
const ne = new NbtSafetyError('NBT_TAG_COUNT_EXCEEDED', 'too many tags');
console.assert(ne.code === 'NBT_TAG_COUNT_EXCEEDED', 'NbtSafetyError code');
console.assert(ne.name === 'NbtSafetyError', 'NbtSafetyError name');

// 6. ExportValidationResult shape
const val: ExportValidationResult = {
  passed: true,
  reimportComparison: { matches: true, differences: [] },
};
console.assert(val.passed === true, 'validation passed');
console.assert(val.reimportComparison.matches === true, 'reimport matches');

console.log('All slice b-0.5 tests passed.');
