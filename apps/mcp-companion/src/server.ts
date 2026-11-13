// apps/mcp-companion/src/server.ts
// MCP Companion — stdio server (SUBSPEC-F §5, §6; SUBSPEC-H §1 H13, §4.4).
// Registers all SPEC-F §5 MCP tools, validates with Zod, applies two-phase destructive
// protocol and routes mutations/queries to the shared CommandBus (backed by EditorSession).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { z } from 'zod';

import { TOOL_NAMES, getToolSchema } from './tool-schemas.ts';
import {
  CONFIRMATION_REQUIRED_TOOLS,
  IMMEDIATE_TOOLS,
  READ_TOOLS,
  createDestructiveProtocol,
  type DestructiveProtocol,
  type DestructiveProtocolServices,
  type PreviewResult,
} from './destructive-protocol.ts';
import { createAgentLog, type AgentLog } from './agent-log.ts';
import { createMcpExporter, type McpExporter } from './mcp-export.ts';
import { createCommandBus, type CommandBus } from './command-bus.ts';

// ============================================================================
// Tool Descriptions (SPEC-F §5)
// ============================================================================

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  open_project: 'Open an existing project by ID or initialize a new project workspace',
  get_project_info: 'Get project metadata, revision, and placement summary',
  list_placements: 'List placements in the project with optional filtering and pagination',
  get_placement: 'Get full placement details including transform, bounds, and ancillary data',
  get_origin: 'Get the origin coordinate of a placement',
  detect_conflicts: 'Detect and summarize voxel state conflicts within optional world bounds',
  get_conflict_map: 'Get a paged and filtered conflict map for a region',
  get_material_list: 'Get block material counts, either effective composite or per-placement',
  get_selection: 'Get the current selection state',
  get_color_mode: 'Get current conflict overlay color mode',
  get_history: 'Get bounded undo/redo history entries',
  get_diagnostics: 'Get diagnostics and validation reports for the project',
  load_schematic: 'Import a schematic file from an approved path',
  transform_placement: 'Translate, rotate, or mirror a placement',
  transform_placements: 'Batch transform multiple placements together',
  set_placement_visibility: 'Set placement visibility (show or hide)',
  set_placement_lock: 'Lock or unlock a placement against mutations',
  rename_placement: 'Rename a placement',
  delete_placement: 'Delete a placement (destructive, two-phase)',
  duplicate_placement: 'Duplicate a placement with optional offset',
  set_origin: 'Set the origin coordinate for a placement',
  bake_placements: 'Bake multiple placements into a single placement (destructive, two-phase)',
  create_selection: 'Create or update a cuboid selection region',
  clear_selection: 'Clear the current selection',
  select_placements: 'Select one or more placements',
  fill_selection: 'Fill selection region with a block type (destructive, two-phase)',
  replace_selection: 'Replace matched blocks in selection region (destructive, two-phase)',
  delete_selection: 'Delete blocks in selection region (destructive, two-phase)',
  copy_selection: 'Copy selection region to the clipboard',
  cut_selection: 'Cut selection region to clipboard (destructive, two-phase)',
  paste_clipboard: 'Paste clipboard contents at target position',
  hollow_selection: 'Hollow selection region with specified shell thickness (destructive, two-phase)',
  walls_selection: 'Create walls around selection region (destructive, two-phase)',
  move_selection: 'Move blocks within selection region by offset (destructive, two-phase)',
  undo: 'Undo the last committed operation',
  redo: 'Redo the last undone operation',
  export_schematic: 'Export schematic to an approved workspace path',
  get_operation_diff: 'Get block-level operation diff for a specific command ID',
  set_color_mode: 'Set the conflict overlay display mode',
};

export function getToolDescription(name: string): string {
  return TOOL_DESCRIPTIONS[name] ?? `Tool ${name}`;
}

// ============================================================================
// Zod to JSON Schema Converter
// ============================================================================

