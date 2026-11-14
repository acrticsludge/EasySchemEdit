# Cloud Persistence & User Auth Plan — Neon DB + Cloudflare R2

Author: orchestrator · Date: 2026-11-14 · Target Branch: `master`
Status: **PLANNING COMPLETE — AWAITING USER APPROVAL TO PROVISION & IMPLEMENT**

---

## 1. GOAL

Add per-user **username + password authentication** and **cloud project persistence** backed by **Neon PostgreSQL** (users, sessions, project metadata) and **Cloudflare R2** (`.vxproj` archive binaries), supporting the full lifecycle from **creating a new project**, **saving it**, to **opening it from a saved projects list**.

---

## 2. CONSTRAINTS & NON-GOALS

### Constraints
- Follow `AGENTS.md`:
  - `packages/*` remain pure TypeScript with **no DOM, React, Three.js, or Cloudflare-specific runtime imports**; browser/Worker APIs live in `apps/web` or behind injected interfaces.
  - Import sibling `.ts` files with explicit `.ts` extensions.
  - Reuse `@easyschemedit/persistence` (`packVxprojArchive`, `unpackVxprojArchive`) rather than inventing a second project archive format.
  - Commit per slice after verification, staging only explicit file paths.
- **No plaintext passwords, no client-side DB credentials.** All Neon queries and R2 reads/writes run server-side inside the Cloudflare Worker/Pages Function.
- **Per-user isolation.** Every project query, download, overwrite, and delete must filter by `user_id = session.userId`.
- **Deployment continuity.** `.git/hooks/post-commit` currently deploys `apps/web/dist` to Cloudflare. The backend API (`/api/auth/*`, `/api/projects/*`) must deploy cleanly alongside the Astro static build in the same Cloudflare project so same-origin `HttpOnly` cookies work without CORS friction.

### Non-Goals (for this phase)
- OAuth / social login (Google, GitHub, Discord), email verification, or password-reset emails.
- Real-time multiplayer collaboration or live shared editing cursors.
- Public project sharing links or community gallery.
- Version history UI / branching of past revisions (we store `revision` and overwrite or key R2 objects cleanly, keeping the latest `.vxproj` per project).
- Billing / storage quotas UI (beyond basic server-side max upload size guard, e.g., 50 MB).

---

## 3. INPUTS (Verified Repo & Account Facts)

### Codebase Inputs
- `apps/web/astro.config.mjs`: `output: 'static'`, `@astrojs/react`, `assets: '_astro'`.
- `apps/web/package.json`: `@easyschemedit/web`, `astro@^5.0.0`, `react@^19.0.0`, `@cloudflare/workers-types@^5.20261113.1`, `wrangler@^4.161.0`.
- `apps/web/wrangler.toml`:
  ```toml
  name = "easyschemedit"
  main = "src/worker.ts"
  compatibility_date = "2026-01-01"
  compatibility_flags = ["nodejs_compat"]

  [assets]
  directory = "./dist"
  binding = "ASSETS"
  ```
- `apps/web/src/worker.ts`: Existing Worker entrypoint serving `env.ASSETS` with SPA fallback to `https://static/index.html`.
- `.git/hooks/post-commit`: Currently runs `npx astro build` and `npx wrangler pages deploy dist --project-name easyschemedit`.
- `apps/web/src/pages/index.astro`: Single Astro page hosting the editor.
- `packages/persistence/src/vxproj.ts`: `.vxproj` ZIP archive serialization (`packVxprojArchive` / `unpackVxprojArchive` via `fflate`).
- `apps/web/src/editor/persistence/persistence-controller.ts`: Existing IndexedDB persistence controller (`saveProject`, `getProject`, `deleteProject`, `listProjects`).
- `apps/web/src/editor/persistence/ProjectDialog.tsx`: Existing (currently unwired) modal UI for New / Save / Open / Import / Export `.vxproj`.
- `apps/web/src/editor/layout/Toolbar.tsx`: Top toolbar with `onSave` button and file action slots.

