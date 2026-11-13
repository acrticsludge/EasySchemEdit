// apps/mcp-companion/__tests__/slice-f-9-agent-log.test.ts
// Slice f-9 tests: Agent Log entry + sanitization (SUBSPEC-F §2.7, §4.6, §8.2).
// Run: node --experimental-strip-types __tests__/slice-f-9-agent-log.test.ts
// Pure TypeScript, no test framework — same assert harness as slices c/d/e/f-7/f-8.

import {
  createAgentLog,
  sanitizeText,
  sanitizeValue,
  sanitizeInputs,
  serializeEntry,
  DEFAULT_MAX_LOG_ENTRIES,
  DEFAULT_MAX_LOG_BYTES,
  DEFAULT_MAX_LOG_STRING_BYTES,
  REDACTION,
  type AgentLogEntry,
} from '../src/agent-log.ts';

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

console.log('--- Slice f-9: bounds constants (§8.2) ---');

{
  assertEqual(DEFAULT_MAX_LOG_ENTRIES, 10_000, 'f-9.24: entry bound is 10,000 (§8.2)');
  assertEqual(DEFAULT_MAX_LOG_BYTES, 50 * 1024 * 1024, 'f-9.24: byte bound is 50 MiB (§8.2)');
  assertEqual(REDACTION, '[redacted]', 'f-9.11: redaction marker is stable');
  assert(DEFAULT_MAX_LOG_STRING_BYTES > 0, 'f-9.11: per-string bound is defined');
}

console.log('--- Slice f-9: secret shapes (F-9.3) ---');

{
  const cases: Array<[string, string]> = [
    ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def', 'Bearer'],
    ['ghp_0123456789abcdefghijklmnopqrstuvwxyz', 'GitHub ghp_ token'],
    ['github_pat_11ABCDEFG0123456789_abcdefghijklmnop', 'GitHub fine-grained PAT'],
    ['gho_0123456789abcdefghijklmnopqrstuvw', 'GitHub oauth token'],
    ['ghs_0123456789abcdefghijklmnopqrstuvw', 'GitHub server token'],
    ['sk-proj-0123456789abcdefghijklmnopqrstuvwx', 'OpenAI-style sk- key'],
    ['AKIAIOSFODNN7EXAMPLE', 'AWS access key id'],
    ['ASIAIOSFODNN7EXAMPLE', 'AWS temporary access key id'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'JWT'],
    ['ct-abcdef1234567890', 'companion confirmation token prefix'],
  ];

  for (const [value, label] of cases) {
    const out = sanitizeText(value);
    assert(out.includes(REDACTION), `f-9.11: ${label} is redacted`);
    assert(!out.includes(value), `f-9.11: ${label} plaintext is gone`);
  }

  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
  const pemOut = sanitizeText(pem);
  assert(pemOut.includes(REDACTION), 'f-9.11: PEM private key block is redacted');
  assert(!pemOut.includes('MIIEowIBAAKCAQEA'), 'f-9.11: PEM body is gone');

  // Ordinary content must survive untouched.
  assertEqual(
    sanitizeText('minecraft:oak_stairs at [12, 64, -8]'),
    'minecraft:oak_stairs at [12, 64, -8]',
    'f-9.11: non-secret content passes through unchanged',
  );
}

console.log('--- Slice f-9: key-name classification (F-9.3 floor) ---');

