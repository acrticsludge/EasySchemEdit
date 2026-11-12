# SPEC.md — Web Schematic Editor

> A browser-based Minecraft schematic composition and editing tool. It combines Litematica-style independent placements with WorldEdit-style region operations. A headless TypeScript core powers the web editor and a local MCP server.

**Version:** 0.2 (reviewed planning baseline)  
**Status:** Build planning — Phase 0 must pass before feature implementation  
**Supersedes:** SPEC.md v0.1  
**Primary target:** Minecraft Java Edition 1.21.11 vanilla assets, with versioned resource-pack support  
**Document intent:** This is an implementation contract, not a promise that every feature ships in the first milestone.

---

## 0. Executive decisions

This revision resolves the specification's main contradictions and adds the missing engineering contracts. The most important decisions are:

1. **The core document is not a Three.js scene.** It is a pure TypeScript voxel/document model. UI, format readers/writers, rendering, persistence, and MCP are adapters around it.
2. **A schematic file is not always one placement.** A Sponge `.schem` imports as one region placement. A multi-region `.litematic` imports as one import group containing one placement per Litematica region, preserving each region's relative position and name.
3. **The canonical volume is sparse and chunked.** A single dense `Uint16Array` per placement is not an acceptable representation for large or sparse builds. Chunk storage uses adaptive palette indices and omits all-air chunks.
4. **Position means the world-space location of the placement's origin pivot.** Every transform rotates/mirrors around that pivot. The old rules saying both “rotate around volume center” and “rotate around origin” are removed.
5. **Block geometry transforms and block-state transforms are separate.** Rotating a placement in the viewport does not mutate its local data. Bake/export must transform directional block states through a versioned state-transform registry; unsupported states produce explicit warnings.
6. **Lossless means semantic preservation, not byte-for-byte identical compressed files.** The editor must preserve supported block data and ancillary NBT, report unsupported/unknown data, and never silently claim data fidelity it cannot provide.
7. **Lodestone is an evaluated rendering dependency, not the domain engine or canonical parser.** Its public README advertises chunked meshing and Litematic support, but its convenience loader loads the first region by default. Compatibility with Minecraft 1.21.11 models and assets must be proven in Phase 0.
8. **No arbitrary 10-million-block timing promise.** Performance is measured on declared reference machines and representative fixtures. Large files load progressively; the engine must not allocate a full world-space bounding box for sparse scenes.
9. **Undo is transactional and chunk-delta based.** The original `Patch[]` type was undefined and could duplicate huge buffers. Commands now record bounded, reversible document deltas with memory accounting.
10. **MCP live editing requires a local session bridge.** A browser cannot share in-memory state with a separate stdio MCP process. The local companion owns the document session and relays commands/events to both MCP and the browser. Remote HTTP MCP hosting is deferred.
11. **Destructive MCP calls are two-phase.** Dry-run produces a revision-bound confirmation token; the actual operation must present that token and the expected document revision.
12. **Minecraft 1.21.11 assets are the default asset target, not an assumption about Lodestone's bundled pack.** Pin the resource version and validate the asset pipeline. Do not ship Mojang assets until their redistribution approach has been reviewed.

### Phase 0 is a hard gate

Before building the full UI, prove these five things with real files:

- Correct parsing and writing of `.schem` v3 and representative `.litematic` files, including multi-region and negative-size regions.
- Correct transform round-trips for all 90-degree rotations and mirrors, including origin mapping and common directional block states.
- A renderer can display Minecraft 1.21.11 block models/textures with correct opaque, cutout, translucent, and emissive behavior.
- A sparse 1M+ non-air-block fixture can be loaded, viewed, selected, and edited without materializing the entire scene as individual meshes or a giant dense union volume.
- Undo/redo, persistence, and MCP can call the same document command API without maintaining separate state models.

If any gate fails, revise the architecture or dependency choice before Phase 1. Do not paper over a failed gate with UI work.

---

## 1. Product definition

The editor lets a user:

- Import one or more `.schem` or `.litematic` files.
- Compose multiple independent placements in one scene.
- Move, rotate, mirror, hide, lock, rename, duplicate, and delete placements.
- Edit placement origins and use them as transform pivots and paste anchors.
- Create exact cuboid selections in world or placement scope.
- Run region operations such as fill, replace, delete, hollow, walls, copy, cut, paste, and move.
- See placement boundaries, selection boundaries, origins, and same-state/state-conflict overlaps.
- Inspect the material list and compare effective-composite counts with per-placement counts.
- Export one placement, a selection, or the effective composite to `.schem` v3 or `.litematic`.
- Save and reopen complete editor projects.
- Allow an AI agent to inspect and edit the same project through MCP, with dry-run and confirmation safeguards.

The product is a **headless document/voxel engine plus adapters**. It is not a full Minecraft client, world editor, server, or shader-pack runtime.

### 1.1 Goals

- Correct semantic block-state import/export for the supported format matrix.
- Preserve supported block entities, entities, biomes, metadata, and unknown NBT where safe.
- Support multi-region Litematica files without silently dropping regions.
- Make origins and transforms deterministic and testable.
- Keep source placements independently editable until the user bakes them.
- Provide understandable overlap and conflict diagnostics.
- Remain usable on large and sparse builds through chunked storage, chunk meshing, worker jobs, and progressive loading.
- Give the UI and MCP the same command/query API.
- Default to Minecraft Java 1.21.11 vanilla block assets, with user resource-pack overrides.
- Run the static editor on Cloudflare Pages; run local MCP/live-session bridging separately.

### 1.2 Non-goals for v1

- Multiplayer or concurrent collaborative editing.
- Editing `.mca` world/chunk files or connecting to a Minecraft server.
- Simulating redstone, fluids, physics, lighting updates, or game ticks.
- Full shader-pack/mod renderer parity.
- Full arbitrary modded block-model support without a matching resource pack.
- Reproducing every mod's custom block-entity behavior.
- Arbitrary-angle placement transforms. Placement transforms are limited to 90-degree Y rotations and X/Z mirrors in v1.
- Remote hosted MCP sessions or unauthenticated public MCP endpoints.
- Selective/non-linear undo.
- Sphere/cylinder/polygon selections, schematics diff/merge UI, and collaborative comments.

---

## 2. Scope and fidelity contract

The word **lossless** must not be used without specifying which layer is preserved.

### 2.1 Fidelity levels

| Level | Meaning | v1 contract |
|---|---|---|
| F0 — block-state fidelity | Every supported block position resolves to the same namespaced block ID and properties after import/export. | Required for supported formats and valid files. |
| F1 — ancillary-data fidelity | Block entities, entities, biomes, metadata, and supported tick data are retained and re-serialized. | Required for data types listed in the format support matrix. |
| F2 — transform fidelity | Ancillary data and block-state orientation remain semantically valid after move/rotate/mirror/copy/bake. | Required for explicitly supported handlers; otherwise warn and require confirmation before lossy export. |
| F3 — byte identity | The output compressed NBT bytes are identical to the input bytes. | Not promised. Compression, tag ordering, and normalized palette ordering may differ. |

### 2.2 Import/export report

Every import and export produces a structured report with:

- Detected format and version.
- Minecraft data version, where present.
- Dimensions, volume, non-air block count, palette size, region count, and file size.
- Imported/preserved counts for block entities, entities, biomes, and ticks.
- Unknown or unsupported tags and block states.
- Data that was normalized, dropped, or could not be transformed safely.
- Warnings and errors with stable codes, not only human-readable strings.

A warning must identify the affected data and the operation that caused the risk. “Some data may be lost” by itself is insufficient.

### 2.3 Strict and permissive modes

- **Strict export (default):** refuse to export if a known fidelity-breaking condition exists, unless the user explicitly acknowledges the listed loss.
- **Permissive export:** allow export but include a visible report of exactly which data was not preserved.
- Import must never silently discard unknown data. Preserve opaque NBT when safe, or report why it cannot be retained.

---

## 3. Supported file formats

### 3.1 v1 format matrix

| Format | Import | Export | v1 behavior |
|---|---:|---:|---|
| Sponge `.schem` v3 | Yes | Yes | One region. Gzip-compressed NBT. Preserve block palette/data, offset, metadata, block entities, 3D biomes, and entities where supported. |
| Litematica `.litematic` | Yes | Yes | Multiple named regions. Preserve region positions/sizes, palettes, block states, metadata, entities, block entities, and supported pending tick payloads. |
| Sponge `.schem` v2 | Yes, if fixture coverage passes | No in v1 | Read compatibility only; normalize into canonical model. |
| Legacy `.schematic` | No in v1 | No | Show a clear unsupported-format message; do not guess based on extension. |

Format detection uses file signatures/NBT structure, not only filename extensions. Extensions are still checked to catch misleading filenames.

### 3.2 Sponge `.schem` v3 constraints

