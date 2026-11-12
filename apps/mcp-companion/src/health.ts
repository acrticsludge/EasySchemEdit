// MCP companion — health endpoints (SUBSPEC-H §4.4)
// /healthz, /readyz, /metrics

import { createServer } from 'http';

const PORT = 8766;
const HOST = '127.0.0.1';

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'mcp-companion',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    })
  );
});

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[mcp-companion] health listening on http://${HOST}:${PORT}`);
});
