// apps/mcp-companion/src/tool-schemas.ts
// Zod input schemas for every MCP tool (SUBSPEC-F §5, §6, acceptance item 20, Slice M3).
// Pure TypeScript + Zod, zero framework/browser/Node imports.

import { z } from 'zod';

// ============================================================================
// Common
// ============================================================================

export const CommonArgs = z.object({
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  allowLimitIncrease: z.boolean().optional(),
});

export const WorldBounds = z.array(z.number()).length(6);

export const PlacementId = z.string();

// ============================================================================
// Project tools
// ============================================================================

export const OpenProjectSchema = z.object({
  projectId: z.string(),
});

export const GetProjectInfoSchema = CommonArgs;

export const ListPlacementsSchema = z.object({
  filter: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
}).merge(CommonArgs);

export const GetPlacementSchema = z.object({
  placementId: PlacementId,
}).merge(CommonArgs);

export const GetOriginSchema = z.object({
  placementId: PlacementId,
}).merge(CommonArgs);

export const DetectConflictsSchema = z.object({
  worldBounds: WorldBounds.optional(),
}).merge(CommonArgs);

export const GetConflictMapSchema = z.object({
  worldBounds: WorldBounds.optional(),
  severity: z.enum(['red', 'yellow', 'all']).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
}).merge(CommonArgs);

export const GetMaterialListSchema = z.object({
  perPlacement: z.boolean().optional(),
  filter: z.string().optional(),
}).merge(CommonArgs);

export const GetSelectionSchema = CommonArgs;

export const GetColorModeSchema = CommonArgs;

export const GetHistorySchema = z.object({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
}).merge(CommonArgs);

export const GetDiagnosticsSchema = z.object({
  category: z.string().optional(),
}).merge(CommonArgs);

// ============================================================================
// Placement tools
// ============================================================================

export const LoadSchematicSchema = z.object({
  filePath: z.string(),
  format: z.enum(['litematic', 'schem', 'nbt']).optional(),
}).merge(CommonArgs);

export const TransformPlacementSchema = z.object({
  placementId: PlacementId,
  translation: z.array(z.number()).length(3).optional(),
  offset: z.array(z.number()).length(3).optional(),
  rotation: z.enum(['0', '90', '180', '270']).optional(),
  mirror: z.enum(['none', 'x', 'z']).optional(),
}).merge(CommonArgs);

export const TransformPlacementsSchema = z.object({
  placementIds: z.array(PlacementId),
  translation: z.array(z.number()).length(3).optional(),
  offset: z.array(z.number()).length(3).optional(),
  rotation: z.enum(['0', '90', '180', '270']).optional(),
  mirror: z.enum(['none', 'x', 'z']).optional(),
}).merge(CommonArgs);

export const SetPlacementVisibilitySchema = z.object({
  placementId: PlacementId,
  visible: z.boolean(),
}).merge(CommonArgs);

export const SetPlacementLockSchema = z.object({
  placementId: PlacementId,
  locked: z.boolean(),
}).merge(CommonArgs);

export const RenamePlacementSchema = z.object({
  placementId: PlacementId,
  name: z.string(),
}).merge(CommonArgs);

export const DeletePlacementSchema = z.object({
  placementId: PlacementId,
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  allowLimitIncrease: z.boolean().optional(),
});

export const DuplicatePlacementSchema = z.object({
  placementId: PlacementId,
  offset: z.array(z.number()).length(3).optional(),
}).merge(CommonArgs);

export const SetOriginSchema = z.object({
  placementId: PlacementId,
  origin: z.array(z.number()).length(3),
}).merge(CommonArgs);

export const BakePlacementsSchema = z.object({
  placementIds: z.array(PlacementId),
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  allowLimitIncrease: z.boolean().optional(),
});

export const CreatePlacementSchema = z.object({
  name: z.string().optional(),
  placementId: z.string().optional(),
  translation: z.array(z.number()).length(3).optional(),
  origin: z.array(z.number()).length(3).optional(),
}).merge(CommonArgs);

// ============================================================================
// Selection tools
// ============================================================================

export const CreateSelectionSchema = z.object({
  bounds: WorldBounds.optional(),
  worldBounds: WorldBounds.optional(),
  name: z.string().optional(),
  id: z.string().optional(),
}).merge(CommonArgs);

export const ClearSelectionSchema = CommonArgs;

export const SelectPlacementsSchema = z.object({
  placementIds: z.array(PlacementId),
  mode: z.enum(['replace', 'add', 'toggle']).optional(),
}).merge(CommonArgs);

export const ListSelectionsSchema = CommonArgs;

export const SelectRegionSchema = z.object({
  id: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
}).merge(CommonArgs);

export const RemoveRegionSchema = z.object({
  id: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
}).merge(CommonArgs);

// ============================================================================
// Region tools
// ============================================================================

