import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ============================================================================
// MCP Companion — stdio server (SUBSPEC-H §1 H13, §4.4)
// ============================================================================

// Tool input schemas (Zod for validation)
const GetPlacementSchema = z.object({
  placementId: z.string(),
  expectedRevision: z.number().optional(),
});

const GetOriginSchema = z.object({
  placementId: z.string(),
  expectedRevision: z.number().optional(),
});

const DetectConflictsSchema = z.object({
  worldBounds: z.array(z.number()).length(6),
  expectedRevision: z.number().optional(),
});

const RegionOpSchema = z.object({
  operation: z.enum(['fill', 'replace', 'delete', 'copy', 'paste', 'move', 'bake']),
  placementId: z.string(),
  worldBounds: z.array(z.number()).length(6),
  expectedRevision: z.number(),
  requestId: z.string(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
});

// Tool handler stubs — these delegate to the shared command bus (h-5+).
// No MCP-only operation implementations (SUBSPEC-H §2.3).
async function handleGetPlacement(args: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ placementId: args.placementId, status: 'stub' }) }],
  };
}

async function handleGetOrigin(args: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ placementId: args.placementId, origin: [0, 0, 0] }) }],
  };
}

async function handleDetectConflicts(args: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ conflicts: [], count: 0 }) }],
  };
}

async function handleRegionOp(args: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ operation: args.operation, status: 'stub' }) }],
  };
}

// Create MCP server
const server = new Server(
  {
    name: '@easyschemedit/mcp-companion',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers registered here once the shared command bus is wired (h-5+).
// Tools are declared via the server's tool list; handlers are no-ops stubs
// returning "not implemented" until the command bus integration lands.

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[mcp-companion] stdio server listening');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[mcp-companion] fatal error:', err);
  process.exit(1);
});