- Read/write the official Sponge Schematic v3 NBT structure.
- Width, height, and length are unsigned 16-bit dimensions in the format; an export whose individual dimension exceeds `65535` must fail with a precise error.
- Block palette data uses VarInt-encoded palette indices and the specified index order: `x + z * Width + y * Width * Length`.
- Preserve `DataVersion`, metadata, `Offset`, block entities, entities, and biome palette/data when present.
- The format's `Offset` is a paste offset from the paste target to the first block. It is not a generic world transform matrix. With canonical local bounds starting at zero and the origin defined as a grid point, write `Offset = -origin` for an untransformed placement export.
- Gzip compression is required by the v3 format contract.

### 3.3 Litematica `.litematic` constraints

- Parse the root NBT document and every named entry in `Regions`.
- Preserve root metadata and per-region metadata/tags where supported.
- Each region has its own `Position`, signed `Size`, palette, packed `BlockStates`, and optional block entities/entities/pending ticks.
- Negative region dimensions are valid and must be normalized through an explicit signed-axis mapping, not treated as malformed positive dimensions.
- The file-level enclosure and origin must be retained separately from each region's local coordinate frame.
- A multi-region file imports as an **Import Group** with one editable placement per region. Each region's relative position is preserved. Users may move/rotate the group or individual placements.
- Exporting an unchanged imported group to `.litematic` should preserve the region structure. Exporting a composite scene may produce one region by default, with an optional multi-region export only when the editor can preserve region grouping without changing effective block results.
- Bit-packed `BlockStates` must be decoded according to the actual Litematica format/version. Do not copy an implementation that assumes one packing layout without validating files from multiple Litematica versions.

### 3.4 Format adapters

`packages/formats` owns:

- NBT parsing/writing, gzip, bounded decompression, and format detection.
- Sponge v2/v3 adapters.
- Litematica adapter, including multi-region and signed-size normalization.
- Block-state palette encode/decode.
- Block-entity/entity/biome/tick metadata adapters.
- Import/export reports and compatibility diagnostics.

Format code must not import Three.js, React, DOM APIs, or UI state. Format adapters consume/produce domain records and byte streams.

---

## 4. Domain glossary and coordinate conventions

| Term | Definition |
|---|---|
| Block state | Namespaced block ID plus canonical property map, e.g. `minecraft:oak_stairs[facing=north,half=bottom]`. |
| Block entity | NBT payload associated with a block position, e.g. a sign or chest. |
| Entity | A world object with a fractional position and NBT payload, e.g. an armor stand. |
| Placement | An independently editable voxel volume plus world transform, origin, metadata, and visibility/lock state. |
| Import Group | A set of placements created from one source file, primarily for multi-region Litematica imports. |
| Composite scene | All visible placements evaluated in world coordinates. |
| Effective block | The winning block state at a world block position after overlap precedence is applied. |
| Conflict | Two or more non-air contributions occupy one world block position. |
| Bake | Destructively replace multiple placements with one placement representing their effective composite. |
| Grid point | An integer or half-integer point on the block lattice. Block positions identify unit cells; grid points identify cell corners/pivots. |
| Bounds | Half-open integer bounds `[min, maxExclusive)` internally. |

### 4.1 Coordinate spaces

- **Local block coordinates:** integer positions in a placement's normalized local volume, starting at `[0,0,0]`.
- **Local points:** grid points used for the origin and transform pivot.
- **World block coordinates:** integer block cells in the composite scene.
- **World points:** positions in the composite scene.
- **Selection bounds:** half-open world/local cuboids. UI numeric entry may display inclusive min/max values, but the core converts them to half-open bounds.
- **Source-format coordinates:** original region coordinates and offsets retained by format metadata for faithful export.

A block at `[x,y,z]` occupies `[x,x+1) × [y,y+1) × [z,z+1)`. Its center is `[x+0.5,y+0.5,z+0.5]`.

### 4.2 Bounds rules

- All internal bounds are half-open.
- `size = maxExclusive - min` on each axis.
- A selection that includes blocks from `min` through displayed inclusive `max` is converted to `[min, max + 1)`.
- Empty bounds have at least one dimension with `min >= maxExclusive` and are rejected by mutating operations.
- Negative world coordinates are valid.

---

## 5. Canonical data model

The project model is JSON-compatible at the metadata level. Large binary voxel chunks are stored as binary records, not base64-expanded JSON strings in memory.

### 5.1 Core types

```ts
type Vec3i = readonly [number, number, number];
type Vec3d = readonly [number, number, number];
type Bounds3i = { min: Vec3i; maxExclusive: Vec3i };

type BlockState = {
  id: string;                                  // namespaced resource location
  props: Readonly<Record<string, string>>;     // canonical sorted keys
};

type PaletteIndexArray = Uint8Array | Uint16Array | Uint32Array;

type VoxelChunk = {
  key: string;                                 // signed chunk coordinate key
  palette: BlockStateId[];                     // index 0 is canonical air
  indices: PaletteIndexArray;                  // fixed CHUNK_SIZE^3 entries
};

type ChunkedVoxelVolume = {
  bounds: Bounds3i;                            // local normalized bounds
  chunkSize: 16 | 32;                           // selected in Phase 0; one value per project
  chunks: Map<string, VoxelChunk>;              // all-air chunks omitted
  nonAirCount: number;
};

type Transform = {
  translation: Vec3d;                           // world position of the placement origin pivot
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';                   // applied in local space before Y rotation
};

type NbtValue =
  | { type: 'byte' | 'short' | 'int' | 'long' | 'float' | 'double'; value: number | bigint }
  | { type: 'string'; value: string }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'intArray'; value: Int32Array }
  | { type: 'longArray'; value: BigInt64Array }
  | { type: 'list'; elementType: string; value: NbtValue[] }
  | { type: 'compound'; value: Record<string, NbtValue> };

type PlacementAncillaryData = {
  blockEntities: Map<string, NbtValue>;         // local integer block position -> NBT compound
  entities: EntityRecord[];                    // fractional local position + opaque NBT
  biomes?: BiomeVolume;
  pendingBlockTicks?: NbtValue[];
  pendingFluidTicks?: NbtValue[];
  unknownTags: Record<string, NbtValue>;        // source tags not yet modeled
};

type Placement = {
  id: string;
  name: string;
  volume: ChunkedVoxelVolume;
  transform: Transform;
  origin: Vec3i;                                // local grid point; may be outside volume
  ancillary: PlacementAncillaryData;
  visible: boolean;
  locked: boolean;
  color?: string;
  createdAt: string;
  source: {
    format: 'schem-v2' | 'schem-v3' | 'litematic' | 'generated';
    filename?: string;
    regionName?: string;
    dataVersion?: number;
    formatVersion?: number;
    sourceGroupId?: string;
    rawMetadata?: NbtValue;
    diagnostics: Diagnostic[];
  };
};

type ImportGroup = {
  id: string;
  name: string;
  sourceFilename: string;
  placementIds: string[];
  sourceFormat: 'schem-v2' | 'schem-v3' | 'litematic';
  sourceMetadata?: NbtValue;
};

type Project = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: Placement[];
  importGroups: ImportGroup[];
  overlapPolicy: 'top-wins' | 'bottom-wins';
  conflictOverlay: 'off' | 'conflicts' | 'full';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
  revision: number;
};

type Selection =
  | { kind: 'placements'; placementIds: string[] }
  | { kind: 'cuboid'; id: string; bounds: Bounds3i; scope: 'world' | 'placement'; placementId?: string };
```

`BlockStateId`, `EntityRecord`, `BiomeVolume`, and `Diagnostic` are stable domain types defined in `packages/domain`. Any change to their serialized representation increments `schemaVersion` or adds a deterministic migration.

### 5.2 Storage decisions

- Do not store `Three.Object3D`, materials, textures, DOM nodes, WebGL handles, or workers in `Project`.
- Do not store one giant dense array for a placement or for the union of the scene.
- Use sparse chunks. A chunk stores a compact local palette and an adaptive index array; choose `Uint8Array`, `Uint16Array`, or `Uint32Array` based on palette size.
- Air-only chunks are omitted. The canonical air entry is reserved at palette index zero. Preserve source air-like block IDs when needed for fidelity, but treat known air-like states as non-owning for composite overlap resolution.
- Block-state identity is based on namespace ID plus sorted property key/value pairs. Equality must not rely on object reference equality or arbitrary JSON property order.
- `Project.placements` is the canonical bottom-to-top order. Reordering changes this array order; there is no second `zOrder` field that can disagree with it.
- The document's `revision` increments once for every committed transaction.
- The project model stores integer block geometry; entity positions and transform translations may be fractional where their formats require it.

### 5.3 Block-state validation

- Validate namespaced IDs and property value types at import boundaries.
- Do not reject unknown modded block IDs solely because the current asset pack lacks them.
- Unknown block states remain data; rendering uses a clear missing-model fallback and diagnostics.
- Unknown properties are preserved as strings. Property validation is against the selected Minecraft data version/resource pack, not hard-coded against the editor's current version.
- Canonicalization sorts property keys but must not rewrite valid values.