export const RegionOpSchema = z.object({
  operation: z.enum(['fill', 'replace', 'delete', 'copy', 'paste', 'move', 'bake', 'hollow', 'walls']),
  placementId: PlacementId.optional(),
  worldBounds: WorldBounds,
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  allowLimitIncrease: z.boolean().optional(),
  blockType: z.string().optional(),
  replacementBlock: z.string().optional(),
});

export const CopySelectionSchema = CommonArgs;

export const PasteClipboardSchema = z.object({
  targetOrigin: z.array(z.number()).length(3).optional(),
}).merge(CommonArgs);

export const StackRegionSchema = z.object({
  worldBounds: WorldBounds.optional(),
  bounds: WorldBounds.optional(),
  count: z.number().int().positive().optional(),
  offset: z.array(z.number()).length(3),
  placementId: z.string().optional(),
  dryRun: z.boolean().optional(),
}).merge(CommonArgs);

export const CopyPasteRegionSchema = z.object({
  sourceBounds: WorldBounds.optional(),
  bounds: WorldBounds.optional(),
  worldBounds: WorldBounds.optional(),
  targetOrigin: z.array(z.number()).length(3),
  placementId: z.string().optional(),
  dryRun: z.boolean().optional(),
}).merge(CommonArgs);

// ============================================================================
// Procedural Build & Voxel Ops Tools (Slice M1/M3)
// ============================================================================

export const SetBlockSchema = z.object({
  pos: z.array(z.number()).length(3),
  block: z.string(),
  placementId: z.string().optional(),
  placementName: z.string().optional(),
  createNewPlacement: z.boolean().optional(),
}).merge(CommonArgs);

export const SetBlocksSchema = z.object({
  voxels: z.array(
    z.object({
      pos: z.array(z.number()).length(3),
      block: z.string(),
    })
  ),
  placementId: z.string().optional(),
  placementName: z.string().optional(),
  createNewPlacement: z.boolean().optional(),
}).merge(CommonArgs);

export const GetBlockSchema = z.object({
  pos: z.array(z.number()).length(3),
  placementId: z.string().optional(),
}).merge(CommonArgs);

export const InspectRegionSchema = z.object({
  worldBounds: WorldBounds.optional(),
  bounds: WorldBounds.optional(),
  maxBlocks: z.number().optional(),
  includeAir: z.boolean().optional(),
  placementId: z.string().optional(),
}).merge(CommonArgs);

export const GenerateShapeSchema = z.object({
  kind: z.enum([
    'box',
    'sphere',
    'ellipsoid',
    'cylinder',
    'pyramid',
    'cone',
    'arch',
    'line',
    'roof',
    'stairs',
    'torus',
  ]),
  block: z.string().optional(),
  secondaryBlock: z.string().optional(),
  center: z.array(z.number()).length(3).optional(),
  bounds: WorldBounds.optional(),
  from: z.array(z.number()).length(3).optional(),
  to: z.array(z.number()).length(3).optional(),
  radius: z.number().optional(),
  radiusX: z.number().optional(),
  radiusY: z.number().optional(),
  radiusZ: z.number().optional(),
  innerRadius: z.number().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
  depth: z.number().optional(),
  hollow: z.boolean().optional(),
  thickness: z.number().optional(),
  axis: z.enum(['x', 'y', 'z']).optional(),
  createNewPlacement: z.boolean().optional(),
  placementId: z.string().optional(),
  placementName: z.string().optional(),
  dryRun: z.boolean().optional(),
}).merge(CommonArgs);

export const GenerateStructureSchema = z.object({
  kind: z.enum([
    'house',
    'tower',
    'castle',
    'temple',
    'bridge',
    'tree',
    'fountain',
    'island',
    'modern_villa',
    'pagoda',
    'ship',
  ]),
  position: z.array(z.number()).length(3).optional(),
  style: z.enum([
    'medieval',
    'modern',
    'deepslate',
    'desert',
    'nether',
    'japanese',
    'prismarine',
  ]).optional(),
  size: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
  }).optional(),
  palette: z.record(z.string(), z.string()).optional(),
  createNewPlacement: z.boolean().optional(),
  placementId: z.string().optional(),
  placementName: z.string().optional(),
  dryRun: z.boolean().optional(),
}).merge(CommonArgs);

export const BuildBlueprintSchema = z.object({
  name: z.string().optional(),
  origin: z.array(z.number()).length(3).optional(),
  createNewPlacement: z.boolean().optional(),
  placementId: z.string().optional(),
  steps: z.array(z.any()),
  dryRun: z.boolean().optional(),
}).merge(CommonArgs);

// ============================================================================
// Cloud Workspace / Account tools
// ============================================================================

export const GetAccountInfoSchema = CommonArgs;

export const ListWorkspaceSchema = CommonArgs;

export const ListProjectsSchema = z.object({
  filter: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
}).merge(CommonArgs);

export const CreateProjectSchema = z.object({
  name: z.string().optional(),
}).merge(CommonArgs);

