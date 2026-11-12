# Subspec H — Slice h-6: Web Workers Setup

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.3 (Background work), §5 (Worker responsibilities), H12 (Web Workers for heavy processing)
**Constraint:** Worker code imports same pure domain/command modules. Typed messages and transferable buffers only — no arbitrary class instances.

## Goal

Create Web Worker entry points for heavy processing: parsing, meshing, conflict indexing, operations, export. Typed messages with transferable buffers. Cancellation support via explicit cancel messages (AbortController cannot cross postMessage).

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `packages/workers/package.json` | create | No runtime deps, devDeps for TS |
| `packages/workers/tsconfig.json` | create | TypeScript config |
| `packages/workers/src/worker-protocol.ts` | create | Typed worker message types (request/result/cancel/progress) |
| `packages/workers/src/parse-worker.ts` | create | NBT parsing worker — receives bytes, returns parsed structure |
| `packages/workers/src/export-worker.ts` | create | Export worker — receives project snapshot, returns serialized archive |
| `packages/workers/src/index.ts` | create | Public API |

## Types / APIs

No domain imports — workers receive serialized data (ArrayBuffers, plain objects), not domain class instances.

Key types:
- `WorkerMessage<T>`: `{ requestId, type, payload, transfers? }`
- `WorkerResult<T>`: `{ requestId, type: 'result'|'progress'|'cancelled'|'error', payload? }`
- Cancellation: explicit `{type: 'cancel', requestId}` message (not AbortController)

## Acceptance criteria

1. `pnpm exec tsc --noEmit` passes for `packages/workers`
2. Worker message types defined with transferable buffer support
3. Parse worker: receives Uint8Array bytes (transferable), returns parsed NBT structure
4. Export worker: receives serialized project, returns serialized archive bytes
5. Cancellation protocol: cancel message stops processing, returns `cancelled` result
6. `packages/domain`, `packages/formats`, `packages/asset-pipeline`, `packages/persistence` still compile clean

## Tests

No new test file. Worker code requires browser/Worker environment; verification via tsc.

## Verification

- `pnpm install` (workspace picks up `packages/workers`)
- `cd packages/workers && pnpm exec tsc --noEmit` exit code 0
- All 35 existing tests pass