### 5.4 Ancillary data model

The original model had no place for block entities, entities, or biomes. This revision adds them as first-class sidecar data.

- Block entity coordinates are local block coordinates and move with their owning placement.
- Entity positions are fractional local coordinates. Preserve NBT payloads opaquely unless an explicit handler is available.
- Biomes use a format-aware volume representation. Sponge v3 biomes are 3D; do not model them as one biome per X/Z column.
- Pending ticks are retained as opaque records when supported by the source format. Editing or transforming them requires a registered coordinate/identity handler; otherwise report that exact tick semantics cannot be guaranteed.
- Unknown NBT tags are retained verbatim as typed NBT values when safe. The editor must not interpret arbitrary NBT text as instructions or executable content.

---

## 6. Architecture and repository layout

### 6.1 Technology baseline

- Language: TypeScript with strict type checking.
- Build: Vite static app, with a React UI unless the Phase 0 spike identifies a concrete reason to use a different UI layer.
- Rendering: Three.js through a renderer adapter. Lodestone is a candidate implementation to evaluate, not a required core dependency.
- State: a single document store/command bus. The UI may use a state library, but it must not become a second document model.
- Persistence: IndexedDB for browser project data and binary chunks.
- Background work: Web Workers for parsing, meshing, conflict indexing, operations, and export.
- MCP: `@modelcontextprotocol/sdk` with Zod input schemas in a local Node companion.
- WASM: not a v1 assumption. Add Rust/WASM only when profiling shows a measured bottleneck that TypeScript workers cannot meet.

Pin versions in the lockfile. No runtime use of unpinned `latest` CDN assets or dependencies.

### 6.2 Package layout

```text
/apps
  /editor                 # Vite + React browser application
  /mcp-local              # Node stdio MCP server + local session bridge
/packages
  /domain                 # pure types, invariants, coordinate math, selectors
  /commands               # transactional operations, patches, history
  /formats                # NBT, Sponge, Litematica import/export
  /render-contract        # renderer-independent scene/chunk interfaces
  /renderer-three         # Three.js/Lodestone adapter and overlays
  /resource-packs         # versioned vanilla and user pack loading
  /worker-protocol        # typed worker messages and cancellation
  /project-store          # IndexedDB and project archive persistence
  /mcp-contract           # shared schemas, query/mutation definitions
  /fixtures               # real and generated schematic fixtures
```

### 6.3 Dependency direction

```text
editor UI ──────┐
MCP adapter ─────┼──> command/query API ──> domain model
file adapters ──┘                           ↑
renderer adapter <── render snapshots ─────┘
project store ─────> serialized domain records / binary chunks
```

Rules:

- `domain` must not import framework, browser, Node, Three.js, or MCP packages.
- `commands` may depend on `domain`, never on UI or renderer packages.
- `formats` may depend on `domain`, never on renderer objects.
- `renderer-three` reads immutable snapshots and renderer deltas; it never mutates the Project directly.
- UI and MCP call the same commands/queries. They do not reimplement transform, overlap, selection, or material-list logic.
- Worker code imports the same pure domain/command modules. Worker boundaries carry typed messages and transferable buffers, not arbitrary class instances.

### 6.4 Renderer dependency decision

Evaluate Lodestone in Phase 0 against:

- Minecraft 1.21.11 blockstate/model JSON, including new model rotations and Z-axis dispatch behavior.
- Correct textures and missing-texture handling.
- Multipart states, model variants, rotations, UV lock, block culling, alpha cutout, translucency, and emissive blocks.
- A user resource pack overriding the vanilla pack.
- A multi-placement scene with independent transforms and visibility.
- Large chunked scenes and worker-compatible mesh generation.

Lodestone's public README advertises Litematic support, a built-in default pack, custom resource packs, chunked meshing, occlusion culling, transparency sorting, and emissive blocks. Its documented convenience loader loads the first Litematica region by default. Therefore:

- Do not use its `LitematicLoader` as the canonical multi-region importer.
- Do not assume its bundled default pack matches 1.21.11 without an asset-by-asset and model-format test.
- Do not let Lodestone's structure representation replace the canonical Project model.
- If Lodestone fails the 1.21.11 or transform tests, keep the adapter boundary and use its lower-level pieces only where validated, or implement a project-specific chunk mesher.

### 6.5 Command execution

All document mutation is performed as a transaction:

1. Validate command input against the current project revision.
2. Resolve target placements, lock state, selection, and bounds.
3. Run a dry computation or operation plan where required.
4. Execute in a worker for large operations.
5. Produce a validated document delta and diagnostics.
6. Commit atomically; increment revision once.
7. Emit a document-change event for UI, renderer, history, autosave, and MCP subscribers.

No mutation is partially committed. Cancellation before commit leaves the document unchanged.

---

## 7. Coordinate math and transforms

All coordinate conversions live in `packages/domain/coordinates.ts`. UI, renderer, MCP, format adapters, and commands must call these helpers rather than doing their own coordinate calculations.

### 7.1 Required functions

```ts
localPointToWorld(placement: Placement, localPoint: Vec3d): Vec3d;
worldPointToLocal(placement: Placement, worldPoint: Vec3d): Vec3d;
localBlockToWorld(placement: Placement, localBlock: Vec3i): Vec3i;
worldBlockToLocal(placement: Placement, worldBlock: Vec3i): Vec3i;
placementWorldBounds(placement: Placement): Bounds3i;
resolveEffectiveBlock(project: Project, worldBlock: Vec3i): EffectiveBlock | null;
resolveAllOwners(project: Project, worldBlock: Vec3i): OwnerContribution[];
```

### 7.2 Transform semantics

- `origin` is a local **grid point**, not a block center.
- Editing the origin defaults to **Keep blocks in place**: update `transform.translation` by the transform of `(newOrigin - oldOrigin)` so every block remains at the same world coordinate while the pivot marker moves. An explicit **Keep pivot fixed** option leaves translation unchanged and therefore moves the placement geometry relative to the pivot.
- `transform.translation` is the world-space grid point where `origin` is located.
- Mirror is applied in local space first; Y rotation is applied second.
- All v1 placement transforms preserve block-grid alignment.
- `localPointToWorld` is:
  `translation + rotateY(mirror(localPoint - origin), rotationY)`.
- To map a block, transform its center (`localBlock + [0.5,0.5,0.5]`), then derive the world cell from the transformed center. Do not transform only the integer minimum corner and forget the unit-cell offset.
- `worldPointToLocal` is the exact inverse matrix operation. `worldBlockToLocal` applies the inverse to the world block center, then floors with a documented floating-point epsilon.
- A placement's world-space pivot never moves merely because its local volume dimensions change. A transform operation changes translation/rotation/mirror according to the command's explicit pivot policy.

### 7.3 Origin behavior

| Operation | Local origin | World origin |
|---|---|---|
| Move placement | Unchanged | Moves by delta |
| Rotate placement | Unchanged | Remains the pivot point |
| Mirror placement | Unchanged | Remains the pivot point |
| Duplicate | Copied | Copied plus duplicate offset |
| Edit origin (default: keep blocks in place) | Changes | Moves to the world point previously occupied by the new local origin; translation is adjusted so block geometry does not jump |
| Edit origin (keep pivot fixed option) | Changes | Remains fixed; the placement's blocks shift relative to that pivot |
| Bake | Chosen/converted into merged local frame | Preserved as the selected bake pivot |

This resolves the v0.1 contradiction that said a placement rotates around its volume center in one section and its origin in another. **The origin pivot is authoritative in v1.**

### 7.4 Group transforms

- A group transform applies one world-space matrix to each placement's origin point and composes its Y rotation/mirror state.
- Default group pivot is the center of the selected placements' union world bounds, represented as a world point. The pivot is shown before the user commits the transform.
- The user can move the group pivot numerically or snap it to a placement origin/selection corner.
- Group transforms are one compound undo transaction.
- Do not describe the pivot as “median origin”; use one deterministic formula.

### 7.5 Block-state orientation transforms

A placement transform changes rendered geometry but does not mutate local block states. Any operation that writes transformed blocks into a new local volume (bake, flatten, export of transformed placement) must call a `BlockStateTransformRegistry` keyed by Minecraft data version.

- Support common vanilla directional properties in v1: `facing`, `axis`, `rotation`, `hinge`, `orientation`, rail shape, stair shape where applicable, door/trapdoor orientation, and other state-specific transforms identified by fixture coverage.
- Transform handlers may also need to rotate/mirror block-entity NBT and entity yaw/rotation.
- Do not use generic string substitution for directional values.
- If no handler exists for a state, retain the state only when the operation does not bake its orientation into local coordinates. For bake/export, mark it as an unsupported transform and require strict-export acknowledgement or refuse in strict mode.

### 7.6 Transform test invariants

For every supported transform combination:

- Local point -> world point -> local point returns the original point within epsilon.
- Local block -> world block -> local block returns the original block.
- Placement world bounds contain every transformed occupied block.
- Rotation by 90 degrees four times returns the original orientation and coordinates.
- Mirror twice returns the original orientation and coordinates.
- Origin world position remains fixed through rotate/mirror around itself.
- Transform composition produces the same result as the corresponding sequential operations.

---

## 8. Project, import, and persistence features

### 8.1 Project operations

- Create a blank project.
- Import one or more supported files through drag/drop or file picker.
- Show import queue and per-file/per-region progress, cancellation, and diagnostics.
- Save/open/duplicate/rename/delete projects.
- Export a portable project archive.
- Recover an autosaved project after tab crash/reload.

### 8.2 Import behavior

- `.schem` creates one placement.
- `.litematic` creates one Import Group and one placement per region.
- Import groups can be expanded/collapsed, selected as a group, hidden/shown as a group, and ungrouped without merging voxel data.
- For a non-empty project, default new import placement behavior is **Auto-arrange**: place the imported group to the right of the current scene bounds with a configurable gap. It must preserve relative region positions inside the group.
- Auto-arrange can be disabled, in which case the import is placed at its format-derived origin and possible overlap is reported before commit.
- Import must not auto-delete, overwrite, or bake an existing placement.
- User can choose to preserve source origin or normalize the imported group to origin `[0,0,0]` while preserving internal offsets.
- Import preview shows a simplified scene outline and estimated memory before commit.

### 8.3 File/project save formats

- Browser autosave uses IndexedDB object stores for project metadata, chunk binaries, ancillary NBT, and history records.
- Do not serialize large typed arrays as base64 strings in the active in-memory document.
- Portable project export uses a versioned archive (`.vxproj`): JSON manifest plus binary chunk/ancillary payloads. A JSON-only export may be offered for small diagnostic projects, not as the preferred large-project format.
- Every project archive contains `schemaVersion`, application version, asset profile reference, source metadata, and checksums for binary entries.
- Migrations are deterministic, tested, and never overwrite the only copy of an older project.
- Autosave runs after committed commands using a debounce and command-count threshold. It also flushes on page visibility change and before a controlled unload where supported. Do not promise that browser unload events always complete.
- Show dirty/saving/saved/error state. Storage quota failure must be visible and must never silently drop the previous save.
- Offer “Download backup” and “Open recovered version” after recovery.

### 8.4 Storage lifecycle

- IndexedDB quota is browser-controlled and may be lower than available disk space.
- Estimate usage before importing very large files and after large operations.
- Warn before an operation whose estimated undo/history + project storage would exceed the configurable storage budget.
- Allow the user to clear old history entries without deleting project data.
- Do not use localStorage for schematic data.

---

## 9. Placement management

Each placement supports:

- Select by viewport click or outliner.
- Multi-select by Shift/Ctrl/Cmd-click and outliner range selection.
- Rename.
- Show/hide.
- Lock/unlock.
- Duplicate with configurable offset.
- Delete.
- Reorder in the outliner; order determines top/bottom precedence only.
- Move with gizmo or numeric translation.
- Rotate by 90-degree Y increments.
- Mirror across local X or Z.
- Edit origin.
- Focus camera on placement.
- Show dimensions, non-air count, palette size, source file/region, transform, origin, block entities/entities counts, and overlap statistics.
- Export placement.

Lock semantics:

- Locked placements cannot be transformed, edited by region operations, deleted, duplicated, baked, or have origins changed.
- Read-only operations and export remain allowed.
- Mixed selection mutations skip no locked items silently. Show the locked placements and require the user to remove them from the operation or explicitly unlock them.
- Hide/show is allowed while locked; it is a visibility property, not geometry editing.

Outliner order is explicit: index zero is bottom; the last item is top. For `top-wins`, the last visible owner in outliner order wins. This rule is independent of import time.

---

## 10. Selection system

### 10.1 Selection kinds

- Placement selection: one or more placement IDs.
- Cuboid selection: half-open `Bounds3i`, in world or one placement's local coordinates.
- Only one active cuboid exists in v1. Placement multi-selection may coexist as a separate UI selection state.

### 10.2 Selection creation and editing

- Placement click selects placement; Shift/Ctrl/Cmd click modifies placement selection.
- Region mode: first click sets anchor; pointer movement previews a box; second click confirms. Escape cancels the in-progress box.
- Numeric entry accepts exact inclusive min/max values and converts max to half-open internally.
- Corner/edge handles resize the selection.
- Expand/shrink by one block along chosen axes or all axes.
- Select all placements; clear current selection.
- Selection survives tool changes. Deleting a referenced placement clears or repairs it and is undoable.
- Selection is editor-session state, not document content. History snapshots the selection before/after a command when needed to restore expected UI state.
- Selection overlays do not mutate the voxel document.

### 10.3 Region operation targeting

The v0.1 rule “operate per placement” was underspecified around air, gaps, and overlaps. v1 defines two explicit modes:

**Source placements mode (default for edits):**

- Apply the operation independently to every editable placement intersecting the selection.
- The operation affects the intersection of the cuboid with each placement's transformed bounds, including explicit air cells within that placement's bounds.
- Positions outside every placement's bounds remain untouched; a gap between two placements is not implicitly filled.
- At overlapping positions, each included source placement is modified independently.
- Hidden placements are excluded by default and listed in the operation preview. The user may opt to include them.
- Locked placements are not modified; the operation is blocked until the target is corrected.

**New result placement mode:**

- Evaluate the effective composite in the selected cuboid and write the operation result into a new placement.
- This mode may fill gaps inside the selection because the new volume is explicitly the selected cuboid.
- Existing source placements are not modified.
- This is the recommended safe mode for composite-level edits and AI-assisted generation.

The mode must be visible in the inspector and operation preview. No operation may silently switch modes.

### 10.4 Selection visuals

- One white screen-space wireframe around the world cuboid.
- Very subtle face tint that does not hide underlying textures.
- Corner and edge handles when the selection is editable.
- Dimension label: width × height × depth and total selected volume.
- During region drag, show a live preview from the first corner to the pointer's snapped block coordinate.
- Placement selection shows individual selected placement borders plus a group union bounds indicator.

---

## 11. Editing tools and exact semantics

Every mutation dispatches a command through the transaction/history system. All operation previews show target mode, affected placements, bounds, non-air blocks changed, total cells visited, and warnings.

### 11.1 Region tools

- **Fill:** write the selected block state to every cell in the operation target bounds. In Source placements mode, bounds are clipped to each placement's local bounds. In New result placement mode, the full cuboid is filled.
- **Replace:** replace matching block states with a target state. Matcher supports exact state equality and optional property-aware predicates (e.g. block ID only, block ID + selected properties). Default is exact state match.
- **Delete:** set target cells to canonical air. Remove block entities whose owning block is deleted. Entity deletion is not implied; entities are handled by a separate option.
- **Copy:** copy the effective composite inside the selection to a session clipboard, including supported block entities, entities, biomes, and source origin metadata.
- **Cut:** copy the effective composite, then clear the contributing source blocks. When overlapping owners exist, preview which owners will be changed; default cut removes all source contributions inside the target selection so hidden overlaps do not reappear unexpectedly.
- **Paste:** create a new placement by default. Its origin is positioned at the paste target. “Paste into active placement” is a separate explicit option.
- **Hollow:** keep a one-block-thick shell on all six faces of the target volume and set interior cells to air. The exact operation bounds and treatment of air cells are shown in preview.
- **Walls:** keep the four vertical side faces and set non-wall interior cells to air; top and bottom are controlled by explicit checkboxes.
- **Move region:** one atomic copy + clear + paste. Destination overlap policy is previewed. If source and destination overlap, the source/destination cell sets are computed before mutation so order does not affect results.

### 11.2 Block properties

- Block picker supports searchable namespaced IDs.
- Property editor is generated from versioned block-state metadata when available.
- Unknown properties remain visible as raw key/value fields.
- Recently used blocks and a project-wide palette are available.
- Search results show missing texture/model diagnostics where applicable.

### 11.3 Placement tools

Move, rotate, mirror, duplicate, hide, lock, delete, rename, set origin, bake, and export. Every operation respects locked state and commits atomically.

### 11.4 Picker and brush

- Picker reads the effective rendered block under the cursor by default. Modifier-click can pick from a named placement.
- Brush paint/erase is a stretch feature for v1. If included, brush radius and shape (sphere/cube) must be specified and stroke edits must commit as one transaction when the pointer is released.

### 11.5 Block-entity behavior during edits

- Replacing/deleting a block removes attached block-entity data unless the target block type accepts the same block entity and a compatibility handler confirms it.
- Copy/paste remaps local coordinates and preserves NBT payloads.
- Bake resolves which source block entity survives using the same effective owner as the block state. Conflicting block entities generate a warning even if block states match.
- For unknown block-entity NBT fields, preserve payload opaquely; if a transform may change orientation-specific fields and no handler exists, warn and require strict-mode acknowledgement.