### Live Account Inputs (Verified via MCPs)
- **Neon MCP (`neon`)**: Authenticated to organization `"Anubhavs Org"` (`id: "org-spring-dew-36122149"`). Existing projects: `sheetrelay-app` and `PESDac` (`aws-us-west-2`, PG 18). No `easyschemedit` project exists yet.
- **Cloudflare API MCP (`cloudflare-api`)**: Authenticated as `anubhavrai100@gmail.com` (`id: "user:bfe928105874d0ba2f45654498489111"`).

---

## 4. ARCHITECTURE DECISIONS

### AD-1: Cloudflare Deployment Alignment (Workers Static Assets vs Pages)
- **Observation**: `apps/web/wrangler.toml` + `apps/web/src/worker.ts` already configure **Cloudflare Workers Static Assets** (`main = "src/worker.ts"`, `[assets] directory = "./dist"`), whereas `.git/hooks/post-commit` currently runs `wrangler pages deploy dist --project-name easyschemedit` (which ignores `src/worker.ts`).
- **Decision**: Route all `/api/*` requests through `apps/web/src/worker.ts` and unify deployment on **`npx wrangler deploy`** (Workers Static Assets) — OR, if the user prefers keeping the existing `easyschemedit.pages.dev` Pages project URL, compile the same router into `apps/web/dist/_worker.js` via esbuild during build so `wrangler pages deploy dist` executes the exact same Worker code with `PROJECTS_BUCKET` R2 binding and `NEON_DATABASE_URL` secret.
- **Recommended default**: `apps/web/src/worker.ts` as single source of truth, bundled to `dist/_worker.js` (if staying on Pages) or deployed with `wrangler deploy` (Workers). We will confirm the user's preferred URL (`pages.dev` vs `workers.dev`) before Slice 1 execution.

### AD-2: Storage Split (Neon PostgreSQL + Cloudflare R2)
- **Neon PostgreSQL** (via `@neondatabase/serverless` HTTP `neon()` client — zero TCP sockets needed in Workers):
  - `users`:
    - `id` (`TEXT` / UUID PK)
    - `username` (`TEXT NOT NULL`) + unique index on `LOWER(username)` (case-insensitive login, preserves display casing)
    - `password_hash` (`TEXT NOT NULL`) — formatted as `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>` using WebCrypto `crypto.subtle` (or `scrypt` via `nodejs_compat`) with 100,000+ iterations and constant-time comparison
    - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `sessions`:
    - `id` (`TEXT` PK)
    - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`)
    - `token_hash` (`TEXT NOT NULL UNIQUE`) — SHA-256 hex of random 32-byte session token
    - `expires_at` (`TIMESTAMPTZ NOT NULL`)
    - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `projects`:
    - `id` (`TEXT` PK, UUID)
    - `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`)
    - `name` (`TEXT NOT NULL`)
    - `revision` (`INTEGER NOT NULL DEFAULT 1`)
    - `placement_count` (`INTEGER NOT NULL DEFAULT 0`)
    - `r2_key` (`TEXT NOT NULL`) — e.g. `users/<userId>/projects/<projectId>.vxproj`
    - `size_bytes` (`INTEGER NOT NULL DEFAULT 0`)
    - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
    - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - Index on `projects (user_id, updated_at DESC)` for fast project list loading.
- **Cloudflare R2** (`env.PROJECTS_BUCKET: R2Bucket`):
  - Stores the raw `.vxproj` ZIP archive bytes produced by `packVxprojArchive()` (`application/zip`).
  - R2 object key: `users/${userId}/projects/${projectId}.vxproj`.
  - When a project is saved, the Worker writes the `.vxproj` bytes to R2 first, then upserts/updates the metadata row in Neon (`revision`, `placement_count`, `size_bytes`, `updated_at`).
  - When a project is deleted, the Worker deletes the Neon row (verifying ownership) and deletes the R2 object.

### AD-3: Routing, Guest Editor Access & Login Popup Flow
- **Routes**:
  - Editor lives at **`/editor`** (`apps/web/src/pages/editor.astro`).
  - **`/` redirects to `/editor`** (`302` in `apps/web/src/worker.ts` + meta/JS redirect in `apps/web/src/pages/index.astro` for `astro preview` / static fallback).
  - `/login` (`apps/web/src/pages/login.astro`) remains available as a standalone login/register route supporting `?redirect=/editor` (default `/editor`).
- **Guest Access + Login Popup on Save**:
  - **Non-logged-in users can use `/editor` freely** without being redirected away on page load.
  - On boot, `/editor` checks `GET /api/auth/me` non-blockingly (`user | null`).
  - If an unauthenticated user clicks **Save** (`Ctrl+S`), **Save to Cloud**, or **Projects**, the editor opens an **in-place Login / Create Account Popup modal** (`LoginModal`) instead of navigating away—preserving their current schematic/placements in memory.
  - Immediately after signing in or registering inside the popup (or returning via `/login?redirect=/editor`), the popup closes, session state updates to the signed-in user, and the pending action (e.g., opening the Save/Projects dialog or completing the save) resumes automatically.
- **Cookie**: `ese_session=<rawToken>; Path=/; HttpOnly; SameSite=Lax; Secure` (omitting `Secure` only on `http://localhost` / `127.0.0.1` local dev), 30-day TTL.

