# Subspec F — Slice f-9: Agent Log Entry + Sanitization

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.7 (Agent Log entry), §4.6 (Sanitization), §8.2 (Agent Log panel)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-f.md` decisions F-9.1 … F-9.5.

## Goal

Implement the Agent Log: a bounded, incrementally serialized record of MCP activity whose text is sanitized before it is stored — secrets, paths, usernames, machine names, raw NBT and raw file contents are redacted, and control characters are stripped so imported metadata cannot forge log lines.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/agent-log.ts` | create | `createAgentLog`, `sanitizeValue`, `sanitizeText`, `serializeEntry`, bounds constants |
| `apps/mcp-companion/__tests__/slice-f-9-agent-log.test.ts` | create | Sanitization, forging, bounds, serialization, undo-validity assertions |
| `apps/mcp-companion/src/index.ts` | update | re-export the log surface |

## Types / APIs

```ts
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

export type SanitizeOptions = {
  /** Absolute filesystem paths approved for display; everything else is reduced to a basename hash. */
  extraSecretPatterns?: RegExp[];
  maxStringBytes?: number;
  /** Home directory / username to redact by exact match. */
  username?: string;
  machineName?: string;
};

export type AgentLogBounds = { maxEntries: number; maxBytes: number };

export type AgentLog = {
  append(entry: Omit<AgentLogEntry, 'sanitizedInputs'> & { inputs: Record<string, unknown> }): AgentLogEntry;
  entries(projectId?: string): AgentLogEntry[];
  size(): { count: number; bytes: number; dropped: number };
  serializeEntry(entry: AgentLogEntry): string;
  /** §8.2: one-click Undo is offered only when the operation is the latest undoable action. */
  isUndoAvailable(entryId: string, currentRevision: number): boolean;
  toSanitizedText(projectId?: string): string;
};

export const DEFAULT_MAX_LOG_ENTRIES = 10_000;
export const DEFAULT_MAX_LOG_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_LOG_STRING_BYTES = 4096;
export const REDACTION = '[redacted]';

export function sanitizeText(input: string, options?: SanitizeOptions): string;
export function sanitizeValue(value: unknown, key: string | null, options?: SanitizeOptions): unknown;
export function createAgentLog(options?: AgentLogOptions): AgentLog;
```

Key rules:

- Sanitize on write, never on read (F-9.4): raw NBT and file contents are replaced by a summary at the point of entry.
- Every string is single-line: control characters stripped, CR/LF/TAB collapsed (F-9.2).
- Paths become `<basename>#<hash8>` so two distinct paths stay distinguishable without leaking the directory (F-9.1).
- Values whose *key* name is sensitive (token, secret, password, key, cookie, authorization) are redacted even when their shape is unknown (F-9.3).
- Known secret shapes are redacted too: `Bearer`, PEM blocks, `ghp_`/`github_pat_`/`gho_`/`ghs_`, `sk-`, `AKIA`/`ASIA`, JWTs, and this companion's `ct-`/pairing tokens.
- Bounds are 10,000 entries / 50 MiB, evicting oldest-first with a visible dropped count (F-9.5).
- Serialization is per entry; no full-log buffer is built.

## Acceptance criteria

1. `AgentLogEntry` matches SPEC-F §2.7 field for field.
2. Secrets redacted: `Bearer`/`Authorization` header values, cookies, PEM private keys, GitHub/OpenAI/AWS token shapes, JWTs.
3. Key-name classification: any sensitive key name is redacted regardless of value shape.
4. Paths, usernames and machine names are redacted: absolute paths reduced to `basename#hash`.
5. Raw NBT and raw file contents are summarized, never stored.
6. Log forging is blocked: CR/LF/TAB and other control characters cannot produce a second line; entry text is single-line.
7. Oversized strings are truncated with an explicit marker rather than entering the log whole.
8. Bounds hold: at most 10,000 entries and 50 MiB, oldest evicted first, dropped count reported.
9. `serializeEntry` serializes one entry at a time; the sanitized log can be exported as text.
10. Undo availability is true only for the latest undoable entry at the current revision (§8.2).

## Tests

`apps/mcp-companion/__tests__/slice-f-9-agent-log.test.ts`

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-9-agent-log.test.ts
```

## Verification

- `node <typescript@5.9.3>/bin/tsc --noEmit` for `apps/mcp-companion`: exit 0
- Test command above: exit 0