---

## 12. Conflict detection and overlap policy

### 12.1 Ownership semantics

At each world block position:

- Air-like contributions do not own the position.
- Every visible placement with a non-air-like block contributes one owner record containing placement ID, block state, z-order, and local coordinate.
- Hidden placements do not contribute to visible composite ownership or conflict colors.
- Locked placements still contribute; lock affects editing, not rendering.

### 12.2 Conflict categories

| Status | Condition | Default visual |
|---|---|---|
| Clean | Exactly one non-air owner | Subtle green in Full classification mode; no tint in Conflicts-only mode |
| Same-state overlap | Two or more owners and every owner has the same canonical block state | Yellow |
| State conflict | Two or more owners and at least two canonical block states differ | Red |

There is no fourth “orange” status. Three or more owners with the same state remain yellow; owner count is exposed in hover/details. A mixed group with two equal states and one different state is red.

### 12.3 Overlay modes

- **Off:** no conflict tint.
- **Conflicts (default):** tint same-state overlaps yellow and state conflicts red; clean blocks remain natural textures.
- **Full:** also show clean blocks with low-opacity green.

The overlay tints the material/fragment result rather than replacing the underlying texture. Colors must be color-blind-aware and accompanied by labels/icons/patterns in the conflict panel; color alone is not the only signal.

Suggested starting colors (must be validated on light/dark blocks):

| Status | Color | Starting opacity |
|---|---|---:|
| Clean | `#22C55E` | 0.12 |
| Same-state overlap | `#EAB308` | 0.42 |
| State conflict | `#EF4444` | 0.52 |

Do not add orange for multiplicity. Use a count indicator in the tooltip/inspector.

### 12.4 Overlap precedence

v1 supports two policies only:

- `top-wins` (default): last placement in outliner order wins.
- `bottom-wins`: first placement in outliner order wins.

Remove `newest-wins` and `oldest-wins` from v1. Import timestamp is not a reliable layer-ordering rule and the original schema did not contain the required stable creation metadata.

Precedence affects effective block resolution, copy of the effective composite, material list effective counts, bake, and export. It does **not** change conflict classification.

### 12.5 Conflict computation architecture

Do not scan every coordinate of a large scene-wide bounding cuboid.

- Maintain a spatial index of occupied placement chunks keyed by world chunk coordinate.
- Candidate overlap pairs are placements whose transformed bounds/chunk occupancy intersect.
- Compare only populated chunk intersections, using inverse transforms to read source chunk data.
- Cache owner/status data per world chunk and invalidate only chunks touched by a geometry/visibility/order/overlap-policy change.
- A placement move invalidates its old and new occupied world chunks plus overlap candidates, not the whole project's full bounding box.
- Large jobs run in a worker and are cancellable. UI may show “conflict map updating” while rendering the last committed map.
- A result is committed only if its input project revision still matches; stale worker results are discarded.

### 12.6 Conflict inspection

- Hover shows owner placements, each block state, effective winner, and owner count.
- Conflict panel lists red and yellow conflict regions, counts, and placement pairs.
- `detect_conflicts` and `get_conflict_map` MCP tools return bounded summaries with pagination/chunk filters; never return millions of block positions in one response.

---

## 13. Bake and composite operations

### 13.1 Bake behavior

Bake is an explicit destructive operation that replaces selected placements with one placement representing the effective composite of those placements.

1. Calculate the selected placements' union world bounds from their occupied/bounding extents.
2. Evaluate the effective block at each represented position using the current overlap policy.
3. Create one axis-aligned output volume. Empty gaps inside the resulting rectangular bounds are air.
4. Convert every winning source block state from its source local orientation into the baked world orientation using the BlockStateTransformRegistry.
5. Transfer supported block entities/entities/biomes and reconcile conflicts.
6. Choose the merged origin and convert it to the baked placement's local frame.
7. Replace original placements with the new placement in one transaction.

Bake must not allocate the entire theoretical AABB if it is mostly empty. The result remains chunked and sparse. A configurable maximum output volume and maximum non-air block count protect memory. If the AABB is too large, show the estimated dimensions and require the user to split the bake or use a sparse multi-region export path.

### 13.2 Bake origin

The user must see and confirm one of:

- Primary placement origin (default if one primary placement exists).
- Merged minimum corner.
- Merged center-bottom.
- Merged center-center.
- Custom world grid point.

Primary placement rule:

- Context-menu bake: the context-menu target is primary.
- Multi-selection bake: last-clicked placement is primary.
- Bake-all: largest non-air placement is primary; show the choice.

The chosen world pivot is converted into the merged local coordinate frame. The new placement's `transform.translation` is set to that same world pivot. Do not automatically force `origin = [0,0,0]` unless the user chose the min-corner preset.

### 13.3 Bake edge cases

- Hidden placements are excluded by default and listed in preview. User may explicitly include them.
- Locked placements block the bake until unlocked or removed from the selection.
- Rotated/mirrored placements are baked into world orientation; directional block-state handlers must run.
- Unsupported state transforms cause strict bake to stop and show the states/counts. Permissive bake can proceed only after explicit acknowledgement and records diagnostics.
- Same-state overlaps do not create duplicate blocks in baked output.
- State conflicts use the project overlap policy and are counted in preview.
- Block-entity conflicts are resolved from the effective winning block owner; any payload mismatch is reported.
- Bake of fewer than two placements is rejected.
- Undo restores all original placements, transforms, origins, ancillary data, order, and relevant selection state.

---

## 14. Material list

Material list is derived from the domain query engine, not from the rendered mesh.

### 14.1 Modes

- **Effective (default):** count one winning non-air block per world position after overlap precedence.
- **Per-placement:** count every non-air block in each visible placement independently. This intentionally double-counts overlaps.

### 14.2 Filters and columns

- Filter by placement, import group, or active selection.
- Filter by block ID and block-state properties.
- Default sort is descending block count, with deterministic name/state tie-breaking.
- Columns: icon/texture, block state name, block count, stack count, shulker-box estimate, contributing placement IDs, conflict count.
- Effective mode identifies the winning placement for each counted state.
- Per-placement mode labels duplicated positions and shows overlap count.
- Export CSV.
- Stack and shulker estimates use Minecraft stack-size metadata where available; unknown/non-stackable items must not be assumed to stack to 64.

### 14.3 Performance

Cache counts by project revision and affected chunks. Do not recompute the entire material list on every camera frame or pointer move.

---

## 15. Rendering and resource packs

### 15.1 Resource-pack target

- Default asset profile: **Minecraft Java Edition 1.21.11 vanilla**, resource-pack format 75.0.
- The selected asset profile is shown in the UI and saved with the project.
- Resource-pack versions are immutable and versioned. Do not silently change the default assets after deployment.
- User resource packs may override the vanilla base pack. Priority order is explicit and visible.
- Missing blocks/models/textures use a deterministic missing-model fallback and diagnostics.
- Resource packs are untrusted input: validate zip paths, file count, decompressed size, JSON depth, image dimensions, and texture limits.

**Asset distribution gate:** Do not commit or redistribute Mojang/Minecraft assets in the repository or R2 until the chosen redistribution method has been reviewed. Phase 0 must decide whether the app (a) downloads/extracts version-pinned assets from an official source at runtime, (b) asks the user to load assets from their local Minecraft installation/client JAR, or (c) distributes only assets whose redistribution is permitted. The UI must still make the default experience clear; it must not pretend textures are built in if they are not.

### 15.2 Minecraft 1.21.11 compatibility

The asset/model pipeline must test 1.21.11-specific format changes, including block model rotations and block-state dispatch changes. The renderer must not assume 1.20-era model JSON semantics.

Minimum vanilla visual fixture set:

- Full cubes, slabs, stairs, fences, walls, panes, doors, trapdoors, logs, leaves, glass, water, lava, rails, redstone wire, crops, signs, banners, beds, chests, end rods, torches, lanterns, chains, plants, and blocks with cutout/translucent/emissive textures.
- Multiple facings, halves, shapes, waterlogged states, rotations, and multipart variants.
- At least one block model with non-cube geometry and one block entity with a separate payload.

### 15.3 Renderer implementation

- Chunked mesh generation; no one-Three.js-mesh-per-block strategy.
- Opaque, cutout, translucent, and emissive geometry are rendered through appropriate material/pass paths.
- Cull internal faces where visually correct; handle non-cube and model-defined culling separately from full-cube adjacency.
- Rebuild only dirty render chunks after edits or placement changes.
- Frustum-cull render chunks and avoid uploading unchanged geometry.
- Keep placement transforms at object/chunk roots so moving a placement does not require regenerating every block mesh.
- Selection borders, placement bounds, origins, gizmos, and conflict overlays are separate render layers.
- Screen-space handles and borders have stable pixel widths and hit targets.
- Renderer state is disposable and reconstructable from a document snapshot.

### 15.4 Texture sampling

The v0.1 phrase “pixel-perfect at any zoom level” is not technically testable and is removed.

