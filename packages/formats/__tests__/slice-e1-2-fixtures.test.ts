// packages/formats/__tests__/slice-e1-2-fixtures.test.ts
// Slice E1.2: Real-fixture format integration test.
//
// Rule from AGENTS.md §3 and docs/goal/GOAL.md:
// "Never generate synthetic fixtures and label them real.
//  Tests that need missing fixtures are marked BLOCKED (awaiting fixture), never green."

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSchematic, exportSchematic, NbtSafetyError } from '../index.ts';

let passed = 0;
let failures = 0;

function check(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('PASS:', msg);
    passed++;
  }
}

async function run(): Promise<void> {
  console.log('--- TEST SUITE: slice E1.2 Real Fixtures ---');

  const fixturesDir = resolve(fileURLToPath(new URL('../../../fixtures/real', import.meta.url)));
  console.log(`Checking real fixtures directory: ${fixturesDir}`);

  if (!existsSync(fixturesDir)) {
    console.warn(`fixtures/real directory not found at ${fixturesDir}`);
  }

  const entries = existsSync(fixturesDir) ? readdirSync(fixturesDir) : [];
  const realFiles = entries.filter((f) => {
    if (f.startsWith('.')) return false;
    if (f === 'README.md' || f.endsWith('.md')) return false;
    const ext = extname(f).toLowerCase();
    return ext === '.schem' || ext === '.litematic' || ext === '.schematic' || ext === '.nbt';
  });

  const categories = [
    { id: 'sponge-v3', ext: '.schem', desc: 'Sponge Schematic v3 (.schem)' },
    { id: 'litematic-multi-region', ext: '.litematic', desc: 'Multi-region Litematica (.litematic)' },
    { id: 'schematic-legacy', ext: '.schematic', desc: 'Legacy MCEdit / WorldEdit (.schematic)' },
    { id: 'vanilla-structure', ext: '.nbt', desc: 'Vanilla Minecraft Structure Template (.nbt)' },
  ] as const;

  console.log(`Discovered ${realFiles.length} real fixture file(s) in fixtures/real/: ${realFiles.length > 0 ? realFiles.join(', ') : 'none'}\n`);

  let blockedCount = 0;
  for (const cat of categories) {
    const matching = realFiles.filter((f) => f.toLowerCase().endsWith(cat.ext));
    if (matching.length === 0) {
      console.log(`BLOCKED (awaiting fixture): ${cat.desc} in fixtures/real/ — see fixtures/real/README.md`);
      blockedCount++;
    } else {
      console.log(`Found ${matching.length} file(s) for category [${cat.id}]: ${matching.join(', ')}`);
    }
  }

  if (realFiles.length > 0) {
    console.log('\n--- Executing Tests on Present Real Fixtures ---');
    for (const fileName of realFiles) {
      const filePath = join(fixturesDir, fileName);
      console.log(`\nTesting fixture: ${fileName}`);
      const bytes = new Uint8Array(readFileSync(filePath));
      const ext = extname(fileName).toLowerCase();

      if (ext === '.schematic') {
        // Legacy .schematic must be rejected with UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC
        try {
          await importSchematic(bytes, fileName);
          check(false, `${fileName} was expected to reject as legacy .schematic, but imported without error`);
        } catch (err: any) {
          const isExpected = err instanceof NbtSafetyError && err.code === 'UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC';
          check(isExpected, `${fileName} rejected with UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC (actual: ${err?.code || err?.message})`);
        }
      } else {
        // Modern schematic: .schem, .litematic, .nbt
        try {
          const imported = await importSchematic(bytes, fileName);
          check(imported.placements.length > 0, `${fileName} imported with ${imported.placements.length} placement(s)`);
          check(imported.report.nonAirBlockCount >= 0, `${fileName} reported nonAirBlockCount: ${imported.report.nonAirBlockCount}`);

          for (const p of imported.placements) {
            const b = p.volume.bounds;
            const w = b.maxExclusive[0] - b.min[0];
            const h = b.maxExclusive[1] - b.min[1];
            const l = b.maxExclusive[2] - b.min[2];
            check(w > 0 && h > 0 && l > 0, `${fileName} placement '${p.name}' has non-zero volume: ${w}x${h}x${l}`);
          }

          // Round-trip test: export and re-import to verify semantic equality
          const exportTargetFormat = imported.report.format.kind === 'litematic' ? 'litematic' : 'schem-v3';
          const snapshot = {
            schemaVersion: 1,
            id: `proj_${fileName}`,
            name: `export_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
            placements: imported.placements,
            importGroups: imported.importGroups,
            overlapPolicy: 'top-wins' as const,
            revision: 1,
          };

          const exported = await exportSchematic(exportTargetFormat, snapshot, { trimOuterAir: false });
          check(exported.bytes.length > 0, `${fileName} re-exported to ${exportTargetFormat} (${exported.bytes.length} bytes)`);

          const reimported = await importSchematic(exported.bytes, exported.filename);
          check(
            reimported.report.nonAirBlockCount === imported.report.nonAirBlockCount,
            `${fileName} roundtrip nonAirBlockCount preserved: ${reimported.report.nonAirBlockCount} === ${imported.report.nonAirBlockCount}`,
          );
        } catch (err: any) {
          check(false, `${fileName} failed import or round-trip: ${err?.message || err}`);
        }
      }
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Results: ${passed} passed, ${failures} failed, ${blockedCount} category/categories BLOCKED (awaiting fixture)`);

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error running slice-e1-2-fixtures test:', err);
  process.exit(1);
});
