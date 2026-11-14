/// <reference types="@cloudflare/workers-types" />
import type { Env } from './env.ts';
import { getDb, type SqlClient } from './db.ts';
import { json, errorJson } from './http.ts';
import { requireSession, type SessionUser } from './auth.ts';

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface CloudProjectSummary {
  id: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudSchematicSummary {
  id: string;
  projectId: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProjectNode extends CloudProjectSummary {
  schematics: CloudSchematicSummary[];
}

export function formatProjectSummary(row: any): CloudProjectSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    revision: Number(row.revision ?? 1),
    placementCount: Number(row.placement_count ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? new Date().toISOString()),
  };
}

export function formatSchematicSummary(row: any): CloudSchematicSummary {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    revision: Number(row.revision ?? 1),
    placementCount: Number(row.placement_count ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * GET /api/projects
 * Lists all cloud projects owned by the authenticated user, ordered by updated_at DESC.
 */
export async function handleListProjects(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    FROM projects
    WHERE user_id = ${session.userId}
    ORDER BY updated_at DESC
  `) as Record<string, any>[];

  const projects: CloudProjectSummary[] = rows.map(formatProjectSummary);
  return json({ projects }, 200);
}

/**
 * POST /api/projects
 * Creates a new project record.
 * Supports application/json ({ name }) or binary archive body (with X-Project-Name, X-Revision, X-Placement-Count headers).
 */
export async function handleCreateProject(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const contentType = request.headers.get('Content-Type') || '';
  const projectId = crypto.randomUUID();
  const r2Key = `users/${session.userId}/projects/${projectId}.vxproj`;

  if (contentType.includes('application/json')) {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload', 400);
    }

    const name =
      typeof body?.name === 'string' && body.name.trim() !== ''
        ? body.name.trim()
        : 'Untitled Project';

    const revision = 1;
    const placementCount = 0;
    const sizeBytes = 0;

    const rows = (await sql`
      INSERT INTO projects (id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
      VALUES (${projectId}, ${session.userId}, ${name}, ${revision}, ${placementCount}, ${r2Key}, ${sizeBytes}, now(), now())
      RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    `) as Record<string, any>[];

    return json({ project: formatProjectSummary(rows[0]) }, 201);
  }

  // Binary body upload (application/zip / application/octet-stream)
  const rawNameHeader = request.headers.get('X-Project-Name');
  let projectName = 'Untitled Project';
  if (rawNameHeader) {
    try {
      const decoded = decodeURIComponent(rawNameHeader).trim();
      if (decoded) projectName = decoded;
    } catch {
      const trimmed = rawNameHeader.trim();
      if (trimmed) projectName = trimmed;
    }
  }

  const revHeader = request.headers.get('X-Revision');
  const revision = revHeader ? Math.max(1, parseInt(revHeader, 10) || 1) : 1;

  const countHeader = request.headers.get('X-Placement-Count');
  const placementCount = countHeader ? Math.max(0, parseInt(countHeader, 10) || 0) : 0;

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return errorJson('Failed to read request body', 400);
  }

  if (buf.byteLength === 0) {
    return errorJson('Archive payload cannot be empty', 400);
  }
  if (buf.byteLength > MAX_ARCHIVE_BYTES) {
    return errorJson('Archive payload exceeds maximum allowed size (50 MB)', 413);
  }

  // Upload to R2 first
  await env.PROJECTS_BUCKET.put(r2Key, buf, {
    httpMetadata: {
      contentType: 'application/zip',
    },
  });

  // Then insert into Neon
  const rows = (await sql`
    INSERT INTO projects (id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
    VALUES (${projectId}, ${session.userId}, ${projectName}, ${revision}, ${placementCount}, ${r2Key}, ${buf.byteLength}, now(), now())
    RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
  `) as Record<string, any>[];

  return json({ project: formatProjectSummary(rows[0]) }, 201);
}

/**
 * GET /api/projects/:id
 * Retrieves metadata for a single project owned by the authenticated user.
 */
export async function handleGetProject(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    FROM projects
    WHERE id = ${projectId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!rows || rows.length === 0) {
    return errorJson('Project not found', 404);
  }

  return json({ project: formatProjectSummary(rows[0]) }, 200);
}

/**
 * GET /api/projects/:id/archive
 * Streams the .vxproj archive binary from R2 storage after verifying project ownership in Neon.
 */
export async function handleGetProjectArchive(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, user_id, name, r2_key
    FROM projects
    WHERE id = ${projectId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!rows || rows.length === 0) {
    return errorJson('Project not found', 404);
  }

  const project = rows[0];
  const obj = await env.PROJECTS_BUCKET.get(project.r2_key);
  if (!obj || !obj.body) {
    return errorJson('Archive file not found in storage', 404);
  }

  const safeFilename = encodeURIComponent(project.name || 'project') + '.vxproj';
  return new Response(obj.body as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
    },
  });
}

/**
 * PUT /api/projects/:id/archive
 * Uploads a revised .vxproj archive binary to R2 and updates project metadata in Neon.
 */
export async function handleSaveProjectArchive(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const existingRows = (await sql`
    SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes
    FROM projects
    WHERE id = ${projectId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!existingRows || existingRows.length === 0) {
    return errorJson('Project not found', 404);
  }

  const existing = existingRows[0];

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return errorJson('Failed to read archive body', 400);
  }

  if (buf.byteLength === 0) {
    return errorJson('Archive payload cannot be empty', 400);
  }
  if (buf.byteLength > MAX_ARCHIVE_BYTES) {
    return errorJson('Archive payload exceeds maximum allowed size (50 MB)', 413);
  }

  const rawNameHeader = request.headers.get('X-Project-Name');
  let newName = existing.name;
  if (rawNameHeader) {
    try {
      const decoded = decodeURIComponent(rawNameHeader).trim();
      if (decoded) newName = decoded;
    } catch {
      const trimmed = rawNameHeader.trim();
      if (trimmed) newName = trimmed;
    }
  }

  const revHeader = request.headers.get('X-Revision');
  const newRevision = revHeader
    ? Math.max(1, parseInt(revHeader, 10) || Number(existing.revision) + 1)
    : Number(existing.revision) + 1;

  const countHeader = request.headers.get('X-Placement-Count');
  const newPlacementCount = countHeader
    ? Math.max(0, parseInt(countHeader, 10) || 0)
    : Number(existing.placement_count);

  await env.PROJECTS_BUCKET.put(existing.r2_key, buf, {
    httpMetadata: {
      contentType: 'application/zip',
    },
  });

  const updatedRows = (await sql`
    UPDATE projects
    SET
      name = ${newName},
      revision = ${newRevision},
      placement_count = ${newPlacementCount},
      size_bytes = ${buf.byteLength},
      updated_at = now()
    WHERE id = ${projectId} AND user_id = ${session.userId}
    RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
  `) as Record<string, any>[];

  return json({ project: formatProjectSummary(updatedRows[0]) }, 200);
}

/**
 * PATCH /api/projects/:id
 * Renames a project record after verifying ownership.
 */
export async function handleRenameProject(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON payload', 400);
  }

  if (!body || typeof body.name !== 'string' || body.name.trim() === '') {
    return errorJson('Project name is required', 400);
  }

  const newName = body.name.trim();

  const updatedRows = (await sql`
    UPDATE projects
    SET
      name = ${newName},
      updated_at = now()
    WHERE id = ${projectId} AND user_id = ${session.userId}
    RETURNING id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
  `) as Record<string, any>[];

  if (!updatedRows || updatedRows.length === 0) {
    return errorJson('Project not found', 404);
  }

  return json({ project: formatProjectSummary(updatedRows[0]) }, 200);
}

/**
 * DELETE /api/projects/:id
 * Deletes a project record from Neon and removes all associated .vxproj archives from R2
 * (both the project archive and all child schematic archives).
 */
export async function handleDeleteProject(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  // 1. Query all child schematic R2 keys for this project before cascade delete
  const childSchematicRows = (await sql`
    SELECT r2_key
    FROM schematics
    WHERE project_id = ${projectId} AND user_id = ${session.userId}
  `) as Record<string, any>[];

  // 2. Delete project from DB (will cascade delete schematics rows in DB)
  const deletedRows = (await sql`
    DELETE FROM projects
    WHERE id = ${projectId} AND user_id = ${session.userId}
    RETURNING r2_key
  `) as Record<string, any>[];

  if (!deletedRows || deletedRows.length === 0) {
    return errorJson('Project not found', 404);
  }

  // 3. Delete all R2 keys (project archive + child schematic archives)
  const keysToDelete: string[] = [];
  const projectR2Key = deletedRows[0]?.r2_key;
  if (projectR2Key) {
    keysToDelete.push(projectR2Key);
  }
  for (const sRow of childSchematicRows) {
    if (sRow?.r2_key && !keysToDelete.includes(sRow.r2_key)) {
      keysToDelete.push(sRow.r2_key);
    }
  }

  if (env.PROJECTS_BUCKET && keysToDelete.length > 0) {
    await Promise.all(
      keysToDelete.map((key) =>
        env.PROJECTS_BUCKET.delete(key).catch(() => {})
      )
    );
  }

  return json({ ok: true, id: projectId }, 200);
}

/**
 * GET /api/workspace
 * Lists all projects with their child schematics owned by the authenticated user.
 */
export async function handleListWorkspaceTree(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const [projectRows, schematicRows] = (await Promise.all([
    sql`
      SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      FROM projects
      WHERE user_id = ${session.userId}
      ORDER BY updated_at DESC
    `,
    sql`
      SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
      FROM schematics
      WHERE user_id = ${session.userId}
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

  return json({ projects }, 200);
}

/**
 * POST /api/projects/:projectId/schematics
 * Creates a new schematic inside the specified project.
 * Supports application/json ({ name }) or binary archive body (with X-Schematic-Name/X-Project-Name, X-Revision, X-Placement-Count headers).
 */
export async function handleCreateSchematic(
  request: Request,
  env: Env,
  projectId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  // Verify project ownership
  const projRows = (await sql`
    SELECT id, user_id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!projRows || projRows.length === 0) {
    return errorJson('Project not found', 404);
  }

  const contentType = request.headers.get('Content-Type') || '';
  const schematicId = crypto.randomUUID();
  const r2Key = `users/${session.userId}/projects/${projectId}/schematics/${schematicId}.vxproj`;

  if (contentType.includes('application/json')) {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload', 400);
    }

    const name =
      typeof body?.name === 'string' && body.name.trim() !== ''
        ? body.name.trim()
        : 'Untitled Schematic';

    const revision = 1;
    const placementCount = 0;
    const sizeBytes = 0;

    const rows = (await sql`
      INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
      VALUES (${schematicId}, ${projectId}, ${session.userId}, ${name}, ${revision}, ${placementCount}, ${r2Key}, ${sizeBytes}, now(), now())
      RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    `) as Record<string, any>[];

    await sql`
      UPDATE projects
      SET updated_at = now()
      WHERE id = ${projectId} AND user_id = ${session.userId}
    `;

    return json({ schematic: formatSchematicSummary(rows[0]) }, 201);
  }

  // Binary body upload (application/zip / application/octet-stream)
  const rawNameHeader =
    request.headers.get('X-Schematic-Name') || request.headers.get('X-Project-Name');
  let schematicName = 'Untitled Schematic';
  if (rawNameHeader) {
    try {
      const decoded = decodeURIComponent(rawNameHeader).trim();
      if (decoded) schematicName = decoded;
    } catch {
      const trimmed = rawNameHeader.trim();
      if (trimmed) schematicName = trimmed;
    }
  }

  const revHeader = request.headers.get('X-Revision');
  const revision = revHeader ? Math.max(1, parseInt(revHeader, 10) || 1) : 1;

  const countHeader = request.headers.get('X-Placement-Count');
  const placementCount = countHeader ? Math.max(0, parseInt(countHeader, 10) || 0) : 0;

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return errorJson('Failed to read request body', 400);
  }

  if (buf.byteLength === 0) {
    return errorJson('Archive payload cannot be empty', 400);
  }
  if (buf.byteLength > MAX_ARCHIVE_BYTES) {
    return errorJson('Archive payload exceeds maximum allowed size (50 MB)', 413);
  }

  // Upload to R2 first
  await env.PROJECTS_BUCKET.put(r2Key, buf, {
    httpMetadata: {
      contentType: 'application/zip',
    },
  });

  // Then insert into Neon
  const rows = (await sql`
    INSERT INTO schematics (id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at)
    VALUES (${schematicId}, ${projectId}, ${session.userId}, ${schematicName}, ${revision}, ${placementCount}, ${r2Key}, ${buf.byteLength}, now(), now())
    RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
  `) as Record<string, any>[];

  await sql`
    UPDATE projects
    SET updated_at = now()
    WHERE id = ${projectId} AND user_id = ${session.userId}
  `;

  return json({ schematic: formatSchematicSummary(rows[0]) }, 201);
}

/**
 * GET /api/schematics/:id
 * Retrieves metadata for a single schematic owned by the authenticated user.
 */
export async function handleGetSchematic(
  request: Request,
  env: Env,
  schematicId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    FROM schematics
    WHERE id = ${schematicId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!rows || rows.length === 0) {
    return errorJson('Schematic not found', 404);
  }

  return json({ schematic: formatSchematicSummary(rows[0]) }, 200);
}

/**
 * GET /api/schematics/:id/archive
 * Streams the .vxproj archive binary from R2 storage after verifying schematic ownership in Neon.
 */
export async function handleGetSchematicArchive(
  request: Request,
  env: Env,
  schematicId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, project_id, user_id, name, r2_key
    FROM schematics
    WHERE id = ${schematicId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!rows || rows.length === 0) {
    return errorJson('Schematic not found', 404);
  }

  const schematic = rows[0];
  const obj = await env.PROJECTS_BUCKET.get(schematic.r2_key);
  if (!obj || !obj.body) {
    return errorJson('Archive file not found in storage', 404);
  }

  const safeFilename = encodeURIComponent(schematic.name || 'schematic') + '.vxproj';
  return new Response(obj.body as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
    },
  });
}

