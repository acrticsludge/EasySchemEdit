# Subspec F — Slice f-8: Export Through MCP

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §4.2 (Approved directories), §6 (`export_schematic` is confirmation-gated), §7 (Export through MCP)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Filesystem access is injected.
**Research:** `docs/research/subplan-f.md` decisions F-8.1 … F-8.5.
**Depends on:** slice f-7 (`destructive-protocol.ts`, for the `export_schematic` size gate).

## Goal

Implement the approved-workspace export path for `export_schematic`: safe relative paths, segment-wise containment inside an approved directory, symlink resolution, refusal to overwrite, atomic write-via-rename, and a bounded artifact handle instead of an inlined blob.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/mcp-export.ts` | create | `createMcpExporter`, `resolveSafeRelativePath`, `isContained`, path/export error codes, result types |
| `apps/mcp-companion/__tests__/slice-f-8-mcp-export.test.ts` | create | Traversal, symlink, overwrite, atomicity, bound, refusal assertions |
| `apps/mcp-companion/src/index.ts` | update | re-export the exporter surface |

## Types / APIs

```ts
export type ExportPathErrorCode =
  | 'PATH_NOT_RELATIVE'      // absolute path supplied
  | 'PATH_EMPTY'
  | 'PATH_TRAVERSAL'         // '..' escape after normalization
  | 'PATH_OUTSIDE_APPROVED'  // resolved target is not inside the approved root
  | 'PATH_SYMLINK_ESCAPE'    // realpath escaped the canonical root
  | 'NO_APPROVED_WORKSPACE'  // F3 default: no directories approved
  | 'PROJECT_NOT_APPROVED';  // project restriction list does not include the root

export type ExportRequest = {
  projectId: string;
  /** Path relative to an approved root. Never absolute. */
  relativePath: string;
  format: '.vxproj' | '.litematic' | '.schematic';
  /** Serialized archive produced by the format/persistence packages. */
  data: ArrayBuffer;
  /** §7: refuse instead of silently dropping an oversized export. */
  allowOverwrite?: boolean;
};

export type ExportArtifact = {
  /** Opaque handle for later retrieval; the blob itself is never inlined (§7 bullet 1). */
  artifactHandle: string;
  /** Safe relative path, root-relative, POSIX separators. */
  relativePath: string;
  /** Which approved root it landed in. */
  approvedRoot: string;
  bytes: number;
  checksum: string;
  validation: { passed: boolean; warnings: Diagnostic[] };
};

export type ExportRefusal = {
  code: ExportPathErrorCode | 'OVERWRITE_REFUSED' | 'EXPORT_TOO_LARGE' | 'WRITE_FAILED' | 'VERIFY_FAILED';
  message: string;
  suggestedAction?: string;
};

export type ExportResult =
  | { ok: true; artifact: ExportArtifact }
  | { ok: false; error: ExportRefusal };

export type ExportServices = {
  /** Canonicalize an existing path (realpath). */
  realpath(path: string): string;
  /** Create the parent directories if missing; returns the canonical parent. */
  ensureDir(path: string): string;
  exists(path: string): boolean;
  readFile(path: string): ArrayBuffer;
  /** Write bytes to a temp sibling. Returns the temp path. */
  writeTemp(targetPath: string, data: ArrayBuffer): string;
  /** Atomic rename over the target path. */
  rename(tempPath: string, targetPath: string): void;
  /** Remove a temp file after a failed verify. */
  remove(path: string): void;
  sha256(data: ArrayBuffer): string;
  /**
   * Host obligation from SPEC-F §4.2 ("race-safe: re-check after open") — see DOUBTS.md D-4.
   * Called after rename so the host can re-verify the canonical path.
   */
  canonicalizeAfterWrite(path: string): string;
  /** Configured bound; exports above it are refused with a suggested action. */
  maxExportBytes: number;
};

export type McpExporter = {
  resolveSafeRelativePath(projectId: string, relativePath: string): { ok: true; absolute: string; root: string } | { ok: false; error: ExportRefusal };
  exportSchematic(request: ExportRequest): ExportResult;
  listArtifacts(projectId?: string): ExportArtifact[];
};

export function isContained(root: string, candidate: string): boolean;
export function createMcpExporter(options: McpExporterOptions): McpExporter;
```

Key rules:

- Default is no approved directories (SPEC-F F3): every export is refused `NO_APPROVED_WORKSPACE` until a root is approved.
- The supplied path must be relative, non-empty, and must not escape after normalization; containment is segment-wise (F-8.1).
- Symlinks are resolved before containment is decided; `..` and symlink escapes are rejected distinctly (F-8.2).
- An existing target is refused unless `allowOverwrite` is set (SPEC-F §4.2 "refuse to overwrite existing files unless explicitly confirmed").
- Write order is temp → sha256 verify → rename → host post-write canonicalization (F-8.4); temp files are removed on failure.
- Payloads above `maxExportBytes` are refused with an actionable message; artifacts are returned as handles, never base64 (F-8.5).
- `export_schematic` remains confirmation-gated by size per slice f-7 when > `MCP_LIMITS.maxChangedCells` (D-3).

## Acceptance criteria

1. No approved directory ⇒ `NO_APPROVED_WORKSPACE`; per-project restrictions additionally raise `PROJECT_NOT_APPROVED`.
2. Absolute input ⇒ `PATH_NOT_RELATIVE`; empty input ⇒ `PATH_EMPTY`.
3. `../` escapes (including nested and doubled) ⇒ `PATH_TRAVERSAL`.
4. A sibling directory whose name shares the root's prefix (`/approved-evil`) is NOT treated as inside `/approved` ⇒ `PATH_OUTSIDE_APPROVED`.
5. A symlink inside the root that points outside ⇒ `PATH_SYMLINK_ESCAPE`.
6. Existing target without `allowOverwrite` ⇒ `OVERWRITE_REFUSED`; no temp file is left behind.
7. Write order is temp → verify → rename; a checksum mismatch ⇒ `VERIFY_FAILED`, target untouched, temp removed.
8. Payload above the bound ⇒ `EXPORT_TOO_LARGE` with a suggested action.
9. Success returns an artifact handle, root-relative POSIX path, byte count and checksum; the payload is not inlined.
10. Repeated export of the same project is listed by `listArtifacts`, scoped by `projectId` when given.

## Tests

`apps/mcp-companion/__tests__/slice-f-8-mcp-export.test.ts` — in-memory filesystem double with a configurable symlink map, recording every write/rename/remove.

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-8-mcp-export.test.ts
```

## Verification

- `node <typescript@5.9.3>/bin/tsc --noEmit` for `apps/mcp-companion`: exit 0
- Test command above: exit 0
