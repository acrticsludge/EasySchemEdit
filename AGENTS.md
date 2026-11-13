# AGENTS.md — EasySchemEdit

Instructions for AI coding agents (Claude Code, Antigravity, Cursor, Codex, etc.) working in this repo.
`CLAUDE.md` imports this file; edit **this** file only.

---

## 1. Model & delegation policy (MANDATORY)

| Work type | Model | Who does it |
|---|---|---|
| Specs (`docs/specs/**`), plans (`docs/plans/**`), research decisions, architecture, slice breakdowns | **Claude Opus 5.5 or Gemini 4 Argon (High)** | Main/orchestrator agent |
| Audits, format/math correctness review, security review, final review of subagent output | **Claude Opus 5.5 or Gemini 4 Argon (High)** | Main/orchestrator agent |
| Implementation (writing code, tests, refactors, config, boilerplate, docs formatting) | **Cheap/fast model** (e.g. Haiku, Gemini Flash / Flash-Lite, GPT mini) | **Always a subagent** |

Rules:
- **Never use the orchestrator model (Opus 5.5 / Gemini 4 Argon) to write implementation code directly.** The orchestrator specs/plans, then delegates each slice to a cheap subagent.
- **Never use a cheap model for specing or planning.** If no Opus 5.5 or Gemini 4 Argon (High) is available for a spec/plan task, stop and ask the user.
- One subagent per slice (or per independent file set). Run independent slices in parallel.
- Every subagent brief follows the **Prompt Pyramid** (§2) and names exact files, acceptance checks, and the test command to run.
- The orchestrator **re-checks every subagent result** before accepting it: read the diff, run typecheck + the relevant tests, and spot-check at least 30% of claims against sources (per `docs/goal/GOAL.md`). Format/math/security-sensitive code (NBT, Litematica bit-packing, rotations/mirrors, MCP auth tokens) gets a full Opus review.

## 2. Prompt Pyramid (every plan, brief, and task)

From `docs/goal/GOAL.md`:
1. **GOAL** in one sentence
2. **CONSTRAINTS** and non-goals
3. **INPUTS** — exact files / spec sections
4. **STEPS**
5. **OUTPUT FORMAT** and acceptance check (command + expected result)
6. Background last

Never start a task without layers 1–5 written down.

## 3. Non-negotiable rules (from `docs/goal/GOAL.md`)

- **No hallucination.** Every technical claim (format fields, APIs, Minecraft data) needs a primary source: spec files, official docs, pinned source code, or a real fixture. If you can't verify it, log it in `docs/agent/DOUBTS.md` as `UNVERIFIED` with your best guess.
- **Never write "verified/tested"** unless you ran the check and saw it pass. Paste the command and its result into `docs/agent/progress.md`.
- **Never generate synthetic fixtures and label them real.** Tests that need missing fixtures are marked `BLOCKED (awaiting fixture)`, never green.
- Don't delete or rename existing plan content as a "fix"; edit in place. Slice names describe deliverables, never fixes.
- Before any change, record branch, commit, `git status --short`, and baseline build/test results in `docs/agent/baseline.md`.
- **Never stage or commit pre-existing user changes.** Stage only your own files by explicit path (no `git add .` / `-A`).
- Keep chunk concepts separate: 16×16 MC world columns, 16-high sections, 16³ domain/storage chunks, placement-local RenderChunks, world-space spatial index.

## 4. Project overview

A web-based Minecraft schematic editor. It combines Litematica-style multi-placement composition with WorldEdit-style region operations. Target: **Minecraft Java 1.21.11** assets.

pnpm monorepo (`pnpm@9`, Node 24, TypeScript 5.6, ESM, `allowImportingTsExtensions` + `noEmit`):