- At close zoom, texture texels must remain crisp and must not be resampled during atlas construction.
- At minification, use mipmaps or a validated pixel-art minification filter to avoid shimmer.
- Atlas generation must include sufficient gutters/padding to prevent neighboring texture bleed at mip levels.
- Offer a filtering preference if the renderer can support both crisp-nearest and smoother Minecraft-like minification.
- Texture color space and alpha behavior must be explicit and consistent.
- Pixel ratio follows device pixel ratio subject to a configurable cap to prevent excessive GPU memory use on high-DPI displays.

### 15.5 Placement bounds and origin markers

Placement borders:

- Thin screen-space white border for all visible placements.
- Selected placement: stronger border.
- Locked placement: dashed border, but still visible.
- Hovered placement: temporary highlight.
- Hidden placement: no viewport border.
- View menu: All / Selected / None.
- Back edges may be dimmed, but depth behavior must be tested on intersecting placements and transparent blocks.

Origin markers:

- Distinct hot-pink marker, not red/green/blue conflict colors.
- Always-on-top visual pass so the marker is not hidden inside the model.
- Constant screen-space size with a sufficiently large hit target.
- Tooltip shows local and world grid-point coordinates.
- Hidden placement origin is hidden; locked origin remains visible but is not draggable.
- Dragging must use a defined gizmo plane/axis mode; “drag in the plane perpendicular to the camera” alone is ambiguous and can cause accidental axis changes.

### 15.6 Camera and viewport controls (added)

- Orbit, pan, zoom, focus selected, fit all, and reset camera.
- Preset views: top, bottom, front, back, left, right, and isometric.
- Perspective/orthographic toggle.
- Optional grid, world axes, and ground plane.
- Viewport coordinate readout and hover block-state inspector.
- A clear block-picking ray and selection hit-test policy for transparent/non-cube blocks.
- Camera state is session state and is not part of the schematic export.

---

## 16. Performance and resource budgets

The original absolute budgets (e.g. load any 10M-block Litematic in under 3 seconds and recompute every 5M-block overlay in under 50 ms) were not tied to hardware, compressed size, palette size, browser, or scene sparsity. They are not valid release gates as written.

### 16.1 Performance principles

- Use sparse chunked storage and chunked rendering.
- Parse NBT incrementally/with bounded allocation where practical.
- Use transferable ArrayBuffers for large worker payloads; avoid repeated structured-clone copies of full volumes.
- Stream/progressively decode/render chunks when possible.
- Cache world chunk ownership, material counts, and render meshes by document revision/chunk revision.
- Recompute only invalidated chunks.
- Provide cancellation for import, bake, conflict indexing, large region edits, and export.
- Never block the main thread with a multi-million-cell scan.
- Use BigInt or safe integer validation for volume arithmetic before allocation.

### 16.2 Provisional targets

All targets are measured on declared reference hardware and browser versions. The first benchmark report must record CPU, RAM, GPU, browser, OS, viewport, file compressed size, decompressed size, non-air count, palette count, and number of placements.

| Scenario | Provisional target | Release interpretation |
|---|---|---|
| Empty editor first paint | < 2 s on reference machine | Hard target after Phase 0 baseline exists. |
| 100k non-air blocks | Interactive editing and orbit with no long main-thread task | Required. |
| 1M non-air blocks | Progressive load; stable orbit; 30 FPS median on reference dedicated GPU | Required initial large-scene target. |
| 5M non-air blocks | Progressive load; 30 FPS median target, 60 FPS stretch | Hardware-dependent target, not universal guarantee. |
| 10M+ blocks | Best-effort progressive load subject to memory budget | No fixed “< 3 s” guarantee. Must fail safely with actionable limits. |
| Fill 100k cells | < 250 ms worker execution target | Measure P50/P95; UI remains responsive. |
| Localized conflict update | Only touched/neighbor chunks recomputed | Correctness and incremental behavior are release gates; timing is benchmarked. |
| Export 1M blocks | Progress reporting and cancellable worker execution | No UI freeze; byte/time budget set after benchmark. |

### 16.3 Memory safety limits

- Validate dimension multiplication and byte estimates before allocation.
- Configure maximum import compressed bytes, decompressed NBT bytes, total volume, non-air block count, palette count, NBT nesting depth, and image dimensions.
- Reject NBT/gzip bombs, malformed lengths, negative/overflowing dimensions where invalid, duplicate invalid IDs, truncated buffers, and allocation-overflow inputs.
- Use a conservative configurable default memory budget and show the estimate before import/bake.
- Handle WebGL context loss and worker failures without corrupting the project.

---

## 17. History, undo, and redo

### 17.1 Command record

The original `Patch[]`/`inverse: Patch[]` was not defined. v1 uses a typed transaction record:

```ts
type CommandRecord = {
  id: string;
  label: string;
  baseRevision: number;
  committedRevision: number;
  timestamp: number;
  affectedPlacementIds: string[];
  affectedBounds?: Bounds3i[];
  changedBlockCount: number;
  forward: DocumentDelta;
  inverse: DocumentDelta;
  estimatedBytes: number;
};
```

`DocumentDelta` contains object metadata changes and per-chunk before/after deltas. Large unchanged chunks are referenced, not copied. Deltas are immutable once committed.

### 17.2 History behavior

- Linear undo/redo per project.
- One user action equals one atomic history entry, including multi-placement actions.
- New commit after undo clears redo.
- Bake, group transforms, multi-placement edits, cut/move, and paste are compound transactions.
- Undo restores affected placements, chunk contents, ancillary data, origins, z-order, overlap policy where applicable, and session selection where appropriate.
- History is bounded by both entry count and byte budget. When pruning occurs, show that older undo steps are no longer available.
- Do not silently evict the only recovery point for a large edit; warn before an operation whose undo delta would exceed the budget.
- History can be persisted in IndexedDB. Project archive export may optionally include history; it is not required for ordinary schematic export.

### 17.3 Command concurrency

Every command is checked against `baseRevision`. If an MCP operation, UI action, or worker result is based on a stale revision, reject/recompute it instead of applying stale deltas.

---

## 18. Export behavior

### 18.1 Export targets

- Full effective composite to `.schem` v3 or `.litematic`.
- One placement to either format.
- One import group to `.litematic` when region metadata can be retained.
- Active selection as a new schematic.
- Bake + export as one compound flow.

### 18.2 Composite export

- Use effective block resolution and the active overlap policy.
- Show merged bounds, dimensions, non-air block count, palette size estimate, red conflict count, yellow overlap count, ancillary-data count, and estimated output size.
- Warn when conflicts are resolved by precedence.
- Do not include unoccupied gaps outside the effective non-air output bounds unless exporting an explicit cuboid selection.
- For an explicit selection, preserve the requested selection bounds, including air, when the format supports it; otherwise state any trim/normalization.
- Transform directional block states into exported orientation.
- Include supported block entities/entities/biomes and metadata.
- Preserve source author/name where appropriate, with explicit user override.

### 18.3 Individual placement export

Schematic formats do not encode the editor's full arbitrary placement transform. Exporting a rotated/mirrored placement therefore materializes the placement into a new local orientation, updates directional states, remaps origin/offset, and emits fidelity warnings for unsupported custom states.

### 18.4 Export UX

- Format selector.
- Preview dimensions, blocks, format constraints, file size estimate, and warnings.
- Progress indicator and cancel.
- Export in a worker/streaming writer for large data.
- Download only after writer completes and checksum/validation succeeds.
- Offer “validate export” and include report.

### 18.5 Export validation

- Re-open the generated file with the corresponding parser.
- Compare block states, bounds, region count, origin/offset, and supported ancillary data against the export source.
- For composite output, compare against a canonical resolved snapshot.
- Run fixture exports through external tools (Litematica and WorldEdit/Sponge-compatible tooling) during Phase 0/CI where practical.

---

## 19. Local MCP adapter

### 19.1 Deployment model

v1 supports a **local companion process**. It exposes an MCP stdio server to the agent and an authenticated local session bridge to the browser editor.

- The local companion is the authority for a live connected document session.
- The browser connects to the companion over localhost using a short-lived pairing token generated by the user.
- MCP and UI send commands to the same in-process command bus.
- The companion emits document revision events to the UI so it can refresh the renderer and Agent Log.
- Local-file mode may open/save `.vxproj` files directly without a browser.
- Remote Streamable HTTP MCP hosting is deferred until authentication, session isolation, quotas, and transport security are separately designed.

A static Cloudflare Pages build cannot directly share its in-memory document with a separate stdio process. Do not describe this as shared memory; it is a shared command API and a local session bridge.

### 19.2 Transport and security

