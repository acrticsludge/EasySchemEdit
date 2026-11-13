// apps/mcp-companion/src/agent-log.ts
// Agent Log: bounded, incrementally serialized MCP activity record with sanitization
// (SUBSPEC-F §2.7, §4.6, §8.2, F7).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
//
// Design decisions (docs/research/subplan-f.md):
//   F-9.1 redaction by classification, not a deny-list of known secrets; paths collapse to
//         basename#hash; block IDs / operation names / counts / coordinates are retained (§4.6)
//   F-9.2 single-line entries: control characters stripped, CR/LF/TAB collapsed (log forging)
//   F-9.3 secret shapes plus a key-name rule for tokens with no public shape
//   F-9.4 raw NBT and raw file contents are summarized at write time, never stored
//   F-9.5 bounds evict oldest-first and report the dropped count; serialization is per entry
//
// Sanitization happens on WRITE. The stored entry never holds plaintext, so a later read cannot leak.

import type { Diagnostic } from '../../../packages/domain/shared-types.ts';

// ============================================================================
// Bounds and markers
// ============================================================================

/** SPEC-F §8.2: max 10,000 entries. */
export const DEFAULT_MAX_LOG_ENTRIES = 10_000;
/** SPEC-F §8.2: max 50 MiB. */
export const DEFAULT_MAX_LOG_BYTES = 50 * 1024 * 1024;
/** Per-string cap, so one payload cannot occupy the whole log (F-9.4). */
export const DEFAULT_MAX_LOG_STRING_BYTES = 4096;
/** Replacement marker for any redacted value. */
export const REDACTION = '[redacted]';
/** Marker appended when a string is truncated. */
export const TRUNCATION_MARKER = '…[truncated]';

// ============================================================================
// Entry (SPEC-F §2.7, field for field)
// ============================================================================

export type AgentLogEntry = {
  id: string;
  timestamp: string;
  tool: string;
  sanitizedInputs: Record<string, unknown>;
  projectId: string;
  revision: number;
  resultSummary: string;
  changedBlockCount?: number;
  warnings: string[];
  durationMs: number;
  undoAvailable: boolean;
  undoEntryId?: string;
};

export type AgentLogAppendInput = {
  tool: string;
  projectId: string;
  revision: number;
  resultSummary: string;
  changedBlockCount?: number;
  warnings?: string[];
  durationMs: number;
  inputs: Record<string, unknown>;
  undoEntryId?: string;
  /** Optional explicit id/timestamp; both are generated when omitted. */
  id?: string;
  timestamp?: string;
};

// ============================================================================
// Sanitize options
// ============================================================================

export type SanitizeOptions = {
  /** Additional caller-supplied secret patterns. */
  extraSecretPatterns?: RegExp[];
  /** Per-string cap; defaults to `DEFAULT_MAX_LOG_STRING_BYTES`. */
  maxStringBytes?: number;
  /** Redact this exact substring (the OS username). */
  username?: string;
  /** Redact this exact substring (the machine name). */
  machineName?: string;
};

export type AgentLogOptions = SanitizeOptions & {
  maxEntries?: number;
  maxBytes?: number;
  generateId?: () => string;
  now?: () => number;
};

// ============================================================================
// Classification tables
// ============================================================================

/**
 * Value shapes that are always secret (F-9.3). This is a floor, not a guarantee — the key-name
 * rule below carries opaque tokens that have no public shape.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\bBasic\s+[A-Za-z0-9+/=]{8,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgho_[A-Za-z0-9]{20,}/g,
  /\bghs_[A-Za-z0-9]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bct-[A-Za-z0-9_-]{8,}/g,
  /\bsession=[A-Za-z0-9._~+/=-]{6,}/g,
];

/** Key names that make their *value* sensitive regardless of shape (F-9.3). */
const SENSITIVE_KEY_RE =
  /(pass(word|phrase)?|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|client[_-]?secret|credential|auth(orization)?|bearer|cookie|session[_-]?id|signature|salt|nonce|pem|pfx|keystore)/i;

/** Keys whose values are raw payloads, summarized rather than stored (F-9.4, §4.6). */
const PAYLOAD_KEY_RE =
  /(raw[_-]?nbt|nbt([_-]?payload)?|raw[_-]?file|file[_-]?contents?|filecontents|raw[_-]?bytes|binary[_-]?blob|content[_-]?bytes|base64[_-]?blob|schematic[_-]?bytes)/i;

// ============================================================================
// Sanitization
// ============================================================================

