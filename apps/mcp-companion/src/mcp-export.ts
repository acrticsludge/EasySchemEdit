// apps/mcp-companion/src/mcp-export.ts
// Export through MCP into an approved workspace (SUBSPEC-F §4.2, §6, §7).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports — every filesystem operation
// is injected through ExportServices.
//
// Design decisions (docs/research/subplan-f.md):
//   F-8.1 containment is segment-wise, not a `startsWith` on a joined string
//   F-8.2 symlinks are resolved via realpath before containment is decided (CWE-59)
//   F-8.3 the O_NOFOLLOW post-open re-check of SPEC-F §4.2 is a HOST obligation exposed as
//         `canonicalizeAfterWrite`; this module does not claim race-freedom on its own (D-4)
//   F-8.4 atomic write = temp → verify → rename; a failed verify never reaches rename
//   F-8.5 artifacts are returned as handles; payloads are never inlined in results (§7 bullet 1)

import type { Diagnostic } from '../../../packages/domain/shared-types.ts';

// ============================================================================
// Error codes
// ============================================================================

export type ExportPathErrorCode =
  | 'PATH_NOT_RELATIVE'
  | 'PATH_EMPTY'
  | 'PATH_TRAVERSAL'
  | 'PATH_OUTSIDE_APPROVED'
  | 'PATH_SYMLINK_ESCAPE'
  | 'NO_APPROVED_WORKSPACE'
  | 'PROJECT_NOT_APPROVED';

export type ExportErrorCode =
  | ExportPathErrorCode
  | 'OVERWRITE_REFUSED'
  | 'EXPORT_TOO_LARGE'
  | 'WRITE_FAILED'
  | 'VERIFY_FAILED';

export type ExportRefusal = {
  code: ExportErrorCode;
  message: string;
  suggestedAction?: string;
};

// ============================================================================
// Requests and results
// ============================================================================

export type ExportRequest = {
  projectId: string;
  /** Path relative to an approved root. Never absolute. */
  relativePath: string;
  format: '.vxproj' | '.litematic' | '.schematic';
  /** Serialized archive produced by the format/persistence packages. */
  data: ArrayBuffer;
  /** SPEC-F §4.2: refuse to overwrite existing files unless explicitly confirmed. */
  allowOverwrite?: boolean;
};

export type ExportArtifact = {
  /** Opaque handle for later retrieval; the blob itself is never inlined (§7 bullet 1). */
  artifactHandle: string;
  /** Root-relative path with POSIX separators. */
  relativePath: string;
  /** Absolute path of the approved root the artifact landed in. */
  approvedRoot: string;
  bytes: number;
  checksum: string;
  validation: { passed: boolean; warnings: Diagnostic[] };
};

export type ExportResult =
  | { ok: true; artifact: ExportArtifact }
  | { ok: false; error: ExportRefusal };

export type ResolvedPath =
  | { ok: true; absolute: string; root: string }
  | { ok: false; error: ExportRefusal };

// ============================================================================
// Injected services
// ============================================================================

export type ExportServices = {
  /** Canonicalize an existing path (realpath). */
  realpath(path: string): string;
  exists(path: string): boolean;
  /** Write bytes to a temp sibling. Returns the temp path. */
  writeTemp(targetPath: string, data: ArrayBuffer): string;
  /** Read back the temp file so the written bytes can be verified before rename (SPEC-F §4.2). */
  readTemp(tempPath: string): ArrayBuffer;
  /** Atomic rename over the target path. */
  rename(tempPath: string, targetPath: string): void;
  /** Remove a temp file after a failed verify. */
  remove(path: string): void;
  sha256(data: ArrayBuffer): string;
  /**
   * Host obligation from SPEC-F §4.2 ("race-safe: re-check after open", O_NOFOLLOW where
   * available). Called after rename so the host can re-verify the canonical path. See DOUBTS.md D-4.
   */
  canonicalizeAfterWrite(path: string): string;
  /** Configured bound; exports above it are refused with an actionable message. */
  maxExportBytes: number;
};

export type McpExporterOptions = {
  services: ExportServices;
  /** SPEC-F F3: canonicalized absolute approved roots. Default is an empty list (nothing approved). */
  approvedDirectories: string[];
  /** projectId → allowed roots. When a project has an entry, it replaces the global list. */
  projectRestrictions?: Record<string, string[]>;
  /** Artifact handle minting; production wiring may use a UUID. */
  generateArtifactHandle?: () => string;
};