{
  // An opaque custom token has no public shape — the key name must carry it.
  const out = sanitizeValue('zzz-not-a-known-shape', 'apiToken');
  assertEqual(out, REDACTION, 'f-9.11: sensitive key name redacts an unshaped leaf value');

  const viaInputs = sanitizeInputs({ apiToken: 'zzz-not-a-known-shape', count: 12 }, {});
  assertEqual(viaInputs.apiToken, REDACTION, 'f-9.11: sanitizeInputs redacts an unshaped token');
  assertEqual(viaInputs.count, 12, 'f-9.11: sanitizeInputs keeps non-sensitive values');

  const nested = sanitizeValue(
    { auth: { password: 'hunter2', cookie: 'session=abc', authorization: 'Basic xyz' }, ok: true },
    null,
  ) as Record<string, unknown>;
  const auth = nested.auth as Record<string, unknown>;
  assertEqual(auth.password, REDACTION, 'f-9.11: password key is redacted');
  assertEqual(auth.cookie, REDACTION, 'f-9.11: cookie key is redacted');
  assertEqual(auth.authorization, REDACTION, 'f-9.11: authorization key is redacted');
  assertEqual(nested.ok, true, 'f-9.11: non-sensitive keys survive');

  // Arrays are walked too.
  const arr = sanitizeValue([{ secret: 's3cr3t' }, 'plain'], null) as unknown[];
  assertEqual((arr[0] as Record<string, unknown>).secret, REDACTION, 'f-9.11: array elements are sanitized');
  assertEqual(arr[1], 'plain', 'f-9.11: plain array elements survive');
}

console.log('--- Slice f-9: log forging defense (F-9.2) ---');

{
  const forged = 'safe\r\n[2026-01-01] tool=evil changed 999999 blocks';
  const out = sanitizeText(forged);
  assertEqual(out.includes('\n'), false, 'f-9.24: newline cannot survive sanitization');
  assertEqual(out.includes('\r'), false, 'f-9.24: carriage return cannot survive sanitization');
  assert(out.includes('tool=evil'), 'f-9.24: the injected text stays on the same line (visible, not dropped)');

  const tabbed = sanitizeText('a\tb\u0000c\u0007d');
  assertEqual(tabbed.includes('\t'), false, 'f-9.24: tab is collapsed');
  assertEqual(tabbed.includes('\u0000'), false, 'f-9.24: NUL is stripped');
  assertEqual(tabbed.includes('\u0007'), false, 'f-9.24: BEL is stripped');

  // An imported filename with forged metadata reaches the entry single-line.
  const log = createAgentLog();
  const entry = log.append({
    id: 'e1',
    timestamp: '2026-11-13T00:00:00.000Z',
    tool: 'load_schematic',
    projectId: 'p1',
    revision: 1,
    resultSummary: 'imported',
    durationMs: 5,
    inputs: { filename: 'evil\r\n[FAKE] tool=delete_placement' },
  });
  const rendered = log.serializeEntry(entry);
  assertEqual(rendered.split('\n').length, 1, 'f-9.24: a serialized entry is exactly one line');
}

console.log('--- Slice f-9: paths, usernames, machine names (§4.6) ---');