function zodTypeToJson(zType: any): Record<string, unknown> {
  const typeName = zType?._def?.typeName;
  if (typeName === 'ZodOptional') {
    return zodTypeToJson(zType._def.innerType);
  }
  if (typeName === 'ZodString') {
    return { type: 'string' };
  }
  if (typeName === 'ZodNumber') {
    return { type: 'number' };
  }
  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }
  if (typeName === 'ZodEnum') {
    return { type: 'string', enum: zType._def.values };
  }
  if (typeName === 'ZodArray') {
    const itemType = zType._def.type;
    return {
      type: 'array',
      items: itemType ? zodTypeToJson(itemType) : { type: 'string' },
    };
  }
  return { type: 'string' };
}

export function zodObjectToJsonSchema(zodObj: z.ZodObject<any>): Record<string, unknown> {
  const shape = zodObj.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, prop] of Object.entries(shape)) {
    properties[key] = zodTypeToJson(prop);
    if ((prop as any)?._def?.typeName !== 'ZodOptional') {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

// ============================================================================
// Server Factory
// ============================================================================

export type McpCompanionServerDeps = {
  commandBus?: CommandBus;
  protocol?: DestructiveProtocol;
  log?: AgentLog;
  exporter?: McpExporter;
  name?: string;
  version?: string;
};

export function createMcpCompanionServer(deps?: McpCompanionServerDeps): Server {
  const commandBus = deps?.commandBus ?? createCommandBus({ projectId: 'default' });

  const protocolServices: DestructiveProtocolServices = {
    getRevision: (projectId) => {
      commandBus.setProjectId(projectId);
      return commandBus.state().revision;
    },
    preview: (projectId, operation, args): PreviewResult => {
      commandBus.setProjectId(projectId);
      return commandBus.preview(operation, args);
    },
    execute: (projectId, operation, args) => {
      commandBus.setProjectId(projectId);
      const res = commandBus.execute(operation, args);
      return {
        success: res.success,
        revision: res.revision,
        changedCells: res.changedCells,
        changedPlacements: res.changedPlacements,
        warnings: res.warnings,
        errorCode: res.errorCode,
        errorMessage: res.errorMessage,
      };
    },
  };

  const protocol = deps?.protocol ?? createDestructiveProtocol({ services: protocolServices });
  const log = deps?.log ?? createAgentLog();
  const defaultExportServices = {
    realpath: (p: string) => p,
    exists: () => false,
    writeTemp: (t: string) => t,
    readTemp: () => new ArrayBuffer(0),
    rename: () => {},
    remove: () => {},
    sha256: () => 'sum',
    canonicalizeAfterWrite: (p: string) => p,
    maxExportBytes: 256 * 1024 * 1024,
  };
  const exporter = deps?.exporter ?? createMcpExporter({
    approvedDirectories: [],
    services: defaultExportServices,
  });

  const server = new Server(
    {
      name: deps?.name ?? '@easyschemedit/mcp-companion',
      version: deps?.version ?? '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = TOOL_NAMES.map((name) => {
      const zodSchema = getToolSchema(name);
      return {
        name,
        description: getToolDescription(name),
        inputSchema: zodObjectToJsonSchema(zodSchema as any),
      };
    });
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const toolSchema = getToolSchema(name);
    if (!toolSchema) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'UNKNOWN_TOOL',
                message: `Unknown tool: ${name}`,
              },
            }),
          },
        ],
      };
    }

    const parseResult = toolSchema.safeParse(rawArgs ?? {});
    if (!parseResult.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Tool arguments failed schema validation',
                details: parseResult.error.format(),
              },
            }),
          },
        ],
      };
    }

    const args = (rawArgs ?? {}) as Record<string, unknown>;
    const projectId = (args.projectId as string) || commandBus.state().projectId;
    const startTime = Date.now();

    // 1. Read tools
    if (READ_TOOLS.has(name)) {
      try {
        const result = commandBus.query(name, args);
        log.append({
          tool: name,
          projectId,
          revision: commandBus.state().revision,
          resultSummary: 'query completed',
          durationMs: Date.now() - startTime,
          inputs: args,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: {
                  code: 'QUERY_FAILED',
                  message: err instanceof Error ? err.message : String(err),
                },
              }),
            },
          ],
        };
      }
    }

    // 2. Export schematic tool (sandboxed path validation + destructive protocol)
    if (name === 'export_schematic') {
      const exportPath = (args.filePath as string) || '';
      const format = (args.format ? `.${args.format}` : '.vxproj') as any;

      if (typeof args.confirmationToken === 'string' && args.confirmationToken.length > 0) {
        // Path containment check before write
        const testExport = exporter.exportSchematic({
          projectId,
          relativePath: exportPath,
          format,
          data: new ArrayBuffer(0),
        });
        if (!testExport.ok) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: testExport.error,
                }),
              },
            ],
          };
        }

        const applied = protocol.apply(
          projectId,
          (args.requestId as string) || `req-${Date.now()}`,
          args.confirmationToken,
          (args.expectedRevision as number) ?? commandBus.state().revision,
        );
        return {
          isError: applied.error !== undefined,
          content: [{ type: 'text', text: JSON.stringify(applied) }],
        };
      }

      // Dry run export
      const dryRun = protocol.dryRun(
        projectId,
        name,
        args,
        (args.expectedRevision as number) ?? commandBus.state().revision,
        undefined,
        args.requestId as string | undefined,
      );

      // Also validate path containment on dry run
      const testExport = exporter.exportSchematic({
        projectId,
        relativePath: exportPath,
        format,
        data: new ArrayBuffer(0),
      });
      if (!testExport.ok) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: testExport.error,
              }),
            },
          ],
        };
      }

      return {
        isError: dryRun.error !== undefined,
        content: [{ type: 'text', text: JSON.stringify(dryRun) }],
      };
    }

    // 3. Confirmation-required tools (Phase 1 dry-run or Phase 2 apply)
    if (CONFIRMATION_REQUIRED_TOOLS.has(name)) {
      if (typeof args.confirmationToken === 'string' && args.confirmationToken.length > 0) {
        const applied = protocol.apply(
          projectId,
          (args.requestId as string) || `req-${Date.now()}`,
          args.confirmationToken,
          (args.expectedRevision as number) ?? commandBus.state().revision,
        );
        log.append({
          tool: name,
          projectId,
          revision: applied.revision,
          resultSummary: applied.applied ? `applied: ${applied.changedCells} cells` : 'rejected',
          changedBlockCount: applied.changedCells,
          warnings: applied.warnings.map((w) => w.message),
          durationMs: Date.now() - startTime,
          inputs: args,
        });
        return {
          isError: applied.error !== undefined,
          content: [{ type: 'text', text: JSON.stringify(applied) }],
        };
      }

      // Default to dry-run
      const dryRun = protocol.dryRun(
        projectId,
        name,
        args,
        (args.expectedRevision as number) ?? commandBus.state().revision,
        undefined,
        args.requestId as string | undefined,
      );
      log.append({
        tool: name,
        projectId,
        revision: dryRun.revision,
        resultSummary: dryRun.requiresConfirmation ? 'dry-run confirmed' : 'dry-run ok',
        changedBlockCount: dryRun.changedCells,
        warnings: dryRun.warnings.map((w) => w.message),
        durationMs: Date.now() - startTime,
        inputs: args,
      });
      return {
        isError: dryRun.error !== undefined,
        content: [{ type: 'text', text: JSON.stringify(dryRun) }],
      };
    }

    // 4. Immediate tools
    if (IMMEDIATE_TOOLS.has(name)) {
      const applied = protocol.executeImmediate(
        projectId,
        name,
        args,
        (args.expectedRevision as number) ?? commandBus.state().revision,
        args.requestId as string | undefined,
      );
      log.append({
        tool: name,
        projectId,
        revision: applied.revision,
        resultSummary: applied.applied ? `executed immediate: ${applied.changedCells} cells` : 'rejected',
        changedBlockCount: applied.changedCells,
        warnings: applied.warnings.map((w) => w.message),
        durationMs: Date.now() - startTime,
        inputs: args,
      });
      return {
        isError: applied.error !== undefined,
        content: [{ type: 'text', text: JSON.stringify(applied) }],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Tool ${name} is unhandled`,
            },
          }),
        },
      ],
    };
  });

  return server;
}

// ============================================================================
// Stdio Server Entrypoint (Guarded)
// ============================================================================

async function main() {
  const server = createMcpCompanionServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[mcp-companion] stdio server listening');
}

const isEntry =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js'));

if (isEntry) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[mcp-companion] fatal error:', err);
    process.exit(1);
  });
}