export type McpExporter = {
  /** Resolve and validate a caller-supplied path against the approved roots. Never writes. */
  resolveSafeRelativePath(projectId: string, relativePath: string): ResolvedPath;
  exportSchematic(request: ExportRequest): ExportResult;
  /** Artifacts written this session, optionally scoped to one project. */
  listArtifacts(projectId?: string): ExportArtifact[];
};

// ============================================================================
// Path helpers
// ============================================================================

function isAbsolute(p: string): boolean {
  if (p.startsWith('/')) return true;
  if (p.startsWith('\\')) return true;
  // Drive-qualified Windows path (C:\ or C:/) and UNC (\\server\share).
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  return false;
}

function segments(p: string): string[] {
  return p.split(/[\\/]+/).filter((s) => s.length > 0 && s !== '.');
}

/**
 * Resolve `.` and `..` segment-wise without touching the filesystem. A `..` that would escape the
 * root survives as a leading `..`, which callers then reject (F-8.1).
 */
export function normalizePathSegments(input: string): string {
  const out: string[] = [];
  for (const seg of segments(input)) {
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') {
        out.pop();
      } else {
        out.push('..');
      }
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

/**
 * Segment-wise containment (F-8.1). A plain `startsWith` would wrongly accept `/approved-evil`
 * for the root `/approved`.
 */
export function isContained(root: string, candidate: string): boolean {
  const rootSegs = segments(root);
  const candSegs = segments(candidate);
  if (candSegs.length < rootSegs.length) return false;
  for (let i = 0; i < rootSegs.length; i++) {
    if (rootSegs[i] !== candSegs[i]) return false;
  }
  return true;
}

function posixJoin(...parts: string[]): string {
  const joined = parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/[\\/]+$/, ''))
    .join('/');
  return joined.startsWith('/') ? joined : `/${joined}`;
}

// ============================================================================
// Policy helpers
// ============================================================================

/**
 * Effective approved roots for a project. SPEC-F §4.2 calls the per-project list a *restriction*,
 * so it narrows the global approved list (intersection) rather than replacing it — a path outside
 * the globally approved set is never writable, even if a project entry names it. See decision
 * F-8.6 in docs/research/subplan-f.md.
 */
export function effectiveRoots(
  projectId: string,
  approvedDirectories: string[],
  projectRestrictions: Record<string, string[]>,
): string[] {
  const restricted = projectRestrictions[projectId];
  if (restricted === undefined) return approvedDirectories;
  return approvedDirectories.filter((root) => restricted.includes(root));
}

// ============================================================================
// Factory
// ============================================================================

let fallbackHandleCounter = 0;