function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter((s) => s.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** Stable short hash, so two distinct paths stay distinguishable without leaking the directory. */
function stableHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** True for absolute POSIX paths, drive-qualified paths, and UNC paths. */
function looksLikeAbsolutePath(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /\b(?:file:\/\/)?\/[\w.-]+\/[\w./-]+/.test(value)
  );
}

/** F-9.2: collapse CR/LF/TAB and strip remaining control characters. */
function toSingleLine(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/ {2,}/g, ' ');
}

function capLength(value: string, maxBytes: number): string {
  if (value.length <= maxBytes) return value;
  const keep = Math.max(0, maxBytes - TRUNCATION_MARKER.length);
  return `${value.slice(0, keep)}${TRUNCATION_MARKER}`;
}

/**
 * Sanitize a free-text string: redact secrets, collapse absolute paths to basename#hash, strip
 * control characters, cap the length.
 */
export function sanitizeText(input: string, options: SanitizeOptions = {}): string {
  const maxBytes = options.maxStringBytes ?? DEFAULT_MAX_LOG_STRING_BYTES;
  let out = input;

  // Exact-match redactions first (username / machine name).
  if (options.username && options.username.length > 0) {
    out = out.split(options.username).join(REDACTION);
  }
  if (options.machineName && options.machineName.length > 0) {
    out = out.split(options.machineName).join(REDACTION);
  }

  // Absolute paths → basename#hash, so directory structure and usernames cannot leak.
  out = out.replace(/(?:[A-Za-z]:[\\/]|\/)[^\s"'`)]+/g, (match) =>
    looksLikeAbsolutePath(match) ? `${basename(match)}#${stableHash(match)}` : match,
  );

  // Secret shapes.
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTION);
  }
  for (const pattern of options.extraSecretPatterns ?? []) {
    out = out.replace(pattern, REDACTION);
  }

  out = toSingleLine(out);
  return capLength(out, maxBytes);
}

/** Summarize a raw payload key instead of storing its contents (F-9.4). */
function summarizePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    return `${REDACTION} (${value.length} bytes)`;
  }
  if (value instanceof ArrayBuffer) {
    return `${REDACTION} (${value.byteLength} bytes)`;
  }
  if (Array.isArray(value)) {
    return `${REDACTION} (${value.length} entries)`;
  }
  if (value !== null && typeof value === 'object') {
    return `${REDACTION} (${Object.keys(value as object).length} keys)`;
  }
  return REDACTION;
}

/**
 * Recursively sanitize a value against the classification tables. `key` is the key this value was
 * found under (null at the root), which is what carries opaque sensitive values (F-9.3).
 */
export function sanitizeValue(
  value: unknown,
  key: string | null,
  options: SanitizeOptions = {},
): unknown {
  // A sensitive *leaf* is redacted. Containers are still walked, otherwise the key-name rule would
  // nuke whole subtrees such as `auth: { password, cookie }` instead of the two leaves.
  const isContainer = value !== null && typeof value === 'object' && !(value instanceof ArrayBuffer);
  if (key !== null && !isContainer && SENSITIVE_KEY_RE.test(key)) return REDACTION;
  if (key !== null && PAYLOAD_KEY_RE.test(key)) return summarizePayload(value);

  if (typeof value === 'string') return sanitizeText(value, options);
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (value instanceof ArrayBuffer) return summarizePayload(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key, options));

  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    out[childKey] = sanitizeValue(childValue, childKey, options);
  }
  return out;
}

/** Sanitize a whole inputs record (SPEC-F §2.7 `sanitizedInputs`). */
export function sanitizeInputs(
  inputs: Record<string, unknown>,
  options: SanitizeOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    out[key] = sanitizeValue(value, key, options);
  }
  return out;
}

// ============================================================================
// Serialization
// ============================================================================

/** Serialize one entry as a single line (§8.2 bounded serialization, one entry at a time). */
export function serializeEntry(entry: AgentLogEntry): string {
  const ordered: Record<string, unknown> = {
    id: entry.id,
    timestamp: entry.timestamp,
    tool: entry.tool,
    projectId: entry.projectId,
    revision: entry.revision,
    resultSummary: entry.resultSummary,
    sanitizedInputs: entry.sanitizedInputs,
    durationMs: entry.durationMs,
    undoAvailable: entry.undoAvailable,
  };
  if (entry.changedBlockCount !== undefined) ordered.changedBlockCount = entry.changedBlockCount;
  if (entry.undoEntryId !== undefined) ordered.undoEntryId = entry.undoEntryId;
  if (entry.warnings.length > 0) ordered.warnings = entry.warnings;
  // JSON.stringify is single-line by construction, and inputs were sanitized on write, so the
  // escaped result cannot contain a raw CR/LF that would forge a line.
  return JSON.stringify(ordered);
}

