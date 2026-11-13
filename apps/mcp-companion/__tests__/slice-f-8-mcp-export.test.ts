// apps/mcp-companion/__tests__/slice-f-8-mcp-export.test.ts
// Slice f-8 tests: export through MCP into an approved workspace (SUBSPEC-F §4.2, §7).
// Run: node --experimental-strip-types __tests__/slice-f-8-mcp-export.test.ts
// Pure TypeScript, no test framework — same assert harness as slices c/d/e/f-7.

import {
  createMcpExporter,
  isContained,
  normalizePathSegments,
  type ExportServices,
  type McpExporterOptions,
} from '../src/mcp-export.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Filesystem double ──────────────────────────────────────────────────────

type FsEvents = {
  writes: string[];
  renames: Array<{ from: string; to: string }>;
  removes: string[];
  canonicalizeCalls: string[];
};

function makeFs(opts?: {
  symlinks?: Record<string, string>;
  existing?: string[];
  failVerify?: boolean;
}) {
  const symlinks = opts?.symlinks ?? {};
  const existing = new Set(opts?.existing ?? []);
  const files = new Map<string, string>();
  const events: FsEvents = { writes: [], renames: [], removes: [], canonicalizeCalls: [] };

  const services: ExportServices = {
    realpath(path: string): string {
      // Follow a symlink for the path itself, then any symlinked ancestors.
      if (symlinks[path]) return symlinks[path];
      const idx = path.lastIndexOf('/');
      if (idx > 0) {
        const parent = path.slice(0, idx);
        const name = path.slice(idx + 1);
        const realParent = symlinks[parent] ?? parent;
        return `${realParent}/${name}`;
      }
      return path;
    },
    ensureDir(path: string): string {
      return path;
    },
    exists(path: string): boolean {
      return existing.has(path) || files.has(path);
    },
    readFile(path: string): ArrayBuffer {
      const content = files.get(path) ?? '';
      return new TextEncoder().encode(content).buffer as ArrayBuffer;
    },
    readTemp(path: string): ArrayBuffer {
      const content = files.get(path) ?? '';
      return new TextEncoder().encode(content).buffer as ArrayBuffer;
    },
    writeTemp(targetPath: string, data: ArrayBuffer): string {
      const temp = `${targetPath}.tmp`;
      events.writes.push(temp);
      // Deliberately record the payload with a marker so a verify mismatch can be simulated.
      const text = new TextDecoder().decode(data);
      files.set(temp, opts?.failVerify ? `${text}-CORRUPTED` : text);
      return temp;
    },
    rename(tempPath: string, targetPath: string): void {
      events.renames.push({ from: tempPath, to: targetPath });
      const content = files.get(tempPath);
      if (content !== undefined) files.set(targetPath, content);
      files.delete(tempPath);
      existing.add(targetPath);
    },
    remove(path: string): void {
      events.removes.push(path);
      files.delete(path);
    },
    sha256(data: ArrayBuffer): string {
      const text = new TextDecoder().decode(data);
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return `fnv1a:${h.toString(16).padStart(8, '0')}`;
    },
    canonicalizeAfterWrite(path: string): string {
      events.canonicalizeCalls.push(path);
      return path;
    },
    maxExportBytes: 1024,
  };

  return { services, events, files, existing };
}

function makeExporter(
  fs: ReturnType<typeof makeFs>,
  overrides?: Partial<McpExporterOptions>,
) {
  return createMcpExporter({
    services: fs.services,
    approvedDirectories: ['/approved'],
    projectRestrictions: {},
    generateArtifactHandle: (() => {
      let n = 0;
      return () => `artifact-${++n}`;
    })(),
    ...overrides,
  });
}

const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

console.log('--- Slice f-8: containment helper (F-8.1) ---');

{
  // Segment-wise containment: a sibling sharing the prefix is NOT inside.
  assert(isContained('/approved', '/approved/a/b') === true, 'f-8.1: nested path is contained');
  assert(isContained('/approved', '/approved') === true, 'f-8.1: root itself is contained');
  assert(isContained('/approved', '/approved-evil') === false, 'f-8.1: prefix-sharing sibling is NOT contained');
  assert(isContained('/approved', '/approved-evil/a') === false, 'f-8.1: sibling descendant is NOT contained');
  assert(isContained('/approved', '/other') === false, 'f-8.1: unrelated path is NOT contained');
  assert(isContained('/approved', '/approve') === false, 'f-8.1: shorter-prefix sibling is NOT contained');

  // Normalization removes '.' and resolves '..' segment-wise.
  assertEqual(normalizePathSegments('a/./b'), 'a/b', 'f-8: "." segments are dropped');
  assertEqual(normalizePathSegments('a/b/../c'), 'a/c', 'f-8: ".." resolves segment-wise');
  assertEqual(normalizePathSegments('./a//b/'), 'a/b', 'f-8: leading "./", doubled and trailing separators normalize');
  assertEqual(normalizePathSegments('..'), '..', 'f-8: a leading ".." survives normalization');
  assertEqual(normalizePathSegments('a/../..'), '..', 'f-8: escaping ".." survives normalization');
}