export function createMcpExporter(options: McpExporterOptions): McpExporter {
  const { services } = options;
  const approvedDirectories = options.approvedDirectories;
  const projectRestrictions = options.projectRestrictions ?? {};
  const generateArtifactHandle =
    options.generateArtifactHandle ??
    (() => {
      fallbackHandleCounter += 1;
      return `artifact-${fallbackHandleCounter}`;
    });

  const artifacts: Array<{ projectId: string; artifact: ExportArtifact }> = [];

  function refusal(code: ExportErrorCode, message: string, suggestedAction?: string): {
    ok: false;
    error: ExportRefusal;
  } {
    return { ok: false, error: { code, message, suggestedAction } };
  }

  function resolveSafeRelativePath(projectId: string, relativePath: string): ResolvedPath {
    const roots = effectiveRoots(projectId, approvedDirectories, projectRestrictions);

    if (roots.length === 0) {
      if (projectRestrictions[projectId] !== undefined) {
        return refusal(
          'PROJECT_NOT_APPROVED',
          `project ${projectId} is restricted to directories that are not approved`,
          'approve one of the directories named for this project, or add an approved directory',
        );
      }
      return refusal(
        'NO_APPROVED_WORKSPACE',
        'no directory is approved for export (SPEC-F F3 default: none)',
        'approve a directory through the native folder picker, then retry',
      );
    }

    const raw = relativePath ?? '';
    if (raw.trim().length === 0) {
      return refusal('PATH_EMPTY', 'the export path is empty');
    }
    if (isAbsolute(raw)) {
      return refusal(
        'PATH_NOT_RELATIVE',
        `the export path must be relative to an approved directory, got "${raw}"`,
        'pass a path relative to the approved root',
      );
    }

    const normalized = normalizePathSegments(raw);
    if (normalized.length === 0) {
      return refusal('PATH_EMPTY', 'the export path resolves to an empty path');
    }
    if (normalized === '..' || normalized.startsWith('../')) {
      return refusal(
        'PATH_TRAVERSAL',
        `the export path escapes the approved directory: "${raw}"`,
        'remove the ".." segments',
      );
    }

    // Choose the first approved root that contains the candidate (segment-wise).
    let chosenRoot: string | null = null;
    let candidate: string | null = null;
    for (const root of roots) {
      const candidatePath = posixJoin(root, normalized);
      if (isContained(root, candidatePath)) {
        chosenRoot = root;
        candidate = candidatePath;
        break;
      }
    }

    if (chosenRoot === null || candidate === null) {
      return refusal(
        'PATH_OUTSIDE_APPROVED',
        `the export path is outside every approved directory: "${raw}"`,
        'choose a path inside an approved directory',
      );
    }

    // F-8.2: canonicalize both sides, then re-check containment. A symlink anywhere in the path
    // (root or intermediate segment) that lands outside the canonical root is refused.
    const realRoot = services.realpath(chosenRoot);
    const realCandidate = services.realpath(candidate);
    if (!isContained(realRoot, realCandidate)) {
      return refusal(
        'PATH_SYMLINK_ESCAPE',
        `the export path resolves through a symlink to "${realCandidate}", outside "${realRoot}"`,
        'choose a path that does not traverse a symlink out of the approved directory',
      );
    }

    return { ok: true, absolute: realCandidate, root: realRoot };
  }

  function exportSchematic(request: ExportRequest): ExportResult {
    const resolved = resolveSafeRelativePath(request.projectId, request.relativePath);
    if (!resolved.ok) return resolved;

    const { absolute, root } = resolved;
    const size = request.data.byteLength;

    if (size > services.maxExportBytes) {
      return refusal(
        'EXPORT_TOO_LARGE',
        `export is ${size} bytes, above the configured bound of ${services.maxExportBytes}`,
        'raise the export bound explicitly, or narrow the export target',
      );
    }

    if (services.exists(absolute) && request.allowOverwrite !== true) {
      return refusal(
        'OVERWRITE_REFUSED',
        `"${absolute}" already exists`,
        'set allowOverwrite to confirm replacing the existing file',
      );
    }

    // F-8.4: temp → verify → rename. A verification failure never reaches rename.
    let tempPath: string;
    try {
      tempPath = services.writeTemp(absolute, request.data);
    } catch (err) {
      return refusal(
        'WRITE_FAILED',
        `could not write the temporary file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const expected = services.sha256(request.data);
    const written = services.readTemp(tempPath);
    if (services.sha256(written) !== expected) {
      services.remove(tempPath);
      return refusal(
        'VERIFY_FAILED',
        'the temporary file did not match the exported bytes; the target was left untouched',
        'retry the export',
      );
    }

    try {
      services.rename(tempPath, absolute);
    } catch (err) {
      services.remove(tempPath);
      return refusal(
        'WRITE_FAILED',
        `could not commit the export: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // SPEC-F §4.2 race-safe re-check — host responsibility (D-4).
    services.canonicalizeAfterWrite(absolute);

    const artifact: ExportArtifact = {
      artifactHandle: generateArtifactHandle(),
      relativePath: normalizePathSegments(request.relativePath),
      approvedRoot: root,
      bytes: size,
      checksum: expected,
      validation: { passed: true, warnings: [] },
    };
    artifacts.push({ projectId: request.projectId, artifact });
    return { ok: true, artifact };
  }

  function listArtifacts(projectId?: string): ExportArtifact[] {
    const source =
      projectId === undefined
        ? artifacts
        : artifacts.filter((entry) => entry.projectId === projectId);
    return source.map((entry) => entry.artifact);
  }

  return { resolveSafeRelativePath, exportSchematic, listArtifacts };
}
