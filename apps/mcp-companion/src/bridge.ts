// MCP companion — localhost HTTP/WebSocket bridge (SUBSPEC-H §4.4)
// Browser editor connects via localhost HTTP + WebSocket to attach to local project.
// Binding is loopback-only; no external network exposure.

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = 8765;
const HOST = '127.0.0.1'; // loopback only

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'mcp-companion' }));
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  // eslint-disable-next-line no-console
  console.log('[mcp-companion] browser connected');
  ws.send(JSON.stringify({ type: 'hello', service: 'mcp-companion' }));

  ws.on('message', (data) => {
    // Echo/ack for now; command bus integration in h-5+
    ws.send(JSON.stringify({ type: 'ack', payload: data.toString() }));
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('[mcp-companion] browser disconnected');
  });
});

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[mcp-companion] bridge listening on http://${HOST}:${PORT}`);
});
