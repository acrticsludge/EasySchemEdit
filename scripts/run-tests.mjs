#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const filter = process.argv[2] ? process.argv[2].toLowerCase() : null;

function findTestFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.astro' ||
          entry.name === '.git'
        ) {
          continue;
        }
        results.push(...findTestFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore errors reading directories
  }
  return results;
}

const rootDir = process.cwd();
const searchDirs = [join(rootDir, 'packages'), join(rootDir, 'apps')];
let testFiles = searchDirs.flatMap(findTestFiles);

// Sort alphabetically for deterministic ordering
testFiles.sort();

if (filter) {
  testFiles = testFiles.filter((f) => f.replace(/\\/g, '/').toLowerCase().includes(filter));
}

if (testFiles.length === 0) {
  console.log(`No test files found${filter ? ` matching "${filter}"` : ''}.`);
  process.exit(0);
}

console.log(`Found ${testFiles.length} test file(s). Running with node --experimental-strip-types...\n`);

let passed = 0;
let failed = 0;
const failures = [];

const startTime = Date.now();

for (const file of testFiles) {
  const relPath = relative(rootDir, file).replace(/\\/g, '/');
  process.stdout.write(`• ${relPath} ... `);

  const result = spawnSync(process.execPath, ['--experimental-strip-types', file], {
    stdio: 'pipe',
    encoding: 'utf-8',
    cwd: rootDir,
  });

  if (result.status === 0) {
    console.log('\x1b[32mPASS\x1b[0m');
    passed++;
  } else {
    console.log('\x1b[31mFAIL\x1b[0m');
    failed++;
    failures.push({
      file: relPath,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    });
  }
}

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n----------------------------------------');
console.log(`Ran ${testFiles.length} test files in ${elapsedSec}s`);
console.log(`Passed: \x1b[32m${passed}\x1b[0m`);
if (failed > 0) {
  console.log(`Failed: \x1b[31m${failed}\x1b[0m\n`);
  console.log('Failure details:');
  for (const f of failures) {
    console.log(`\n--- FAIL: ${f.file} ---`);
    if (f.stdout) console.log(f.stdout);
    if (f.stderr) console.error(f.stderr);
    if (f.error) console.error(f.error);
  }
  process.exit(1);
} else {
  console.log(`Failed: 0`);
  console.log('All tests passed!');
  process.exit(0);
}