/**
 * PUT /api/schematics/:id/archive
 * Uploads a revised .vxproj archive binary to R2 and updates schematic metadata in Neon,
 * touching the parent project's updated_at timestamp.
 */
export async function handleSaveSchematicArchive(
  request: Request,
  env: Env,
  schematicId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const existingRows = (await sql`
    SELECT id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes
    FROM schematics
    WHERE id = ${schematicId} AND user_id = ${session.userId}
    LIMIT 1
  `) as Record<string, any>[];

  if (!existingRows || existingRows.length === 0) {
    return errorJson('Schematic not found', 404);
  }

  const existing = existingRows[0];

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return errorJson('Failed to read archive body', 400);
  }

  if (buf.byteLength === 0) {
    return errorJson('Archive payload cannot be empty', 400);
  }
  if (buf.byteLength > MAX_ARCHIVE_BYTES) {
    return errorJson('Archive payload exceeds maximum allowed size (50 MB)', 413);
  }

  const rawNameHeader =
    request.headers.get('X-Schematic-Name') || request.headers.get('X-Project-Name');
  let newName = existing.name;
  if (rawNameHeader) {
    try {
      const decoded = decodeURIComponent(rawNameHeader).trim();
      if (decoded) newName = decoded;
    } catch {
      const trimmed = rawNameHeader.trim();
      if (trimmed) newName = trimmed;
    }
  }

  const revHeader = request.headers.get('X-Revision');
  const newRevision = revHeader
    ? Math.max(1, parseInt(revHeader, 10) || Number(existing.revision) + 1)
    : Number(existing.revision) + 1;

  const countHeader = request.headers.get('X-Placement-Count');
  const newPlacementCount = countHeader
    ? Math.max(0, parseInt(countHeader, 10) || 0)
    : Number(existing.placement_count);

  const r2Key =
    existing.r2_key ||
    `users/${session.userId}/projects/${existing.project_id}/schematics/${schematicId}.vxproj`;

  await env.PROJECTS_BUCKET.put(r2Key, buf, {
    httpMetadata: {
      contentType: 'application/zip',
    },
  });

  const [updatedRows] = (await Promise.all([
    sql`
      UPDATE schematics
      SET
        name = ${newName},
        revision = ${newRevision},
        placement_count = ${newPlacementCount},
        size_bytes = ${buf.byteLength},
        r2_key = ${r2Key},
        updated_at = now()
      WHERE id = ${schematicId} AND user_id = ${session.userId}
      RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
    `,
    // Touch parent project
    sql`
      UPDATE projects
      SET updated_at = now()
      WHERE id = ${existing.project_id} AND user_id = ${session.userId}
    `,
  ])) as [Record<string, any>[], any];

  return json({ schematic: formatSchematicSummary(updatedRows[0]) }, 200);
}

