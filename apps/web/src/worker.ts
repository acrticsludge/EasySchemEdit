/// <reference types="@cloudflare/workers-types" />
import type { Env } from './server/env.ts';
import { getDb } from './server/db.ts';
import { json, errorJson } from './server/http.ts';
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
} from './server/auth.ts';
import {
  handleListProjects,
  handleCreateProject,
  handleGetProject,
  handleGetProjectArchive,
  handleSaveProjectArchive,
  handleRenameProject,
  handleDeleteProject,
} from './server/projects.ts';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Root redirect: / -> /editor
    if (url.pathname === '/') {
      return Response.redirect(new URL('/editor', request.url).toString(), 302);
    }

    // Health check endpoint
    if (url.pathname === '/api/health') {
      try {
        const sql = getDb(env);
        await sql`SELECT 1 AS ok`;
        return json({
          ok: true,
          db: true,
          r2: Boolean(env.PROJECTS_BUCKET),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json(
          {
            ok: false,
            db: false,
            r2: Boolean(env.PROJECTS_BUCKET),
            error: message,
          },
          500,
        );
      }
    }

    // Auth endpoints
    if (url.pathname === '/api/auth/register') {
      if (request.method !== 'POST') {
        return errorJson('Method Not Allowed', 405);
      }
      return handleRegister(request, env);
    }

    if (url.pathname === '/api/auth/login') {
      if (request.method !== 'POST') {
        return errorJson('Method Not Allowed', 405);
      }
      return handleLogin(request, env);
    }

    if (url.pathname === '/api/auth/logout') {
      if (request.method !== 'POST') {
        return errorJson('Method Not Allowed', 405);
      }
      return handleLogout(request, env);
    }

    if (url.pathname === '/api/auth/me') {
      if (request.method !== 'GET') {
        return errorJson('Method Not Allowed', 405);
      }
      return handleMe(request, env);
    }

    // Projects collection endpoints
    if (url.pathname === '/api/projects') {
      if (request.method === 'GET') {
        return handleListProjects(request, env);
      }
      if (request.method === 'POST') {
        return handleCreateProject(request, env);
      }
      return errorJson('Method Not Allowed', 405);
    }

    // Projects archive endpoint: /api/projects/:id/archive (where :id has no '/')
    const archiveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/archive$/);
    if (archiveMatch) {
      const id = decodeURIComponent(archiveMatch[1]);
      if (request.method === 'GET') {
        return handleGetProjectArchive(request, env, id);
      }
      if (request.method === 'PUT') {
        return handleSaveProjectArchive(request, env, id);
      }
      return errorJson('Method Not Allowed', 405);
    }

    // Project item endpoint: /api/projects/:id (where :id has no '/')
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch) {
      const id = decodeURIComponent(projectMatch[1]);
      if (request.method === 'GET') {
        return handleGetProject(request, env, id);
      }
      if (request.method === 'PATCH') {
        return handleRenameProject(request, env, id);
      }
      if (request.method === 'DELETE') {
        return handleDeleteProject(request, env, id);
      }
      return errorJson('Method Not Allowed', 405);
    }

    // Unhandled /api/* routes
    if (url.pathname.startsWith('/api/')) {
      return errorJson('Not found', 404);
    }

    // Static assets via ASSETS binding
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Fall through to fallback below
    }

    // SPA fallback: try /editor/index.html first, then fall back to /index.html
    try {
      const editorFallback = await env.ASSETS.fetch(
        new Request(new URL('/editor/index.html', url.origin), request),
      );
      if (editorFallback.status !== 404) {
        return editorFallback;
      }
    } catch {
      // Fall through to /index.html
    }

    return env.ASSETS.fetch(
      new Request(new URL('/index.html', url.origin), request),
    );
  },
};
