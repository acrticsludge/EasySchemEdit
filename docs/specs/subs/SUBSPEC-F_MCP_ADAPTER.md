# SUBSPEC-F — MCP Adapter (v1 implementation contract)

Source decisions: F1–F8 (locked planning baseline).  
Cross-checked against SUBSPEC-A (domain model, immutable snapshots, coordinate math), SUBSPEC-B (format adapters, fidelity), SUBSPEC-C (project persistence, history), SUBSPEC-D (editing engine), SUBSPEC-E (rendering).

Every decision below is translated into implementation details: type definitions, data flow, validation rules, worker responsibilities, frontend interactions, backend/companion responsibilities, failure handling, and tests.

---

## 1. Locked decisions

| ID | Decision | Status |
|---|---|---|
| F1 | Pairing token: 256-bit (32 random bytes), 5-minute TTL, one-time use. Displayed in pairing dialog. | Locked |
| F2 | Browser bridge: local HTTP (commands/queries) + WebSocket (events/progress). Port 127.0.0.1:43127 (configurable). | Locked |
| F3 | Approved directories: native folder picker, persisted per-user, restricted per-project. Default: none approved. | Locked |
| F4 | Block-count limit: 250,000 changed cells default, 1,000,000 configurable, 5,000,000 absolute safety. | Locked |
| F5 | Confirmation token: 60-second TTL, one-time use, bound to project ID + revision + operation + normalized args. | Locked |
| F6 | Idempotency: 15-minute retention, 1,000 entries, 50 MiB cache. Duplicate requestId returns original result. | Locked |
| F7 | Agent Log sanitization: redact tokens, headers, paths, usernames, machine names, secrets, raw NBT, raw file contents. | Locked |
|| F8 | Health endpoint: /healthz, /readyz; optional /metrics (debug, localhost-only). | Locked |
|| F9 | Single document authority per live session: browser-live mode or headless local-file mode. | Locked |
|| F10 | Idempotency: check completed request IDs before rejecting old revision (after auth + identity validation). | Locked |
|| F11 | Persist idempotency results atomically with successful document commits. | Locked |
|| F12 | No plaintext pairing tokens; revocation, expiry, idle timeout, permission controls. | Locked |
|| F13 | Chrome PNA, CORS, preflight, WebSocket, production-origin validation in Phase 0. | Locked |
|| F14 | Never expose pairing tokens in URLs or logs. | Locked |
|| F15 | Candidate-cell, runtime, memory limits alongside changed-block limits. | Locked |

---

## 2. Type definitions

### 2.1 Deployment model

```ts
export type McpCompanionConfig = {
  port: number;                    // default 43127
  host: string;                    // '127.0.0.1' (loopback only)
  pairingTokenTtlMs: number;        // 300000 (5 minutes)
  confirmationTokenTtlMs: number;   // 60000 (60 seconds)
  maxBlocksPerCall: number;         // 250000
  configurableLimit: number;        // 1000000
  absoluteSafetyLimit: number;      // 5000000
  idempotencyRetentionMs: number;  // 900000 (15 minutes)
  idempotencyMaxEntries: number;    // 1000
  idempotencyMaxBytes: number;     // 50 * 1024 * 1024 (50 MiB)
  approvedDirectories: string[];   // canonicalized absolute paths
  projectRestrictions: Record<string, string[]>;  // projectId → allowed dirs
};

export type McpSession = {
  id: string;
  projectId: string;
  expectedRevision: number;
  connectedAt: string;
  lastActivityAt: string;
  browserConnected: boolean;
  authority: 'browser' | 'companion';   // who owns the document in this session (F9/F12)
};
```

### 2.1.1 Document authority modes (F9)

**Exactly one authority owns the document at any time**, tracked by `McpSession.authority`. No split-brain; the authority field is the source of truth for who may commit mutations.

**Browser-live mode (default when a browser is paired and connected):**
- The browser owns the document in memory; `authority = 'browser'`.
- The companion is a forwarding proxy only: it holds **no document copy** and no chunk data.
- All MCP mutations go through the companion → localhost bridge → browser's command bus. The companion validates auth, revision, and idempotency before forwarding (F10/F11).
- Companion read tools reflect the browser's current revision via the revision-event channel.
- **Browser disconnect:** the companion stops being a proxy; `authority` reverts to `'companion'` nominally but the companion holds no document, so MCP mutations are rejected (`DOCUMENT_UNAVAILABLE`) until a browser re-attaches and regains authority. Pending forwarded operations are held briefly and delivered on reconnect; if the browser does not reconnect within the session idle timeout, they are dropped.
- **Browser reconnect:** the browser re-authenticates with a fresh pairing token, reloads/syncs the document from its own IndexedDB, and `authority` returns to `'browser'`. No document is transferred from companion (it has none).

