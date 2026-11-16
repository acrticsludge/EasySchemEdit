/// <reference types="@cloudflare/workers-types" />
import type { Env } from './env.ts';
import { getDb, type SqlClient } from './db.ts';
import {
  requireMcpAuth,
  getUserMcpState,
  upsertUserMcpState,
  appendMcpActivityLog,
  type UserMcpStateRecord,
  type McpSelectionSyncState,
  type McpClipboardSyncState,
  type SerializedClipboardEntry,
} from './mcp-keys.ts';
import {
  formatProjectSummary,
  formatSchematicSummary,
  type CloudProjectSummary,
  type CloudSchematicSummary,
  type WorkspaceProjectNode,
} from './projects.ts';
import type { SessionUser } from './auth.ts';
import {
  EditorSession,
  generateStructure,
  generateShape,
  executeBlueprint,
  getVoxelBlockAt,
  inspectRegionVoxels,
  setVoxelBlockAt,
  setVoxelBlocksBatch,
  parseVoxelBlockState,
  detectConflicts,
  analyzeSchematicStructures,
  renderSchematicPng,
  selectStructureByQuery,
  type BlockStateMatcher,
  type ShapeGenerationSpec,
  type StructureGenerationSpec,
  type BlueprintSpec,
  type HistoryQueryResult,
  type ClipboardEntry,
  type SchematicVisualAnalysis,
  type DetectedStructure,
} from '@easyschemedit/operations';
import { MoveStackEngine } from '../../../../packages/operations/src/move-stack.ts';
import {
  packVxprojArchiveAsync,
  unpackVxprojArchiveAsync,
} from '@easyschemedit/persistence';
import {
  importSchematic,
  exportSchematic,
} from '@easyschemedit/formats';
import {
  placementWorldBounds,
  localBlockToWorld,
  worldBlockToLocal,
  type Bounds3i,
  type Vec3i,
  type Vec3Half,
  type Placement,
  type Project,
} from '@easyschemedit/domain';

// ============================================================================
// CORS & Headers
// ============================================================================

export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Accept',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

// ============================================================================
// Request Size Limits (Cloudflare Workers CPU/memory budget)
// ============================================================================