/**
 * PATCH /api/schematics/:id
 * Renames a schematic record after verifying ownership.
 */
export async function handleRenameSchematic(
  request: Request,
  env: Env,
  schematicId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON payload', 400);
  }

  if (!body || typeof body.name !== 'string' || body.name.trim() === '') {
    return errorJson('Schematic name is required', 400);
  }

  const newName = body.name.trim();

  const updatedRows = (await sql`
    UPDATE schematics
    SET
      name = ${newName},
      updated_at = now()
    WHERE id = ${schematicId} AND user_id = ${session.userId}
    RETURNING id, project_id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at
  `) as Record<string, any>[];

  if (!updatedRows || updatedRows.length === 0) {
    return errorJson('Schematic not found', 404);
  }

  const schematic = updatedRows[0];

  // Touch parent project
  await sql`
    UPDATE projects
    SET updated_at = now()
    WHERE id = ${schematic.project_id} AND user_id = ${session.userId}
  `;

  return json({ schematic: formatSchematicSummary(schematic) }, 200);
}

/**
 * DELETE /api/schematics/:id
 * Deletes a schematic record from Neon and removes the .vxproj archive from R2.
 */
export async function handleDeleteSchematic(
  request: Request,
  env: Env,
  schematicId: string,
  sqlOverride?: SqlClient,
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireSession(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const deletedRows = (await sql`
    DELETE FROM schematics
    WHERE id = ${schematicId} AND user_id = ${session.userId}
    RETURNING project_id, r2_key
  `) as Record<string, any>[];

  if (!deletedRows || deletedRows.length === 0) {
    return errorJson('Schematic not found', 404);
  }

  const r2Key = deletedRows[0]?.r2_key;
  if (r2Key && env.PROJECTS_BUCKET) {
    try {
      await env.PROJECTS_BUCKET.delete(r2Key);
    } catch {
      // Ignore if R2 object already absent
    }
  }

  const projectId = deletedRows[0]?.project_id;
  if (projectId) {
    await sql`
      UPDATE projects
      SET updated_at = now()
      WHERE id = ${projectId} AND user_id = ${session.userId}
    `;
  }

  return json({ ok: true, id: schematicId }, 200);
}