**Headless local-file mode (no browser, or browser not attached):**
- The companion owns the document (loaded from `.vxproj` or newly created); `authority = 'companion'`.
- The companion holds the document in memory and commits MCP mutations directly to its own IndexedDB (project + idempotency records atomically, SUBSPEC-C section 2.3.8).
- A browser can attach as a client (read-only or read-write with pairing). On attach, the companion streams a document snapshot and revision events to the browser; the companion **remains authority** (`authority = 'companion'`). The browser is a client, not an authority.
- **Browser detach:** the companion continues operating headlessly; authority unchanged.

**Authority handover (explicit, one at a time):**
- Handover is always explicit and atomic: `authority` flips from one side to the other in a single transition, never both, never neither.
- Browser → companion: browser flushes pending commits and the companion loads the document (e.g. from a `.vxproj` the browser exported, or shared state); `authority` becomes `'companion'`.
- Companion → browser: companion writes a document snapshot; browser loads it into IndexedDB; `authority` becomes `'browser'`.
- A handover only completes when both sides acknowledge the same target revision; on failure, authority stays with the current holder.

**Connection lifecycle:**
- Pairing: a one-time 256-bit token (5-minute TTL) authenticates the initial browser↔companion link (SUBSPEC-F section 2.6; plaintext never stored, only SHA-256 hash).
- Idle timeout: 30 minutes of no activity drops the session; the authority holder retains the document.
- Reconnect after disconnect: the previously authoritative side resumes authority if it still holds the document; otherwise the session must be re-paired and the document re-opened.

### 2.2 Mutation envelope

```ts
export type MutationEnvelope = {
  projectId: string;
  expectedRevision: number;
  dryRun?: boolean;
  confirmationToken?: string;
  requestId: string;  // idempotency key
};

export type MutationResult<T> = {
  success: boolean;
  data?: T;
  error?: McpError;
  revision: number;
  requestId: string;
  durationMs: number;
};

export type McpError = {
  code: string;           // stable error code
  message: string;
  currentRevision?: number;
  suggestedAction?: string;
};
```

### 2.3 Dry-run result

```ts
export type DryRunResult = {
  operation: string;
  affectedPlacementIds: string[];
  affectedBounds: Bounds3i[];
  candidateCells: number;
  changedCells: number;
  resultingNonAirCount: number;
  conflictImpact: {
    sameStateOverlapsResolved: number;
    stateConflictsResolved: number;
  };
  estimatedUndoBytes: number;
  warnings: Diagnostic[];
  confirmationToken: string;   // bound to project + revision + operation + args
  expiresAt: string;
};
```

### 2.4 Confirmation token

```ts
export type ConfirmationToken = {
  token: string;              // cryptographically random
  projectId: string;
  expectedRevision: number;
  operation: string;
  normalizedArgs: string;      // canonicalized JSON of operation arguments
  createdAt: number;
  expiresAt: number;
  used: boolean;
};
```

### 2.5 Idempotency cache

```ts
export type IdempotencyEntry = {
  requestId: string;
  projectId: string;
  operation: string;
  normalizedArgs: string;
  result: MutationResult<unknown>;
  createdAt: number;
  expiresAt: number;
  sizeBytes: number;
};
```

### 2.6 Pairing token

```ts
export type PairingToken = {
  tokenHash: string;          // SHA-256 of token (plaintext never stored)
  createdAt: number;
  expiresAt: number;          // createdAt + 300000ms (5 minutes)
  used: boolean;              // one-time use
  sessionId?: string;
  revoked: boolean;
};
```

Pairing token security (F12, F14):
- Plaintext token displayed once in pairing dialog; never stored.
- Only SHA-256 hash persisted.
- Never expose in URLs, query parameters, or logs.
- Revocation: user can revoke active pairing from companion or browser.
- Expiry: 5-minute TTL; idle session timeout: 30 minutes of no activity.
- Permission controls: browser can request read-only or read-write access.
- Chrome Private Network Access (F13): companion responds to PNA preflight; validates `Access-Control-Request-Private-Network`.
- CORS: exact origin allowlist; no wildcard; preflight handled.
- WebSocket: origin validation on upgrade; no token in URL (sent in first message).