| Path | Role |
|---|---|
| `packages/domain` | Core model: coords, NBT codec, `ChunkedVoxelVolume` (16³ sparse chunks), placements. **Sources at package root, not `src/`.** |
| `packages/formats` | Sponge v2/v3, Litematica, legacy `.schematic`, vanilla structure `.nbt`. **Sources at package root.** |
| `packages/operations` | Selection, region ops (fill/replace/walls/hollow), transforms, clipboard, conflicts, command bus |
| `packages/persistence` | IndexedDB project store, `.vxproj` archives, delta undo/redo (`history.ts`), autosave |
| `packages/renderer` | Chunk meshing, face culling, texture atlas, pack resolution (renderer-agnostic) |
| `packages/ui` | Headless UI controllers (layout, outliner, inspector, shortcuts, a11y) |
| `packages/workers` | Worker message protocol (mostly stubs) |
| `packages/asset-pipeline` | Mojang manifest/JAR download, SHA-1 verify, asset extraction |
| `apps/web` | Astro 5 + React 19 + Three.js editor, deployed to Cloudflare Workers Static Assets |
| `apps/mcp-companion` | Local MCP server (stdio) + HTTP/WS bridge on `127.0.0.1:43127`, two-phase HMAC confirm for destructive ops |

Source of truth for docs:
- `docs/goal/GOAL.md` — goals, rules, phases
- `docs/specs/SPEC.updated.md`, `docs/specs/subs/SUBSPEC-A..H_*.md` — specs
- `docs/plans/subplan-*/` — slice plans (`index.md` + `slice-*.md`)
- `docs/audits/` — audit rounds
- `docs/agent/` — `progress.md`, `DOUBTS.md`, `baseline.md`, `repo-state.md`

## 5. Commands

```powershell
pnpm install                                   # install
pnpm typecheck                                 # NOTE: only covers some packages (see §7)
pnpm --filter @easyschemedit/<pkg> exec tsc --noEmit   # typecheck one package

# Tests: plain TS scripts with custom assert(), no Jest/Vitest.
# Run each file directly (root `pnpm test` is broken, see §7):
node --experimental-strip-types packages/domain/__tests__/slice-0.test.ts

pnpm --filter @easyschemedit/web dev           # web dev server
pnpm --filter @easyschemedit/web build         # static build
```

Package names are `@easyschemedit/<folder>` (web: `@easyschemedit/web`, MCP: `@easyschemedit/mcp-companion`).

## 6. Conventions

- Pure TypeScript in `packages/*`. **No DOM, React, or Three.js imports in packages** (renderer stays engine-agnostic). Browser/Three.js code goes in `apps/web` only.
- Import sibling sources with explicit `.ts` extensions.
- Tests live in `<pkg>/__tests__/`, named after their slice (`slice-<letter>-<n>.test.ts`). Each slice delivers code and its test together.
- Apps must consume the packages (`@easyschemedit/formats`, `renderer`, `persistence`, `operations`) instead of re-implementing logic.
- Destructive MCP operations must keep the dry-run → token → execute protocol.
- No linter/formatter is configured. Match the surrounding style (2-space indent, single quotes, semicolons).
- Commit style: Conventional Commits, scoped by package (`feat(web): ...`, `fix(formats): ...`).

## 7. Known issues (audit 2026-11-13). Don't trip over them.

- `apps/web/src/islands/EditorIsland.tsx` is a monolithic prototype: one Three.js mesh per block, its own undo stack, and raw IndexedDB writes. It bypasses `renderer`, `persistence`, and `operations`.
- `apps/web/src/workers/parse-worker.ts` decodes Litematica `BlockStates` as varints (wrong; they are bit-packed longs). Its gzip function is a no-op and block colours are hashed from names. Use `@easyschemedit/formats` instead.
- `apps/web/astro.config.mjs:21` aliases `packages/domain/src/index.ts`, which doesn't exist (real path: `packages/domain/index.ts`).
- `apps/web/.astro/` is committed and not gitignored. This can make the build fail with `EPERM` on Windows.
- Root `pnpm test` uses `npx tsx` (not installed) plus a glob that Windows won't expand. Run tests with `node --experimental-strip-types` instead.
- Root `typecheck` and CI skip `operations`, `renderer`, `mcp-companion`, and `web`. Typecheck those packages manually.
- `packages/formats/index.ts` only exports detection, not the format adapters.
- MCP stdio handlers in `apps/mcp-companion/src/server.ts` are stubs and aren't registered.
- No tests for `apps/web`, `packages/workers`, or `packages/asset-pipeline`.