- MCP transport: stdio for the agent process.
- Browser bridge: localhost-only WebSocket or HTTP transport with an unpredictable, short-lived pairing token.
- Bind only to loopback interfaces by default.
- Validate `Origin`, host, token, message size, project ID, and session revision.
- Do not expose filesystem paths to the browser or allow arbitrary path reads/writes.
- Local MCP file access is restricted to user-approved workspace directories.
- Every mutation validates IDs and limits on the server side; UI validation is not a security boundary.
- Treat filenames, metadata, block names, NBT strings, resource-pack JSON, and imported file contents as untrusted data. They are data, not agent instructions.

### 19.3 MCP tool surface

**Read tools**

- `list_projects`
- `open_project`
- `get_project_info`
- `list_placements`
- `get_placement`
- `get_origin`
- `detect_conflicts`
- `get_conflict_map` (paged/filtered)
- `get_material_list`
- `get_selection`
- `get_color_mode`
- `get_history`
- `get_diagnostics`

**Placement tools**

- `load_schematic`
- `transform_placement`
- `transform_placements`
- `set_placement_visibility`
- `set_placement_lock`
- `rename_placement`
- `delete_placement`
- `duplicate_placement`
- `set_origin`
- `bake_placements`

**Selection tools**

- `create_selection`
- `clear_selection`
- `select_placements`

**Region tools**

- `fill_selection`
- `replace_selection`
- `delete_selection`
- `copy_selection`
- `cut_selection`
- `paste_clipboard`
- `hollow_selection`
- `walls_selection`
- `move_selection`

**History/export tools**

- `undo`
- `redo`
- `export_schematic`
- `get_operation_diff`
- `set_color_mode`

All tools call the same domain queries and commands as the UI. Avoid adding separate MCP-only operation implementations.

### 19.4 Mutation protocol

All mutating tools accept:

```ts
type MutationEnvelope = {
  projectId: string;
  expectedRevision: number;
  dryRun?: boolean;
  confirmationToken?: string;
  requestId: string; // idempotency key
};
```

- `expectedRevision` is mandatory.
- Destructive operations default to dry-run and return a short-lived confirmation token bound to project ID, revision, operation, and normalized arguments.
- The actual apply call must submit that token. A token is invalid after the project revision changes or the token expires.
- Non-destructive mutations still require expected revision and idempotency key.
- Duplicate `requestId` calls return the original result and do not apply twice.
- `dryRun` returns affected placements, bounds, affected cell/block count, conflict impact, estimated memory/undo bytes, and warnings.
- `maxBlocksPerCall` is configurable. Default 1,000,000 changed cells, not a vague count of every scanned voxel. Read operations use pagination/limits too.
- A rejected operation returns machine-readable error code, message, current revision, and suggested next action.

### 19.5 Export through MCP

- Do not return huge base64 schematic blobs in normal tool results.
- Write exports only inside a configured approved workspace, returning a safe relative path or artifact handle.
- For a non-file environment, use a bounded resource/artifact mechanism supported by the MCP host; if unavailable, refuse large exports with an actionable response.
- Report export validation and fidelity diagnostics.

### 19.6 Agent Log

- Show timestamp, tool, sanitized inputs, project revision, result summary, changed block count, warnings, and duration.
- A one-click Undo control is shown only when the operation has a valid undo entry and the project revision still permits it.
- Redact local secrets, pairing tokens, absolute paths outside the approved workspace, and raw NBT payloads.
- Keep a bounded log; allow export/copy of the sanitized log.

### 19.7 MCP safety

- `destructiveHint` annotations are informational and do not replace server-side confirmation.
- File paths, block-state IDs, IDs, counts, coordinates, and NBT payload sizes are validated.
- Per-call limits, cancellation, transaction rollback, idempotency, and stale-revision checks are mandatory.
- No mutation may partially apply if one target placement is locked, malformed, missing, or over limit.
- MCP responses must not expose unbounded block lists or large raw binary data.

---

## 20. UI layout and interaction

### 20.1 Main workspace