### 2.7 Agent Log entry

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
```

### 2.8 Health check

```ts
export type HealthStatus = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  bridgeStatus: 'connected' | 'disconnected' | 'pairing';
  activeSessions: number;
  lastError?: string;
};
```

---

## 3. Data flow

### 3.1 Connection flow

```
User starts companion → generates pairing token (256-bit, 5-min TTL, one-time)
  → displays in pairing dialog (copy button, no QR for v1)
  → browser connects to 127.0.0.1:43127 with token
  → companion validates token (loopback, exact origin, Host header, DNS rebinding protection)
  → companion establishes WebSocket event channel
  → browser and MCP share command bus via companion
```

### 3.2 Mutation flow

```
MCP tool call → MutationEnvelope (projectId, expectedRevision, requestId, dryRun, confirmationToken)
  → companion authenticates request (pairing token, origin, host)
  → companion validates request identity (projectId, tool name)
  → companion checks idempotency cache for completed requestId
    → if found and args match: return cached result (regardless of revision)
    → if found and args differ: reject with IDEMPOTENCY_ARGS_MISMATCH
  → companion validates: project exists, revision matches expectedRevision
  → if dryRun: compute DryRunResult → return with confirmationToken
  → if apply: validate confirmationToken (if destructive) → execute command → commit → increment revision
    → persist idempotency result atomically with commit (F11)
  → return MutationResult with revision and requestId
  → emit document-change event to browser via WebSocket
```

### 3.3 Idempotency flow

```
Receive request with requestId
  → authenticate and validate request identity first
  → check idempotency cache for completed requestId
  → if found and args match: return cached result (even if revision is old)
  → if found and args differ: reject with IDEMPOTENCY_ARGS_MISMATCH
  → if not found: validate revision → execute → commit → persist idempotency result atomically → return
  → on cache eviction: oldest entries first
  → idempotency results persisted to IndexedDB; survive companion restart