### AD-4: Project Lifecycle in the Editor
1. **New Project**: Creates a fresh empty `Project` (`createEmptyProject` / new UUID), clears active cloud `projectId` or prompts for a project name, resets the `EditorSession` & viewport, and marks dirty/unsaved until saved (or creates immediately in cloud if named).
2. **Save Project**:
   - Packs current `Project` into `.vxproj` (`Uint8Array`) via `packVxprojArchive`.
   - If the project has not been saved to cloud yet, creates a new record via `POST /api/projects` (with name + `.vxproj` body or multipart/octet-stream) and stores the returned `projectId`.
   - If already saved, uploads updated `.vxproj` via `PUT /api/projects/:id` with metadata headers/query (`name`, `revision`, `placementCount`).
   - Also mirrors to IndexedDB as a fast local cache.
3. **Open Project from List**:
   - Opens a **Projects Modal / Drawer** (replacing/upgrading the currently unwired `ProjectDialog.tsx`) showing all saved cloud projects for the logged-in user (`name`, `placement_count`, `size_bytes`, `updated_at`), sorted by most recently updated.
   - Selecting a project fetches `GET /api/projects/:id/archive` (`.vxproj` bytes), runs `unpackVxprojArchive()`, loads it into `EditorSession`, updates the active project header/title, and closes the modal.
   - Includes **New Project**, **Rename**, and **Delete** actions in the list.

---

## 5. PHASED IMPLEMENTATION SLICES (Prompt Pyramid)

Each slice below follows the `AGENTS.md` §2 Prompt Pyramid so it can be handed directly to an implementation subagent after plan approval.

---

### Slice 1 — Infrastructure, Cloudflare R2 + Neon DB Schema & Worker Router Foundation

1. **GOAL**: Provision the Neon database (`easyschemedit`) and Cloudflare R2 bucket (`easyschemedit-projects`), configure Worker bindings/secrets, and add a typed `/api/*` router + DB/R2 helpers in `apps/web`.
2. **CONSTRAINTS**:
   - Use `@neondatabase/serverless` (HTTP driver) only; no `pg` TCP driver.
   - Do not hardcode secrets or connection strings in `wrangler.toml` or git-tracked files; use `wrangler secret put` (and `.dev.vars` gitignored for local dev).
   - Non-goal: Auth endpoints or project endpoints (those are Slices 2 and 3).
3. **INPUTS**:
   - `apps/web/wrangler.toml`
   - `apps/web/src/worker.ts`
   - `apps/web/package.json`
   - `.gitignore`
