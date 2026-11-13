const path: any = await import('node:' + 'path');
const fs: any = await import('node:' + 'fs');
const urlMod: any = await import('node:' + 'url');
const __filename = urlMod.fileURLToPath((import.meta as any).url);
const __dirname = path.dirname(__filename);

import { shouldBypassServiceWorkerCache, MOJANG_HOSTS, SW_CACHE_NAME } from '../src/editor/sw-policy.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Slice E5.1 Offline Service Worker tests...');

// 1. Test shouldBypassServiceWorkerCache
const appOrigin = 'https://easyschemedit.pages.dev';

// Mojang hosts should bypass SW cache
for (const host of MOJANG_HOSTS) {
  const url = `https://${host}/v1/packages/test/manifest.json`;
  assert(shouldBypassServiceWorkerCache(url, 'GET', appOrigin) === true, `Should bypass Mojang host: ${host}`);
}

// Local MCP companion should bypass SW cache
assert(shouldBypassServiceWorkerCache('http://127.0.0.1:43127/session/pair', 'GET', appOrigin) === true, 'Should bypass local MCP 127.0.0.1');
assert(shouldBypassServiceWorkerCache('http://localhost:43127/healthz', 'GET', appOrigin) === true, 'Should bypass local MCP localhost');

// Non-GET requests should bypass SW cache
assert(shouldBypassServiceWorkerCache(`${appOrigin}/api/save`, 'POST', appOrigin) === true, 'Should bypass POST request');
assert(shouldBypassServiceWorkerCache(`${appOrigin}/api/delete`, 'DELETE', appOrigin) === true, 'Should bypass DELETE request');

// Cross-origin requests should bypass SW cache
assert(shouldBypassServiceWorkerCache('https://external-api.com/data', 'GET', appOrigin) === true, 'Should bypass cross-origin request');

// Same-origin GET requests should NOT bypass SW cache (eligible for app-shell caching)
assert(shouldBypassServiceWorkerCache(`${appOrigin}/`, 'GET', appOrigin) === false, 'Should not bypass same-origin root');
assert(shouldBypassServiceWorkerCache(`${appOrigin}/index.html`, 'GET', appOrigin) === false, 'Should not bypass same-origin index.html');
assert(shouldBypassServiceWorkerCache(`${appOrigin}/_astro/EditorIsland.js`, 'GET', appOrigin) === false, 'Should not bypass same-origin bundle');

console.log('✓ shouldBypassServiceWorkerCache tests passed');

// 2. Verify sw.js exists and contains expected strings
const swPath = path.resolve(__dirname, '../public/sw.js');
assert(fs.existsSync(swPath), 'apps/web/public/sw.js must exist');
const swContent = fs.readFileSync(swPath, 'utf8');
assert(swContent.includes('SW_CACHE_NAME') || swContent.includes('easyschemedit-app-shell-v1'), 'sw.js must contain cache name');
assert(swContent.includes('skipWaiting'), 'sw.js must contain skipWaiting');
assert(swContent.includes('clients.claim'), 'sw.js must contain clients.claim');
assert(swContent.includes('shouldBypassServiceWorkerCache'), 'sw.js must include bypass check');
console.log('✓ sw.js verification passed');

// 3. Verify BaseLayout.astro registers /sw.js
const layoutPath = path.resolve(__dirname, '../src/layouts/BaseLayout.astro');
assert(fs.existsSync(layoutPath), 'BaseLayout.astro must exist');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');
assert(layoutContent.includes("navigator.serviceWorker.register('/sw.js')"), 'BaseLayout.astro must register /sw.js');
console.log('✓ BaseLayout.astro SW registration verification passed');

// 4. Verify wrangler.toml
const wranglerPath = path.resolve(__dirname, '../wrangler.toml');
assert(fs.existsSync(wranglerPath), 'wrangler.toml must exist');
const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
assert(wranglerContent.includes('directory = "./dist"') || wranglerContent.includes('directory = "./dist"'), 'wrangler.toml must have static assets directory');
console.log('✓ wrangler.toml verification passed');

console.log('All Slice E5.1 offline Service Worker tests passed successfully!');
