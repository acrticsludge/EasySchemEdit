# EasySchemEdit

A high-performance web-based Minecraft Java 1.21.11 schematic editor combining Litematica-style multi-placement composition with WorldEdit-style region operations and a local MCP AI companion.

---

## Architecture & Monorepo Packages

EasySchemEdit is built as a pure TypeScript pnpm monorepo (`pnpm@9`, Node 24, TypeScript 5.6, ESM):

| Package / App | Path | Role |
|---|---|---|
| `@easyschemedit/domain` | `packages/domain` | Core model: coords, NBT codec, `ChunkedVoxelVolume` (16³ sparse chunks), placements |
| `@easyschemedit/formats` | `packages/formats` | Sponge v2/v3, Litematica, legacy `.schematic`, vanilla structure `.nbt` |
| `@easyschemedit/operations` | `packages/operations` | Selection, region ops (fill/replace/walls/hollow), transforms, clipboard, command bus |
| `@easyschemedit/persistence` | `packages/persistence` | IndexedDB project store, `.vxproj` archives, delta undo/redo (`history.ts`), autosave |
| `@easyschemedit/renderer` | `packages/renderer` | Chunk meshing, face culling, texture atlas, pack resolution (renderer-agnostic) |
| `@easyschemedit/ui` | `packages/ui` | Headless UI controllers (layout, outliner, inspector, shortcuts, a11y) |
| `@easyschemedit/workers` | `packages/workers` | Worker message protocol stubs |
| `@easyschemedit/asset-pipeline` | `packages/asset-pipeline` | Mojang manifest/JAR download, SHA-1 verify, asset extraction |
| `apps/web` | `apps/web` | Astro 5 + React 19 + Three.js editor, deployed to Cloudflare Workers Static Assets |
| `apps/mcp-companion` | `apps/mcp-companion` | Local MCP server (stdio) + HTTP/WS bridge (`127.0.0.1:43127`), two-phase HMAC confirm |

---

## Quickstart Commands

```powershell
pnpm install                                   # Install dependencies
pnpm typecheck                                 # Typecheck packages
node --experimental-strip-types packages/domain/__tests__/slice-0.test.ts  # Run tests
pnpm --filter @easyschemedit/web dev           # Start web dev server
pnpm --filter @easyschemedit/web build         # Build static web assets
```

---

## Asset Loading & Formats

- **Asset Loading**: Automatic first-run download of official Minecraft 1.21.11 client JAR from Mojang with SHA-1 verification + IndexedDB caching, manual JAR drop-zone fallback, resource pack `.zip` layering.
- **Supported Formats**: Sponge `.schem` v2/v3, Litematica `.litematic`, Vanilla structure `.nbt`, project archive `.vxproj`, and structured diagnostic rejection of legacy `.schematic`.

---

## Local MCP AI Companion

- **Endpoint**: `127.0.0.1:43127`
- **Security**: One-time pairing token, two-phase `dryRun` -> `confirmationToken` -> `apply` safety protocol for destructive operations, Agent Log undo rule.

---

## Real Fixtures

See [fixtures/real/README.md](fixtures/real/README.md) for benchmark and test fixture details.
