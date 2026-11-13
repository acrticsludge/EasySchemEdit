const SW_CACHE_NAME = 'easyschemedit-app-shell-v1';
const PRECACHE_URLS = ['/', '/index.html'];

const MOJANG_HOSTS = [
  'piston-meta.mojang.com',
  'piston-data.mojang.com',
  'launchermeta.mojang.com',
  'libraries.minecraft.net',
  'resources.download.minecraft.net'
];

function shouldBypassServiceWorkerCache(
  requestUrl,
  requestMethod = 'GET',
  appOrigin = self.location.origin
) {
  if (requestMethod.toUpperCase() !== 'GET') {
    return true;
  }

  let url;
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== SW_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;

  if (shouldBypassServiceWorkerCache(url, request.method, self.location.origin)) {
    return;
  }

  // Cache-first for immutable asset paths (/_astro/*), network-first for navigation/HTML
  if (url.includes('/_astro/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(SW_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML/navigation
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(SW_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/');
        });
      })
  );
});