```

---

## 4. Validation rules

### 4.1 Security (F2)

- Bind only to loopback interfaces (127.0.0.1).
- Exact origin allowlist (no wildcard CORS).
- Origin and Host validation.
- DNS rebinding protection.
- Authenticated requests (pairing token).
- CSRF protection.
- Rate limiting.
- No unauthenticated arbitrary filesystem access.
- Message size limits.

### 4.2 Approved directories (F3)

- Default: no directories approved.
- User approves via native folder picker.
- Persisted in companion's per-user config file.
- Optional per-project restrictions.
- Resolve symlinks and canonicalize paths before checking (race-safe: re-check after open).
- Block path traversal (`../`, absolute paths outside approved roots).
- Symlink race protection: open file with O_NOFOLLOW; re-verify canonical path after open.
- Unintended overwrite protection: refuse to overwrite existing files unless explicitly confirmed.
- Atomic writes: write to temp file, verify, then rename.

### 4.3 Block-count limits (F4, F15)

```ts
const MCP_LIMITS = {
  maxCandidateCells: 1_000_000,   // total cells examined (including air)
  maxChangedCells: 250_000,       // actually modified cells (default)
  maxRuntimeMs: 5_000,            // estimated execution time
  maxMemoryBytes: 256 * 1024 * 1024,  // estimated peak memory (256 MiB)
  configurableChangedLimit: 1_000_000,
  absoluteSafetyLimit: 5_000_000
};
```

- Candidate cells: total cells examined (including air).
- Changed cells: actually modified cells.
- Runtime: estimated execution time.
- Memory: estimated peak memory allocation.
- Default counts actual changed cells, not merely selection size.
- Operations over default require dry-run + explicit limit increase.
- Operations exceeding configured maximum rejected.
- If any budget exceeded: refuse or require explicit override with warning.

### 4.4 Confirmation tokens (F5)

- 60-second TTL.
- One-time use.
- Bound to project ID, revision, operation name, normalized args.
- Invalidated when project changes.
- A confirmation must never authorize a different operation even with similar args.

### 4.5 Idempotency (F6)

- 15-minute retention.
- Maximum 1,000 cached results.
- Maximum 50 MiB cache.
- Duplicate requestId returns original result.
- If requestId reused with different normalized args: reject.

### 4.6 Agent Log sanitization (F7)

Redact:
- Pairing tokens.
- Authentication headers.
- Access tokens.
- Cookies.
- Absolute filesystem paths.
- Operating-system usernames.
- Machine names.
- Environment secrets.
- Raw NBT payloads.
- Raw file contents.
- Private local configuration.

Retain: block IDs, operation names, affected counts, useful coordinate information.

### 4.7 Health endpoint (F8)

- `GET /healthz`: companion status, version, bridge status, readiness.
- `GET /readyz`: readiness probe.
- `GET /metrics`: optional, debug-only, localhost-restricted.

---

## 5. MCP tool surface

### 5.1 Read tools

| Tool | Description |
|---|---|
| `list_projects` | List available projects |
| `open_project` | Open a project by ID |
| `get_project_info` | Project metadata, revision, placement count |
| `list_placements` | List placements with summary |
| `get_placement` | Full placement details |
| `get_origin` | Get placement origin |
| `detect_conflicts` | Conflict summary (bounded) |
| `get_conflict_map` | Paged/filtered conflict map |
| `get_material_list` | Material list (effective or per-placement) |
| `get_selection` | Current selection state |
| `get_color_mode` | Current conflict overlay mode |
| `get_history` | History entries (bounded) |
| `get_diagnostics` | Diagnostics for project |

### 5.2 Placement tools

| Tool | Description |
|---|---|
| `load_schematic` | Import a schematic file |
| `transform_placement` | Move/rotate/mirror a placement |
| `transform_placements` | Batch transform |
| `set_placement_visibility` | Show/hide |
| `set_placement_lock` | Lock/unlock |
| `rename_placement` | Rename |
| `delete_placement` | Delete (destructive, two-phase) |
| `duplicate_placement` | Duplicate with offset |
| `set_origin` | Edit origin |
| `bake_placements` | Bake (destructive, two-phase) |

### 5.3 Selection tools

| Tool | Description |
|---|---|
| `create_selection` | Create cuboid selection |
| `clear_selection` | Clear selection |
| `select_placements` | Select placements |

### 5.4 Region tools

| Tool | Description |
|---|---|
| `fill_selection` | Fill (destructive, two-phase) |
| `replace_selection` | Replace (destructive, two-phase) |
| `delete_selection` | Delete (destructive, two-phase) |
| `copy_selection` | Copy to clipboard |
| `cut_selection` | Cut (destructive, two-phase) |
| `paste_clipboard` | Paste |
| `hollow_selection` | Hollow (destructive, two-phase) |
| `walls_selection` | Walls (destructive, two-phase) |
| `move_selection` | Move (destructive, two-phase) |

### 5.5 History/export tools

| Tool | Description |
|---|---|
| `undo` | Undo last command |
| `redo` | Redo |
| `export_schematic` | Export to file (writes to approved workspace) |
- `get_operation_diff` | Diff between two revisions (block-level changes) |

**Operation diff vs revision diff:**
- Operation diff: changes made by a single command (placement-level + block-level).
- Revision diff: changes between any two project revisions (may span multiple commands).
- `get_operation_diff` returns the diff for a specific command (by command ID).
- For revision-level diff, use `get_history` + compare placement/chunk state between revisions.
| `set_color_mode` | Set conflict overlay mode |

All tools call the same domain queries and commands as the UI. No separate MCP-only operation implementations.

---

### 6. Destructive operation protocol

**Operations requiring confirmation (two-phase dry-run + apply):**
- `delete_placement`, `bake_placements`
- `fill_selection`, `replace_selection`, `delete_selection`
- `cut_selection`, `hollow_selection`, `walls_selection`, `move_selection`
- `export_schematic` (large exports)

**Operations executing immediately (no confirmation):**
- `transform_placement`, `transform_placements`
- `set_placement_visibility`, `set_placement_lock`
- `rename_placement`, `duplicate_placement`
- `set_origin`, `create_selection`, `clear_selection`, `select_placements`
- `copy_selection`, `paste_clipboard`
- `undo`, `redo`, `set_color_mode`

Destructive operations default to dry-run:

1. **Dry-run call** (default): returns `DryRunResult` with affected placements, bounds, cell/block counts, conflict impact, estimated memory/undo bytes, warnings, and a short-lived `confirmationToken`.
2. **Apply call**: must submit the `confirmationToken` + `expectedRevision`. Token is invalid after revision change or expiry.
3. Non-destructive mutations still require `expectedRevision` and `requestId`.
4. Duplicate `requestId` calls return original result without reapplying.
5. `maxBlocksPerCall` enforced: default 250,000 changed cells. Read operations use pagination/limits too.
6. Rejected operations return machine-readable error code, message, current revision, suggested next action.

---

## 7. Export through MCP

- Do not return huge base64 schematic blobs in normal tool results.
- Write exports only inside configured approved workspace, returning safe relative path or artifact handle.
- For non-file environments, use bounded resource/artifact mechanism; if unavailable, refuse large exports with actionable response.
- Report export validation and fidelity diagnostics.

---

## 8. Frontend interactions

### 8.1 Pairing UI

- User generates pairing token via button in editor settings.
- Token displayed in dialog with copy button.
- 5-minute countdown shown.
- One-time use: after successful connection, token invalidated.
- Browser requests pairing before attaching to local project.

### 8.2 Agent Log panel

- Show timestamp, tool, sanitized inputs, project revision, result summary, changed block count, warnings, duration.
- One-click Undo control shown only when operation has valid undo entry, project revision still permits it, AND the associated operation is the latest undoable action (no newer commands committed since).
- Keep bounded log (max 10,000 entries, 50 MiB); allow export/copy of sanitized log.
- Bounded serialization: Agent Log entries serialized incrementally; no full-log intermediate buffer.
- Malicious metadata protection: sanitize all imported file metadata (filenames, region names, NBT strings) before display; treat as data, not instructions. Redact paths, usernames, and any content matching secret patterns.
- Show connection status (connected/disconnected/pairing).

---

## 9. Failure handling

| Condition | Handling |
|---|---|
| Invalid/expired pairing token | Reject connection; show "Generate new token" prompt. |
| Stale `expectedRevision` | Reject with current revision and suggested action. |
| Expired confirmation token | Reject; require new dry-run. |
| Duplicate requestId with different args | Reject with `IDEMPOTENCY_ARGS_MISMATCH`. |
| Over-limit operation | Reject; suggest dry-run with explicit limit increase. |
| Locked placement in target | Reject; list locked placements. |
| Path traversal attempt | Reject; log security warning. |
| DNS rebinding attempt | Reject; log security warning. |
| Worker crash during operation | Discard partial result; main thread unchanged. |
| Browser disconnect during operation | Operation continues if already committed; partial results discarded. |

---

## 10. Tests and acceptance criteria

### 10.1 MCP tests

- End-to-end local companion sessions.
- Same command produces same result through UI and MCP.
- Stale revision, duplicate request ID, expired confirmation token, invalid token, locked placement, over-limit operation, cancellation, malformed input.
- Agent Log sanitization and undo action validity.
- Path sandboxing and loopback/origin restrictions.
- Pairing token: 256-bit, 5-min TTL, one-time use.
- Idempotency: 15-min retention, 1000 entries, 50 MiB.
- Health endpoint: /healthz, /readyz, /metrics.

### 10.2 Acceptance criteria for SUBSPEC-F (revised)

1. Local companion is authority for live connected document session.
2. Browser connects over localhost with short-lived pairing token (256-bit, 5-min TTL, one-time use).
3. MCP and UI send commands to same in-process command bus.
4. Companion emits document revision events to UI.
5. All mutating tools accept `MutationEnvelope` with `expectedRevision`, `requestId`.
6. Destructive operations default to dry-run with confirmation token.
7. Confirmation token: 60s TTL, one-time use, bound to project + revision + operation + args.
8. `maxBlocksPerCall`: 250,000 default changed cells, 1,000,000 configurable, 5,000,000 absolute.
9. Duplicate `requestId` returns original result without reapplying (idempotency ordering: auth → identity → cache check → revision check).
10. Idempotency results persisted atomically with successful document commits.
11. Agent Log sanitizes tokens, paths, usernames, secrets, raw NBT, raw file contents.
12. Path sandboxing: approved directories only, symlink resolution, traversal blocked, atomic writes.
13. Loopback-only binding, exact origin allowlist, DNS rebinding protection, Chrome PNA validation.
14. Same command produces same result through UI and MCP.
15. Browser and MCP use same command/query implementation.
16. Single document authority: browser-live mode or headless local-file mode; no split-brain.
17. Pairing token: plaintext never stored; only SHA-256 hash persisted; revocation, expiry, idle timeout.
18. Never expose pairing tokens in URLs or logs.
19. Candidate-cell, runtime, memory limits alongside changed-block limits.
20. Complete Zod input/output schemas for every MCP tool.
21. Operation diff (single command) vs revision diff (between revisions) clarified.
22. Operations classified: confirmation-required (destructive) vs immediate (non-destructive).
23. One-click undo available only when associated operation is latest undoable action.
24. Bounded Agent Log serialization (10,000 entries, 50 MiB); malicious metadata protection.
25. Chrome PNA, CORS, preflight, WebSocket, production-origin validated in Phase 0.

---

**Next:** SUBSPEC-G (UI & Interaction) will follow once Subspec F is accepted.