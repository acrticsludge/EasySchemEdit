import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

console.log('[build-worker] Bundling src/worker.ts -> dist/_worker.js ...');

await esbuild.build({
  entryPoints: [path.join(webRoot, 'src/worker.ts')],
  outfile: path.join(webRoot, 'dist/_worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  target: 'es2022',
  external: ['node:*'],
});

console.log('[build-worker] Worker bundled successfully.');

// Mirror apps/web/dist to root dist for deployment hooks
const distPath = path.join(webRoot, 'dist');
const rootDistPath = path.join(repoRoot, 'dist');
console.log(`[build-worker] Mirroring ${distPath} -> ${rootDistPath} ...`);
fs.rmSync(rootDistPath, { recursive: true, force: true });
fs.cpSync(distPath, rootDistPath, { recursive: true });
console.log('[build-worker] Build and copy complete.');