4. **STEPS**:
   1. Provision Neon project `easyschemedit` (`aws-us-west-2`) and apply initial migration creating `users`, `sessions`, and `projects` tables + indexes.
   2. Provision R2 bucket `easyschemedit-projects` in Cloudflare.
   3. Update `apps/web/wrangler.toml` with `[[r2_buckets]]` (`binding = "PROJECTS_BUCKET"`, `bucket_name = "easyschemedit-projects"`).
   4. Add `@neondatabase/serverless` to `apps/web/package.json`.
   5. Create `apps/web/src/server/env.ts` (typed `Env` interface: `ASSETS`, `PROJECTS_BUCKET: R2Bucket`, `NEON_DATABASE_URL: string`, `SESSION_SECRET: string`), `apps/web/src/server/db.ts` (Neon HTTP query helper), and `apps/web/src/server/http.ts` (JSON response, error helpers, cookie parser).
   6. Update `apps/web/src/worker.ts` to dispatch `/api/*` to `handleApiRequest(request, env)` and fall back to `env.ASSETS` for static/SPA routes. Add `/api/health` returning `{ ok: true, db: true }` (pinging `SELECT 1`) and R2 bucket check.
   7. Ensure `.dev.vars` is in `.gitignore`.
5. **OUTPUT FORMAT & ACCEPTANCE CHECK**:
   - Files: `apps/web/wrangler.toml`, `apps/web/package.json`, `apps/web/src/worker.ts`, `apps/web/src/server/{env.ts,db.ts,http.ts}`, `docs/plans/cloud-persistence-auth/schema.sql`.
   - Acceptance: `pnpm --filter @easyschemedit/web exec tsc --noEmit` exits `0`; `pnpm --filter @easyschemedit/web build` exits `0`.
6. **Background**: `apps/web/src/worker.ts` currently only serves `env.ASSETS`. Adding the `/api/*` router establishes the backend boundary.

---

### Slice 2 — Username + Password Authentication Backend

