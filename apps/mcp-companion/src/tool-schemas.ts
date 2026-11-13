// apps/mcp-companion/src/tool-schemas.ts
// Zod input schemas for every MCP tool (SUBSPEC-F §5, §6, acceptance item 20).
// Pure TypeScript + Zod, zero framework/browser/Node imports.

import { z } from 'zod';

// ============================================================================
// Common
// ============================================================================

export const CommonArgs = z.object({
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
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
  rotation: z.enum(['0', '90', '180', '270']).optional(),
  mirror: z.enum(['none', 'x', 'z']).optional(),
}).merge(CommonArgs);

export const TransformPlacementsSchema = z.object({
  placementIds: z.array(PlacementId),
  translation: z.array(z.number()).length(3).optional(),
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
  expectedRevision: z.number(),
  requestId: z.string(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
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
  expectedRevision: z.number(),
  requestId: z.string(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
});

// ============================================================================
// Selection tools
// ============================================================================

export const CreateSelectionSchema = z.object({
  bounds: WorldBounds,
}).merge(CommonArgs);

export const ClearSelectionSchema = CommonArgs;

export const SelectPlacementsSchema = z.object({
  placementIds: z.array(PlacementId),
  mode: z.enum(['replace', 'add', 'toggle']).optional(),
}).merge(CommonArgs);

// ============================================================================
// Region tools
// ============================================================================

export const RegionOpSchema = z.object({
  operation: z.enum(['fill', 'replace', 'delete', 'copy', 'paste', 'move', 'bake', 'hollow', 'walls']),
  placementId: PlacementId.optional(),
  worldBounds: WorldBounds,
  expectedRevision: z.number(),
  requestId: z.string(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  blockType: z.string().optional(),
  replacementBlock: z.string().optional(),
});

export const CopySelectionSchema = CommonArgs;

export const PasteClipboardSchema = z.object({
  targetOrigin: z.array(z.number()).length(3).optional(),
}).merge(CommonArgs);

// ============================================================================
// History/export tools
// ============================================================================

export const UndoSchema = CommonArgs;

export const RedoSchema = CommonArgs;

export const ExportSchematicSchema = z.object({
  filePath: z.string(),
  format: z.enum(['litematic', 'schem', 'nbt']).optional(),
  expectedRevision: z.number().optional(),
  requestId: z.string().optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
});

export const GetOperationDiffSchema = z.object({
  commandId: z.string(),
}).merge(CommonArgs);

export const SetColorModeSchema = z.object({
  mode: z.enum(['conflicts', 'materials', 'height', 'none']),
}).merge(CommonArgs);

// ============================================================================
// Tool name registry (all ~40 tools)
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
  create_selection: CreateSelectionSchema,
  clear_selection: ClearSelectionSchema,
  select_placements: SelectPlacementsSchema,
  fill_selection: RegionOpSchema,
  replace_selection: RegionOpSchema,
  delete_selection: RegionOpSchema,
  copy_selection: CopySelectionSchema,
  cut_selection: RegionOpSchema,
  paste_clipboard: PasteClipboardSchema,
  hollow_selection: RegionOpSchema,
  walls_selection: RegionOpSchema,
  move_selection: RegionOpSchema,
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