console.log('--- Slice f-8: approved workspace (F3 default) ---');

{
  const fs = makeFs();
  const ex = makeExporter(fs, { approvedDirectories: [] });
  const r = ex.exportSchematic({
    projectId: 'p1',
    relativePath: 'out.litematic',
    format: '.litematic',
    data: bytes('x'),
  });
  assertEqual(r.ok, false, 'f-8.1: export refused with no approved directory');
  assert(r.ok === false && r.error.code === 'NO_APPROVED_WORKSPACE', 'f-8.1: code is NO_APPROVED_WORKSPACE');
  assertEqual(fs.events.writes.length, 0, 'f-8.1: nothing is written when no root is approved');

  // Per-project restriction raises PROJECT_NOT_APPROVED.
  const fs2 = makeFs();
  const ex2 = makeExporter(fs2, { projectRestrictions: { p1: ['/somewhere-else'] } });
  const r2 = ex2.exportSchematic({
    projectId: 'p1',
    relativePath: 'out.litematic',
    format: '.litematic',
    data: bytes('x'),
  });
  assertEqual(r2.ok, false, 'f-8.1: project restriction blocks the global root');
  assert(r2.ok === false && r2.error.code === 'PROJECT_NOT_APPROVED', 'f-8.1: code is PROJECT_NOT_APPROVED');

  // A project with no restriction entry falls back to the global list.
  const r3 = ex2.exportSchematic({
    projectId: 'p2',
    relativePath: 'ok.litematic',
    format: '.litematic',
    data: bytes('x'),
  });
  assertEqual(r3.ok, true, 'f-8.1: unrestricted project uses the global approved list');
}

console.log('--- Slice f-8: path rejection ---');

{
  const fs = makeFs();
  const ex = makeExporter(fs);

  const abs = ex.exportSchematic({
    projectId: 'p1', relativePath: '/etc/passwd', format: '.vxproj', data: bytes('x'),
  });
  assert(abs.ok === false && abs.error.code === 'PATH_NOT_RELATIVE', 'f-8.3: absolute path is refused');

  const winAbs = ex.exportSchematic({
    projectId: 'p1', relativePath: 'C:/Windows/system32/x.vxproj', format: '.vxproj', data: bytes('x'),
  });
  assert(winAbs.ok === false && winAbs.error.code === 'PATH_NOT_RELATIVE', 'f-8.3: drive-qualified path is refused');

  const empty = ex.exportSchematic({
    projectId: 'p1', relativePath: '', format: '.vxproj', data: bytes('x'),
  });
  assert(empty.ok === false && empty.error.code === 'PATH_EMPTY', 'f-8.3: empty path is refused');

  for (const bad of ['../escape.vxproj', 'a/../../escape.vxproj', 'a/b/../../../escape.vxproj']) {
    const r = ex.exportSchematic({
      projectId: 'p1', relativePath: bad, format: '.vxproj', data: bytes('x'),
    });
    assert(r.ok === false && r.error.code === 'PATH_TRAVERSAL', `f-8.3: "${bad}" is refused as PATH_TRAVERSAL`);
  }
  assertEqual(fs.events.writes.length, 0, 'f-8.3: rejected paths never reach a write');
}

console.log('--- Slice f-8: symlink escape (F-8.2 / CWE-59) ---');

{
  const fs = makeFs({
    symlinks: { '/approved/link': '/outside/secret' },
    existing: ['/outside/secret'],
  });
  const ex = makeExporter(fs);
  const r = ex.exportSchematic({
    projectId: 'p1', relativePath: 'link/evil.litematic', format: '.litematic', data: bytes('x'),
  });
  assertEqual(r.ok, false, 'f-8.2: symlink escape is refused');
  assert(r.ok === false && r.error.code === 'PATH_SYMLINK_ESCAPE', 'f-8.2: code is PATH_SYMLINK_ESCAPE');
  assertEqual(fs.events.writes.length, 0, 'f-8.2: symlink escape writes nothing');

  // A symlink that stays inside the root is allowed.
  const fsIn = makeFs({ symlinks: { '/approved/link': '/approved/real' } });
  const exIn = makeExporter(fsIn);
  const ok = exIn.exportSchematic({
    projectId: 'p1', relativePath: 'link/inside.litematic', format: '.litematic', data: bytes('x'),
  });
  assertEqual(ok.ok, true, 'f-8.2: an in-root symlink is allowed');
}

console.log('--- Slice f-8: atomic write path (F-8.4) ---');

