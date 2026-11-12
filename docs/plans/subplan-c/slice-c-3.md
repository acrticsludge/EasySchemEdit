# Subspec C — Slice c-3: Autosave with Race Resolution

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.3 (Autosave), §2.3.5 (Autosave revised)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/persistence` only.

## Goal

Implement autosave with debounce (1500ms), command-count threshold (10), max interval (10s), race-safe save with `saveInProgress` flag, and `newerEditArrived` handling.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/autosave.ts` | modify | Add debounce timer, command counting, `saveInProgress` flag, `newerEditArrived` handling, integrate with commitProject |

## Types / APIs

```ts
export interface AutosaveConfig {
  debounceMs: number;          // 1500
  commandThreshold: number;     // 10
  maxIntervalMs: number;        // 10000
  flushOnVisibilityChange: boolean;
  flushOnBeforeUnload: boolean;
}

export interface AutosaveState {
  config: AutosaveConfig;
  lastCommandAt: number;       // epoch ms
  commandsSinceSave: number;
  lastSaveAt: number;          // epoch ms
  state: 'saved' | 'saving' | 'unsaved' | 'save-failed';
  pendingSave: boolean;
}

export async function scheduleAutosave(projectId: string, archive: ProjectArchive): Promise<void>
export async function recordCommand(projectId: string): Promise<void>
export async function flushAutosave(projectId: string): Promise<void>
```

## Race resolution

- `saveInProgress` flag prevents concurrent saves
- If a new edit arrives during save (`newerEditArrived = true`), the save completes with save-start state, then a new save is scheduled immediately
- Save captures a snapshot at save-start time; if revision changed during save, the save is marked stale and retried

## Acceptance criteria

1. Autosave debounces 1500ms after last command
2. Autosave triggers after every 10 committed commands
3. Max interval 10s between saves
4. `saveInProgress` prevents concurrent saves
5. `newerEditArrived` triggers immediate save after current save completes
6. Revision mismatch during save triggers retry

## Tests

No test file yet — verification via typecheck. Test file `slice-c-3-autosave.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