// ============================================================================
// Log
// ============================================================================

export type AgentLogSize = { count: number; bytes: number; dropped: number };

export type AgentLog = {
  append(input: AgentLogAppendInput): AgentLogEntry;
  entries(projectId?: string): AgentLogEntry[];
  size(): AgentLogSize;
  serializeEntry(entry: AgentLogEntry): string;
  /** §8.2 / acceptance 23: undo only for the latest undoable action at the current revision. */
  isUndoAvailable(entryId: string, currentRevision: number): boolean;
  toSanitizedText(projectId?: string): string;
  clear(): void;
};

let fallbackIdCounter = 0;

export function createAgentLog(options: AgentLogOptions = {}): AgentLog {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_LOG_ENTRIES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES;
  const now = options.now ?? (() => Date.now());
  const generateId =
    options.generateId ??
    (() => {
      fallbackIdCounter += 1;
      return `log-${fallbackIdCounter}`;
    });

  const buffer: Array<{ entry: AgentLogEntry; line: string; bytes: number }> = [];
  let dropped = 0;
  let totalBytes = 0;

  function evictToBounds(): void {
    while (buffer.length > maxEntries) {
      const removed = buffer.shift();
      if (removed) {
        totalBytes -= removed.bytes;
        dropped += 1;
      }
    }
    while (totalBytes > maxBytes && buffer.length > 0) {
      const removed = buffer.shift();
      if (removed) {
        totalBytes -= removed.bytes;
        dropped += 1;
      }
    }
  }

  function append(input: AgentLogAppendInput): AgentLogEntry {
    const entry: AgentLogEntry = {
      id: input.id ?? generateId(),
      timestamp: input.timestamp ?? new Date(now()).toISOString(),
      tool: sanitizeText(input.tool, options),
      sanitizedInputs: sanitizeInputs(input.inputs, options),
      projectId: sanitizeText(input.projectId, options),
      revision: input.revision,
      resultSummary: sanitizeText(input.resultSummary, options),
      warnings: (input.warnings ?? []).map((w) => sanitizeText(w, options)),
      durationMs: input.durationMs,
      undoAvailable: false,
    };
    if (input.changedBlockCount !== undefined) entry.changedBlockCount = input.changedBlockCount;
    if (input.undoEntryId !== undefined) {
      entry.undoEntryId = sanitizeText(input.undoEntryId, options);
    }

    // §8.2: undo is offered only for the latest undoable action. A new entry with an undo id
    // supersedes every earlier one.
    if (entry.undoEntryId !== undefined) {
      for (const item of buffer) {
        if (item.entry.undoAvailable) {
          item.entry.undoAvailable = false;
          item.line = serializeEntry(item.entry);
          totalBytes += item.line.length - item.bytes;
          item.bytes = item.line.length;
        }
      }
      entry.undoAvailable = true;
    }

    const line = serializeEntry(entry);
    buffer.push({ entry, line, bytes: line.length });
    totalBytes += line.length;
    evictToBounds();
    return entry;
  }

  function entries(projectId?: string): AgentLogEntry[] {
    if (projectId === undefined) return buffer.map((item) => item.entry);
    return buffer.filter((item) => item.entry.projectId === projectId).map((item) => item.entry);
  }

  function size(): AgentLogSize {
    return { count: buffer.length, bytes: totalBytes, dropped };
  }

  function isUndoAvailable(entryId: string, currentRevision: number): boolean {
    const item = buffer.find((candidate) => candidate.entry.id === entryId);
    if (!item) return false;
    const entry = item.entry;
    if (!entry.undoAvailable) return false;
    return entry.revision === currentRevision;
  }

  function toSanitizedText(projectId?: string): string {
    const source =
      projectId === undefined ? buffer : buffer.filter((item) => item.entry.projectId === projectId);
    return source.map((item) => item.line).join('\n');
  }

  function clear(): void {
    buffer.length = 0;
    totalBytes = 0;
  }

  return { append, entries, size, serializeEntry, isUndoAvailable, toSanitizedText, clear };
}

/** Convenience alias so callers can log a diagnostic list without mapping it first. */
export function warningTexts(warnings: Diagnostic[]): string[] {
  return warnings.map((w) => w.message);
}
