// packages/ui/__tests__/slice-g-13-asset-load-panel.test.ts
// Slice g-13 tests: asset load panel (SUBSPEC-G §6.4/§8.2).
// Run: node --experimental-strip-types __tests__/slice-g-13-asset-load-panel.test.ts

import {
  createAssetLoadPanel,
} from '../src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const CHECKSUM = 'abc123';

console.log('--- Slice g-13: idle start ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  assertEqual(p.state(), 'idle', 'g-13.1: starts idle');
  assertEqual(p.progress(), 0, 'g-13.1: progress 0');
  assertEqual(p.manualImportAvailable(), false, 'g-13.1: no manual import initially');
}

console.log('--- Slice g-13: auto-download flow ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  assertEqual(p.state(), 'downloading', 'g-13.2: downloading');
  p.updateProgress(50);
  assertEqual(p.progress(), 50, 'g-13.3: progress updated');
  p.updateProgress(150);
  assertEqual(p.progress(), 100, 'g-13.3: progress clamped');
  // Matching checksum → ready.
  p.finishDownload(CHECKSUM);
  assertEqual(p.state(), 'ready', 'g-13.4: matching checksum → ready');
  assertEqual(p.checksum(), CHECKSUM, 'g-13.4: checksum stored');
  assertEqual(p.manualImportAvailable(), false, 'g-13.4: no manual import when ready');
}

console.log('--- Slice g-13: checksum mismatch → manual import ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  p.finishDownload('wrong');
  assertEqual(p.state(), 'failed', 'g-13.5: mismatch → failed');
  assertEqual(p.manualImportAvailable(), true, 'g-13.5: manual import available (never a dead end)');
}

console.log('--- Slice g-13: fail download → manual import ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  p.failDownload('Network error');
  assertEqual(p.state(), 'failed', 'g-13.6: failed');
  assertEqual(p.errorMessage(), 'Network error', 'g-13.6: error message stored');
  assertEqual(p.manualImportAvailable(), true, 'g-13.6: manual import available');
}

console.log('--- Slice g-13: cancel download ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  p.updateProgress(30);
  assertEqual(p.cancelDownload(), true, 'g-13.7: cancel succeeds while downloading');
  assertEqual(p.state(), 'idle', 'g-13.7: returns to idle');
  assertEqual(p.cancelDownload(), false, 'g-13.7: cancel fails when not downloading');
}

console.log('--- Slice g-13: manual JAR import ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  p.failDownload('Network error');
  // Valid checksum → ready.
  assertEqual(p.importManualJar('/path/to/assets.jar', CHECKSUM), true, 'g-13.8: valid manual import succeeds');
  assertEqual(p.state(), 'ready', 'g-13.8: ready after manual import');
  assertEqual(p.manualImportAvailable(), false, 'g-13.8: manual import closed');
  // Invalid checksum → failed.
  const p2 = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p2.startAutoDownload();
  p2.failDownload('Network error');
  assertEqual(p2.importManualJar('/path/to/bad.jar', 'wrong'), false, 'g-13.9: invalid checksum fails');
  assertEqual(p2.state(), 'failed', 'g-13.9: stays failed');
  // Empty path rejected.
  const p3 = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  assertEqual(p3.importManualJar('', CHECKSUM), false, 'g-13.8: empty path rejected');
}

console.log('--- Slice g-13: status label ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  assertEqual(p.statusLabel(), 'Assets not loaded', 'g-13.10: idle label');
  p.startAutoDownload();
  p.updateProgress(42);
  assertEqual(p.statusLabel(), 'Downloading… 42%', 'g-13.10: downloading label');
  p.finishDownload(CHECKSUM);
  assertEqual(p.statusLabel(), 'Assets ready', 'g-13.10: ready label');
}

console.log('--- Slice g-13: reset ---');

{
  const p = createAssetLoadPanel({ expectedChecksum: CHECKSUM });
  p.startAutoDownload();
  p.finishDownload(CHECKSUM);
  p.reset();
  assertEqual(p.state(), 'idle', 'g-13: reset returns to idle');
  assertEqual(p.checksum(), null, 'g-13: reset clears checksum');
}

console.log('\n=== Slice g-13 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
