# Subspec C — Slice c-5: Migration (Versioned Schema Upgrades)

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.5 (Migration), §2.3.7 (Migration)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/persistence` only.

## Goal

Implement schema version migration system: version tracking, migration functions, auto-migrate on open, backup before migration.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/migration.ts` | create | `MigrationFn`, `MigrationStep`, `SchemaVersion`, `MigrationManager` types + functions |

## Types / APIs

```ts
export type SchemaVersion = number;

export interface MigrationStep {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrate: (data: unknown) => Promise<unknown>;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  backupId?: string;
  error?: string;
}

export class MigrationManager {
  constructor(currentVersion: SchemaVersion);
  registerStep(step: MigrationStep): void;
  migrate(data: unknown, fromVersion: SchemaVersion): Promise<MigrationResult>;
  canMigrate(fromVersion: SchemaVersion): boolean;
}
```

## Acceptance criteria

1. MigrationManager tracks current schema version
2. registerStep() adds migration path between versions
3. migrate() chains multiple steps if needed (e.g. v1→v2→v3)
4. Backup created before migration (returns backupId)
5. Failed migration: no data loss, original data preserved
6. canMigrate() returns false if no migration path exists

## Tests

No test file yet — verification via typecheck. Test file `slice-c-5-migration.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
