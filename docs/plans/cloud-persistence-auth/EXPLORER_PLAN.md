# Left Sidebar Project Explorer & Independent Schematics Plan

Author: orchestrator · Date: 2026-11-14 · Extends: [PLAN.md](./PLAN.md)

## 1. GOAL
Replace flat project listing with a **3-level folder explorer** at the top of the left sidebar (`<username | guest>` → **Project folder** → **Schematic files**), where each schematic file is an independent editable 3D document stored in Neon + R2, with a **first-login "Create your first project" prompt** and **automatic guest-to-user migration** on sign-in.

## 2. CONSTRAINTS & NON-GOALS
- Preserve existing `PLAN.md` auth, R2 `.vxproj` archive format (`packVxprojArchive` / `unpackVxprojArchive`), and pure `packages/*` boundaries.
- Every Neon query and R2 key for `schematics` MUST be scoped to `user_id = session.userId`.
- Non-goals: nested sub-folders inside a project, multi-file drag-and-drop, or sharing individual schematics across users.

## 3. ARCHITECTURE DECISIONS
- **Database & R2 (`schematics` table)**:
  - `projects` row = a **Project folder** (`id`, `user_id`, `name`, `created_at`, `updated_at`).
  - `schematics` row = an **independent `.schem` / `.vxproj` document** inside a Project folder (`id`, `project_id`, `user_id`, `name`, `revision`, `placement_count`, `r2_key`, `size_bytes`, `created_at`, `updated_at`), with `.vxproj` bytes stored in R2 at `users/<userId>/projects/<projectId>/schematics/<schematicId>.vxproj`.
  - Deleting a Project folder deletes all its `schematics` rows (`ON DELETE CASCADE`) and cleans up all their R2 keys.
- **Left Sidebar Layout (`WorkspaceShell.tsx`)**:
  - Collapsible **Explorer** panel stacked vertically above `OutlinerPanel` inside the left dock (`hierarchy` panel).
  - Tree hierarchy:
    - Root: `📁 <username>` (or `📁 guest` when unauthenticated) + `+ Project` button
      - Project folder: `📁 <projectName>` + `+ Schem`, `Rename`, `Delete`
        - Schematic file: `📄 <schemName>` (active highlighted, `*` if dirty, `Rename`, `Delete`)
- **Guest Mode + Automatic Migration**:
  - Unauthenticated users start under `📁 guest` with an in-memory default project folder (or can create folders/schematics locally in memory).
  - Clicking **Save** (`Ctrl+S`) or **+ Project** while signed out? Guests can create local folders/files under `guest` freely; clicking **Save** opens `LoginModal`.
  - Upon login/register, any local `guest` project folders & their schematics (including the active unsaved scene) are automatically created under `<username>` in Neon + R2 so the user can save immediately without losing work.
- **First-Login Prompt (0 projects)**:
  - When a user signs in (either on boot, via `/login`, or via `LoginModal` with no guest work) and has **0 projects**, show a clean **Create Your First Project** prompt (`FirstProjectModal`), then auto-create a default schematic (e.g., `main.schem`) inside it (or let them name/import).

---

## 4. SLICES (Prompt Pyramid)

### Slice E-1 — Schematics Backend & Client API
1. **GOAL**: Add `schematics` CRUD + `.vxproj` R2 archive endpoints (`/api/projects/:projectId/schematics`, `/api/schematics/:id`, `/api/schematics/:id/archive`) and client wrappers in `projects-client.ts`.
2. **CONSTRAINTS**: Enforce `requireSession` + `user_id = session.userId`; cascade R2 cleanup on project delete; 50 MB max upload.
3. **INPUTS**: `apps/web/src/server/projects.ts`, `apps/web/src/worker.ts`, `apps/web/src/client/projects-client.ts`, `docs/plans/cloud-persistence-auth/schema.sql`.
4. **STEPS**:
   - Extend `projects.ts` with `handleListWorkspaceTree` (returns projects + their schematics in one call), `handleCreateSchematic`, `handleGetSchematicArchive`, `handleSaveSchematicArchive`, `handleRenameSchematic`, `handleDeleteSchematic`, and update `handleDeleteProject` to delete all R2 objects for that project's schematics.
   - Wire routes into `apps/web/src/worker.ts`.
   - Extend `apps/web/src/client/projects-client.ts` with typed schematic & workspace tree functions.
   - Update `apps/web/__tests__/projects-api.test.ts` and `slice-cloud-router.test.ts`.
5. **OUTPUT & ACCEPTANCE**: `pnpm typecheck` and `pnpm test` pass with 0 failures.

### Slice E-2 — Left Sidebar Explorer, First-Login Prompt & Guest Migration
1. **GOAL**: Build `ProjectExplorer.tsx` (collapsible tree at the top of the left dock), `FirstProjectModal.tsx`, guest-to-user migration on login, and wire schematic switching/saving into `EditorIsland.tsx` and `WorkspaceShell.tsx`.
2. **CONSTRAINTS**: Keep `OutlinerPanel` below `ProjectExplorer` inside the left dock; warn/confirm or auto-save before switching active schematic when dirty; never lose guest edits on login.
3. **INPUTS**: `apps/web/src/editor/layout/WorkspaceShell.tsx`, `apps/web/src/islands/EditorIsland.tsx`, `apps/web/src/editor/persistence/persistence-controller.ts`, `apps/web/src/client/projects-client.ts`.
4. **STEPS**:
   - Create `apps/web/src/editor/persistence/ProjectExplorer.tsx` (3-level tree: `<username | guest>` -> Project folders -> Schematic files, inline create/rename/delete).
   - Create `apps/web/src/components/FirstProjectModal.tsx` (shown when signed-in user has 0 projects, creates first project + initial `main.schem` or lets user import).
   - Update `persistence-controller.ts` for active `(projectId, schematicId)` tracking + `.vxproj` load/save per schematic.
   - Update `WorkspaceShell.tsx` to render `ProjectExplorer` above `OutlinerPanel` in the left dock.
   - Update `EditorIsland.tsx` to manage guest workspace tree state, migrate guest projects/schematics on login (`LoginModal` or boot), trigger `FirstProjectModal` when cloud project list is empty, and switch/save schematics cleanly.
5. **OUTPUT & ACCEPTANCE**: `pnpm typecheck`, `pnpm test`, and `pnpm --filter @easyschemedit/web build` all exit `0`.
