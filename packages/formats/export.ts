// packages/formats/export.ts
// Public high-level schematic export API.

import type { ExportOptions, ExportResult, ExportTarget, ProjectSnapshot } from './adapter.ts';
import { ExportError } from './errors.ts';
import { SpongeV3Adapter } from './sponge-v3.ts';
import { LitematicAdapter } from './litematic.ts';

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  strict: false,
  confirmLossy: false,
  includeRegionMetadata: true,
  trimOuterAir: true,
  bakeTransforms: false,
  targetDataVersion: 3955, // Minecraft Java 1.21.11 default DataVersion
};

export type ExportSchematicOptions = Partial<ExportOptions> & {
  target?: ExportTarget;
};

export async function exportSchematic(
  targetFormat: 'schem-v3' | 'litematic',
  snapshot: ProjectSnapshot | any,
  opts?: ExportSchematicOptions,
): Promise<ExportResult> {
  const options: ExportOptions = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...opts,
  };

  let exportTarget: ExportTarget;
  if (opts?.target) {
    exportTarget = opts.target;
  } else if (snapshot.placements && snapshot.placements.length === 1) {
    exportTarget = { kind: 'placement', placementId: snapshot.placements[0].id };
  } else {
    exportTarget = { kind: 'composite', includeHidden: false };
  }

  if (targetFormat === 'schem-v3') {
    const adapter = new SpongeV3Adapter();
    return adapter.export(snapshot, exportTarget, options);
  } else if (targetFormat === 'litematic') {
    const adapter = new LitematicAdapter();
    return adapter.export(snapshot, exportTarget, options);
  } else {
    throw new ExportError(
      'UNSUPPORTED_EXPORT_FORMAT',
      `Unsupported export target format '${targetFormat}'`,
    );
  }
}
