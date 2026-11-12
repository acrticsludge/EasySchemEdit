# Subspec C — Slice c-2: Project Lifecycle

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §2.1 (Project lifecycle), §3.1 (Project lifecycle flow)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/persistence` (idb-store, commit-protocol) only.

## Goal

Implement project lifecycle operations: create, open, duplicate, rename, delete projects in IndexedDB with revision tracking.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/project-store.ts` | modify | Add `saveProject`, `getProject`, `deleteProject`, `listProjects` functions using `openDB`, `STORE_PROJECTS`, and `commitProject` |

## Types / APIs

```ts
export interface ProjectArchive {
  projectId: string;
  revision: number;
  projectJson: string;           // serialized Project JSON
  manifestJson: string;          // manifest with checksums
  savedAt: string;               // ISO timestamp
}

export async function saveProject(archive: ProjectArchive): Promise<void>
export async function getProject(projectId: string): Promise<ProjectArchive | null>
export async function deleteProject(projectId: string): Promise<void>
export async function listProjects(): Promise<string[]>
```

## Acceptance criteria

1. saveProject stores project archive with projectId as key
2. getProject retrieves project by projectId
3. deleteProject removes project and all associated data
4. listProjects returns all project IDs
5. Revision tracking: each save increments revision
6. Revision check: baseRevision must match current revision before commit

## Tests

No test file yet — verification via typecheck. Test file `slice-c-2-project-store.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