1. **GOAL**: Implement register, login, logout, and current-user endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`) with PBKDF2-SHA256 password hashing and `HttpOnly` cookie sessions stored in Neon.
2. **CONSTRAINTS**:
   - Username rules: 3–32 chars, trimmed, `^[a-zA-Z0-9_-]+$`, case-insensitive uniqueness (`LOWER(username)`).
   - Password rules: minimum 8 characters, never logged or returned in API responses.
   - Constant-time hash comparison; cryptographically random 32-byte session tokens (`crypto.getRandomValues`), stored hashed (`SHA-256`) in `sessions`.
   - Non-goal: OAuth, email verification, or password reset.
3. **INPUTS**:
   - `apps/web/src/server/env.ts`
   - `apps/web/src/server/db.ts`
   - `apps/web/src/server/http.ts`
   - `apps/web/src/worker.ts`
4. **STEPS**:
   1. Create `apps/web/src/server/crypto.ts`: `hashPassword(password)` and `verifyPassword(password, stored)` using WebCrypto `PBKDF2` (`SHA-256`, 100,000 iterations, 16-byte random salt, constant-time compare), plus `generateSessionToken()` and `sha256Hex()`.
   2. Create `apps/web/src/server/auth.ts`:
      - `requireSession(request, env)` — reads `ese_session` cookie, hashes token, looks up non-expired session joined with `users`, returns `{ userId, username, sessionId }` or `null`.
      - `handleRegister`: validates username & password, checks uniqueness, inserts `users` row, creates `sessions` row, sets `Set-Cookie`, returns `201 { user: { id, username } }`.
      - `handleLogin`: looks up user by `LOWER(username)`, verifies password, creates `sessions` row, sets `Set-Cookie`, returns `200 { user: { id, username } }`.
      - `handleLogout`: deletes `sessions` row for current cookie, clears `ese_session` cookie (`Max-Age=0`), returns `200 { ok: true }`.
      - `handleMe`: returns `200 { user: { id, username } }` or `401 { error: 'Unauthorized' }`.
   3. Wire `/api/auth/*` routes into `apps/web/src/worker.ts`.
   4. Add unit tests `apps/web/__tests__/auth-crypto.test.ts` verifying password hash/verify roundtrip, wrong-password rejection, and token hashing.
5. **OUTPUT FORMAT & ACCEPTANCE CHECK**:
   - Files: `apps/web/src/server/crypto.ts`, `apps/web/src/server/auth.ts`, `apps/web/src/worker.ts`, `apps/web/__tests__/auth-crypto.test.ts`.
   - Acceptance: `node --experimental-strip-types apps/web/__tests__/auth-crypto.test.ts` exits `0`; `pnpm typecheck` exits `0`.
6. **Background**: Using WebCrypto `PBKDF2` avoids native Node binary issues and works identically in Cloudflare Workers and Node 24 tests.

---

### Slice 3 — Cloud Projects Backend (Neon Metadata + R2 `.vxproj` Storage)

1. **GOAL**: Implement authenticated CRUD + binary archive endpoints (`/api/projects`, `/api/projects/:id`, `/api/projects/:id/archive`) storing metadata in Neon and `.vxproj` archives in Cloudflare R2.
2. **CONSTRAINTS**:
   - Every endpoint requires a valid session (`requireSession`); unauthenticated requests return `401`.
   - Every single-project endpoint verifies `user_id = session.userId`; missing or unowned project returns `404`.
   - Enforce max upload body size (50 MB) and validate non-empty binary payload for `.vxproj` uploads.
   - Non-goal: Public sharing or multi-user permissions.
3. **INPUTS**:
   - `apps/web/src/server/auth.ts`
   - `apps/web/src/server/db.ts`
   - `apps/web/src/server/env.ts`
   - `apps/web/src/worker.ts`
4. **STEPS**:
   1. Create `apps/web/src/server/projects.ts`:
      - `GET /api/projects`: returns `{ projects: ProjectSummary[] }` ordered by `updated_at DESC` for `session.userId`.
      - `POST /api/projects`: creates a new project. Accepts either JSON `{ name }` (metadata-only / empty project, or followed by archive upload) OR binary `.vxproj` body with `X-Project-Name`, `X-Placement-Count`, `X-Revision` headers; writes `.vxproj` to R2 at `users/${userId}/projects/${id}.vxproj` when body is present, inserts Neon row, returns `201 { project }`.
      - `PUT /api/projects/:id/archive`: uploads `.vxproj` binary (`application/zip` / `application/octet-stream`) to R2, updates `name` (if `X-Project-Name` provided), `revision`, `placement_count`, `size_bytes`, and `updated_at = now()` in Neon, returns `200 { project }`.
      - `GET /api/projects/:id/archive`: verifies ownership in Neon, fetches object from `env.PROJECTS_BUCKET.get(r2Key)`, streams bytes back with `Content-Type: application/zip` and `Content-Disposition: attachment; filename="..."`.
      - `PATCH /api/projects/:id`: renames project (`{ name }`).
      - `DELETE /api/projects/:id`: deletes Neon row (`RETURNING r2_key`) and deletes object from `env.PROJECTS_BUCKET`.
   2. Wire `/api/projects` and `/api/projects/*` into `apps/web/src/worker.ts`.
   3. Add unit tests `apps/web/__tests__/projects-api.test.ts` using mocked `R2Bucket` and mocked DB query runner to verify ownership checks, 401/404 handling, R2 key scoping, and upload size limits.
5. **OUTPUT FORMAT & ACCEPTANCE CHECK**:
   - Files: `apps/web/src/server/projects.ts`, `apps/web/src/worker.ts`, `apps/web/__tests__/projects-api.test.ts`.
   - Acceptance: `node --experimental-strip-types apps/web/__tests__/projects-api.test.ts` exits `0`; `pnpm typecheck` exits `0`.
6. **Background**: Keeping `.vxproj` bytes in R2 and metadata in Neon keeps Postgres fast and under free-tier storage limits while supporting full schematic project files.

---

### Slice 4 — `/editor` Route, `/` → `/editor` Redirect, Login Popup & `/login` Page

1. **GOAL**: Move the editor to `/editor`, redirect `/` → `/editor`, allow guest users to use `/editor`, and show an in-editor **Login / Create Account popup** when an unauthenticated user attempts to save or open cloud projects (returning them straight back to `/editor` with their work intact), plus a standalone `/login` page.
2. **CONSTRAINTS**:
   - Match the existing dark editor aesthetic (`#14161b` / `#1c1f26`, crisp borders, clean sans/mono typography).
   - Never discard in-memory editor state or reload the page when logging in via the popup.
   - Provide clear inline validation and server error messages (e.g., "Username already taken", "Invalid username or password").
   - Non-goal: Marketing landing page at `/` (redirect `/` → `/editor` for now).
3. **INPUTS**:
   - `apps/web/src/pages/index.astro`
   - `apps/web/src/worker.ts`
   - `apps/web/src/editor/layout/Toolbar.tsx`
   - `apps/web/src/islands/EditorIsland.tsx`
4. **STEPS**:
   1. Move the editor page from `apps/web/src/pages/index.astro` to `apps/web/src/pages/editor.astro`.
   2. Update `apps/web/src/pages/index.astro` to immediately redirect `/` → `/editor` (and add a `302` redirect for `/` → `/editor` in `apps/web/src/worker.ts`, plus SPA fallback targeting `/editor/index.html` where appropriate).
   3. Create `apps/web/src/client/auth-client.ts`: typed fetch wrappers for `getMe()`, `login(username, password)`, `register(username, password)`, `logout()`.
   4. Create `apps/web/src/components/LoginView.tsx` (reusable form with **Sign In** / **Create Account** tabs, username + password + confirm password) and:
      - `apps/web/src/components/LoginModal.tsx`: in-editor popup modal wrapping `LoginView` so unauthenticated users can sign in without losing their canvas/placements, invoking `onSuccess(user)` to resume the pending save/open action.
      - `apps/web/src/pages/login.astro`: standalone `/login` page redirecting to `?redirect` (default `/editor`) after login/register (or immediately if already signed in).
   5. Update `apps/web/src/islands/EditorIsland.tsx` and `Toolbar.tsx`:
      - Check `getMe()` on boot without blocking guest editing.
      - Show `username` + **Sign Out** when signed in, or a subtle **Sign In** button when guest.
      - Gate cloud **Save** (`Ctrl+S`) / **Projects** actions behind auth: if `!user`, open `LoginModal` and automatically continue the pending action once authenticated.
5. **OUTPUT FORMAT & ACCEPTANCE CHECK**:
   - Files: `apps/web/src/pages/editor.astro`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/login.astro`, `apps/web/src/client/auth-client.ts`, `apps/web/src/components/LoginView.tsx`, `apps/web/src/components/LoginModal.tsx`, `apps/web/src/islands/EditorIsland.tsx`, `apps/web/src/editor/layout/Toolbar.tsx`, `apps/web/src/worker.ts`.
   - Acceptance: `pnpm --filter @easyschemedit/web exec tsc --noEmit` exits `0`; `pnpm --filter @easyschemedit/web build` exits `0` and emits `dist/editor/index.html` and `dist/login/index.html`.
6. **Background**: Keeping guests unblocked on `/editor` lowers friction while the in-place `LoginModal` preserves unsaved scene state across authentication.

---

### Slice 5 — Client Cloud Persistence & Saved Projects List UI (New / Save / Open)

1. **GOAL**: Connect the editor's **New Project**, **Save Project** (`Ctrl+S` + Save button), and **Open Project** (Saved Projects List modal) flows to Neon + R2 via `@easyschemedit/persistence` `.vxproj` packing/unpacking.
2. **CONSTRAINTS**:
   - Reuse `packVxprojArchive` and `unpackVxprojArchive` from `@easyschemedit/persistence`.
   - Unsaved changes indicator (`*`) in the toolbar/project title when `revision` advances past last cloud save.
   - Confirm before discarding unsaved changes when creating a New Project or opening another project.
   - Non-goal: Background auto-upload on every block edit (explicit Save + `Ctrl+S` + optional debounced local IndexedDB crash-recovery cache).
3. **INPUTS**:
   - `apps/web/src/editor/persistence/persistence-controller.ts`
   - `apps/web/src/editor/persistence/ProjectDialog.tsx`
   - `apps/web/src/editor/layout/Toolbar.tsx`
   - `apps/web/src/islands/EditorIsland.tsx`
4. **STEPS**:
   1. Create `apps/web/src/client/projects-client.ts`: typed fetch wrappers for `listCloudProjects()`, `createCloudProject(name, archiveBytes, meta)`, `saveCloudProjectArchive(id, archiveBytes, meta)`, `loadCloudProjectArchive(id)`, `renameCloudProject(id, name)`, `deleteCloudProject(id)`.
   2. Extend `apps/web/src/editor/persistence/persistence-controller.ts` with cloud methods (`saveToCloud`, `openFromCloud`, `createNewProject`, `listCloudProjects`, `deleteFromCloud`, `activeCloudProjectId`, `isDirty`).
   3. Update `apps/web/src/editor/persistence/ProjectDialog.tsx` to display the **Saved Projects List** from Neon (name, placements, size, last updated timestamp), **New Project** button, **Open** action, **Rename**, **Delete**, and **Save Current Project** (with name prompt if untitled), while keeping local `.vxproj` download/upload as secondary utilities.
   4. Wire `Projects` button, active project name + dirty dot, and `Save` (`Ctrl+S`) in `Toolbar.tsx` and `EditorIsland.tsx` so opening a project replaces the `EditorSession` document and re-renders the 3D viewport cleanly.
   5. Add tests `apps/web/__tests__/cloud-persistence-controller.test.ts` verifying pack → upload → download → unpack roundtrip with mocked fetch.
5. **OUTPUT FORMAT & ACCEPTANCE CHECK**:
   - Files: `apps/web/src/client/projects-client.ts`, `apps/web/src/editor/persistence/persistence-controller.ts`, `apps/web/src/editor/persistence/ProjectDialog.tsx`, `apps/web/src/editor/layout/Toolbar.tsx`, `apps/web/src/islands/EditorIsland.tsx`, `apps/web/__tests__/cloud-persistence-controller.test.ts`.
   - Acceptance: `pnpm typecheck` exits `0`; `pnpm test` exits `0`; `pnpm --filter @easyschemedit/web build` exits `0`.
6. **Background**: `ProjectDialog.tsx` already exists in the codebase from earlier slices and was decluttered from `EditorIsland.tsx`; upgrading and re-wiring it for cloud projects avoids dead code and ships a cohesive UX.

---

## 6. MCP ACCOUNT CONTROL SUMMARY (Ready Upon Approval)

Once you approve this plan, I can directly provision and configure your accounts using these MCP servers currently connected in this session:
- **`neon`** (already authenticated to `Anubhavs Org` / `org-spring-dew-36122149`):
  - `create_project` to create the `easyschemedit` PostgreSQL database
  - `run_sql` / `prepare_database_migration` + `complete_database_migration` to apply the `users`, `sessions`, and `projects` schema
  - `get_connection_string` to retrieve the pooled/HTTP `DATABASE_URL`
- **`cloudflare-api`** (already authenticated as `anubhavrai100@gmail.com`):
  - `execute` / `search` / `docs` to create the `easyschemedit-projects` R2 bucket, configure Pages/Workers bindings & secrets (`NEON_DATABASE_URL`, `SESSION_SECRET`), and verify deployments.
- **`cloudflare-docs`**:
  - `search_cloudflare_documentation` to verify exact R2 / Workers Static Assets / Pages Functions configuration syntax.
