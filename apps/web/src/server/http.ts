export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has('Content-Type')) {
    mergedHeaders.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: mergedHeaders,
  });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const equalIndex = pair.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    const name = pair.slice(0, equalIndex).trim();
    const value = pair.slice(equalIndex + 1).trim();
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }
  return cookies;
}

export function isSecureRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