Three-panel layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Menu / Project name / Save status / Undo / Redo / Import / Export   │
├────────────────┬───────────────────────────────┬───────────────────┤
│ Outliner       │ 3D Viewport                   │ Inspector         │
│                │                               │                   │
│ Import groups  │ Placement borders             │ Active tool       │
│ Placements     │ Origin markers                │ Transform         │
│ Visibility     │ Conflict overlay              │ Origin editor     │
│ Lock state     │ Selection cuboid              │ Block picker      │
│ Order          │ Grid / axes / camera gizmo    │ Operation options │
├────────────────┴───────────────────────────────┴───────────────────┤
│ Status: world coords / selected bounds / counts / FPS / job status │
├────────────────────────────────────────────────────────────────────┤
│ Tabs: Materials | Conflicts | History | Diagnostics | Agent Log    │
└────────────────────────────────────────────────────────────────────┘
```

### 20.2 Outliner

- Import groups may expand/collapse.
- Placement rows show visibility, lock, name, dimensions, and conflict indicator.
- Drag reorder affects overlap precedence.
- Context menu: duplicate, delete, bake, export, set origin, focus, group/ungroup.
- Multi-select and bulk operations.

### 20.3 Inspector

- Contextual to active tool/selection.
- Selected placement inspector always exposes origin and transform.
- Numeric values are editable and keyboard accessible.
- Show data fidelity warnings and unsupported block-state transform warnings adjacent to affected controls.

### 20.4 Bottom panels

- Materials: effective/per-placement counts, filters, CSV export.
- Conflicts: red/yellow region list with owner info and navigation to conflict.
- History: undo/redo rows, memory usage, pruning state.
- Diagnostics: import/export/asset/unsupported-state warnings.
- Agent Log: MCP activity when local session bridge is connected.

### 20.5 Required UX safeguards

- Confirm destructive deletes and bake operations with affected item/block counts.
- Show progress and cancellation for long jobs.
- Show a persistent warning when a resource pack is missing or version-incompatible.
- Keep selection/operation mode visible to avoid editing the wrong source placement.
- Show lock-related blocked targets before running an operation.
- Provide keyboard tooltips and a shortcut reference overlay.
- Do not rely only on color to convey conflict status.

---

## 21. Keyboard shortcuts

Shortcuts must be editable later and must not fire while typing into text/number inputs.

| Action | Shortcut |
|---|---|
| Placement mode | `1` |
| Region mode | `2` |
| Brush mode | `3` (only if brush ships) |
| Picker | `P` |
| Select all placements | `Ctrl/Cmd+A` |
| Clear selection / cancel current gesture | `Esc` |
| Undo | `Ctrl/Cmd+Z` |
| Redo | `Ctrl/Cmd+Shift+Z` |
| Duplicate selection | `Ctrl/Cmd+D` |
| Delete selection | `Delete` |
| Bake placements | `Ctrl/Cmd+Shift+B` |
| Toggle conflict overlay | `C` |
| Cycle border display | `B` |
| Focus origin editor | `O` |
| Move gizmo mode | `G` |
| Rotate gizmo mode | `R` |
| Expand/shrink selection | `+` / `-` |
| Save project | `Ctrl/Cmd+S` |
| Export | `Ctrl/Cmd+E` |
| Focus selected placement | `F` |
| Fit all | `Home` |

---

## 22. Deployment and operational constraints

### 22.1 Web editor

- Host static Vite build on Cloudflare Pages.
- Static deployment does not require a server runtime for the editor itself.
- Keep individual deployed assets within platform limits; inspect current Cloudflare limits at deployment time rather than hard-coding an assumed permanent limit.
- Large WASM assets, if introduced after profiling, may be served from R2 with immutable cache headers.
- Use content-hashed assets and long-lived immutable caching.
- Only enable COOP/COEP headers if the chosen worker/WASM architecture requires cross-origin isolation. Validate every third-party asset's CORP/CORS behavior before enabling `require-corp`.
- If using `SharedArrayBuffer`/threaded WASM, document the cross-origin isolation requirement and provide a non-threaded fallback where feasible.

### 22.2 Local MCP companion

- Distributed separately from the static editor (npm package or executable after packaging decision).
- Must support Windows, macOS, and Linux in the test matrix.
- Local session bridge binds to loopback only.
- Companion logs errors and provides clear startup/connection status.
- Browser editor may be hosted publicly but must request pairing before attaching to a local project.

### 22.3 Release versioning

- App version, domain schema version, resource-pack profile version, and supported file-format versions are tracked separately.
- A deployment must not silently migrate an existing project in place without a backup or recoverable migration record.

---

## 23. Testing and validation strategy

### 23.1 Domain/core tests

- Coordinate conversion and inverse properties.
- Bounds and integer overflow validation.
- Rotation/mirror composition.
- Block-state canonicalization and equality.
- Owner resolution, conflict categories, and overlap precedence.
- Fill/replace/delete/copy/cut/paste/hollow/walls/move/bake.
- Lock/visibility semantics.
- Ancillary data movement and cleanup.
- History atomicity and memory pruning.
- Deterministic project serialization and migrations.

Use property-based tests for transforms and operation bounds, not only hand-written examples.

### 23.2 Format tests

Maintain checked-in fixtures produced by real supported tools and Minecraft versions:

- Sponge v3: multiple dimensions, non-zero offset, all-air regions, high palette cardinality, block entities, entities, and 3D biomes.
- Sponge v2: legacy read fixture.
- Litematic: one region, multiple regions, negative size on each axis, non-zero positions, empty region, multiple palette sizes/packing widths, entities, block entities, and pending ticks.
- Malformed fixtures: truncated NBT, bad VarInt, invalid palette index, gzip bomb limits, impossible sizes, duplicate/missing fields, oversized NBT nesting.

Round-trip checks compare semantic block states and supported ancillary data. Byte equality is not required.

### 23.3 External compatibility tests

- Open generated `.schem` in WorldEdit/Sponge-compatible tooling.
- Open generated `.litematic` in Litematica.
- Re-import exported files and compare them against canonical expected output.
- Keep known-good fixtures from multiple versions; do not validate only files generated by this editor.

### 23.4 Rendering tests

- Visual regression on 1.21.11 vanilla fixture scenes.
- Verify correct model dispatch, texture UVs, transparency, emissive behavior, borders, overlays, selection, origins, and transformed placements.
- Verify missing model/texture fallback.
- Verify user resource-pack override precedence.
- Run tests at multiple device pixel ratios and zoom levels.

### 23.5 MCP tests

- End-to-end local companion sessions.
- Same command produces same result through UI and MCP.
- Stale revision, duplicate request ID, expired confirmation token, invalid token, locked placement, over-limit operation, cancellation, and malformed input.
- Agent Log sanitization and undo action validity.
- Path sandboxing and loopback/origin restrictions.

### 23.6 Performance and reliability tests

- Fixtures at 100k, 1M, 5M, and 10M+ non-air blocks, plus highly sparse huge bounding boxes.
- Record load, parse, decompression, chunk mesh, conflict index, material counts, operation, undo, autosave, and export separately.
- Track memory peak and main-thread long tasks, not only FPS.
- Simulate WebGL context loss, worker crash, browser reload during autosave, quota exhaustion, and export cancellation.
- Benchmarks run in CI where deterministic; hardware-sensitive performance runs are release reports, not flaky pass/fail unit tests.

---

## 24. Implementation phases and gates

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 — Feasibility spike | Format fixtures, coordinate prototype, rendering/library evaluation, asset distribution decision, performance baseline | All five gates in §0 pass or architecture is revised before proceeding. |
| 1 — Domain and format foundation | Canonical types, sparse chunk store, bounded NBT reader/writer, Sponge v3 and Litematic adapters | Multi-region/negative-size imports and supported semantic round-trips pass. |
| 2 — Read-only viewer | Resource-pack pipeline, 1.21.11 model rendering, chunked meshes, camera controls, placement borders/origins | Representative 1M-block scene loads progressively and remains interactive on reference hardware. |
| 3 — Headless command core | Selection, region ops, placement transforms, conflict index, material queries, transactional history | Core operations and transform property tests pass without UI. |
| 4 — Single-placement editor | Outliner, inspector, region selection, block picker, fill/replace/delete/copy/paste, undo/redo | User can edit one placement and recover exact prior state. |
| 5 — Composition | Multi-placement transforms, group import, overlap policy, conflict overlay, cross-placement selection, bake | Two or more real schematics compose, diagnose conflicts, bake, undo, and export correctly. |
| 6 — Persistence and export | IndexedDB autosave, `.vxproj` archive, export previews, validation, recovery | Close/reopen restores exact semantic project state; exports pass external compatibility checks. |
| 7 — MCP local companion | stdio MCP server, local pairing bridge, shared command bus, dry-run confirmation, Agent Log | Agent performs a multi-step task while UI shows the same revision/state; safety tests pass. |
| 8 — Polish and stretch | Brush, thumbnails, advanced LOD, more selection shapes, extra material/inventory integrations | Only after correctness, stability, and core performance goals are met. |

Do not start Phase 4 UI polish while Phase 1 format correctness or Phase 2 renderer compatibility is failing.

---

## 25. Release acceptance checklist

A v1 release is not ready until all of the following are true:

- [ ] Imports `.schem` v3 and `.litematic` fixtures, including multi-region and negative-size Litematic regions.
- [ ] Shows a complete import report; no unknown source data is silently discarded.
- [ ] Default asset profile is pinned to Minecraft 1.21.11, or the UI clearly explains the approved asset-loading step if assets cannot be bundled.
- [ ] Common 1.21.11 blocks render correctly with cutout/translucent/emissive behavior.
- [ ] Placement transforms, origin editing, group transforms, and coordinate inversion pass property tests.
- [ ] Directional block states are transformed correctly for supported vanilla states; unsupported states are reported.
- [ ] World and placement selections have deterministic half-open bounds.
- [ ] Region operation source/result modes are visible and behave exactly as specified.
- [ ] Conflict categories and top/bottom precedence are deterministic.
- [ ] Bake, export, undo, and redo are atomic and reconcile ancillary data.
- [ ] Effective and per-placement material lists match independent test calculations.
- [ ] Project autosave/recovery works and quota failure is visible.
- [ ] Generated exports re-open in supported external tools and pass semantic comparisons.
- [ ] Large files do not block the main thread or require a dense scene-wide array.
- [ ] MCP dry-run, confirmation tokens, expected revisions, idempotency, limits, and path security pass tests.
- [ ] Browser and MCP use the same command/query implementation.

---

## 26. Deferred features

- Sphere/cylinder selections and advanced shape masks.
- Inventory-driven material availability mode.
- Selective undo and branching history.
- Remote Streamable HTTP MCP sessions.
- Collaborative editing.
- World/chunk (`.mca`) editing.
- Full entity/block-entity visual editing.
- Custom mod block-state transform plugins.
- Full resource-pack compatibility beyond tested Minecraft versions.
- Thumbnail generation and server-side rendering.
- Brush tools, unless the core editor is stable before v1 release.

---

## 27. Decisions removed from v0.1

| v0.1 item | v0.2 decision | Reason |
|---|---|---|
| Dense `Uint16Array` per placement | Sparse chunked volume with adaptive palette indices | Dense storage wastes memory for sparse/large schematics; 16-bit palette cap was arbitrary. |
| One placement per uploaded file | One placement per source region; Litematic import group | Litematic files can contain multiple independent regions. |
| Origin/volume-center rotation ambiguity | Placement origin is the transform pivot | One unambiguous transform contract. |
| `newest-wins` / `oldest-wins` | Removed from v1 | Outliner order is explicit and predictable. |
| Orange for 3+ same-state overlaps | Yellow for every same-state overlap; count shown separately | A fourth color contradicted the three-state legend and confused semantics. |
| Green tint on all clean blocks by default | Conflicts-only default; optional full classification | Keeps normal Minecraft textures legible in ordinary scenes. |
| “Pixel-perfect at any zoom” | Crisp magnification + stable minification, tested at defined zoom levels | “Any zoom” is not a measurable or physically consistent texture requirement. |
| 10M blocks in <3 s | Progressive loading with declared benchmark targets | Runtime depends on compression, browser, CPU, GPU, data density, and memory. |
| Lodestone as implicit resource/format solution | Phase 0 renderer candidate behind adapter | Multi-region convenience loader defaults to first region; 1.21.11 compatibility needs proof. |
| MCP stdio + HTTP described as shared state | Local companion/session bridge | Separate processes do not share browser memory automatically. |
| Undefined `Patch[]` history | Typed chunk/object delta with byte budget | Required for scalable, atomic undo. |
| JSON base64 as project save | IndexedDB binary stores + `.vxproj` archive | Avoids enormous JSON/base64 duplication. |
| “Lossless round-trip” without caveats | Fidelity levels F0–F3 and strict export | Defines what can actually be guaranteed. |

---

## 28. Reference material used for this revision

These references informed format and dependency decisions. They are not substitutes for fixture tests or format-level validation.

1. SpongePowered, *Schematic Specification v3*: https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
   - Documents gzip-compressed NBT, dimensions, `Offset`, VarInt block palette data, data ordering, block entities, entities, and 3D biomes.
2. Litemapy, *The Litematic file format*: https://litemapy.readthedocs.io/en/latest/litematics.html
   - Documents metadata, multiple regions, per-region coordinate systems, and negative region dimensions.
3. Lodestone README: https://github.com/mattzh72/lodestone
   - Documents Litematic loading, default/custom resource packs, chunked meshing, occlusion culling, transparency sorting, and emissive support. The README also states that its convenience loader loads the first region by default.
4. Mojang, *Minecraft Java Edition 1.21.11*: https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-11
   - Confirms 1.21.11 resource-pack format 75.0 and model/state format changes relevant to renderer compatibility.
5. Three.js Manual, *Voxel (Minecraft Like) Geometry*: https://threejs.org/manual/pages/voxel-geometry.html
   - Explains why one mesh per voxel and giant dense voxel arrays are inefficient, and demonstrates chunk/cell-based sparse rendering.

---

**End of SPEC.md v0.2**
