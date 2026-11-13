export const SW_CACHE_NAME = 'easyschemedit-app-shell-v1';
export const PRECACHE_URLS = ['/', '/index.html'];

export const MOJANG_HOSTS = [
  'piston-meta.mojang.com',
  'piston-data.mojang.com',
  'launchermeta.mojang.com',
  'libraries.minecraft.net',
  'resources.download.minecraft.net'
];

export function shouldBypassServiceWorkerCache(
  requestUrl: string,
  requestMethod = 'GET',
  appOrigin = 'https://easyschemedit.pages.dev'
): boolean {
  if (requestMethod.toUpperCase() !== 'GET') {
    return true;
  }

  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return true;
  }

  // Bypass for local MCP companion bridge
  if (
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    url.port === '43127'
  ) {
    return true;
  }

  // Bypass for Mojang hosts
  if (MOJANG_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))) {
    return true;
  }

  // Cross-origin check
  if (url.origin !== 'null' && appOrigin && url.origin !== appOrigin) {
    return true;
  }

  return false;
}
