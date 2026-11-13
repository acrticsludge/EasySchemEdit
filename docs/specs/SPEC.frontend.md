# Frontend Implementation Spec

## Goal
Make EasySchemEdit usable: upload a .schem/.litematic file, view it in 3D, edit placements, save/export.

## Architecture
- Astro static shell (already builds)
- React editor island (EditorIsland.tsx) — needs full implementation
- Three.js renderer for 3D viewport
- Domain layer integration via packages/domain, packages/formats
- IndexedDB for persistence
- Web Workers for heavy processing (NBT parsing, meshing)

## Phase 1: File upload + 3D view (MVP)
1. File upload (drag-and-drop + file picker)
2. Parse uploaded file using formats package
3. Create placement from parsed schematic
4. Render placement in Three.js viewport (chunked meshing)
5. Camera controls (orbit, pan, zoom)

## Phase 2: Editing tools
1. Selection (click to select placement, box select)
2. Move/rotate/mirror transforms
3. Region operations (fill, replace, delete, copy, paste)
4. Undo/redo

## Phase 3: Persistence + polish
1. IndexedDB save/load
2. Web Workers for parsing/meshing
3. Export to .schem/.litematic
4. MCP companion integration

## Constraints
- Zero-cost deployment (Cloudflare Workers static assets)
- No mandatory hosted services
- All editing client-side
- Pure domain packages stay pure (no Three.js/DOM imports)
