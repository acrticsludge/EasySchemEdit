# Skills / Tools / MCPs Inventory (GOAL.md §PHASE 0 step 3)

## Local skills available (hermes-agent skill ecosystem)
- `astyrix-astro-frontend` — Astro + Astryx UI builds
- `claude-code` / `codex` / `opencode` — delegate coding to external CLI agents
- `computer-use` — drive desktop background-first
- `hermes-agent` — use, configure, theme, extend, orchestrate Hermes Agent
- `mcp-server-patterns` — MCP servers: tools, resources, prompts
- `ponytail` / `ponytail-audit` / `ponytail-review` / `ponytail-debt` / `ponytail-gain` / `ponytail-help` — lazy senior dev mode, quality audits
- `spec-driven-development` — create specifications before coding
- `incremental-implementation` — deliver changes in thin vertical slices
- `verification-loop` — build, typecheck, lint, tests, security
- `context7-mcp` — fetch current library docs
- `source-driven-development` — ground implementation decisions in official documentation
- `debugging-and-error-recovery` — systematic root-cause debugging
- `code-review-and-quality` — multi-axis code review
- `test-driven-development` — TDD enforcement

## MCP servers
- `mcp__astryx__get`, `mcp__astryx__search` — Astryx design system
- `mcp__better_auth__get_doc`, `mcp__better_auth__search_docs` — Better Auth docs
- `mcp__cloudflare_docs__*` — Cloudflare documentation
- `mcp__design_systems__*` — design system extraction/validation
- `mcp__neon__*` — Neon Postgres database operations
- `mcp__playwright__*` — Playwright browser automation
- `mcp__supabase__*` — Supabase project/database operations
- `mcp__Framelink_Figma_MCP__download_figma_images`, `mcp__Framelink_Figma_MCP__get_figma_data` — Figma integration
- `browserpaw` (53 tools) — Chrome automation, CDP, network capture
- `chrome-devtools` (33 tools) — Chrome DevTools Protocol
- `vercel` (252 tools) — Vercel platform
- `desktop_ui` (8 tools) — Hermes desktop UI preview/theme

## Deferred tools (call via tool_search/tool_describe/tool_call)
- `mcp__astro__search_astro_docs` — Astro documentation
- `cronjob_manage`, `session_search`, `process_manage`, `todo_list` — agent infrastructure
- `manage_catalog`, `computer_use` — catalog and desktop driving

## Subagent models
- Beam-free and iceman-contributor-free cheap models for discovery/boilerplate only (per GOAL.md SUBAGENT POLICY). Never for format/math correctness, architecture, audits, security or final review.

## Notes
- Zero framework/browser/Node/Three.js/MCP imports in `packages/domain` or `packages/formats`.
- Compression (fflate) injected via `NbtServices` interface, not direct imports.
