import {
  createManifest,
  verifyManifest,
  rejectPathTraversal,
  rejectDuplicateEntries,
  type ArchiveEntry,
  type Manifest,
} from '../archive.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Test 1: Deterministic bytes: same project twice = identical manifest
const entries1: ArchiveEntry[] = [
  { path: 'project.json', data: new Uint8Array([1, 2, 3]) },
  { path: 'placements/p1/transform.json', data: new Uint8Array([4, 5]) },
];
const entries2: ArchiveEntry[] = [
  { path: 'placements/p1/transform.json', data: new Uint8Array([4, 5]) },
  { path: 'project.json', data: new Uint8Array([1, 2, 3]) },
];

const manifest1 = createManifest(entries1, '1.0.0', '1.21.11');
const manifest2 = createManifest(entries2, '1.0.0', '1.21.11');
assert(JSON.stringify(manifest1.checksums) === JSON.stringify(manifest2.checksums), 'deterministic checksums');

// Test 2: Path traversal rejected
assert(rejectPathTraversal('../etc/passwd'), '.. path rejected');
assert(rejectPathTraversal('/absolute/path'), 'absolute path rejected');
assert(rejectPathTraversal('path\\with\\backslashes'), 'backslashes rejected');
assert(!rejectPathTraversal('normal/path/file.json'), 'normal path accepted');

// Test 3: Duplicate entries rejected
const dupeEntries: ArchiveEntry[] = [
  { path: 'a.json', data: new Uint8Array([1]) },
  { path: 'a.json', data: new Uint8Array([2]) },
];
assert(rejectDuplicateEntries(dupeEntries), 'duplicate entries detected');

const uniqueEntries: ArchiveEntry[] = [
  { path: 'a.json', data: new Uint8Array([1]) },
  { path: 'b.json', data: new Uint8Array([2]) },
];
assert(!rejectDuplicateEntries(uniqueEntries), 'unique entries OK');

// Test 4: Verify manifest — missing entry
const manifest: Manifest = {
  schemaVersion: 1,
  appVersion: '1.0.0',
  assetProfile: '1.21.11',
  createdAt: '2026-01-01',
  modifiedAt: '2026-01-01',
  checksums: { 'a.json': 'sha256:1', 'b.json': 'sha256:2' },
};
const result = verifyManifest(manifest, [{ path: 'a.json', data: new Uint8Array([1]) }]);
assert(result.missing.includes('b.json'), 'missing entry detected');
assert(!result.valid, 'manifest invalid when entry missing');

// Test 5: Verify manifest — extra entry
const result2 = verifyManifest(manifest, [
  { path: 'a.json', data: new Uint8Array([1]) },
  { path: 'c.json', data: new Uint8Array([3]) },
]);
assert(result2.extra.includes('c.json'), 'extra entry detected');
assert(!result2.valid, 'manifest invalid with extra entry');

// Test 6: Verify manifest — valid
const result3 = verifyManifest(manifest, [
  { path: 'a.json', data: new Uint8Array([1]) },
  { path: 'b.json', data: new Uint8Array([2]) },
]);
assert(result3.valid, 'valid manifest passes');
assert(result3.missing.length === 0, 'no missing entries');
assert(result3.extra.length === 0, 'no extra entries');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
