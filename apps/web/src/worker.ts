// Worker entry point for Cloudflare Workers Static Assets.
// Serves the Astro static build from the ASSETS binding and falls back to
// index.html for SPA routes (client-side routing in the React editor island).
export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }, ctx: ExecutionContext): Promise<Response> {
    // Try to serve the requested static asset first.
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Fall through to SPA fallback below.
    }

    // SPA fallback: serve index.html for any non-asset route so the
    // React editor island can handle client-side routing.
    return env.ASSETS.fetch(new Request('https://static/index.html', request));
  },
};
