// packages/persistence/src/migration.ts
// Migration system for versioned schema upgrades (SUBSPEC-C §4.5, §2.3.7).
// Version tracking, chained migration steps, backup before migration.

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

export interface MigrationOptions {
  currentVersion: SchemaVersion;
  createBackup: (data: unknown) => Promise<string>;
}

export class MigrationManager {
  private readonly currentVersion: SchemaVersion;
  private readonly steps: Map<string, MigrationStep> = new Map();
  private readonly createBackup: (data: unknown) => Promise<string>;

  constructor(options: MigrationOptions) {
    this.currentVersion = options.currentVersion;
    this.createBackup = options.createBackup;
  }

  // Register a migration step from one version to the next.
  registerStep(step: MigrationStep): void {
    const key = `${step.fromVersion}->${step.toVersion}`;
    this.steps.set(key, step);
  }

  // Migrate data from fromVersion to currentVersion.
  // Chains multiple steps if needed (e.g. v1→v2→v3).
  // Creates backup before migration.
  async migrate(data: unknown, fromVersion: SchemaVersion): Promise<MigrationResult> {
    if (fromVersion === this.currentVersion) {
      return {
        success: true,
        fromVersion,
        toVersion: this.currentVersion,
      };
    }

    if (fromVersion > this.currentVersion) {
      return {
        success: false,
        fromVersion,
        toVersion: this.currentVersion,
        error: `Cannot migrate from version ${fromVersion} to older version ${this.currentVersion}`,
      };
    }

    // Create backup before migration
    let backupId: string | undefined;
    try {
      backupId = await this.createBackup(data);
    } catch (err) {
      return {
        success: false,
        fromVersion,
        toVersion: this.currentVersion,
        error: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Chain migration steps
    let currentData = data;
    let currentVer = fromVersion;

    while (currentVer < this.currentVersion) {
      const nextVer = currentVer + 1;
      const key = `${currentVer}->${nextVer}`;
      const step = this.steps.get(key);

      if (!step) {
        return {
          success: false,
          fromVersion,
          toVersion: this.currentVersion,
          error: `No migration step registered for ${currentVer}->${nextVer}`,
        };
      }

      try {
        currentData = await step.migrate(currentData);
      } catch (err) {
        return {
          success: false,
          fromVersion,
          toVersion: this.currentVersion,
          backupId,
          error: `Migration ${currentVer}->${nextVer} failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      currentVer = nextVer;
    }

    return {
      success: true,
      fromVersion,
      toVersion: this.currentVersion,
      backupId,
    };
  }

  // Check if a migration path exists from fromVersion to currentVersion.
  canMigrate(fromVersion: SchemaVersion): boolean {
    if (fromVersion === this.currentVersion) {
      return true;
    }
    if (fromVersion > this.currentVersion) {
      return false;
    }

    let ver = fromVersion;
    while (ver < this.currentVersion) {
      const key = `${ver}->${ver + 1}`;
      if (!this.steps.has(key)) {
        return false;
      }
      ver++;
    }
    return true;
  }

  getCurrentVersion(): SchemaVersion {
    return this.currentVersion;
  }
}