export const RenameProjectSchema = z.object({
  projectId: z.string().optional(),
  name: z.string(),
}).merge(CommonArgs);

export const DeleteProjectSchema = z.object({
  projectId: z.string(),
}).merge(CommonArgs);

export const ListSchematicsSchema = z.object({
  projectId: z.string().optional(),
  filter: z.string().optional(),
}).merge(CommonArgs);

export const CreateSchematicSchema = z.object({
  name: z.string().optional(),
  projectId: z.string().optional(),
}).merge(CommonArgs);

export const RenameSchematicSchema = z.object({
  id: z.string(),
  name: z.string(),
}).merge(CommonArgs);

export const DeleteSchematicSchema = z.object({
  id: z.string(),
}).merge(CommonArgs);

export const DuplicateSchematicSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
}).merge(CommonArgs);

export const SetActiveSchematicSchema = z.object({
  id: z.string(),
}).merge(CommonArgs);

// ============================================================================
// History/export tools
// ============================================================================

export const UndoSchema = CommonArgs;

export const RedoSchema = CommonArgs;

export const ExportSchematicSchema = z.object({
  filePath: z.string(),
  format: z.enum(['litematic', 'schem', 'nbt', 'vxproj']).optional(),
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  allowLimitIncrease: z.boolean().optional(),
});

export const GetOperationDiffSchema = z.object({
  commandId: z.string(),
}).merge(CommonArgs);

export const SetColorModeSchema = z.object({
  mode: z.enum(['conflicts', 'materials', 'height', 'none']),
}).merge(CommonArgs);

// ============================================================================
// Tool name registry
// ============================================================================

export const TOOL_SCHEMAS = {
  open_project: OpenProjectSchema,
  get_project_info: GetProjectInfoSchema,
  list_placements: ListPlacementsSchema,
  get_placement: GetPlacementSchema,
  get_origin: GetOriginSchema,
  detect_conflicts: DetectConflictsSchema,
  get_conflict_map: GetConflictMapSchema,
  get_material_list: GetMaterialListSchema,
  get_selection: GetSelectionSchema,
  get_color_mode: GetColorModeSchema,
  get_history: GetHistorySchema,
  get_diagnostics: GetDiagnosticsSchema,
  load_schematic: LoadSchematicSchema,
  transform_placement: TransformPlacementSchema,
  transform_placements: TransformPlacementsSchema,
  set_placement_visibility: SetPlacementVisibilitySchema,
  set_placement_lock: SetPlacementLockSchema,
  rename_placement: RenamePlacementSchema,
  delete_placement: DeletePlacementSchema,
  duplicate_placement: DuplicatePlacementSchema,
  set_origin: SetOriginSchema,
  bake_placements: BakePlacementsSchema,
  create_placement: CreatePlacementSchema,
  create_selection: CreateSelectionSchema,
  clear_selection: ClearSelectionSchema,
  select_placements: SelectPlacementsSchema,
  list_selections: ListSelectionsSchema,
  select_region: SelectRegionSchema,
  remove_region: RemoveRegionSchema,
  fill_selection: RegionOpSchema,
  replace_selection: RegionOpSchema,
  delete_selection: RegionOpSchema,
  copy_selection: CopySelectionSchema,
  cut_selection: RegionOpSchema,
  paste_clipboard: PasteClipboardSchema,
  hollow_selection: RegionOpSchema,
  walls_selection: RegionOpSchema,
  move_selection: RegionOpSchema,
  stack_region: StackRegionSchema,
  copy_paste_region: CopyPasteRegionSchema,
  set_block: SetBlockSchema,
  set_blocks: SetBlocksSchema,
  get_block: GetBlockSchema,
  inspect_region: InspectRegionSchema,
  generate_shape: GenerateShapeSchema,
  generate_structure: GenerateStructureSchema,
  generate_build: GenerateStructureSchema,
  build_blueprint: BuildBlueprintSchema,
  get_account_info: GetAccountInfoSchema,
  list_workspace: ListWorkspaceSchema,
  list_projects: ListProjectsSchema,
  create_project: CreateProjectSchema,
  rename_project: RenameProjectSchema,
  delete_project: DeleteProjectSchema,
  list_schematics: ListSchematicsSchema,
  create_schematic: CreateSchematicSchema,
  rename_schematic: RenameSchematicSchema,
  delete_schematic: DeleteSchematicSchema,
  duplicate_schematic: DuplicateSchematicSchema,
  set_active_schematic: SetActiveSchematicSchema,
  undo: UndoSchema,
  redo: RedoSchema,
  export_schematic: ExportSchematicSchema,
  get_operation_diff: GetOperationDiffSchema,
  set_color_mode: SetColorModeSchema,
} as const;

export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as (keyof typeof TOOL_SCHEMAS)[];

export function getToolSchema(name: string) {
  return TOOL_SCHEMAS[name as keyof typeof TOOL_SCHEMAS];
}