{
  const fs = makeFs();
  const ex = makeExporter(fs);
  const r = ex.exportSchematic({
    projectId: 'p1', relativePath: 'nested/deep/out.vxproj', format: '.vxproj', data: bytes('payload'),
  });

  assertEqual(r.ok, true, 'f-8.4: valid export succeeds');
  assertEqual(fs.events.writes.length, 1, 'f-8.4: exactly one temp write');
  assertEqual(fs.events.writes[0], '/approved/nested/deep/out.vxproj.tmp', 'f-8.4: temp is a sibling of the target');
  assertEqual(fs.events.renames.length, 1, 'f-8.4: exactly one rename');
  assertEqual(fs.events.renames[0].to, '/approved/nested/deep/out.vxproj', 'f-8.4: rename targets the final path');
  assertEqual(fs.events.canonicalizeCalls.length, 1, 'f-8.4: host post-write canonicalization is invoked (D-4)');

  if (r.ok) {
    assertEqual(r.artifact.relativePath, 'nested/deep/out.vxproj', 'f-8.4: artifact path is root-relative POSIX');
    assertEqual(r.artifact.approvedRoot, '/approved', 'f-8.4: artifact records its approved root');
    assertEqual(r.artifact.bytes, 7, 'f-8.4: artifact records the byte count');
    assert(r.artifact.checksum.startsWith('fnv1a:'), 'f-8.4: artifact carries a checksum');
    assertEqual(r.artifact.artifactHandle, 'artifact-1', 'f-8.5: artifact is returned as a handle, not a blob');
    assertEqual('data' in r.artifact, false, 'f-8.5: the payload is never inlined in the result');
    assertEqual(r.artifact.validation.passed, true, 'f-8.4: validation passes for a verified write');
  }
}

console.log('--- Slice f-8: overwrite protection and verify failure ---');

{
  const fs = makeFs({ existing: ['/approved/existing.vxproj'] });
  const ex = makeExporter(fs);
  const r = ex.exportSchematic({
    projectId: 'p1', relativePath: 'existing.vxproj', format: '.vxproj', data: bytes('x'),
  });
  assertEqual(r.ok, false, 'f-8.4: existing target is refused by default');
  assert(r.ok === false && r.error.code === 'OVERWRITE_REFUSED', 'f-8.4: code is OVERWRITE_REFUSED');
  assertEqual(fs.events.writes.length, 0, 'f-8.4: refused overwrite leaves no temp file');

  const forced = ex.exportSchematic({
    projectId: 'p1', relativePath: 'existing.vxproj', format: '.vxproj', data: bytes('x'),
    allowOverwrite: true,
  });
  assertEqual(forced.ok, true, 'f-8.4: explicit confirmation allows overwrite');

  // Verification failure: temp is removed, target untouched, no rename.
  const fsBad = makeFs({ failVerify: true });
  const exBad = makeExporter(fsBad);
  const bad = exBad.exportSchematic({
    projectId: 'p1', relativePath: 'verify.vxproj', format: '.vxproj', data: bytes('payload'),
  });
  assertEqual(bad.ok, false, 'f-8.4: checksum mismatch is refused');
  assert(bad.ok === false && bad.error.code === 'VERIFY_FAILED', 'f-8.4: code is VERIFY_FAILED');
  assertEqual(fsBad.events.renames.length, 0, 'f-8.4: a failed verify never renames');
  assertEqual(fsBad.events.removes.length, 1, 'f-8.4: a failed verify removes the temp file');
  assertEqual(fsBad.events.removes[0], '/approved/verify.vxproj.tmp', 'f-8.4: the removed file is the temp');
}

console.log('--- Slice f-8: size bound (§7) ---');

{
  const fs = makeFs();
  const ex = makeExporter(fs);
  const big = ex.exportSchematic({
    projectId: 'p1', relativePath: 'big.vxproj', format: '.vxproj', data: bytes('x'.repeat(2048)),
  });
  assertEqual(big.ok, false, 'f-8.5: payload above the bound is refused');
  assert(big.ok === false && big.error.code === 'EXPORT_TOO_LARGE', 'f-8.5: code is EXPORT_TOO_LARGE');
  assert(
    big.ok === false && typeof big.error.suggestedAction === 'string' && big.error.suggestedAction.length > 0,
    'f-8.5: oversized export carries a suggested action rather than a silent drop',
  );
  assertEqual(fs.events.writes.length, 0, 'f-8.5: refused export writes nothing');
}

console.log('--- Slice f-8: artifact listing ---');

{
  const fs = makeFs();
  const ex = makeExporter(fs);
  ex.exportSchematic({ projectId: 'p1', relativePath: 'a.vxproj', format: '.vxproj', data: bytes('a') });
  ex.exportSchematic({ projectId: 'p2', relativePath: 'b.vxproj', format: '.vxproj', data: bytes('b') });
  ex.exportSchematic({ projectId: 'p1', relativePath: 'c.vxproj', format: '.vxproj', data: bytes('c') });

  assertEqual(ex.listArtifacts().length, 3, 'f-8.5: all artifacts are listed');
  assertEqual(ex.listArtifacts('p1').length, 2, 'f-8.5: artifacts are scoped by projectId');
  assertEqual(ex.listArtifacts('p2')[0].relativePath, 'b.vxproj', 'f-8.5: listing keeps the relative path');
  assertEqual(ex.listArtifacts('nope').length, 0, 'f-8.5: unknown project lists nothing');
}

console.log('\n=== Slice f-8 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