const MAX_BLOCKS = 4096;
const MAX_STRUCTURES = 100;
const MAX_RENDER_DIMENSION = 1280;
const MAX_RENDER_PIXELS = 1280 * 720;

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function clampRenderSize(widthValue: unknown, heightValue: unknown): { width: number; height: number } {
  let width = clampInt(widthValue, 680, 1, MAX_RENDER_DIMENSION);
  let height = clampInt(heightValue, 360, 1, MAX_RENDER_DIMENSION);
  if (width * height > MAX_RENDER_PIXELS) {
    const scale = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
  return { width, height };
}

// ============================================================================
// Clipboard Serialization Helpers
// ============================================================================

export function serializeClipboardEntries(entries: ClipboardEntry[]): SerializedClipboardEntry[] {
  return entries.map((e) => ({
    id: e.id,
    data: {
      blocks: e.data.blocks.map((b) => ({
        localPos: b.localPos,
        state: {
          id: b.state.id,
          props: b.state.props ?? {},
        },
      })),
      blockEntities: e.data.blockEntities instanceof Map
        ? Array.from(e.data.blockEntities.entries())
        : Array.isArray(e.data.blockEntities)
        ? (e.data.blockEntities as Array<[string, unknown]>)
        : [],
      entities: e.data.entities ?? [],
      biomes: e.data.biomes,
      anchor: e.data.anchor,
      bounds: e.data.bounds,
    },
    createdAt: e.createdAt,
    sourceProjectId: e.sourceProjectId,
    scope: e.scope,
  }));
}

export function deserializeClipboardEntries(raw: SerializedClipboardEntry[]): ClipboardEntry[] {
  return (raw || []).map((e) => ({
    id: e.id,
    data: {
      blocks: (e.data.blocks ?? []).map((b) => ({
        localPos: b.localPos as Vec3i,
        state: {
          id: b.state.id,
          props: b.state.props ?? (b.state as any).properties ?? {},
        },
      })),
      blockEntities: new Map<string, unknown>(
        Array.isArray(e.data.blockEntities) ? e.data.blockEntities : []
      ),
      entities: e.data.entities ?? [],
      biomes: e.data.biomes,
      anchor: e.data.anchor as Vec3i,
      bounds: {
        min: e.data.bounds.min as Vec3i,
        maxExclusive: e.data.bounds.maxExclusive as Vec3i,
      },
    },
    createdAt: e.createdAt,
    sourceProjectId: e.sourceProjectId,
    scope: e.scope,
  }));
}

function toSyncBounds(b: Bounds3i): { min: [number, number, number]; maxExclusive: [number, number, number] } {
  return {
    min: [b.min[0], b.min[1], b.min[2]],
    maxExclusive: [b.maxExclusive[0], b.maxExclusive[1], b.maxExclusive[2]],
  };
}

function toSyncPos(v: readonly [number, number, number] | [number, number, number]): [number, number, number] {
  return [v[0], v[1], v[2]];
}

export function transformSelectionStateForPlacement(
  selectionState: McpSelectionSyncState | null | undefined,
  oldPlacement: Placement,
  newPlacement: Placement
): McpSelectionSyncState | undefined {
  if (!selectionState) return undefined;

  const transformPt = (pt: readonly [number, number, number] | [number, number, number]): [number, number, number] => {
    const local = worldBlockToLocal(oldPlacement, [pt[0], pt[1], pt[2]] as Vec3i);
    const world = localBlockToWorld(newPlacement, local);
    return [world[0], world[1], world[2]];
  };

  const transformCorners = (p1: [number, number, number], p2: [number, number, number]) => {
    const np1 = transformPt(p1);
    const np2 = transformPt(p2);
    const min: [number, number, number] = [
      Math.min(np1[0], np2[0]),
      Math.min(np1[1], np2[1]),
      Math.min(np1[2], np2[2]),
    ];
    const maxExclusive: [number, number, number] = [
      Math.max(np1[0], np2[0]) + 1,
      Math.max(np1[1], np2[1]) + 1,
      Math.max(np1[2], np2[2]) + 1,
    ];
    return { pos1: np1, pos2: np2, bounds: { min, maxExclusive } };
  };

  const newRegions = (selectionState.savedRegions ?? []).map((r) => {
    const transformed = transformCorners(r.pos1, r.pos2);
    return {
      id: r.id,
      name: r.name,
      pos1: transformed.pos1,
      pos2: transformed.pos2,
      bounds: transformed.bounds,
    };
  });

  let newBounds = selectionState.bounds;
  let newPos1 = selectionState.pos1;
  let newPos2 = selectionState.pos2;

  if (selectionState.pos1 && selectionState.pos2) {
    const tc = transformCorners(selectionState.pos1, selectionState.pos2);
    newPos1 = tc.pos1;
    newPos2 = tc.pos2;
    newBounds = tc.bounds;
  } else if (selectionState.bounds) {
    const p1: [number, number, number] = [
      selectionState.bounds.min[0],
      selectionState.bounds.min[1],
      selectionState.bounds.min[2],
    ];
    const p2: [number, number, number] = [
      selectionState.bounds.maxExclusive[0] - 1,
      selectionState.bounds.maxExclusive[1] - 1,
      selectionState.bounds.maxExclusive[2] - 1,
    ];
    const tc = transformCorners(p1, p2);
    newBounds = tc.bounds;
  }

  return {
    ...selectionState,
    savedRegions: newRegions,
    bounds: newBounds,
    pos1: newPos1,
    pos2: newPos2,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Types
// ============================================================================

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface TargetSchematicContext {
  schematicRow: {
    id: string;
    project_id: string;
    name: string;
    revision: number;
    placement_count: number;
    r2_key: string;
    size_bytes: number;
  };
  editorSession: EditorSession;
  userMcpState: UserMcpStateRecord | null;
}

// ============================================================================
// Prompts
// ============================================================================

export const PROMPTS_LIST = [
  {
    name: 'build-architect',
    description: 'Expert prompt for designing and generating architectural Minecraft builds with geometric shapes and palettes',
    systemPrompt:
      'You are the Minecraft Build Architect. Use generate_structure, generate_shape, build_blueprint, and set_blocks to design cohesive builds. Check material lists and inspect regions before making major changes.',
  },
  {
    name: 'worldedit-assistant',
    description: 'Specialist prompt for WorldEdit region operations, multi-selections, stacking, and bulk block replacements',
    systemPrompt:
      'You are the WorldEdit Assistant. Create selections with create_selection, then manipulate them with fill_selection, replace_selection, walls_selection, hollow_selection, stack_region, and move_selection.',
  },
  {
    name: 'schematic-inspector',
    description: 'Diagnostic prompt for detecting placement overlap conflicts, auditing material costs, and inspecting schematics',
    systemPrompt:
      'You are the Schematic Inspector. Analyze projects using detect_conflicts, get_conflict_map, get_material_list, and inspect_region. Verify placement visibility and coordinates.',
  },
];

// ============================================================================
// Helper Utilities
// ============================================================================

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseBoundsArg(arg: unknown): Bounds3i | null {
  if (!arg) return null;
  if (Array.isArray(arg) && arg.length >= 6) {
    const minX = Math.min(Number(arg[0]), Number(arg[3]));
    const minY = Math.min(Number(arg[1]), Number(arg[4]));
    const minZ = Math.min(Number(arg[2]), Number(arg[5]));
    let maxX = Math.max(Number(arg[0]), Number(arg[3]));
    let maxY = Math.max(Number(arg[1]), Number(arg[4]));
    let maxZ = Math.max(Number(arg[2]), Number(arg[5]));
    if (minX === maxX) maxX = minX + 1;
    if (minY === maxY) maxY = minY + 1;
    if (minZ === maxZ) maxZ = minZ + 1;
    return {
      min: [minX, minY, minZ],
      maxExclusive: [maxX, maxY, maxZ],
    };
  }
  if (typeof arg === 'object' && arg !== null && 'min' in arg && 'maxExclusive' in arg) {
    const b = arg as any;
    return {
      min: [Number(b.min[0]), Number(b.min[1]), Number(b.min[2])],
      maxExclusive: [Number(b.maxExclusive[0]), Number(b.maxExclusive[1]), Number(b.maxExclusive[2])],
    };
  }
  return null;
}

function parseMatcher(input?: unknown): BlockStateMatcher {
  if (!input) return { mode: 'block-id-only', blockId: 'minecraft:air' };
  if (typeof input === 'object' && input !== null && 'mode' in input) {
    return input as BlockStateMatcher;
  }
  if (typeof input === 'string') {
    if (input === '*' || input === 'any') {
      return { mode: 'block-id-only', blockId: 'minecraft:air' };
    }
    const parsed = parseVoxelBlockState(input);
    if (Object.keys(parsed.props).length > 0) {
      return {
        mode: 'exact',
        blockId: parsed.id,
        properties: parsed.props as Record<string, string>,
      };
    }
    return { mode: 'block-id-only', blockId: parsed.id };
  }
  return { mode: 'block-id-only', blockId: 'minecraft:air' };
}

function getProjectBounds(project: Project): Bounds3i {
  if (project.placements.length === 0) {
    return { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const p of project.placements) {
    const b = placementWorldBounds(p);
    minX = Math.min(minX, b.min[0]);
    minY = Math.min(minY, b.min[1]);
    minZ = Math.min(minZ, b.min[2]);
    maxX = Math.max(maxX, b.maxExclusive[0]);
    maxY = Math.max(maxY, b.maxExclusive[1]);
    maxZ = Math.max(maxZ, b.maxExclusive[2]);
  }
  if (minX === Infinity) {
    return { min: [0, 0, 0], maxExclusive: [16, 16, 16] };
  }
  return { min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] };
}

function ensureDefaultPlacementIfNeeded(session: EditorSession, bounds?: Bounds3i): void {
  if (session.snapshot().placements.length > 0) return;
  const b = bounds ?? { min: [0, 0, 0] as Vec3i, maxExclusive: [16, 16, 16] as Vec3i };
  const minChunk: Vec3i = [
    Math.floor(b.min[0] / 16) * 16,
    Math.floor(b.min[1] / 16) * 16,
    Math.floor(b.min[2] / 16) * 16,
  ];
  const maxChunk: Vec3i = [
    Math.max(minChunk[0] + 16, Math.ceil(b.maxExclusive[0] / 16) * 16),
    Math.max(minChunk[1] + 16, Math.ceil(b.maxExclusive[1] / 16) * 16),
    Math.max(minChunk[2] + 16, Math.ceil(b.maxExclusive[2] / 16) * 16),
  ];
  const p: Placement = {
    id: `placement-${Date.now()}`,
    name: 'Main Placement',
    volume: {
      bounds: { min: minChunk, maxExclusive: maxChunk },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: new Set(),
  };
  session.execute({ type: 'placement:add', placement: p });
}

// ============================================================================
// Target Schematic Loading & Saving
// ============================================================================

export async function loadTargetSchematicSession(
  env: Env,
  sql: SqlClient,
  sessionUser: SessionUser,
  args?: Record<string, unknown>,
  options?: { skipR2?: boolean }
): Promise<TargetSchematicContext> {
  const userMcpState = await getUserMcpState(sql, sessionUser.userId);
  let row: any = null;

  // 1. Explicit args.schematicId
  if (args?.schematicId) {
    const rows = (await sql`
      SELECT id, project_id, name, revision, placement_count, r2_key, size_bytes
      FROM schematics
      WHERE id = ${String(args.schematicId)} AND user_id = ${sessionUser.userId}
      LIMIT 1
    `) as Record<string, any>[];
    if (rows && rows.length > 0) row = rows[0];
  }

  // 2. Active schematic from mcp_user_state
  if (!row && userMcpState?.active_schematic_id) {
    const rows = (await sql`
      SELECT id, project_id, name, revision, placement_count, r2_key, size_bytes
      FROM schematics
      WHERE id = ${userMcpState.active_schematic_id} AND user_id = ${sessionUser.userId}
      LIMIT 1
    `) as Record<string, any>[];
    if (rows && rows.length > 0) row = rows[0];
  }

  // 3. Most recently updated schematic owned by user
  if (!row) {
    const rows = (await sql`
      SELECT id, project_id, name, revision, placement_count, r2_key, size_bytes
      FROM schematics
      WHERE user_id = ${sessionUser.userId}
      ORDER BY updated_at DESC
      LIMIT 1
    `) as Record<string, any>[];
    if (rows && rows.length > 0) row = rows[0];
  }

  // 4. If user has NO schematics, create default project & schematic
  if (!row) {
    let projId: string;
    const projRows = (await sql`
      SELECT id FROM projects WHERE user_id = ${sessionUser.userId} ORDER BY updated_at DESC LIMIT 1
    `) as Record<string, any>[];

    if (projRows && projRows.length > 0) {
      projId = String(projRows[0].id);
    } else {
      projId = crypto.randomUUID();
      const projR2Key = `users/${sessionUser.userId}/projects/${projId}.vxproj`;
      await sql`
        INSERT INTO projects (id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
        VALUES (${projId}, ${sessionUser.userId}, 'AI Workspace', 1, 0, ${projR2Key}, 0, now(), now())
      `;
    }

    const schemId = crypto.randomUUID();
    const schemName = 'ai-build.schem';
    const r2Key = `users/${sessionUser.userId}/projects/${projId}/schematics/${schemId}.vxproj`;

    const defaultProject: Project = {
      schemaVersion: 1,
      id: schemId,
      name: schemName,
      placements: [],
      importGroups: [],
      overlapPolicy: 'top-wins',
      conflictOverlay: 'off',
      metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
      revision: 1,
    };
    const bytes = await packVxprojArchiveAsync(defaultProject);

    if (env.PROJECTS_BUCKET) {
      await env.PROJECTS_BUCKET.put(
        r2Key,
        bytes,
        {
          httpMetadata: { contentType: 'application/zip' },
        }
      );
    }

    const sRows = (await sql`
      INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
      VALUES (${schemId}, ${projId}, ${sessionUser.userId}, ${schemName}, 1, 0, ${r2Key}, ${bytes.byteLength}, now(), now())
      RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    `) as Record<string, any>[];

    row = sRows[0];
    await upsertUserMcpState(sql, sessionUser.userId, {
      activeProjectId: projId,
      activeSchematicId: schemId,
    });
  }

  // 5. Load project from R2 or fallback to empty project
  let project: Project | undefined = undefined;
  if (!options?.skipR2) {
    try {
      if (env.PROJECTS_BUCKET && row.r2_key) {
        const obj = await env.PROJECTS_BUCKET.get(row.r2_key);
        if (obj && obj.body) {
          const bytes = new Uint8Array(await obj.arrayBuffer());
          if (bytes.byteLength > 0) {
            project = await unpackVxprojArchiveAsync(bytes);
          }
        }
      }
    } catch (err) {
      console.error('Error unpacking in loadTargetSchematicSession:', err);
    }
  }

  if (!project) {
    project = {
      schemaVersion: 1,
      id: String(row.id),
      name: String(row.name),
      placements: [],
      importGroups: [],
      overlapPolicy: 'top-wins',
      conflictOverlay: 'off',
      metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
      revision: Number(row.revision || 1),
    };
  }

  const editorSession = new EditorSession(project);
  if (!options?.skipR2 && userMcpState?.clipboard_state?.entries?.length) {
    editorSession.replaceClipboardEntries(
      deserializeClipboardEntries(userMcpState.clipboard_state.entries)
    );
  }

  return {
    schematicRow: {
      id: String(row.id),
      project_id: String(row.project_id),
      name: String(row.name),
      revision: Number(row.revision || 1),
      placement_count: Number(row.placement_count || 0),
      r2_key: String(row.r2_key),
      size_bytes: Number(row.size_bytes || 0),
    },
    editorSession,
    userMcpState,
  };
}

export async function saveTargetSchematicSession(
  env: Env,
  sql: SqlClient,
  userId: string,
  schematicRow: { id: string; project_id: string; revision: number; r2_key: string; name: string },
  session: EditorSession,
  meta: {
    toolName: string;
    changedCells: number;
    summary: string;
    args?: Record<string, unknown>;
    selectionState?: McpSelectionSyncState | null;
    clipboardState?: McpClipboardSyncState | null;
  }
): Promise<{ revision: number; sizeBytes: number }> {
  const newRevision = Number(schematicRow.revision || 0) + 1;
  if ((session as any).project) {
    (session as any).project.revision = newRevision;
  }
  const snap = session.snapshot();
  let totalNonAir = 0;
  for (const p of snap.placements) {
    totalNonAir += p.volume?.nonAirCount ?? 0;
  }
  const bytes = await packVxprojArchiveAsync(snap, {
    compressionLevel: totalNonAir > 200_000 ? 0 : 1,
  });

  if (env.PROJECTS_BUCKET) {
    await env.PROJECTS_BUCKET.put(
      schematicRow.r2_key,
      bytes,
      {
        httpMetadata: { contentType: 'application/zip' },
      }
    );
  }

  const newPlacementCount = snap.placements.length;

  await sql`
    UPDATE schematics
    SET revision = ${newRevision},
        placement_count = ${newPlacementCount},
        size_bytes = ${bytes.byteLength},
        updated_at = now()
    WHERE id = ${schematicRow.id} AND user_id = ${userId}
  `;

  await sql`
    UPDATE projects
    SET updated_at = now()
    WHERE id = ${schematicRow.project_id} AND user_id = ${userId}
  `;

  await upsertUserMcpState(sql, userId, {
    activeProjectId: schematicRow.project_id,
    activeSchematicId: schematicRow.id,
    selectionState: meta.selectionState !== undefined ? meta.selectionState : undefined,
    clipboardState: meta.clipboardState !== undefined ? meta.clipboardState : undefined,
  });

  await appendMcpActivityLog(sql, {
    userId,
    projectId: schematicRow.project_id,
    schematicId: schematicRow.id,
    tool: meta.toolName,
    revision: newRevision,
    changedCells: meta.changedCells,
    summary: meta.summary,
    args: meta.args,
  });

  return { revision: newRevision, sizeBytes: bytes.byteLength };
}

// ============================================================================
// Tool Dispatch Engine
// ============================================================================

export async function executeCloudTool(
  sessionUser: SessionUser,
  env: Env,
  sql: SqlClient,
  toolName: string,
  args: Record<string, any> = {}
): Promise<Record<string, any>> {
  switch (toolName) {
    // ── 1. Account & Workspace Management ──
    case 'get_account_info': {
      const userMcpState = await getUserMcpState(sql, sessionUser.userId);
      const [projCountRows, schemCountRows] = await Promise.all([
        sql`SELECT count(*)::int AS cnt FROM projects WHERE user_id = ${sessionUser.userId}`,
        sql`SELECT count(*)::int AS cnt FROM schematics WHERE user_id = ${sessionUser.userId}`,
      ]);
      const projectCount = Number((projCountRows as Record<string, any>[])[0]?.cnt ?? 0);
      const schematicCount = Number((schemCountRows as Record<string, any>[])[0]?.cnt ?? 0);
      return {
        ok: true,
        user: { id: sessionUser.userId, username: sessionUser.username },
        projectCount,
        schematicCount,
        activeProjectId: userMcpState?.active_project_id ?? null,
        activeSchematicId: userMcpState?.active_schematic_id ?? null,
      };
    }

    case 'list_workspace': {
      const userMcpState = await getUserMcpState(sql, sessionUser.userId);
      const [projectRows, schematicRows] = (await Promise.all([
        sql`
          SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
          FROM projects
          WHERE user_id = ${sessionUser.userId}
          ORDER BY updated_at DESC
        `,
        sql`
          SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
          FROM schematics
          WHERE user_id = ${sessionUser.userId}
          ORDER BY updated_at DESC
        `,
      ])) as [Record<string, any>[], Record<string, any>[]];

      const schematicsByProject = new Map<string, CloudSchematicSummary[]>();
      for (const sRow of schematicRows) {
        const s = formatSchematicSummary(sRow);
        const list = schematicsByProject.get(s.projectId) ?? [];
        list.push(s);
        schematicsByProject.set(s.projectId, list);
      }

      const projects: WorkspaceProjectNode[] = projectRows.map((pRow) => {
        const p = formatProjectSummary(pRow);
        return {
          ...p,
          schematics: schematicsByProject.get(p.id) ?? [],
        };
      });

      return {
        ok: true,
        projects,
        activeProjectId: userMcpState?.active_project_id ?? null,
        activeSchematicId: userMcpState?.active_schematic_id ?? null,
      };
    }

    case 'list_projects': {
      const rows = (await sql`
        SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        FROM projects
        WHERE user_id = ${sessionUser.userId}
        ORDER BY updated_at DESC
      `) as Record<string, any>[];
      return { ok: true, projects: rows.map(formatProjectSummary) };
    }

    case 'create_project': {
      const name =
        typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Untitled Project';
      const initialSchematicName =
        typeof args.initialSchematicName === 'string' && args.initialSchematicName.trim()
          ? args.initialSchematicName.trim()
          : 'Untitled Schematic';
      const projectId = crypto.randomUUID();
      const schematicId = crypto.randomUUID();
      const projectR2Key = `users/${sessionUser.userId}/projects/${projectId}.vxproj`;
      const schematicR2Key = `users/${sessionUser.userId}/projects/${projectId}/schematics/${schematicId}.vxproj`;

      const emptyProject: Project = {
        schemaVersion: 1,
        id: schematicId,
        name: initialSchematicName,
        placements: [],
        importGroups: [],
        overlapPolicy: 'top-wins',
        conflictOverlay: 'off',
        metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
        revision: 1,
      };
      const bytes = await packVxprojArchiveAsync(emptyProject);
      if (env.PROJECTS_BUCKET) {
        await env.PROJECTS_BUCKET.put(
          schematicR2Key,
          bytes,
          {
            httpMetadata: { contentType: 'application/zip' },
          }
        );
      }

      const [pRows, sRows] = (await Promise.all([
        sql`
          INSERT INTO projects (id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
          VALUES (${projectId}, ${sessionUser.userId}, ${name}, 1, 0, ${projectR2Key}, 0, now(), now())
          RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        `,
        sql`
          INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
          VALUES (${schematicId}, ${projectId}, ${sessionUser.userId}, ${initialSchematicName}, 1, 0, ${schematicR2Key}, ${bytes.byteLength}, now(), now())
          RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        `,
      ])) as [Record<string, any>[], Record<string, any>[]];

      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: projectId,
        activeSchematicId: schematicId,
      });

      await appendMcpActivityLog(sql, {
        userId: sessionUser.userId,
        projectId,
        schematicId,
        tool: 'create_project',
        revision: 1,
        changedCells: 0,
        summary: `Created project "${name}" with schematic "${initialSchematicName}"`,
        args,
      });

      return {
        ok: true,
        project: formatProjectSummary(pRows[0]),
        schematic: formatSchematicSummary(sRows[0]),
      };
    }

    case 'rename_project': {
      const projectId = String(args.projectId ?? '');
      const newName = String(args.name ?? '').trim();
      if (!newName) return { ok: false, error: 'Project name is required' };
      const rows = (await sql`
        UPDATE projects
        SET name = ${newName}, updated_at = now()
        WHERE id = ${projectId} AND user_id = ${sessionUser.userId}
        RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Project not found' };
      return { ok: true, project: formatProjectSummary(rows[0]) };
    }

    case 'delete_project': {
      const projectId = String(args.projectId ?? '');
      const childRows = (await sql`
        SELECT r2_key FROM schematics WHERE project_id = ${projectId} AND user_id = ${sessionUser.userId}
      `) as Record<string, any>[];
      const deletedRows = (await sql`
        DELETE FROM projects WHERE id = ${projectId} AND user_id = ${sessionUser.userId} RETURNING r2_key
      `) as Record<string, any>[];
      if (!deletedRows || deletedRows.length === 0) return { ok: false, error: 'Project not found' };
      const keysToDelete = [deletedRows[0]?.r2_key, ...childRows.map((r: any) => r.r2_key)].filter(Boolean);
      if (env.PROJECTS_BUCKET && keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map((k) => env.PROJECTS_BUCKET.delete(k).catch(() => {})));
      }
      return { ok: true, projectId };
    }

    case 'get_project':
    case 'open_project': {
      const projectId = String(args.projectId ?? '');
      const rows = (await sql`
        SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        FROM projects
        WHERE id = ${projectId} AND user_id = ${sessionUser.userId}
        LIMIT 1
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Project not found' };
      const schematicsRows = (await sql`
        SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        FROM schematics
        WHERE project_id = ${projectId} AND user_id = ${sessionUser.userId}
        ORDER BY updated_at DESC
      `) as Record<string, any>[];
      const schematics = schematicsRows.map(formatSchematicSummary);
      const activeSchemId = schematics.length > 0 ? schematics[0].id : null;
      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: projectId,
        activeSchematicId: activeSchemId,
      });
      return {
        ok: true,
        project: formatProjectSummary(rows[0]),
        schematics,
        activeProjectId: projectId,
        activeSchematicId: activeSchemId,
      };
    }

    case 'list_schematics': {
      const projectId = args.projectId ? String(args.projectId) : null;
      const rows = (projectId
        ? await sql`
            SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
            FROM schematics
            WHERE project_id = ${projectId} AND user_id = ${sessionUser.userId}
            ORDER BY updated_at DESC
          `
        : await sql`
            SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
            FROM schematics
            WHERE user_id = ${sessionUser.userId}
            ORDER BY updated_at DESC
          `) as Record<string, any>[];
      return { ok: true, schematics: rows.map(formatSchematicSummary) };
    }

    case 'create_schematic': {
      let targetProjectId = args.projectId ? String(args.projectId) : null;
      if (!targetProjectId) {
        const userState = await getUserMcpState(sql, sessionUser.userId);
        targetProjectId = userState?.active_project_id || null;
        if (!targetProjectId) {
          const pRows = (await sql`
            SELECT id FROM projects WHERE user_id = ${sessionUser.userId} ORDER BY updated_at DESC LIMIT 1
          `) as Record<string, any>[];
          if (pRows && pRows.length > 0) {
            targetProjectId = String(pRows[0].id);
          } else {
            const newProjId = crypto.randomUUID();
            await sql`
              INSERT INTO projects (id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
              VALUES (${newProjId}, ${sessionUser.userId}, 'AI Workspace', 1, 0, ${'users/' + sessionUser.userId + '/projects/' + newProjId + '.vxproj'}, 0, now(), now())
            `;
            targetProjectId = newProjId;
          }
        }
      }
      const schemName =
        typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Untitled Schematic';
      const schemId = crypto.randomUUID();
      const r2Key = `users/${sessionUser.userId}/projects/${targetProjectId}/schematics/${schemId}.vxproj`;

      const emptyProject: Project = {
        schemaVersion: 1,
        id: schemId,
        name: schemName,
        placements: [],
        importGroups: [],
        overlapPolicy: 'top-wins',
        conflictOverlay: 'off',
        metadata: { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() },
        revision: 1,
      };
      const bytes = await packVxprojArchiveAsync(emptyProject);
      if (env.PROJECTS_BUCKET) {
        await env.PROJECTS_BUCKET.put(
          r2Key,
          bytes,
          {
            httpMetadata: { contentType: 'application/zip' },
          }
        );
      }

      const sRows = (await sql`
        INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
        VALUES (${schemId}, ${targetProjectId}, ${sessionUser.userId}, ${schemName}, 1, 0, ${r2Key}, ${bytes.byteLength}, now(), now())
        RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      `) as Record<string, any>[];

      await sql`UPDATE projects SET updated_at = now() WHERE id = ${targetProjectId} AND user_id = ${sessionUser.userId}`;
      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: targetProjectId,
        activeSchematicId: schemId,
      });

      await appendMcpActivityLog(sql, {
        userId: sessionUser.userId,
        projectId: targetProjectId,
        schematicId: schemId,
        tool: 'create_schematic',
        revision: 1,
        changedCells: 0,
        summary: `Created schematic "${schemName}"`,
        args,
      });

      return { ok: true, schematic: formatSchematicSummary(sRows[0]) };
    }

    case 'rename_schematic': {
      const schematicId = String(args.schematicId ?? '');
      const newName = String(args.name ?? '').trim();
      if (!newName) return { ok: false, error: 'Schematic name is required' };
      const rows = (await sql`
        UPDATE schematics
        SET name = ${newName}, updated_at = now()
        WHERE id = ${schematicId} AND user_id = ${sessionUser.userId}
        RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Schematic not found' };
      return { ok: true, schematic: formatSchematicSummary(rows[0]) };
    }

    case 'delete_schematic': {
      const schematicId = String(args.schematicId ?? '');
      const rows = (await sql`
        DELETE FROM schematics
        WHERE id = ${schematicId} AND user_id = ${sessionUser.userId}
        RETURNING project_id, r2_key
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Schematic not found' };
      if (env.PROJECTS_BUCKET && rows[0]?.r2_key) {
        await env.PROJECTS_BUCKET.delete(rows[0].r2_key).catch(() => {});
      }
      await sql`UPDATE projects SET updated_at = now() WHERE id = ${rows[0].project_id} AND user_id = ${sessionUser.userId}`;
      return { ok: true, schematicId };
    }

    case 'duplicate_schematic': {
      const schematicId = String(args.schematicId ?? '');
      const rows = (await sql`
        SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes
        FROM schematics
        WHERE id = ${schematicId} AND user_id = ${sessionUser.userId}
        LIMIT 1
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Schematic not found' };
      const existing = rows[0];
      const targetProjId = args.targetProjectId ? String(args.targetProjectId) : String(existing.project_id);
      const newName =
        typeof args.newName === 'string' && args.newName.trim()
          ? args.newName.trim()
          : `${existing.name} (Copy)`;
      const newSchemId = crypto.randomUUID();
      const newR2Key = `users/${sessionUser.userId}/projects/${targetProjId}/schematics/${newSchemId}.vxproj`;

      if (env.PROJECTS_BUCKET && existing.r2_key) {
        const existingObj = await env.PROJECTS_BUCKET.get(existing.r2_key);
        if (existingObj && existingObj.body) {
          const buf = await existingObj.arrayBuffer();
          await env.PROJECTS_BUCKET.put(newR2Key, buf, {
            httpMetadata: { contentType: 'application/zip' },
          });
        }
      }

      const sRows = (await sql`
        INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
        VALUES (${newSchemId}, ${targetProjId}, ${sessionUser.userId}, ${newName}, ${existing.revision}, ${existing.placement_count}, ${newR2Key}, ${existing.size_bytes}, now(), now())
        RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      `) as Record<string, any>[];

      await sql`UPDATE projects SET updated_at = now() WHERE id = ${targetProjId} AND user_id = ${sessionUser.userId}`;
      return { ok: true, schematic: formatSchematicSummary(sRows[0]) };
    }

    case 'set_active_schematic':
    case 'open_schematic': {
      const schematicId = String(args.schematicId ?? '');
      const rows = (await sql`
        SELECT id, project_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        FROM schematics
        WHERE id = ${schematicId} AND user_id = ${sessionUser.userId}
        LIMIT 1
      `) as Record<string, any>[];
      if (!rows || rows.length === 0) return { ok: false, error: 'Schematic not found' };
      const s = rows[0];
      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: String(s.project_id),
        activeSchematicId: String(s.id),
      });
      return {
        ok: true,
        activeProjectId: String(s.project_id),
        activeSchematicId: String(s.id),
        schematic: formatSchematicSummary(s),
      };
    }

    case 'get_project_info': {
      const userMcpState = await getUserMcpState(sql, sessionUser.userId);
      const projId = args.projectId ? String(args.projectId) : userMcpState?.active_project_id;
      if (!projId) return { ok: false, error: 'No active project or projectId specified' };
      const pRows = (await sql`
        SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
        FROM projects
        WHERE id = ${projId} AND user_id = ${sessionUser.userId}
        LIMIT 1
      `) as Record<string, any>[];
      if (!pRows || pRows.length === 0) return { ok: false, error: 'Project not found' };
      return { ok: true, project: formatProjectSummary(pRows[0]) };
    }

    case 'get_schematic_info': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const snap = ctx.editorSession.snapshot();
      let totalNonAir = 0;
      for (const p of snap.placements) {
        totalNonAir += p.volume.nonAirCount;
      }
      const analysis = analyzeSchematicStructures(ctx.editorSession, { maxStructures: 20 });
      return {
        ok: true,
        id: ctx.schematicRow.id,
        name: ctx.schematicRow.name,
        projectId: ctx.schematicRow.project_id,
        revision: ctx.editorSession.revision,
        placementCount: snap.placements.length,
        nonAirCount: totalNonAir,
        bounds: getProjectBounds(ctx.editorSession.peekProject()),
        overlapPolicy: snap.overlapPolicy,
        conflictOverlay: snap.conflictOverlay,
        placements: snap.placements.map((p) => ({
          id: p.id,
          name: p.name,
          transform: p.transform,
          origin: p.origin,
          bounds: p.volume.bounds,
          worldBounds: placementWorldBounds(p),
          nonAirCount: p.volume.nonAirCount,
          visible: p.visible,
          locked: p.locked,
        })),
        selection: ctx.userMcpState?.selection_state ?? null,
        groundLevelY: analysis.groundLevelY,
        environment: analysis.environment,
        structureCount: analysis.structures.length,
        structures: analysis.structures,
        spatialMap: analysis.spatialMap,
      };
    }

    // ── 2. Selections & Multi-Region Management ──
    case 'get_selection':
    case 'list_selections': {
      const userState = await getUserMcpState(sql, sessionUser.userId);
      return {
        ok: true,
        selectionState: userState?.selection_state ?? null,
        activeRegionId: userState?.selection_state?.activeRegionId ?? null,
        bounds: userState?.selection_state?.bounds ?? null,
        pos1: userState?.selection_state?.pos1 ?? null,
        pos2: userState?.selection_state?.pos2 ?? null,
        savedRegions: userState?.selection_state?.savedRegions ?? [],
      };
    }

    case 'create_selection': {
      let min: [number, number, number];
      let maxExclusive: [number, number, number];
      let pos1: [number, number, number];
      let pos2: [number, number, number];

      if (
        Array.isArray(args.pos1) &&
        Array.isArray(args.pos2) &&
        args.pos1.length === 3 &&
        args.pos2.length === 3
      ) {
        const p1 = args.pos1.map(Number);
        const p2 = args.pos2.map(Number);
        pos1 = [p1[0], p1[1], p1[2]];
        pos2 = [p2[0], p2[1], p2[2]];
        min = [
          Math.min(pos1[0], pos2[0]),
          Math.min(pos1[1], pos2[1]),
          Math.min(pos1[2], pos2[2]),
        ];
        maxExclusive = [
          Math.max(pos1[0], pos2[0]) + 1,
          Math.max(pos1[1], pos2[1]) + 1,
          Math.max(pos1[2], pos2[2]) + 1,
        ];
      } else {
        const raw = (args.bounds ?? args.worldBounds) as number[];
        if (!Array.isArray(raw) || raw.length < 6) {
          return {
            ok: false,
            error: 'Provide either pos1 + pos2 or bounds: [x1, y1, z1, x2, y2, z2]',
          };
        }
        const x1 = Number(raw[0]), y1 = Number(raw[1]), z1 = Number(raw[2]);
        const x2 = Number(raw[3]), y2 = Number(raw[4]), z2 = Number(raw[5]);
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const minZ = Math.min(z1, z2);
        let maxX = Math.max(x1, x2);
        let maxY = Math.max(y1, y2);
        let maxZ = Math.max(z1, z2);
        if (minX === maxX) maxX = minX + 1;
        if (minY === maxY) maxY = minY + 1;
        if (minZ === maxZ) maxZ = minZ + 1;
        min = [minX, minY, minZ];
        maxExclusive = [maxX, maxY, maxZ];
        pos1 = [minX, minY, minZ];
        pos2 = [maxExclusive[0] - 1, maxExclusive[1] - 1, maxExclusive[2] - 1];
      }

      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args, { skipR2: true });
      const currentRegions = ctx.userMcpState?.selection_state?.savedRegions ?? [];
      const regionId = crypto.randomUUID();
      const regionName =
        typeof args.name === 'string' && args.name.trim()
          ? args.name.trim()
          : `R${currentRegions.length + 1}`;
      const newRegion = {
        id: regionId,
        name: regionName,
        pos1,
        pos2,
        bounds: { min, maxExclusive },
      };

      const replace = args.replaceExisting === true;
      let nextRegions = currentRegions;
      let targetActiveRegionId: string = regionId;

      if (replace) {
        nextRegions = [newRegion];
      } else {
        const hasExplicitName = typeof args.name === 'string' && args.name.trim().length > 0;
        const existingIndex = hasExplicitName
          ? currentRegions.findIndex((r) => r.name === regionName)
          : -1;
        if (existingIndex >= 0) {
          const existing = currentRegions[existingIndex]!;
          targetActiveRegionId = existing.id;
          const updated = {
            ...existing,
            pos1,
            pos2,
            bounds: { min, maxExclusive },
          };
          nextRegions = [...currentRegions];
          nextRegions[existingIndex] = updated;
        } else {
          nextRegions = [...currentRegions, newRegion];
        }
      }

      const activeRegion = nextRegions.find((r) => r.id === targetActiveRegionId) ?? newRegion;

      const nextSelectionState: McpSelectionSyncState = {
        schematicId: ctx.schematicRow.id,
        savedRegions: nextRegions,
        activeRegionId: targetActiveRegionId,
        bounds: { min, maxExclusive },
        pos1,
        pos2,
        updatedAt: new Date().toISOString(),
      };

      ctx.editorSession.execute({
        type: 'selection:edit',
        bounds: {
          minX: min[0],
          minY: min[1],
          minZ: min[2],
          maxX: maxExclusive[0],
          maxY: maxExclusive[1],
          maxZ: maxExclusive[2],
        },
      });

      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: ctx.schematicRow.project_id,
        activeSchematicId: ctx.schematicRow.id,
        selectionState: nextSelectionState,
      });

      await appendMcpActivityLog(sql, {
        userId: sessionUser.userId,
        projectId: ctx.schematicRow.project_id,
        schematicId: ctx.schematicRow.id,
        tool: 'create_selection',
        revision: ctx.editorSession.revision,
        changedCells: 0,
        summary: `Created selection "${regionName}" [${min.join(',')}] -> [${maxExclusive.join(',')}]`,
        args,
      });

      return {
        ok: true,
        region: activeRegion,
        activeRegionId: targetActiveRegionId,
        bounds: { min, maxExclusive },
        pos1,
        pos2,
        savedRegions: nextRegions,
        selectionState: nextSelectionState,
      };
    }

    case 'select_region': {
      const userState = await getUserMcpState(sql, sessionUser.userId);
      const regions = userState?.selection_state?.savedRegions ?? [];
      const targetId = args.regionId ? String(args.regionId) : undefined;
      const targetName = args.name ? String(args.name) : undefined;
      const found = regions.find(
        (r) => (targetId && r.id === targetId) || (targetName && r.name === targetName)
      );
      if (!found) return { ok: false, error: 'Region not found' };

      const nextState: McpSelectionSyncState = {
        ...userState!.selection_state!,
        activeRegionId: found.id,
        bounds: found.bounds,
        pos1: found.pos1,
        pos2: found.pos2,
        updatedAt: new Date().toISOString(),
      };
      await upsertUserMcpState(sql, sessionUser.userId, { selectionState: nextState });
      return {
        ok: true,
        activeRegionId: found.id,
        bounds: found.bounds,
        pos1: found.pos1,
        pos2: found.pos2,
        selectionState: nextState,
      };
    }

    case 'remove_region': {
      const userState = await getUserMcpState(sql, sessionUser.userId);
      const regions = [...(userState?.selection_state?.savedRegions ?? [])];
      const targetId = args.regionId ? String(args.regionId) : undefined;
      const targetName = args.name ? String(args.name) : undefined;
      const activeId = userState?.selection_state?.activeRegionId;

      const removeIdx = regions.findIndex((r) =>
        targetId ? r.id === targetId : targetName ? r.name === targetName : r.id === activeId
      );
      if (removeIdx === -1) return { ok: false, error: 'Region not found to remove' };

      const [removed] = regions.splice(removeIdx, 1);
      const nextActive = regions.length > 0 ? regions[0] : null;
      const nextState: McpSelectionSyncState = {
        schematicId: userState?.active_schematic_id ?? null,
        savedRegions: regions,
        activeRegionId: nextActive ? nextActive.id : null,
        bounds: nextActive ? nextActive.bounds : null,
        pos1: nextActive ? nextActive.pos1 : null,
        pos2: nextActive ? nextActive.pos2 : null,
        updatedAt: new Date().toISOString(),
      };

      await upsertUserMcpState(sql, sessionUser.userId, { selectionState: nextState });
      return {
        ok: true,
        removed: removed.name,
        remainingCount: regions.length,
        activeRegionId: nextState.activeRegionId,
        selectionState: nextState,
      };
    }

    case 'clear_selection': {
      const userState = await getUserMcpState(sql, sessionUser.userId);
      const nextState: McpSelectionSyncState = {
        schematicId: userState?.active_schematic_id ?? null,
        savedRegions: [],
        activeRegionId: null,
        bounds: null,
        pos1: null,
        pos2: null,
        updatedAt: new Date().toISOString(),
      };
      await upsertUserMcpState(sql, sessionUser.userId, { selectionState: nextState });
      return { ok: true, cleared: true, selectionState: nextState };
    }

    case 'select_placements': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pids = Array.isArray(args.placementIds) ? args.placementIds.map(String) : [];
      ctx.editorSession.execute({
        type: 'selection:edit',
        placementIds: pids,
      });
      return { ok: true, placementIds: pids };
    }

    // ── 3. Block-Level Inspection & Voxel Editing ──
    case 'get_block': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pos =
        Array.isArray(args.pos) && args.pos.length === 3
          ? ([Number(args.pos[0]), Number(args.pos[1]), Number(args.pos[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      const res = getVoxelBlockAt(
        ctx.editorSession,
        pos,
        args.placementId ? String(args.placementId) : undefined
      );
      return { ok: true, ...res };
    }

    case 'inspect_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.bounds ?? args.worldBounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        getProjectBounds(ctx.editorSession.peekProject());
      const placementId = args.placementId ? String(args.placementId) : undefined;
      const includeAir = Boolean(args.includeAir);

      const volX = Math.max(0, bounds.maxExclusive[0] - bounds.min[0]);
      const volY = Math.max(0, bounds.maxExclusive[1] - bounds.min[1]);
      const volZ = Math.max(0, bounds.maxExclusive[2] - bounds.min[2]);
      const volume = volX * volY * volZ;

      const maxBlocks = clampInt(args.maxBlocks, volume > 8192 ? 256 : 512, 1, MAX_BLOCKS);
      const maxStructures = clampInt(args.maxStructures, 25, 1, MAX_STRUCTURES);
      const analysis = analyzeSchematicStructures(ctx.editorSession, {
        bounds,
        maxStructures,
        placementId,
      });

      let res: {
        bounds: Bounds3i;
        nonAirCount: number;
        countsByBlock: Record<string, number>;
        blocks: Array<{ pos: Vec3i; block: string }>;
        truncated: boolean;
      };

      if (volume > 65536 && args.fullVoxelScan !== true) {
        const countsByBlock: Record<string, number> = {};
        for (const st of analysis.structures) {
          for (const db of st.dominantBlocks) {
            countsByBlock[db.block] = (countsByBlock[db.block] ?? 0) + db.count;
          }
        }
        if (analysis.environment.waterVoxelCount > 0) {
          countsByBlock['minecraft:water'] = (countsByBlock['minecraft:water'] ?? 0) + analysis.environment.waterVoxelCount;
        }
        const sampleCenter = analysis.structures[0]?.centroid ?? [
          Math.floor((bounds.min[0] + bounds.maxExclusive[0]) / 2),
          analysis.groundLevelY,
          Math.floor((bounds.min[2] + bounds.maxExclusive[2]) / 2),
        ];
        const sampleBounds: Bounds3i = {
          min: [sampleCenter[0] - 8, sampleCenter[1], sampleCenter[2] - 8],
          maxExclusive: [sampleCenter[0] + 8, sampleCenter[1] + 16, sampleCenter[2] + 8],
        };
        const sample = inspectRegionVoxels(ctx.editorSession, sampleBounds, {
          maxBlocks: Math.min(maxBlocks, 128),
          includeAir: false,
          placementId,
        });
        res = {
          bounds,
          nonAirCount: analysis.totalVoxels,
          countsByBlock,
          blocks: sample.blocks,
          truncated: true,
        };
      } else {
        res = inspectRegionVoxels(ctx.editorSession, bounds, {
          maxBlocks,
          includeAir,
          placementId,
        });
      }

      let nextSelectionState: McpSelectionSyncState | undefined = ctx.userMcpState?.selection_state ?? undefined;
      if (typeof args.selectStructure === 'string' && args.selectStructure.trim()) {
        const matched = selectStructureByQuery(analysis, args.selectStructure.trim());
        if (matched) {
          const regionId = matched.id;
          const regionName = `${matched.id}: ${matched.name}`;
          const newRegion = {
            id: regionId,
            name: regionName,
            pos1: toSyncPos(matched.bounds.min),
            pos2: toSyncPos([matched.bounds.maxExclusive[0] - 1, matched.bounds.maxExclusive[1] - 1, matched.bounds.maxExclusive[2] - 1]),
            bounds: toSyncBounds(matched.bounds),
          };
          const existing = (ctx.userMcpState?.selection_state?.savedRegions ?? []).filter((r) => r.name !== regionName);
          nextSelectionState = {
            schematicId: ctx.schematicRow.id,
            savedRegions: [...existing, newRegion],
            activeRegionId: regionId,
            bounds: toSyncBounds(matched.bounds),
            pos1: newRegion.pos1,
            pos2: newRegion.pos2,
            updatedAt: new Date().toISOString(),
          };
          ctx.editorSession.execute({
            type: 'selection:edit',
            bounds: {
              minX: matched.bounds.min[0],
              minY: matched.bounds.min[1],
              minZ: matched.bounds.min[2],
              maxX: matched.bounds.maxExclusive[0],
              maxY: matched.bounds.maxExclusive[1],
              maxZ: matched.bounds.maxExclusive[2],
            },
          });
          await upsertUserMcpState(sql, sessionUser.userId, {
            activeSchematicId: ctx.schematicRow.id,
            selectionState: nextSelectionState,
          });
        }
      } else if (args.saveStructureRegions === true && analysis.structures.length > 0) {
        const existingRegions = args.replaceExisting === true
          ? []
          : (ctx.userMcpState?.selection_state?.savedRegions ?? []);
        const newRegions = analysis.structures.map((st) => ({
          id: st.id,
          name: `${st.id}: ${st.name}`,
          pos1: toSyncPos(st.bounds.min),
          pos2: toSyncPos([st.bounds.maxExclusive[0] - 1, st.bounds.maxExclusive[1] - 1, st.bounds.maxExclusive[2] - 1]),
          bounds: toSyncBounds(st.bounds),
        }));
        const newNames = new Set(newRegions.map((r) => r.name));
        const mergedRegions = [
          ...existingRegions.filter((r) => !newNames.has(r.name) && !newRegions.some((nr) => nr.id === r.id)),
          ...newRegions,
        ];
        const active = newRegions[0]!;
        nextSelectionState = {
          schematicId: ctx.schematicRow.id,
          savedRegions: mergedRegions,
          activeRegionId: active.id,
          bounds: active.bounds,
          pos1: active.pos1,
          pos2: active.pos2,
          updatedAt: new Date().toISOString(),
        };
        ctx.editorSession.execute({
          type: 'selection:edit',
          bounds: {
            minX: active.bounds.min[0],
            minY: active.bounds.min[1],
            minZ: active.bounds.min[2],
            maxX: active.bounds.maxExclusive[0],
            maxY: active.bounds.maxExclusive[1],
            maxZ: active.bounds.maxExclusive[2],
          },
        });
        await upsertUserMcpState(sql, sessionUser.userId, {
          activeSchematicId: ctx.schematicRow.id,
          selectionState: nextSelectionState,
        });
      }

      let renderView: { width: number; height: number; view: string } | undefined;
      let _mcpImages: Array<{ data: string; mimeType: string }> | undefined;

      if (args.render !== false) {
        const { width, height } = clampRenderSize(args.width, args.height);
        const png = renderSchematicPng(ctx.editorSession, {
          bounds,
          view: (args.view as any) || 'composite',
          width,
          height,
          analysis,
          highlightRegions: nextSelectionState?.savedRegions ?? ctx.userMcpState?.selection_state?.savedRegions,
        });
        renderView = { width: png.width, height: png.height, view: png.view };
        _mcpImages = [{ data: png.base64, mimeType: 'image/png' }];
      }

      return {
        ok: true,
        ...res,
        groundLevelY: analysis.groundLevelY,
        environment: analysis.environment,
        structureCount: analysis.structures.length,
        structures: analysis.structures,
        spatialMap: analysis.spatialMap,
        renderView,
        _mcpImages,
      };
    }

    case 'set_block': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pos =
        Array.isArray(args.pos) && args.pos.length === 3
          ? ([Number(args.pos[0]), Number(args.pos[1]), Number(args.pos[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      const block = String(args.block ?? args.blockType ?? 'minecraft:stone');
      ensureDefaultPlacementIfNeeded(ctx.editorSession);
      const res = setVoxelBlockAt(ctx.editorSession, pos, block, {
        placementId: args.placementId ? String(args.placementId) : undefined,
        placementName: args.placementName ? String(args.placementName) : undefined,
        createNewPlacement: Boolean(args.createNewPlacement),
      });
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_block',
          changedCells: res.changedCells,
          summary: `Set block ${block} at [${pos.join(',')}]`,
          args,
        }
      );
      return { ...res, revision: saved.revision };
    }

    case 'set_blocks': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const voxels = Array.isArray(args.voxels) ? args.voxels : [];
      ensureDefaultPlacementIfNeeded(ctx.editorSession);
      const res = setVoxelBlocksBatch(ctx.editorSession, voxels, {
        placementId: args.placementId ? String(args.placementId) : undefined,
        placementName: args.placementName ? String(args.placementName) : undefined,
        createNewPlacement: Boolean(args.createNewPlacement),
      });
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_blocks',
          changedCells: res.changedCells,
          summary: `Set batch of ${voxels.length} blocks`,
          args,
        }
      );
      return { ...res, revision: saved.revision };
    }

    // ── 4. Region Operations ──
    case 'fill_selection':
    case 'fill_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for fill' };
      }
      const blockStr = String(args.blockType ?? args.block ?? args.state ?? 'minecraft:stone');
      const block = parseVoxelBlockState(blockStr);
      ensureDefaultPlacementIfNeeded(ctx.editorSession, bounds);
      const res = ctx.editorSession.execute({
        type: 'region:fill',
        bounds,
        block,
        placementId: args.placementId ? String(args.placementId) : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'fill_selection',
          changedCells: res.changed.cells,
          summary: `Filled region with ${blockStr} (${res.changed.cells} cells)`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, bounds, revision: saved.revision };
    }

    case 'replace_selection':
    case 'replace_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for replace' };
      }
      const matcherStr = String(args.blockType ?? args.matcher ?? 'minecraft:stone');
      const repStr = String(args.replacementBlock ?? args.replacement ?? 'minecraft:air');
      const replacement = parseVoxelBlockState(repStr);
      ensureDefaultPlacementIfNeeded(ctx.editorSession, bounds);

      let totalChanged = 0;
      if (Array.isArray(args.matchers) && args.matchers.length > 0) {
        for (const m of args.matchers) {
          const matcher = parseMatcher(m);
          const res = ctx.editorSession.execute({
            type: 'region:replace',
            bounds,
            matcher,
            replacement,
            preserveProperties: Boolean(args.preserveProperties),
            placementId: args.placementId ? String(args.placementId) : undefined,
          });
          if (!res.ok) return { ok: false, error: res.error.message };
          totalChanged += res.changed.cells;
        }
      } else {
        const matcher = parseMatcher(args.blockType ?? args.matcher);
        const res = ctx.editorSession.execute({
          type: 'region:replace',
          bounds,
          matcher,
          replacement,
          preserveProperties: Boolean(args.preserveProperties),
          placementId: args.placementId ? String(args.placementId) : undefined,
        });
        if (!res.ok) return { ok: false, error: res.error.message };
        totalChanged = res.changed.cells;
      }

      const summary =
        Array.isArray(args.matchers) && args.matchers.length > 0
          ? `Replaced ${args.matchers.length} block types with ${repStr} (${totalChanged} cells)`
          : `Replaced ${matcherStr} with ${repStr} (${totalChanged} cells)`;

      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'replace_selection',
          changedCells: totalChanged,
          summary,
          args,
        }
      );
      return { ok: true, changedCells: totalChanged, bounds, revision: saved.revision };
    }

    case 'walls_selection':
    case 'walls_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for walls' };
      }
      const wallBlockStr = String(args.blockType ?? args.wallBlock ?? 'minecraft:stone_bricks');
      const wallBlock = parseVoxelBlockState(wallBlockStr);
      const fillInterior =
        args.fillInterior || args.replacementBlock
          ? parseVoxelBlockState(String(args.fillInterior ?? args.replacementBlock))
          : null;
      ensureDefaultPlacementIfNeeded(ctx.editorSession, bounds);
      const res = ctx.editorSession.execute({
        type: 'region:walls',
        bounds,
        wallBlock,
        fillInterior,
        includeTop: args.includeTop !== false,
        includeBottom: args.includeBottom !== false,
        placementId: args.placementId ? String(args.placementId) : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'walls_selection',
          changedCells: res.changed.cells,
          summary: `Created walls with ${wallBlockStr} (${res.changed.cells} cells)`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, bounds, revision: saved.revision };
    }

    case 'hollow_selection':
    case 'hollow_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for hollow' };
      }
      const shellThickness = typeof args.shellThickness === 'number' ? args.shellThickness : 1;
      ensureDefaultPlacementIfNeeded(ctx.editorSession, bounds);
      const res = ctx.editorSession.execute({
        type: 'region:hollow',
        bounds,
        shellThickness,
        placementId: args.placementId ? String(args.placementId) : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'hollow_selection',
          changedCells: res.changed.cells,
          summary: `Hollowed selection with thickness ${shellThickness}`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, bounds, revision: saved.revision };
    }

    case 'delete_selection':
    case 'delete_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for delete' };
      }
      const res = ctx.editorSession.execute({
        type: 'region:delete',
        bounds,
        placementId: args.placementId ? String(args.placementId) : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'delete_selection',
          changedCells: res.changed.cells,
          summary: `Deleted blocks in selection (${res.changed.cells} cells)`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, bounds, revision: saved.revision };
    }

    case 'move_selection':
    case 'move_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for move' };
      }
      const offset =
        Array.isArray(args.offset) && args.offset.length === 3
          ? ([Number(args.offset[0]), Number(args.offset[1]), Number(args.offset[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      const res = ctx.editorSession.execute({
        type: 'region:move',
        sourceBounds: bounds,
        offset,
        affectedPlacements: args.placementId ? [String(args.placementId)] : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'move_selection',
          changedCells: res.changed.cells,
          summary: `Moved selection by [${offset.join(',')}]`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, offset, revision: saved.revision };
    }

    case 'stack_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) {
        return { ok: false, error: 'No bounds or active selection provided for stack' };
      }
      const count = Math.min(32, Math.max(1, Number(args.count || 1)));
      const offset =
        Array.isArray(args.offset) && args.offset.length === 3
          ? ([Number(args.offset[0]), Number(args.offset[1]), Number(args.offset[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);

      const proj = ctx.editorSession.snapshot();
      const engine = new MoveStackEngine();
      const stackRes = engine.stack(proj, bounds, {
        count,
        offset,
        shiftSelection: false,
        ignoreAir: true,
      });

      ctx.editorSession = new EditorSession(proj);
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'stack_region',
          changedCells: stackRes.totalChangedCells,
          summary: `Stacked region ${count} times along [${offset.join(',')}] (${stackRes.totalChangedCells} cells)`,
          args,
        }
      );
      return {
        ok: true,
        copies: stackRes.copies,
        changedCells: stackRes.totalChangedCells,
        revision: saved.revision,
      };
    }

    case 'copy_selection': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) return { ok: false, error: 'No bounds or selection to copy' };
      ctx.editorSession.execute({
        type: 'clipboard:copy',
        selection: { kind: 'cuboid', bounds },
      });
      await upsertUserMcpState(sql, sessionUser.userId, {
        activeProjectId: ctx.schematicRow.project_id,
        activeSchematicId: ctx.schematicRow.id,
        clipboardState: {
          entries: serializeClipboardEntries(ctx.editorSession.getClipboardEntries()),
          updatedAt: new Date().toISOString(),
        },
      });
      return { ok: true, copied: true, bounds };
    }

    case 'cut_selection': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!bounds) return { ok: false, error: 'No bounds or selection to cut' };
      const res = ctx.editorSession.execute({
        type: 'clipboard:cut',
        selection: { kind: 'cuboid', bounds },
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'cut_selection',
          changedCells: res.changed.cells,
          summary: `Cut selection to clipboard`,
          args,
          clipboardState: {
            entries: serializeClipboardEntries(ctx.editorSession.getClipboardEntries()),
            updatedAt: new Date().toISOString(),
          },
        }
      );
      return { ok: true, cut: true, bounds, revision: saved.revision };
    }

    case 'paste_clipboard': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      if (ctx.userMcpState?.clipboard_state?.entries?.length) {
        ctx.editorSession.replaceClipboardEntries(
          deserializeClipboardEntries(ctx.userMcpState.clipboard_state.entries)
        );
      }
      const targetPos =
        Array.isArray(args.targetOrigin) && args.targetOrigin.length === 3
          ? ([Number(args.targetOrigin[0]), Number(args.targetOrigin[1]), Number(args.targetOrigin[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      const res = ctx.editorSession.execute({
        type: 'clipboard:paste',
        targetPosition: targetPos,
        intoPlacementId: args.intoPlacementId ? String(args.intoPlacementId) : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'paste_clipboard',
          changedCells: res.changed.cells,
          summary: `Pasted clipboard at [${targetPos.join(',')}]`,
          args,
        }
      );
      return {
        ok: true,
        pasted: true,
        targetPosition: targetPos,
        changedCells: res.changed.cells,
        revision: saved.revision,
      };
    }

    case 'copy_paste_region': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const sourceBounds =
        parseBoundsArg(args.sourceBounds ?? args.worldBounds ?? args.bounds) ??
        ctx.userMcpState?.selection_state?.bounds ??
        null;
      if (!sourceBounds) return { ok: false, error: 'No source bounds provided' };
      const targetOrigin =
        Array.isArray(args.targetOrigin) && args.targetOrigin.length === 3
          ? ([Number(args.targetOrigin[0]), Number(args.targetOrigin[1]), Number(args.targetOrigin[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      ctx.editorSession.execute({
        type: 'clipboard:copy',
        selection: { kind: 'cuboid', bounds: sourceBounds },
      });
      const pasteRes = ctx.editorSession.execute({
        type: 'clipboard:paste',
        targetPosition: targetOrigin,
      });
      if (!pasteRes.ok) return { ok: false, error: pasteRes.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'copy_paste_region',
          changedCells: pasteRes.changed.cells,
          summary: `Copied region to [${targetOrigin.join(',')}]`,
          args,
        }
      );
      return { ok: true, changedCells: pasteRes.changed.cells, revision: saved.revision };
    }

    // ── 5. Procedural Build, 3D Shape & Blueprint Generators ──
    case 'generate_structure':
    case 'generate_build': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      ensureDefaultPlacementIfNeeded(ctx.editorSession);
      const spec = args as unknown as StructureGenerationSpec;
      const res = generateStructure(ctx.editorSession, spec);
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'generate_structure',
          changedCells: res.changedCells,
          summary: `Generated structure ${spec.kind} (${res.changedCells} cells)`,
          args,
        }
      );
      return {
        ok: true,
        placementId: res.placementId,
        placementName: spec.placementName ?? spec.kind,
        changedCells: res.changedCells,
        bounds: res.bounds,
        revision: saved.revision,
      };
    }

    case 'generate_shape': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      ensureDefaultPlacementIfNeeded(ctx.editorSession);
      const spec = args as unknown as ShapeGenerationSpec;
      const res = generateShape(ctx.editorSession, spec);
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'generate_shape',
          changedCells: res.changedCells,
          summary: `Generated shape ${spec.kind} (${res.changedCells} cells)`,
          args,
        }
      );
      return {
        ok: true,
        placementId: res.placementId,
        placementName: spec.placementName ?? spec.kind,
        changedCells: res.changedCells,
        bounds: res.bounds,
        revision: saved.revision,
      };
    }

    case 'build_blueprint': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      ensureDefaultPlacementIfNeeded(ctx.editorSession);
      const spec = args as unknown as BlueprintSpec;
      const res = executeBlueprint(ctx.editorSession, spec);
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'build_blueprint',
          changedCells: res.changedCells,
          summary: `Executed blueprint ${spec.name ?? 'Build'} (${res.changedCells} cells)`,
          args,
        }
      );
      return {
        ok: true,
        placementId: res.placementId,
        placementName: spec.placementName ?? spec.name ?? 'Blueprint Build',
        changedCells: res.changedCells,
        bounds: res.bounds,
        revision: saved.revision,
      };
    }

    // ── 6. Placement Composition & Movement ──
    case 'list_placements': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const snap = ctx.editorSession.snapshot();
      return {
        ok: true,
        placements: snap.placements.map((p) => ({
          id: p.id,
          name: p.name,
          transform: p.transform,
          origin: p.origin,
          bounds: p.volume.bounds,
          worldBounds: placementWorldBounds(p),
          nonAirCount: p.volume.nonAirCount,
          visible: p.visible,
          locked: p.locked,
        })),
      };
    }

    case 'get_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const p = ctx.editorSession.peekProject().placements.find((pl) => pl.id === pid);
      if (!p) return { ok: false, error: `Placement ${pid} not found` };
      return {
        ok: true,
        placement: {
          id: p.id,
          name: p.name,
          transform: p.transform,
          origin: p.origin,
          bounds: p.volume.bounds,
          worldBounds: placementWorldBounds(p),
          nonAirCount: p.volume.nonAirCount,
          visible: p.visible,
          locked: p.locked,
        },
      };
    }

    case 'get_origin': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const p = ctx.editorSession.peekProject().placements.find((pl) => pl.id === pid);
      if (!p) return { ok: false, error: `Placement ${pid} not found` };
      return { ok: true, placementId: pid, origin: p.origin };
    }

    case 'set_origin': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const origin = args.origin as Vec3Half;
      const res = ctx.editorSession.execute({
        type: 'placement:setOrigin',
        placementId: pid,
        origin,
        keepBlocksInPlace: args.keepBlocksInPlace !== false,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_origin',
          changedCells: 0,
          summary: `Set origin of placement ${pid} to [${origin.join(',')}]`,
          args,
        }
      );
      return { ok: true, placementId: pid, origin, revision: saved.revision };
    }

    case 'create_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const name =
        typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'New Placement';
      const translation =
        Array.isArray(args.translation) && args.translation.length === 3
          ? ([Number(args.translation[0]), Number(args.translation[1]), Number(args.translation[2])] as Vec3i)
          : ([0, 0, 0] as Vec3i);
      const newPlacementId = `placement-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newPlacement: Placement = {
        id: newPlacementId,
        name,
        volume: {
          bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
          chunkSize: 16,
          chunks: new Map(),
          nonAirCount: 0,
          paletteCardinality: 1,
        },
        transform: { translation, rotationY: 0, mirror: 'none' },
        origin: [0, 0, 0],
        ancillary: {
          blockEntities: new Map(),
          entities: [],
          pendingBlockTicks: [],
          pendingFluidTicks: [],
          unknownTags: new Map(),
        },
        visible: true,
        locked: false,
        createdAt: new Date().toISOString(),
        source: { format: 'generated', diagnostics: [] },
        eraseTombstones: new Set(),
      };
      ctx.editorSession.execute({ type: 'placement:add', placement: newPlacement });
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'create_placement',
          changedCells: 0,
          summary: `Created placement "${name}" at [${translation.join(',')}]`,
          args,
        }
      );
      return { ok: true, placementId: newPlacementId, name, translation, revision: saved.revision };
    }

    case 'transform_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const p = ctx.editorSession.peekProject().placements.find((pl) => pl.id === pid);
      if (!p) return { ok: false, error: `Placement ${pid} not found` };

      const oldPlacement: Placement = {
        ...p,
        transform: { ...p.transform, translation: [...p.transform.translation] as Vec3i },
        origin: [...p.origin] as Vec3Half,
      };

      let translation = p.transform.translation;
      if (Array.isArray(args.translation) && args.translation.length === 3) {
        translation = [
          Number(args.translation[0]),
          Number(args.translation[1]),
          Number(args.translation[2]),
        ];
      } else if (Array.isArray(args.offset) && args.offset.length === 3) {
        translation = [
          p.transform.translation[0] + Number(args.offset[0]),
          p.transform.translation[1] + Number(args.offset[1]),
          p.transform.translation[2] + Number(args.offset[2]),
        ];
      }
      const rotation =
        args.rotation !== undefined ? (Number(args.rotation) as 0 | 90 | 180 | 270) : undefined;
      const mirror = args.mirror ? (String(args.mirror) as 'none' | 'x' | 'z') : undefined;

      const res = ctx.editorSession.execute({
        type: 'placement:transform',
        placementId: pid,
        translation,
        rotationY: rotation,
        mirror,
      });
      if (!res.ok) return { ok: false, error: res.error.message };

      const newPlacement = ctx.editorSession.peekProject().placements.find((pl) => pl.id === pid) ?? p;
      const nextSelectionState = transformSelectionStateForPlacement(
        ctx.userMcpState?.selection_state,
        oldPlacement,
        newPlacement
      );

      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'transform_placement',
          changedCells: 0,
          summary: `Transformed placement ${pid}`,
          args,
          selectionState: nextSelectionState,
        }
      );
      return {
        ok: true,
        placementId: pid,
        transform: newPlacement.transform,
        selectionState: nextSelectionState,
        revision: saved.revision,
      };
    }

    case 'transform_placements': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pids = Array.isArray(args.placementIds) ? args.placementIds.map(String) : [];
      const primaryPlacement = pids.length > 0
        ? ctx.editorSession.peekProject().placements.find((pl) => pl.id === pids[0])
        : undefined;
      const oldPrimaryPlacement: Placement | undefined = primaryPlacement
        ? {
            ...primaryPlacement,
            transform: { ...primaryPlacement.transform, translation: [...primaryPlacement.transform.translation] as Vec3i },
            origin: [...primaryPlacement.origin] as Vec3Half,
          }
        : undefined;

      const translation =
        Array.isArray(args.translation) && args.translation.length === 3
          ? ([Number(args.translation[0]), Number(args.translation[1]), Number(args.translation[2])] as Vec3i)
          : undefined;
      const rotation =
        args.rotation !== undefined ? (Number(args.rotation) as 0 | 90 | 180 | 270) : undefined;
      const mirror = args.mirror ? (String(args.mirror) as 'none' | 'x' | 'z') : undefined;

      const res = ctx.editorSession.execute({
        type: 'group:transform',
        placementIds: pids,
        translation,
        rotationY: rotation,
        mirror,
      });
      if (!res.ok) return { ok: false, error: res.error.message };

      const newPrimaryPlacement = oldPrimaryPlacement
        ? ctx.editorSession.peekProject().placements.find((pl) => pl.id === oldPrimaryPlacement.id)
        : undefined;
      const nextSelectionState = (oldPrimaryPlacement && newPrimaryPlacement)
        ? transformSelectionStateForPlacement(
            ctx.userMcpState?.selection_state,
            oldPrimaryPlacement,
            newPrimaryPlacement
          )
        : undefined;

      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'transform_placements',
          changedCells: 0,
          summary: `Batch transformed ${pids.length} placements`,
          args,
          selectionState: nextSelectionState,
        }
      );
      return { ok: true, placementIds: pids, selectionState: nextSelectionState, revision: saved.revision };
    }

    case 'duplicate_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const offset =
        Array.isArray(args.offset) && args.offset.length === 3
          ? ([Number(args.offset[0]), Number(args.offset[1]), Number(args.offset[2])] as Vec3i)
          : undefined;
      const res = ctx.editorSession.execute({
        type: 'placement:duplicate',
        placementId: pid,
        offset,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const newId = res.changed.placementIds[0];
      if (args.name && newId) {
        ctx.editorSession.execute({
          type: 'placement:rename',
          placementId: newId,
          name: String(args.name),
        });
      }
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'duplicate_placement',
          changedCells: 0,
          summary: `Duplicated placement ${pid} -> ${newId}`,
          args,
        }
      );
      return {
        ok: true,
        originalPlacementId: pid,
        newPlacementId: newId,
        revision: saved.revision,
      };
    }

    case 'rename_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const name = String(args.name ?? '');
      const res = ctx.editorSession.execute({ type: 'placement:rename', placementId: pid, name });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'rename_placement',
          changedCells: 0,
          summary: `Renamed placement ${pid} to "${name}"`,
          args,
        }
      );
      return { ok: true, placementId: pid, name, revision: saved.revision };
    }

    case 'set_placement_visibility': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const visible = Boolean(args.visible);
      const res = ctx.editorSession.execute({
        type: 'placement:setVisibility',
        placementId: pid,
        visible,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_placement_visibility',
          changedCells: 0,
          summary: `Set placement ${pid} visibility to ${visible}`,
          args,
        }
      );
      return { ok: true, placementId: pid, visible, revision: saved.revision };
    }

    case 'set_placement_lock': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const locked = Boolean(args.locked);
      const res = ctx.editorSession.execute({
        type: 'placement:setLocked',
        placementId: pid,
        locked,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_placement_lock',
          changedCells: 0,
          summary: `Set placement ${pid} lock to ${locked}`,
          args,
        }
      );
      return { ok: true, placementId: pid, locked, revision: saved.revision };
    }

    case 'delete_placement': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pid = String(args.placementId ?? '');
      const res = ctx.editorSession.execute({ type: 'placement:delete', placementId: pid });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'delete_placement',
          changedCells: 0,
          summary: `Deleted placement ${pid}`,
          args,
        }
      );
      return { ok: true, placementId: pid, revision: saved.revision };
    }

    case 'bake_placements': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const pids = Array.isArray(args.placementIds) ? args.placementIds.map(String) : undefined;
      const res = ctx.editorSession.execute({
        type: 'bake',
        placementIds: pids,
        createNewPlacement: args.createNewPlacement,
        newPlacementName: args.newPlacementName,
      });
      if (!res.ok) return { ok: false, error: res.error.message };
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'bake_placements',
          changedCells: res.changed.cells,
          summary: `Baked placements (${res.changed.cells} cells)`,
          args,
        }
      );
      return { ok: true, changedCells: res.changed.cells, revision: saved.revision };
    }

    // ── 7. Analysis, History & Import/Export ──
    case 'detect_conflicts': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        getProjectBounds(ctx.editorSession.peekProject());
      const conflicts = detectConflicts(ctx.editorSession.peekProject(), bounds);
      return { ok: true, ...conflicts };
    }

    case 'get_conflict_map': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds =
        parseBoundsArg(args.worldBounds ?? args.bounds) ??
        getProjectBounds(ctx.editorSession.peekProject());
      const conflicts = detectConflicts(ctx.editorSession.peekProject(), bounds);
      const severity = args.severity ? String(args.severity) : 'all';
      const filtered = (conflicts.entries ?? []).filter((c: any) => {
        if (severity === 'red') return c.category === 'state-conflict';
        if (severity === 'yellow') return c.category === 'same-state';
        return true;
      });
      const page = Math.max(1, Number(args.page || 1));
      const pageSize = Math.max(1, Number(args.pageSize || 50));
      const offset = (page - 1) * pageSize;
      const paged = filtered.slice(offset, offset + pageSize);
      return {
        ok: true,
        totalConflicts: filtered.length,
        page,
        pageSize,
        conflicts: paged,
      };
    }

    case 'get_material_list': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const perPlacement = Boolean(args.perPlacement);
      const res = ctx.editorSession.query({
        type: 'materialList',
        mode: perPlacement ? 'perPlacement' : 'effective',
        placementId: args.placementId ? String(args.placementId) : undefined,
      });
      return { ok: true, materials: res };
    }

    case 'get_color_mode': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      return { ok: true, mode: ctx.editorSession.snapshot().conflictOverlay };
    }

    case 'set_color_mode': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const mode = String(args.mode ?? 'off');
      (ctx.editorSession.peekProject() as any).conflictOverlay = mode;
      await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'set_color_mode',
          changedCells: 0,
          summary: `Set color mode to ${mode}`,
          args,
        }
      );
      return { ok: true, mode };
    }

    case 'get_diagnostics': {
      return { ok: true, diagnostics: [] };
    }

    case 'get_history': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const history = ctx.editorSession.query<HistoryQueryResult>({
        type: 'getHistory',
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        offset: typeof args.offset === 'number' ? args.offset : undefined,
      });
      return { ok: true, history };
    }

    case 'get_operation_diff': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const historyAll = ctx.editorSession.query<HistoryQueryResult>({ type: 'getHistory' });
      const entry =
        historyAll?.undoStack?.find((e) => e.id === args.commandId) ??
        historyAll?.redoStack?.find((e) => e.id === args.commandId);
      return { ok: true, commandId: args.commandId, diff: entry ? entry.data : null };
    }

    case 'undo': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const undoRes = ctx.editorSession.undo();
      if (!undoRes || !undoRes.ok) {
        return { ok: false, error: 'Nothing to undo' };
      }
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'undo',
          changedCells: undoRes.changed.cells,
          summary: `Undid last operation (${undoRes.changed.cells} cells affected)`,
          args,
        }
      );
      return {
        ok: true,
        revision: saved.revision,
        changedCells: undoRes.changed.cells,
        affectedPlacements: undoRes.changed.placementIds,
      };
    }

    case 'redo': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const redoRes = ctx.editorSession.redo();
      if (!redoRes || !redoRes.ok) {
        return { ok: false, error: 'Nothing to redo' };
      }
      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'redo',
          changedCells: redoRes.changed.cells,
          summary: `Redid last operation (${redoRes.changed.cells} cells affected)`,
          args,
        }
      );
      return {
        ok: true,
        revision: saved.revision,
        changedCells: redoRes.changed.cells,
        affectedPlacements: redoRes.changed.placementIds,
      };
    }

    case 'export_schematic':
    case 'export_schematic_base64': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const fmt = args.format ? String(args.format).toLowerCase() : 'vxproj';
      let bytes: Uint8Array;
      let mimeType = 'application/octet-stream';
      let actualFormat = fmt;

      if (fmt === 'vxproj' || fmt === 'project') {
        bytes = await packVxprojArchiveAsync(ctx.editorSession.snapshot());
        mimeType = 'application/zip';
        actualFormat = 'vxproj';
      } else if (fmt === 'litematic' || fmt === 'litematica') {
        const res = await exportSchematic('litematic', ctx.editorSession.snapshot());
        bytes = res.bytes;
        mimeType = 'application/octet-stream';
        actualFormat = 'litematic';
      } else {
        const res = await exportSchematic('schem-v3', ctx.editorSession.snapshot());
        bytes = res.bytes;
        mimeType = 'application/octet-stream';
        actualFormat = 'schem-v3';
      }
      const bytesBase64 = uint8ArrayToBase64(bytes);
      return {
        ok: true,
        format: actualFormat,
        byteLength: bytes.byteLength,
        mimeType,
        bytesBase64,
      };
    }

    case 'load_schematic':
    case 'import_schematic_base64': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      if (!args.bytesBase64) {
        return { ok: false, error: 'bytesBase64 string is required' };
      }
      const bytes = base64ToUint8Array(String(args.bytesBase64));
      const format = args.format ? String(args.format).toLowerCase() : '';

      let addedPlacementId = '';
      if (
        format === 'vxproj' ||
        format.endsWith('.vxproj') ||
        (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)
      ) {
        try {
          const unpacked = await unpackVxprojArchiveAsync(bytes);
          for (const p of unpacked.placements) {
            p.id = `${p.id}-${Date.now().toString(36)}`;
            ctx.editorSession.execute({ type: 'placement:add', placement: p });
            addedPlacementId = p.id;
          }
        } catch {
          const importRes = await importSchematic(
            bytes,
            args.fileName ? String(args.fileName) : 'import.schem'
          );
          for (const p of importRes.placements) {
            ctx.editorSession.execute({ type: 'placement:add', placement: p });
            addedPlacementId = p.id;
          }
        }
      } else {
        const importRes = await importSchematic(
          bytes,
          args.fileName ? String(args.fileName) : 'import.schem'
        );
        for (const p of importRes.placements) {
          ctx.editorSession.execute({ type: 'placement:add', placement: p });
          addedPlacementId = p.id;
        }
      }

      const saved = await saveTargetSchematicSession(
        env,
        sql,
        sessionUser.userId,
        ctx.schematicRow,
        ctx.editorSession,
        {
          toolName: 'load_schematic',
          changedCells: 0,
          summary: `Imported schematic archive into active project`,
          args,
        }
      );

      return {
        ok: true,
        placementId: addedPlacementId,
        revision: saved.revision,
      };
    }

    // ── 12. Visual & Structural Intelligence Engine ──
    case 'analyze_structures': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const bounds = parseBoundsArg(args.bounds ?? args.worldBounds) ?? undefined;
      const maxStructures = clampInt(args.maxStructures, 36, 1, MAX_STRUCTURES);
      const analysis = analyzeSchematicStructures(ctx.editorSession, {
        bounds,
        maxStructures,
      });

      let nextSelectionState: McpSelectionSyncState | undefined = ctx.userMcpState?.selection_state ?? undefined;
      if (args.saveRegions === true && analysis.structures.length > 0) {
        const existingRegions = args.replaceExisting === true
          ? []
          : (ctx.userMcpState?.selection_state?.savedRegions ?? []);
        const newRegions = analysis.structures.map((st) => ({
          id: st.id,
          name: `${st.id}: ${st.name}`,
          pos1: toSyncPos(st.bounds.min),
          pos2: toSyncPos([st.bounds.maxExclusive[0] - 1, st.bounds.maxExclusive[1] - 1, st.bounds.maxExclusive[2] - 1]),
          bounds: toSyncBounds(st.bounds),
        }));
        const newNames = new Set(newRegions.map((r) => r.name));
        const mergedRegions = [
          ...existingRegions.filter((r) => !newNames.has(r.name) && !newRegions.some((nr) => nr.id === r.id)),
          ...newRegions,
        ];
        const active = newRegions[0]!;
        nextSelectionState = {
          schematicId: ctx.schematicRow.id,
          savedRegions: mergedRegions,
          activeRegionId: active.id,
          bounds: active.bounds,
          pos1: active.pos1,
          pos2: active.pos2,
          updatedAt: new Date().toISOString(),
        };
        ctx.editorSession.execute({
          type: 'selection:edit',
          bounds: {
            minX: active.bounds.min[0],
            minY: active.bounds.min[1],
            minZ: active.bounds.min[2],
            maxX: active.bounds.maxExclusive[0],
            maxY: active.bounds.maxExclusive[1],
            maxZ: active.bounds.maxExclusive[2],
          },
        });
        await upsertUserMcpState(sql, sessionUser.userId, {
          activeSchematicId: ctx.schematicRow.id,
          selectionState: nextSelectionState,
        });
      }

      let renderView: { width: number; height: number; view: string } | undefined;
      let _mcpImages: Array<{ data: string; mimeType: string }> | undefined;

      if (args.includeRender !== false) {
        const { width, height } = clampRenderSize(args.width, args.height);
        const png = renderSchematicPng(ctx.editorSession, {
          bounds,
          view: (args.view as any) || 'composite',
          width,
          height,
          analysis,
          highlightRegions: nextSelectionState?.savedRegions ?? ctx.userMcpState?.selection_state?.savedRegions,
        });
        renderView = { width: png.width, height: png.height, view: png.view };
        _mcpImages = [{ data: png.base64, mimeType: 'image/png' }];
      }

      return {
        ok: true,
        bounds: analysis.bounds,
        groundLevelY: analysis.groundLevelY,
        totalVoxels: analysis.totalVoxels,
        structureCount: analysis.structures.length,
        structures: analysis.structures,
        environment: analysis.environment,
        spatialMap: analysis.spatialMap,
        renderView,
        _mcpImages,
      };
    }

    case 'render_schematic_view': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      let bounds = parseBoundsArg(args.bounds ?? args.worldBounds) ?? undefined;
      const analysis = analyzeSchematicStructures(ctx.editorSession, { bounds });
      let matchedStructure: DetectedStructure | null = null;

      if (args.structureId) {
        matchedStructure = selectStructureByQuery(analysis, String(args.structureId));
        if (matchedStructure) {
          bounds = {
            min: [
              matchedStructure.bounds.min[0] - 4,
              matchedStructure.bounds.min[1] - 2,
              matchedStructure.bounds.min[2] - 4,
            ],
            maxExclusive: [
              matchedStructure.bounds.maxExclusive[0] + 4,
              matchedStructure.bounds.maxExclusive[1] + 2,
              matchedStructure.bounds.maxExclusive[2] + 4,
            ],
          };
        }
      }

      const view = (args.view as any) || 'composite';
      const { width, height } = clampRenderSize(args.width, args.height);
      const annotateStructures = args.annotateStructures !== false;

      const png = renderSchematicPng(ctx.editorSession, {
        bounds,
        view,
        width,
        height,
        annotateStructures,
        analysis,
        highlightRegions: ctx.userMcpState?.selection_state?.savedRegions,
      });

      return {
        ok: true,
        view: png.view,
        width: png.width,
        height: png.height,
        bounds: bounds ?? analysis.bounds,
        structure: matchedStructure,
        structures: analysis.structures,
        _mcpImages: [{ data: png.base64, mimeType: 'image/png' }],
      };
    }

    case 'select_structure': {
      const ctx = await loadTargetSchematicSession(env, sql, sessionUser, args);
      const query = String(args.query || '').trim();
      if (!query) {
        return { ok: false, error: 'Query is required for select_structure' };
      }
      const analysis = analyzeSchematicStructures(ctx.editorSession);
      const matched = selectStructureByQuery(analysis, query);
      if (!matched) {
        return {
          ok: false,
          error: `Structure matching "${query}" not found`,
          availableStructures: analysis.structures.map((s) => ({ id: s.id, name: s.name })),
        };
      }

      const regionId = matched.id;
      const regionName = `${matched.id}: ${matched.name}`;
      const newRegion = {
        id: regionId,
        name: regionName,
        pos1: toSyncPos(matched.bounds.min),
        pos2: toSyncPos([matched.bounds.maxExclusive[0] - 1, matched.bounds.maxExclusive[1] - 1, matched.bounds.maxExclusive[2] - 1]),
        bounds: toSyncBounds(matched.bounds),
      };

      const keepExisting = args.keepExistingRegions !== false && args.replaceExisting !== true;
      const currentRegions = keepExisting
        ? (ctx.userMcpState?.selection_state?.savedRegions ?? []).filter((r) => r.id !== regionId && r.name !== regionName)
        : [];
      const nextRegions = [...currentRegions, newRegion];

      const nextSelectionState: McpSelectionSyncState = {
        schematicId: ctx.schematicRow.id,
        savedRegions: nextRegions,
        activeRegionId: regionId,
        bounds: toSyncBounds(matched.bounds),
        pos1: newRegion.pos1,
        pos2: newRegion.pos2,
        updatedAt: new Date().toISOString(),
      };

      ctx.editorSession.execute({
        type: 'selection:edit',
        bounds: {
          minX: matched.bounds.min[0],
          minY: matched.bounds.min[1],
          minZ: matched.bounds.min[2],
          maxX: matched.bounds.maxExclusive[0],
          maxY: matched.bounds.maxExclusive[1],
          maxZ: matched.bounds.maxExclusive[2],
        },
      });

      await upsertUserMcpState(sql, sessionUser.userId, {
        activeSchematicId: ctx.schematicRow.id,
        selectionState: nextSelectionState,
      });

      return {
        ok: true,
        structure: matched,
        bounds: matched.bounds,
        selectionState: nextSelectionState,
      };
    }

    default:
      return { ok: false, error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================================
// JSON-RPC Message Handler
// ============================================================================

async function handleJsonRpcMessage(
  session: SessionUser,
  env: Env,
  sql: SqlClient,
  message: any
): Promise<any> {
  if (!message || typeof message !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request: expected JSON-RPC object' },
    };
  }

  const id = message.id !== undefined ? message.id : null;
  const method = String(message.method ?? '');

  // Notifications without an ID
  if (message.id === undefined || method.startsWith('notifications/')) {
    return null;
  }

  switch (method) {
    case 'initialize': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: message.params?.protocolVersion || '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'easyschemedit-mcp',
            version: '1.0.0',
          },
        },
      };
    }

    case 'ping': {
      return { jsonrpc: '2.0', id, result: {} };
    }

    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: CLOUD_MCP_TOOLS,
        },
      };
    }

    case 'tools/call': {
      const name = String(message.params?.name ?? '');
      const toolArgs = message.params?.arguments ?? {};
      try {
        const toolResult = await executeCloudTool(session, env, sql, name, toolArgs);
        const isError = Boolean(toolResult?.ok === false || toolResult?.error);
        const mcpImages = Array.isArray(toolResult?._mcpImages) ? toolResult._mcpImages : [];
        let cleanResult = toolResult;
        if (mcpImages.length > 0) {
          const { _mcpImages, ...rest } = toolResult;
          cleanResult = rest;
        }
        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
          { type: 'text', text: JSON.stringify(cleanResult, null, 2) },
          ...mcpImages.map((img: any) => ({
            type: 'image',
            data: img.data,
            mimeType: img.mimeType || 'image/png',
          })),
        ];
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content,
            isError,
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2),
              },
            ],
            isError: true,
          },
        };
      }
    }

    case 'resources/list': {
      const rows = (await sql`
        SELECT id, project_id, name
        FROM schematics
        WHERE user_id = ${session.userId}
        ORDER BY updated_at DESC
        LIMIT 50
      `) as Record<string, any>[];

      const resources = rows.map((r: any) => ({
        uri: `easyschemedit://schematic/${r.id}`,
        name: String(r.name),
        description: `Schematic ${r.name} in project ${r.project_id}`,
        mimeType: 'application/x-easyschemedit-schematic',
      }));

      return {
        jsonrpc: '2.0',
        id,
        result: { resources },
      };
    }

    case 'resources/read': {
      const uri = String(message.params?.uri ?? '');
      const schemId = uri.replace('easyschemedit://schematic/', '');
      try {
        const ctx = await loadTargetSchematicSession(env, sql, session, { schematicId: schemId });
        const snap = ctx.editorSession.snapshot();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    id: ctx.schematicRow.id,
                    name: ctx.schematicRow.name,
                    projectId: ctx.schematicRow.project_id,
                    revision: ctx.editorSession.revision,
                    placementCount: snap.placements.length,
                    placements: snap.placements.map((p) => ({
                      id: p.id,
                      name: p.name,
                      nonAirCount: p.volume.nonAirCount,
                      bounds: p.volume.bounds,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Resource not found or failed to load: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    }

    case 'prompts/list': {
      return {
        jsonrpc: '2.0',
        id,
        result: { prompts: PROMPTS_LIST },
      };
    }

    case 'prompts/get': {
      const promptName = String(message.params?.name ?? '');
      const p = PROMPTS_LIST.find((item) => item.name === promptName);
      if (!p) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown prompt: ${promptName}` },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: p.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: p.systemPrompt,
              },
            },
          ],
        },
      };
    }

    default: {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    }
  }
}

// ============================================================================
// Route Handler: GET / POST / OPTIONS / DELETE for /api/mcp and /mcp
// ============================================================================

export async function handleMcpRequest(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);

  // 1. CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: MCP_CORS_HEADERS,
    });
  }

  // 2. Authentication check
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    if (request.method === 'POST') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32001,
            message:
              'Unauthorized: Provide a valid MCP API Key via Authorization: Bearer ese_mcp_..., X-API-Key header, or ?apiKey=ese_mcp_... URL parameter.',
          },
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...MCP_CORS_HEADERS,
          },
        }
      );
    }
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...MCP_CORS_HEADERS,
      },
    });
  }

  // 3. GET /api/mcp or GET /mcp (Info or Streamable SSE transport)
  if (request.method === 'GET') {
    const accept = request.headers.get('Accept') || '';
    const url = new URL(request.url);

    if (accept.includes('text/event-stream')) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32000,
            message: 'Method Not Allowed: standalone GET SSE stream is not supported; use POST',
          },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            Allow: 'POST, OPTIONS',
            ...MCP_CORS_HEADERS,
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'easyschemedit-cloud-mcp',
          version: '1.0.0',
        },
        user: {
          id: session.userId,
          username: session.username,
        },
        toolCount: CLOUD_MCP_TOOLS.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...MCP_CORS_HEADERS,
        },
      }
    );
  }

  // 4. POST /api/mcp or POST /mcp (JSON-RPC or Direct REST tool call)
  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: Invalid JSON' },
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...MCP_CORS_HEADERS,
          },
        }
      );
    }

    // Direct REST-style call: { tool: string, args?: Record<string, unknown> }
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.tool === 'string') {
      try {
        const result = await executeCloudTool(session, env, sql, body.tool, body.args ?? {});
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...MCP_CORS_HEADERS,
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...MCP_CORS_HEADERS,
            },
          }
        );
      }
    }

    // Standard JSON-RPC 2.0 (batch array or single object)
    if (Array.isArray(body)) {
      const responses = [];
      for (const item of body) {
        const resp = await handleJsonRpcMessage(session, env, sql, item);
        if (resp) responses.push(resp);
      }
      return new Response(JSON.stringify(responses), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...MCP_CORS_HEADERS,
        },
      });
    }

    const response = await handleJsonRpcMessage(session, env, sql, body);
    if (!response) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          ...MCP_CORS_HEADERS,
        },
      });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...MCP_CORS_HEADERS,
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      ...MCP_CORS_HEADERS,
    },
  });
}

// ============================================================================
// Tool Catalog (50+ Cloud MCP Tools)
// ============================================================================

export const CLOUD_MCP_TOOLS: McpToolDefinition[] = [
  // ── Account & Workspace Management ──
  {
    name: 'get_account_info',
    description: 'Get authenticated user info, active project/schematic IDs, and schematic counts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_workspace',
    description: 'List the complete tree of projects and schematics owned by the user',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_projects',
    description: 'List all cloud projects owned by the authenticated user',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_project',
    description: 'Create a new cloud project with an initial schematic and set it as active',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the project' },
        initialSchematicName: { type: 'string', description: 'Name of starter schematic' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_project',
    description: 'Rename an existing cloud project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of project to rename' },
        name: { type: 'string', description: 'New name for project' },
      },
      required: ['projectId', 'name'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a cloud project and all its child schematics from database and storage',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of project to delete' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_project',
    description: 'Get project details and list of schematics, setting it as active',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of project' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'open_project',
    description: 'Alias for get_project: open project and set it as active in workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of project to open' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_schematics',
    description: 'List all schematics (optionally filtered by projectId)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID to filter by' },
      },
    },
  },
  {
    name: 'create_schematic',
    description: 'Create a new schematic in a project and set it as the active schematic',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Schematic name' },
        projectId: { type: 'string', description: 'Parent project ID' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_schematic',
    description: 'Rename an existing schematic',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Schematic ID' },
        name: { type: 'string', description: 'New name' },
      },
      required: ['schematicId', 'name'],
    },
  },
  {
    name: 'delete_schematic',
    description: 'Delete a schematic from database and storage',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Schematic ID' },
      },
      required: ['schematicId'],
    },
  },
  {
    name: 'duplicate_schematic',
    description: 'Duplicate a schematic archive and record',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Schematic ID to duplicate' },
        newName: { type: 'string', description: 'Optional new name' },
        targetProjectId: { type: 'string', description: 'Optional destination project ID' },
      },
      required: ['schematicId'],
    },
  },
  {
    name: 'set_active_schematic',
    description: 'Set active schematic in user state so subsequent tools and browser editor target it',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Schematic ID' },
      },
      required: ['schematicId'],
    },
  },
  {
    name: 'open_schematic',
    description: 'Alias for set_active_schematic: switch active schematic for AI and browser view',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Schematic ID' },
      },
      required: ['schematicId'],
    },
  },
  {
    name: 'get_project_info',
    description: 'Get project metadata, revisions, and placement counts',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID' },
      },
    },
  },
  {
    name: 'get_schematic_info',
    description: 'Get full schematic overview: non-air block count, bounds, placements, and active selection',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Optional schematic ID' },
      },
    },
  },

  // ── 2. Selections & Multi-Region Management ──
  {
    name: 'get_selection',
    description: 'Get current selection state, active region, bounds, and saved multi-regions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_selections',
    description: 'Alias for get_selection: list all saved multi-regions and active bounds',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_selection',
    description: 'Create or append a named selection region (pos1/pos2 or 6-tuple bounds [x1,y1,z1,x2,y2,z2]), synced with 3D browser viewport',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' }, description: '[x1,y1,z1,x2,y2,z2]' },
        worldBounds: { type: 'array', items: { type: 'number' } },
        pos1: { type: 'array', items: { type: 'number' }, description: '[x,y,z]' },
        pos2: { type: 'array', items: { type: 'number' }, description: '[x,y,z]' },
        name: { type: 'string', description: 'Region name (e.g. R1, TowerRoof)' },
        replaceExisting: { type: 'boolean', description: 'Default false. Leave false/omitted to preserve and append to existing regions; only set true if the user explicitly asks to clear/replace all existing regions.' },
      },
    },
  },
  {
    name: 'select_region',
    description: 'Select an existing saved region by regionId or name to make it active',
    inputSchema: {
      type: 'object',
      properties: {
        regionId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'remove_region',
    description: 'Remove a saved region by regionId or name (or active region if omitted)',
    inputSchema: {
      type: 'object',
      properties: {
        regionId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'clear_selection',
    description: 'Clear all saved regions and active selection',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'select_placements',
    description: 'Set selected placement IDs in the session',
    inputSchema: {
      type: 'object',
      properties: {
        placementIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['placementIds'],
    },
  },

  // ── 3. Block-Level Inspection & Voxel Editing ──
  {
    name: 'get_block',
    description: 'Get effective block state at a world coordinate',
    inputSchema: {
      type: 'object',
      properties: {
        pos: { type: 'array', items: { type: 'number' }, description: '[x,y,z]' },
        placementId: { type: 'string' },
      },
      required: ['pos'],
    },
  },
  {
    name: 'inspect_region',
    description: 'Scan region voxels, block type counts, and non-air totals (falls back to active selection)',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        maxBlocks: { type: 'number' },
        includeAir: { type: 'boolean' },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'set_block',
    description: 'Set a single block at a world position',
    inputSchema: {
      type: 'object',
      properties: {
        pos: { type: 'array', items: { type: 'number' } },
        block: { type: 'string', description: 'Block state string (e.g. minecraft:stone_bricks)' },
        placementId: { type: 'string' },
        placementName: { type: 'string' },
        createNewPlacement: { type: 'boolean' },
      },
      required: ['pos', 'block'],
    },
  },
  {
    name: 'set_blocks',
    description: 'Set a batch of blocks at world positions in one atomic operation',
    inputSchema: {
      type: 'object',
      properties: {
        voxels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pos: { type: 'array', items: { type: 'number' } },
              block: { type: 'string' },
            },
            required: ['pos', 'block'],
          },
        },
        placementId: { type: 'string' },
        placementName: { type: 'string' },
        createNewPlacement: { type: 'boolean' },
      },
      required: ['voxels'],
    },
  },

  // ── 4. Region Operations ──
  {
    name: 'fill_selection',
    description: 'Fill region or active selection with a block type',
    inputSchema: {
      type: 'object',
      properties: {
        blockType: { type: 'string' },
        block: { type: 'string' },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'fill_region',
    description: 'Alias for fill_selection',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'string' },
        bounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'replace_selection',
    description: 'Replace blocks matching matcher with replacement in bounds or active selection',
    inputSchema: {
      type: 'object',
      properties: {
        matcher: { type: 'string' },
        blockType: { type: 'string' },
        replacement: { type: 'string' },
        replacementBlock: { type: 'string' },
        preserveProperties: { type: 'boolean' },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'replace_region',
    description: 'Alias for replace_selection',
    inputSchema: {
      type: 'object',
      properties: {
        matcher: { type: 'string' },
        replacement: { type: 'string' },
        bounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'walls_selection',
    description: 'Create walls around region bounds with optional interior fill',
    inputSchema: {
      type: 'object',
      properties: {
        wallBlock: { type: 'string' },
        blockType: { type: 'string' },
        fillInterior: { type: 'string' },
        includeTop: { type: 'boolean' },
        includeBottom: { type: 'boolean' },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'walls_region',
    description: 'Alias for walls_selection',
    inputSchema: {
      type: 'object',
      properties: {
        wallBlock: { type: 'string' },
        bounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'hollow_selection',
    description: 'Hollow out region blocks leaving a shell of thickness N',
    inputSchema: {
      type: 'object',
      properties: {
        shellThickness: { type: 'number' },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'hollow_region',
    description: 'Alias for hollow_selection',
    inputSchema: {
      type: 'object',
      properties: {
        shellThickness: { type: 'number' },
        bounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'delete_selection',
    description: 'Clear blocks to air in region or active selection',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
    },
  },
  {
    name: 'delete_region',
    description: 'Alias for delete_selection',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'move_selection',
    description: 'Move blocks in region by an offset [dx, dy, dz]',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'array', items: { type: 'number' } },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
        placementId: { type: 'string' },
      },
      required: ['offset'],
    },
  },
  {
    name: 'move_region',
    description: 'Alias for move_selection',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'array', items: { type: 'number' } },
        bounds: { type: 'array', items: { type: 'number' } },
      },
      required: ['offset'],
    },
  },
  {
    name: 'stack_region',
    description: 'Repeat/stack blocks in region N times along offset [dx, dy, dz]',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of copies (1..32)' },
        offset: { type: 'array', items: { type: 'number' }, description: '[dx, dy, dz]' },
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
      },
      required: ['offset'],
    },
  },
  {
    name: 'copy_selection',
    description: 'Copy region or active selection to clipboard',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'cut_selection',
    description: 'Cut region or active selection to clipboard and clear blocks to air',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'paste_clipboard',
    description: 'Paste current clipboard at targetOrigin [x, y, z]',
    inputSchema: {
      type: 'object',
      properties: {
        targetOrigin: { type: 'array', items: { type: 'number' } },
        intoPlacementId: { type: 'string' },
      },
    },
  },
  {
    name: 'copy_paste_region',
    description: 'Copy a region and paste it directly at targetOrigin [x, y, z]',
    inputSchema: {
      type: 'object',
      properties: {
        sourceBounds: { type: 'array', items: { type: 'number' } },
        targetOrigin: { type: 'array', items: { type: 'number' } },
      },
      required: ['targetOrigin'],
    },
  },

  // ── 5. Procedural Build, 3D Shape & Blueprint Generators ──
  {
    name: 'generate_structure',
    description: 'Generate complete architectural Minecraft structures (house, tower, castle, temple, bridge, tree, fountain, island, modern_villa, pagoda, ship) with palettes and styles',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'house',
            'tower',
            'castle',
            'temple',
            'bridge',
            'tree',
            'fountain',
            'island',
            'modern_villa',
            'pagoda',
            'ship',
          ],
        },
        position: { type: 'array', items: { type: 'number' } },
        style: {
          type: 'string',
          enum: ['medieval', 'modern', 'deepslate', 'desert', 'nether', 'japanese', 'prismarine'],
        },
        size: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
            depth: { type: 'number' },
          },
        },
        palette: { type: 'object' },
        seed: { type: 'number' },
        createNewPlacement: { type: 'boolean' },
        placementName: { type: 'string' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'generate_build',
    description: 'Alias for generate_structure: procedural structure builder',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        position: { type: 'array', items: { type: 'number' } },
        style: { type: 'string' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'generate_shape',
    description: 'Generate procedural 3D geometric shapes (box, sphere, ellipsoid, cylinder, pyramid, cone, arch, line, roof, stairs, torus)',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'box',
            'sphere',
            'ellipsoid',
            'cylinder',
            'pyramid',
            'cone',
            'arch',
            'line',
            'roof',
            'stairs',
            'torus',
          ],
        },
        block: { type: 'string' },
        secondaryBlock: { type: 'string' },
        center: { type: 'array', items: { type: 'number' } },
        bounds: { type: 'object' },
        radius: { type: 'number' },
        height: { type: 'number' },
        width: { type: 'number' },
        depth: { type: 'number' },
        hollow: { type: 'boolean' },
        thickness: { type: 'number' },
        axis: { type: 'string', enum: ['x', 'y', 'z'] },
        createNewPlacement: { type: 'boolean' },
        placementName: { type: 'string' },
      },
      required: ['kind', 'block'],
    },
  },
  {
    name: 'build_blueprint',
    description: 'Execute multi-step procedural blueprint instructions sequentially',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        origin: { type: 'array', items: { type: 'number' } },
        steps: { type: 'array', items: { type: 'object' } },
        createNewPlacement: { type: 'boolean' },
        placementName: { type: 'string' },
      },
      required: ['steps'],
    },
  },

  // ── 6. Placement Composition & Movement ──
  {
    name: 'list_placements',
    description: 'List all placements in active schematic with transform, bounds, non-air count, visible, and locked status',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_placement',
    description: 'Get placement details by ID',
    inputSchema: {
      type: 'object',
      properties: { placementId: { type: 'string' } },
      required: ['placementId'],
    },
  },
  {
    name: 'get_origin',
    description: 'Get rotation/mirror pivot origin of a placement',
    inputSchema: {
      type: 'object',
      properties: { placementId: { type: 'string' } },
      required: ['placementId'],
    },
  },
  {
    name: 'set_origin',
    description: 'Set rotation/mirror pivot origin of a placement',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        origin: { type: 'array', items: { type: 'number' } },
        keepBlocksInPlace: { type: 'boolean' },
      },
      required: ['placementId', 'origin'],
    },
  },
  {
    name: 'create_placement',
    description: 'Create an empty named placement at translation [x, y, z]',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        translation: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'transform_placement',
    description: 'Move, rotate, or mirror a placement (supports absolute translation or relative offset)',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        translation: { type: 'array', items: { type: 'number' } },
        offset: { type: 'array', items: { type: 'number' } },
        rotation: { type: 'string', enum: ['0', '90', '180', '270'] },
        mirror: { type: 'string', enum: ['none', 'x', 'z'] },
      },
      required: ['placementId'],
    },
  },
  {
    name: 'transform_placements',
    description: 'Batch transform multiple placements simultaneously',
    inputSchema: {
      type: 'object',
      properties: {
        placementIds: { type: 'array', items: { type: 'string' } },
        translation: { type: 'array', items: { type: 'number' } },
        rotation: { type: 'string', enum: ['0', '90', '180', '270'] },
        mirror: { type: 'string', enum: ['none', 'x', 'z'] },
      },
      required: ['placementIds'],
    },
  },
  {
    name: 'duplicate_placement',
    description: 'Clone a placement with optional offset [dx, dy, dz] and optional new name',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        offset: { type: 'array', items: { type: 'number' } },
        name: { type: 'string' },
      },
      required: ['placementId'],
    },
  },
  {
    name: 'rename_placement',
    description: 'Rename an existing placement',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['placementId', 'name'],
    },
  },
  {
    name: 'set_placement_visibility',
    description: 'Toggle placement visibility in the 3D viewport and composite',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        visible: { type: 'boolean' },
      },
      required: ['placementId', 'visible'],
    },
  },
  {
    name: 'set_placement_lock',
    description: 'Lock or unlock a placement to prevent accidental edits',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
        locked: { type: 'boolean' },
      },
      required: ['placementId', 'locked'],
    },
  },
  {
    name: 'delete_placement',
    description: 'Delete a placement from the schematic',
    inputSchema: {
      type: 'object',
      properties: {
        placementId: { type: 'string' },
      },
      required: ['placementId'],
    },
  },
  {
    name: 'bake_placements',
    description: 'Bake multiple overlapping placements into a single flattened placement',
    inputSchema: {
      type: 'object',
      properties: {
        placementIds: { type: 'array', items: { type: 'string' } },
        createNewPlacement: { type: 'boolean' },
        newPlacementName: { type: 'string' },
      },
    },
  },

  // ── 7. Analysis, History & Import/Export ──
  {
    name: 'detect_conflicts',
    description: 'Detect placement voxel overlaps, conflicting states, and clean identical overlaps',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        worldBounds: { type: 'array', items: { type: 'number' } },
      },
    },
  },
  {
    name: 'get_conflict_map',
    description: 'Get paginated conflict details with severity filtering (red, yellow, all)',
    inputSchema: {
      type: 'object',
      properties: {
        bounds: { type: 'array', items: { type: 'number' } },
        severity: { type: 'string', enum: ['red', 'yellow', 'all'] },
        page: { type: 'number' },
        pageSize: { type: 'number' },
      },
    },
  },
  {
    name: 'get_material_list',
    description: 'Generate material checklist and block counts across project or per placement',
    inputSchema: {
      type: 'object',
      properties: {
        perPlacement: { type: 'boolean' },
        placementId: { type: 'string' },
        filter: { type: 'string' },
      },
    },
  },
  {
    name: 'get_color_mode',
    description: 'Get conflict overlay display mode',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_color_mode',
    description: 'Set conflict overlay display mode (conflicts, materials, height, off)',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['conflicts', 'materials', 'height', 'off'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'get_diagnostics',
    description: 'Get project diagnostic validation logs',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_history',
    description: 'Get undo and redo transaction history stacks',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'get_operation_diff',
    description: 'Get delta diff details for a specific commandId in history',
    inputSchema: {
      type: 'object',
      properties: {
        commandId: { type: 'string' },
      },
      required: ['commandId'],
    },
  },
  {
    name: 'undo',
    description: 'Undo the last transaction in the active schematic',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'redo',
    description: 'Redo the last undone transaction in the active schematic',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export_schematic',
    description: 'Export schematic in .vxproj, .schem, or .litematic format as base64 bytes',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['vxproj', 'schem', 'litematic'] },
      },
    },
  },
  {
    name: 'export_schematic_base64',
    description: 'Alias for export_schematic',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string' },
      },
    },
  },
  {
    name: 'load_schematic',
    description: 'Import base64-encoded schematic bytes (.schem, .litematic, .vxproj) into active schematic as a new placement',
    inputSchema: {
      type: 'object',
      properties: {
        bytesBase64: { type: 'string', description: 'Base64 encoded schematic file bytes' },
        fileName: { type: 'string', description: 'File name with extension (e.g. build.schem)' },
        format: { type: 'string' },
      },
      required: ['bytesBase64'],
    },
  },
  {
    name: 'import_schematic_base64',
    description: 'Alias for load_schematic',
    inputSchema: {
      type: 'object',
      properties: {
        bytesBase64: { type: 'string' },
        fileName: { type: 'string' },
      },
      required: ['bytesBase64'],
    },
  },

  // ── 12. Visual & Structural Intelligence Engine ──
  {
    name: 'analyze_structures',
    description: 'Analyze schematic structures, architectural classifications, spatial layout, ground level, and environmental features with multi-view PNG rendering',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Optional schematic ID' },
        bounds: { type: 'array', items: { type: 'number' }, description: '6-tuple [minX,minY,minZ,maxX,maxY,maxZ]' },
        maxStructures: { type: 'number', description: 'Max structures to segment (default: 36)' },
        saveRegions: { type: 'boolean', description: 'Save detected structures as browser editor selection regions' },
        includeRender: { type: 'boolean', description: 'Include software-rendered PNG preview image (default: true)' },
        view: { type: 'string', enum: ['composite', 'top', 'isometric', 'front', 'side'], description: 'Render projection view' },
      },
    },
  },
  {
    name: 'render_schematic_view',
    description: 'Render a high-resolution 2D/3D software preview PNG of the schematic or a specific structure',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Optional schematic ID' },
        bounds: { type: 'array', items: { type: 'number' }, description: '6-tuple [minX,minY,minZ,maxX,maxY,maxZ]' },
        structureId: { type: 'string', description: 'Structure ID, symbol, or query (e.g. S1, tower, largest) to zoom into and highlight' },
        view: { type: 'string', enum: ['composite', 'top', 'isometric', 'front', 'side'], description: 'Camera perspective (default: composite)' },
        width: { type: 'number', description: 'Render pixel width (default: 680)' },
        height: { type: 'number', description: 'Render pixel height (default: 360)' },
        annotateStructures: { type: 'boolean', description: 'Draw bounding boxes and structure labels (default: true)' },
      },
    },
  },
  {
    name: 'select_structure',
    description: 'Find a structure by ID (e.g. S1, 1), name, category, or largest/tallest query, and select it in the 3D viewport and selection state',
    inputSchema: {
      type: 'object',
      properties: {
        schematicId: { type: 'string', description: 'Optional schematic ID' },
        query: { type: 'string', description: 'Structure ID (e.g. S1, 1), name, category, or "largest"/"tallest"' },
        keepExistingRegions: { type: 'boolean', description: 'Keep existing saved regions instead of replacing them' },
      },
      required: ['query'],
    },
  },
];

// ============================================================================
// Direct Render Endpoint: GET /api/mcp/render
// ============================================================================

export async function handleMcpRenderRequest(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }

  const sql = sqlOverride ?? getDb(env);
  const sessionUser = await requireMcpAuth(request, env, sql);
  if (!sessionUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...MCP_CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const schematicId = url.searchParams.get('schematicId') || undefined;
  const structureId = url.searchParams.get('structureId') || undefined;
  const view = (url.searchParams.get('view') as any) || 'composite';
  const width = url.searchParams.has('width') ? parseInt(url.searchParams.get('width')!, 10) : undefined;
  const height = url.searchParams.has('height') ? parseInt(url.searchParams.get('height')!, 10) : undefined;

  try {
    const ctx = await loadTargetSchematicSession(env, sql, sessionUser, { schematicId });
    const analysis = analyzeSchematicStructures(ctx.editorSession);
    let bounds: Bounds3i | undefined;

    if (structureId) {
      const matched = selectStructureByQuery(analysis, structureId);
      if (matched) {
        bounds = {
          min: [matched.bounds.min[0] - 4, matched.bounds.min[1] - 2, matched.bounds.min[2] - 4],
          maxExclusive: [matched.bounds.maxExclusive[0] + 4, matched.bounds.maxExclusive[1] + 2, matched.bounds.maxExclusive[2] + 4],
        };
      }
    }

    const png = renderSchematicPng(ctx.editorSession, {
      bounds,
      view,
      width,
      height,
      analysis,
      highlightRegions: ctx.userMcpState?.selection_state?.savedRegions,
    });

    return new Response(png.pngBytes as any, {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...MCP_CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