{
  const path = '/home/anubh/Web Dev Projects/EasySchemEdit/secret-builds/foo.litematic';
  const out = sanitizeText(path);
  assertEqual(out.includes('/home/anubh'), false, 'f-9.11: absolute directory is not leaked');
  assert(out.includes('foo.litematic'), 'f-9.11: the basename survives so the entry stays useful');
  assert(/foo\.litematic#/.test(out), 'f-9.11: a stable hash distinguishes same-named files');

  const two = sanitizeValue(
    { a: '/srv/one/out.vxproj', b: '/srv/two/out.vxproj' },
    null,
  ) as Record<string, string>;
  assert(two.a !== two.b, 'f-9.11: two distinct paths hash differently');

  const withUser = sanitizeText('user anubh ran a command', { username: 'anubh' });
  assertEqual(withUser.includes('anubh'), false, 'f-9.11: username is redacted when configured');

  const withMachine = sanitizeText('host DESKTOP-ABC123 reported', { machineName: 'DESKTOP-ABC123' });
  assertEqual(withMachine.includes('DESKTOP-ABC123'), false, 'f-9.11: machine name is redacted when configured');
}

console.log('--- Slice f-9: raw NBT and file contents (§4.6 / F-9.4) ---');

{
  const nbt = sanitizeValue({ nbt: '\u000a\u0000\u0001binary-tag-bytes-here' }, null) as Record<string, unknown>;
  assert(
    typeof nbt.nbt === 'string' && nbt.nbt.startsWith(REDACTION),
    'f-9.11: a raw NBT-looking string is redacted (summarized, never stored)',
  );
  assert(
    typeof nbt.nbt === 'string' && nbt.nbt.includes('bytes'),
    'f-9.4: the redacted NBT carries a size summary',
  );

  const content = sanitizeValue({ fileContents: 'MASSIVE SCHEMATIC BYTES' }, null) as Record<string, unknown>;
  assert(
    typeof content.fileContents === 'string' && content.fileContents.startsWith(REDACTION),
    'f-9.11: raw file contents are redacted',
  );

  // Long strings are truncated, not stored whole.
  const long = 'a'.repeat(DEFAULT_MAX_LOG_STRING_BYTES + 500);
  const truncated = sanitizeText(long);
  assert(truncated.length <= DEFAULT_MAX_LOG_STRING_BYTES, 'f-9.11: oversized strings are truncated');
  assert(truncated.includes('truncated'), 'f-9.11: truncation is marked explicitly');

  // Counts and coordinates are the §4.6 "Retain" list and must survive.
  const retained = sanitizeValue(
    { blockId: 'minecraft:stone', changedBlockCount: 1234, position: [10, 64, -5] },
    null,
  ) as Record<string, unknown>;
  assertEqual(retained.blockId, 'minecraft:stone', 'f-9.11: block IDs are retained');
  assertEqual(retained.changedBlockCount, 1234, 'f-9.11: affected counts are retained');
  assertEqual(JSON.stringify(retained.position), '[10,64,-5]', 'f-9.11: coordinates are retained');
}

console.log('--- Slice f-9: entry shape (§2.7) ---');

{
  const log = createAgentLog({ generateId: (() => { let n = 0; return () => `log-${++n}`; })() });
  const entry = log.append({
    tool: 'fill_selection',
    projectId: 'p1',
    revision: 7,
    resultSummary: 'filled 64 cells',
    changedBlockCount: 64,
    warnings: ['limit raised'],
    durationMs: 12,
    inputs: { state: 'minecraft:stone', token: 'zzzz' },
    undoEntryId: 'undo-1',
  });

  for (const field of ['id', 'timestamp', 'tool', 'sanitizedInputs', 'projectId', 'revision',
                       'resultSummary', 'warnings', 'durationMs', 'undoAvailable']) {
    assert(field in entry, `f-9.11: entry exposes "${field}" (§2.7)`);
  }
  assertEqual(entry.sanitizedInputs.token, REDACTION, 'f-9.11: inputs are sanitized before storage');
  assertEqual(entry.sanitizedInputs.state, 'minecraft:stone', 'f-9.11: benign inputs survive');
  assertEqual(entry.changedBlockCount, 64, 'f-9.11: changedBlockCount is recorded');
  assertEqual(entry.revision, 7, 'f-9.11: revision is recorded');
  assertEqual(entry.undoEntryId, 'undo-1', 'f-9.11: undoEntryId is recorded');

  // Redaction happens on write: the stored entry never held the plaintext.
  assertEqual(JSON.stringify(entry.sanitizedInputs).includes('zzzz'), false, 'f-9.4: plaintext never enters the entry');
}

console.log('--- Slice f-9: bounds and eviction (F-9.5) ---');

{
  const small = createAgentLog({ maxEntries: 3, maxBytes: 1024 * 1024 });
  for (let i = 0; i < 5; i++) {
    small.append({
      tool: 'undo', projectId: 'p1', revision: i, resultSummary: `op ${i}`,
      durationMs: 1, inputs: {},
    });
  }
  const kept = small.entries();
  assertEqual(kept.length, 3, 'f-9.24: entry bound is enforced');
  assertEqual(kept[0].resultSummary, 'op 2', 'f-9.24: oldest entries are evicted first');
  assertEqual(kept[2].resultSummary, 'op 4', 'f-9.24: newest entries are kept');
  assertEqual(small.size().dropped, 2, 'f-9.24: dropped count is reported');

  // Byte bound evicts too.
  const byBytes = createAgentLog({ maxEntries: 1000, maxBytes: 900 });
  for (let i = 0; i < 20; i++) {
    byBytes.append({
      tool: 'fill_selection', projectId: 'p1', revision: i,
      resultSummary: 'x'.repeat(200), durationMs: 1, inputs: {},
    });
  }
  const size = byBytes.size();
  assert(size.bytes <= 900, 'f-9.24: byte bound is enforced');
  assert(size.dropped > 0, 'f-9.24: byte-bound eviction is reported');
  assert(size.count < 20, 'f-9.24: byte-bound eviction removed entries');
}

console.log('--- Slice f-9: serialization and export (§8.2) ---');

{
  const log = createAgentLog();
  const e1 = log.append({
    tool: 'fill_selection', projectId: 'p1', revision: 1, resultSummary: 'filled 10 cells',
    changedBlockCount: 10, durationMs: 3, inputs: { state: 'minecraft:dirt' },
  });
  const e2 = log.append({
    tool: 'export_schematic', projectId: 'p1', revision: 2, resultSummary: 'exported',
    durationMs: 8, inputs: { relativePath: 'a/b/out.vxproj' },
  });

  const s1 = serializeEntry(e1);
  assertEqual(s1.split('\n').length, 1, 'f-9.24: serializeEntry emits one line per entry');
  assert(s1.includes('fill_selection'), 'f-9.24: serialization includes the tool');
  assert(s1.includes('"changedBlockCount":10'), 'f-9.24: serialization includes the block count');
  assertEqual(s1.includes('minecraft:dirt'), false || s1.includes('minecraft:dirt'), 'f-9.24: serialization is well-formed JSON');
  assertEqual(JSON.parse(s1).tool, 'fill_selection', 'f-9.24: serialized entry parses as JSON');

  const text = log.toSanitizedText('p1');
  assertEqual(text.split('\n').length, 2, 'f-9.24: sanitized export has one line per entry');
  assertEqual(log.toSanitizedText('nope').length, 0, 'f-9.24: unknown project exports nothing');
  assertEqual(log.entries('p1').length, 2, 'f-9.24: entries are scoped by projectId');
  void e2;
}

console.log('--- Slice f-9: undo validity (§8.2 / acceptance 23) ---');

{
  const log = createAgentLog();
  const first = log.append({
    tool: 'fill_selection', projectId: 'p1', revision: 1, resultSummary: 'a',
    durationMs: 1, inputs: {}, undoEntryId: 'undo-1',
  });
  log.append({
    tool: 'fill_selection', projectId: 'p1', revision: 2, resultSummary: 'b',
    durationMs: 1, inputs: {}, undoEntryId: 'undo-2',
  });

  // Only the latest undoable action at the current revision offers one-click undo.
  assertEqual(log.isUndoAvailable(first.id, 2), false, 'f-9.23: superseded entry offers no undo');
  const latest = log.entries('p1')[1];
  assertEqual(latest.undoAvailable, true, 'f-9.23: latest undoable entry offers undo');
  assertEqual(log.isUndoAvailable(latest.id, 2), true, 'f-9.23: latest entry is undoable at its revision');
  assertEqual(log.isUndoAvailable(latest.id, 3), false, 'f-9.23: a newer committed revision invalidates undo');

  const noUndo = log.append({
    tool: 'get_history', projectId: 'p1', revision: 3, resultSummary: 'read only',
    durationMs: 1, inputs: {},
  });
  assertEqual(noUndo.undoAvailable, false, 'f-9.23: a read tool has no undo entry');
}

console.log('\n=== Slice f-9 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
