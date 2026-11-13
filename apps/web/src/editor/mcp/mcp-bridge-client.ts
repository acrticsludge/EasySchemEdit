// apps/web/src/editor/mcp/mcp-bridge-client.ts
// Browser MCP pairing client & relayed command executor (Slice E4.2, SUBSPEC-F §2.1, §8.2, AD-5).
// Manages pairing with local MCP companion (127.0.0.1:43127), command execution against live EditorSession,
// and agent activity logging with D-8 undo rule enforcement.

import type { EditorSession } from '@easyschemedit/operations';
import type {
  Command,
  BlockStateMatcher,
} from '@easyschemedit/operations';
import type {
  Bounds3i,
  Vec3i,
  Vec3Half,
  BlockStateId,
  Placement,
} from '@easyschemedit/domain';
import { CANONICAL_AIR } from '@easyschemedit/domain';

// ============================================================================
// Types
// ============================================================================

export type McpBridgeClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type BrowserAgentLogEntry = {
  id: string;
  timestamp: string;
  tool: string;
  projectId: string;
  revision: number;
  changedCells: number;
  resultSummary: string;
  warnings: string[];
  canUndo: boolean;
  undone?: boolean;
  changedPlacements?: string[];
  args?: Record<string, unknown>;
};

export type RelayedExecutionResult = {
  success: boolean;
  revision: number;
  changedCells: number;
  changedPlacements: string[];
  warnings: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  errorCode?: string;
  errorMessage?: string;
  result?: unknown;
};

export type McpBridgeClientOptions = {
  session: EditorSession;
  baseUrl?: string;
  wsUrl?: string;
  projectId?: string;
  fetchFn?: typeof fetch;
  wsFactory?: (url: string) => any;
};

export type Listener = () => void;

// ============================================================================
// Read Tools Set
// ============================================================================

const READ_TOOLS: ReadonlySet<string> = new Set([
  'open_project',
  'get_project_info',
  'list_placements',
  'get_placement',
  'get_origin',
  'detect_conflicts',
  'get_conflict_map',
  'get_material_list',
  'get_selection',
  'get_color_mode',
  'get_history',
  'get_diagnostics',
  'get_operation_diff',
]);

export function isReadTool(tool: string): boolean {
  return READ_TOOLS.has(tool);
}

// ============================================================================
// Helpers
// ============================================================================

export function tupleToBounds(coords: number[]): Bounds3i {
  return {
    min: [
      Math.min(coords[0], coords[3]),
      Math.min(coords[1], coords[4]),
      Math.min(coords[2], coords[5]),
    ] as Vec3i,
    maxExclusive: [
      Math.max(coords[0], coords[3]),
      Math.max(coords[1], coords[4]),
      Math.max(coords[2], coords[5]),
    ] as Vec3i,
  };
}

export function parseBlockState(input?: string): BlockStateId {
  if (!input) return CANONICAL_AIR;
  let id = input.trim().toLowerCase();
  const props: Record<string, string> = {};
  const bracketIndex = id.indexOf('[');
  if (bracketIndex !== -1 && id.endsWith(']')) {
    const propStr = id.slice(bracketIndex + 1, -1);
    id = id.slice(0, bracketIndex);
    const pairs = propStr.split(',');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k && v) {
        props[k.trim()] = v.trim();
      }
    }
  }
  if (!id.includes(':')) {
    id = `minecraft:${id}`;
  }
  return { id, props };
}

export function parseMatcher(input?: unknown): BlockStateMatcher {
  if (!input) return { mode: 'block-id-only', blockId: 'minecraft:air' };
  if (typeof input === 'object' && input !== null && 'mode' in input) {
    return input as BlockStateMatcher;
  }
  if (typeof input === 'string') {
    const parsed = parseBlockState(input);
    if (Object.keys(parsed.props).length > 0) {
      return {
        mode: 'exact',
        blockId: parsed.id,
        properties: parsed.props as Record<string, string>,
      };
    }
    return { mode: 'block-id-only', blockId: parsed.id };
  }
  return { mode: 'block-id-only', blockId: 'minecraft:air' };
}

function ensureDefaultPlacementIfNeeded(session: EditorSession, bounds?: Bounds3i): void {
  if (session.snapshot().placements.length > 0) return;
  const b = bounds ?? { min: [0, 0, 0] as Vec3i, maxExclusive: [16, 16, 16] as Vec3i };
  const minChunk: Vec3i = [
    Math.floor(b.min[0] / 16) * 16,
    Math.floor(b.min[1] / 16) * 16,
    Math.floor(b.min[2] / 16) * 16,
  ];
  const maxChunk: Vec3i = [
    Math.max(minChunk[0] + 16, Math.ceil(b.maxExclusive[0] / 16) * 16),
    Math.max(minChunk[1] + 16, Math.ceil(b.maxExclusive[1] / 16) * 16),
    Math.max(minChunk[2] + 16, Math.ceil(b.maxExclusive[2] / 16) * 16),
  ];
  const p: Placement = {
    id: 'placement-1',
    name: 'Default Placement',
    volume: {
      bounds: { min: minChunk, maxExclusive: maxChunk },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    },
    transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
    origin: [0, 0, 0],
    ancillary: {
      blockEntities: new Map(),
      entities: [],
      pendingBlockTicks: [],
      pendingFluidTicks: [],
      unknownTags: new Map(),
    },
    visible: true,
    locked: false,
    createdAt: new Date().toISOString(),
    source: { format: 'generated', diagnostics: [] },
    eraseTombstones: new Set(),
  };
  session.execute({ type: 'placement:add', placement: p });
}

export function mapToolToCommands(operation: string, args: Record<string, unknown>): Command[] {
  switch (operation) {
    case 'fill_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const bounds = tupleToBounds(rawBounds);
      const block = parseBlockState((args.blockType ?? args.state ?? args.block) as string | undefined);
      return [{
        type: 'region:fill',
        bounds,
        block,
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'replace_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const bounds = tupleToBounds(rawBounds);
      const matcher = parseMatcher(args.blockType ?? args.matcher);
      const replacement = parseBlockState((args.replacementBlock ?? args.replacement) as string | undefined);
      return [{
        type: 'region:replace',
        bounds,
        matcher,
        replacement,
        preserveProperties: Boolean(args.preserveProperties),
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'delete_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:delete',
        bounds: tupleToBounds(rawBounds),
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'cut_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'clipboard:cut',
        selection: { kind: 'cuboid', bounds: tupleToBounds(rawBounds) },
      }];
    }
    case 'hollow_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:hollow',
        bounds: tupleToBounds(rawBounds),
        shellThickness: typeof args.shellThickness === 'number' ? args.shellThickness : 1,
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'walls_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      return [{
        type: 'region:walls',
        bounds: tupleToBounds(rawBounds),
        wallBlock: parseBlockState((args.blockType ?? args.wallBlock) as string | undefined),
        fillInterior: args.replacementBlock
          ? parseBlockState(args.replacementBlock as string)
          : (args.fillInterior ? parseBlockState(args.fillInterior as string) : null),
        placementId: args.placementId as string | undefined,
      }];
    }
    case 'move_selection': {
      const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
      if (!rawBounds) return [];
      const offset = (args.offset ?? args.translation ?? [0, 0, 0]) as Vec3i;
      return [{
        type: 'region:move',
        sourceBounds: tupleToBounds(rawBounds),
        offset,
        affectedPlacements: args.placementId
          ? [args.placementId as string]
          : (args.affectedPlacements as string[] | undefined),
      }];
    }
    case 'delete_placement': {
      return [{
        type: 'placement:delete',
        placementId: args.placementId as string,
      }];
    }
    case 'duplicate_placement': {
      return [{
        type: 'placement:duplicate',
        placementId: args.placementId as string,
        offset: args.offset as Vec3i | undefined,
      }];
    }
    case 'rename_placement': {
      return [{
        type: 'placement:rename',
        placementId: args.placementId as string,
        name: args.name as string,
      }];
    }
    case 'set_placement_visibility': {
      return [{
        type: 'placement:setVisibility',
        placementId: args.placementId as string,
        visible: Boolean(args.visible),
      }];
    }
    case 'set_placement_lock': {
      return [{
        type: 'placement:setLocked',
        placementId: args.placementId as string,
        locked: Boolean(args.locked),
      }];
    }
    case 'set_origin': {
      return [{
        type: 'placement:setOrigin',
        placementId: args.placementId as string,
        origin: args.origin as Vec3Half,
      }];
    }
    case 'transform_placement': {
      const cmds: Command[] = [];
      const pid = args.placementId as string;
      if (Array.isArray(args.translation)) {
        cmds.push({ type: 'placement:move', placementId: pid, translation: args.translation as unknown as Vec3i });
      }
      if (typeof args.rotation === 'string' || typeof args.rotation === 'number') {
        cmds.push({
          type: 'placement:rotate',
          placementId: pid,
          rotationY: Number(args.rotation) as 0 | 90 | 180 | 270,
        });
      }
      if (typeof args.mirror === 'string') {
        cmds.push({ type: 'placement:mirror', placementId: pid, mirror: args.mirror as 'none' | 'x' | 'z' });
      }
      return cmds;
    }
    case 'transform_placements': {
      return [{
        type: 'group:transform',
        placementIds: (args.placementIds as string[]) || [],
        translation: args.translation as unknown as Vec3i | undefined,
        rotationY: args.rotation ? (Number(args.rotation) as 0 | 90 | 180 | 270) : undefined,
        mirror: args.mirror as 'none' | 'x' | 'z' | undefined,
      }];
    }
    case 'bake_placements': {
      return [{
        type: 'bake',
        placementIds: args.placementIds as string[] | undefined,
      }];
    }
    case 'create_selection': {
      const b = (args.bounds ?? args.worldBounds) as number[];
      return [{
        type: 'selection:edit',
        bounds: { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] },
      }];
    }
    case 'clear_selection': {
      return [{ type: 'selection:clear' }];
    }
    case 'select_placements': {
      return [{
        type: 'selection:edit',
        placementIds: args.placementIds as string[],
      }];
    }
    case 'copy_selection': {
      return [{ type: 'clipboard:copy' }];
    }
    case 'paste_clipboard': {
      return [{
        type: 'clipboard:paste',
        targetPosition: (args.targetOrigin ?? [0, 0, 0]) as Vec3i,
      }];
    }
    default:
      return [];
  }
}

// ============================================================================
// McpBridgeClient
// ============================================================================

export class McpBridgeClient {
  public status: McpBridgeClientStatus = 'disconnected';
  public sessionId: string | null = null;
  public projectId: string;
  public errorMessage: string | null = null;

  private session: EditorSession;
  public readonly baseUrl: string;
  public readonly wsUrl: string;
  private fetchFn: typeof fetch;
  private wsFactory?: (url: string) => any;
  private ws: any = null;
  private entries: BrowserAgentLogEntry[] = [];
  private listeners: Set<Listener> = new Set();
  private sessionUnsub: () => void;

  constructor(options: McpBridgeClientOptions) {
    this.session = options.session;
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:43127';
    this.wsUrl = options.wsUrl ?? 'ws://127.0.0.1:43127/ws';
    this.projectId = options.projectId ?? this.session.snapshot().id ?? 'default';
    this.fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);
    this.wsFactory = options.wsFactory;

    // Listen to session mutations so UI and undo-availability react to external edits
    this.sessionUnsub = this.session.subscribe(() => {
      this.notifyListeners();
    });
  }

  public getStatus(): McpBridgeClientStatus {
    return this.status;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getProjectId(): string {
    return this.projectId;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getEntries(): BrowserAgentLogEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      canUndo: this.isUndoAvailable(entry.id, this.session.revision),
    }));
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('McpBridgeClient listener threw error:', err);
      }
    }
  }

  /**
   * Pair with companion bridge using one-time pairing token.
   * On success, stores returned sessionId and transitions to 'connected'.
   */
  public async pairWithToken(
    token: string,
  ): Promise<{ ok: boolean; sessionId?: string; error?: string; code?: string }> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      this.status = 'error';
      this.errorMessage = 'Pairing token is required';
      this.notifyListeners();
      return { ok: false, error: this.errorMessage, code: 'INVALID_TOKEN' };
    }

    this.status = 'connecting';
    this.errorMessage = null;
    this.notifyListeners();

    try {
      if (!this.fetchFn) {
        throw new Error('fetch is not available in this environment');
      }

      const res = await this.fetchFn(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanToken}`,
        },
        body: JSON.stringify({
          tool: 'get_project_info',
          projectId: this.projectId,
          expectedRevision: this.session.revision,
        }),
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        const code = data?.error?.code ?? 'PAIRING_FAILED';
        const msg = data?.error?.message ?? data?.error ?? `Pairing failed with status ${res.status}`;
        this.status = 'error';
        this.errorMessage = typeof msg === 'string' ? msg : JSON.stringify(msg);
        this.notifyListeners();
        return { ok: false, error: this.errorMessage, code };
      }

      const returnedSessionId = data.sessionId ?? data.result?.sessionId ?? data.body?.sessionId;
      if (typeof returnedSessionId !== 'string') {
        this.status = 'error';
        this.errorMessage = 'No sessionId returned from companion';
        this.notifyListeners();
        return { ok: false, error: this.errorMessage, code: 'NO_SESSION_ID' };
      }

      this.sessionId = returnedSessionId;
      this.status = 'connected';
      this.errorMessage = null;

      this.initWebSocket();
      this.notifyListeners();
      return { ok: true, sessionId: returnedSessionId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.status = 'error';
      this.errorMessage = errorMsg;
      this.notifyListeners();
      return { ok: false, error: errorMsg, code: 'NETWORK_ERROR' };
    }
  }

  private initWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const factory =
      this.wsFactory ??
      (typeof WebSocket !== 'undefined' ? (url: string) => new WebSocket(url) : undefined);
    if (!factory) return;

    try {
      const url = `${this.wsUrl}?sessionId=${encodeURIComponent(this.sessionId ?? '')}`;
      this.ws = factory(url);
      if (this.ws && typeof this.ws.addEventListener === 'function') {
        this.ws.addEventListener('message', (event: any) => {
          try {
            const raw = typeof event.data === 'string' ? event.data : String(event.data);
            const msg = JSON.parse(raw);
            if (msg.type === 'command' && typeof msg.operation === 'string') {
              const res = this.handleRelayedCommand(msg.operation, msg.args ?? {});
              if (msg.requestId && typeof this.ws.send === 'function') {
                this.ws.send(JSON.stringify({ type: 'command_result', requestId: msg.requestId, ...res }));
              }
            }
          } catch {}
        });
        this.ws.addEventListener('close', () => {
          this.ws = null;
        });
        this.ws.addEventListener('error', () => {
          // Handled silently
        });
      }
    } catch {}
  }

  /**
   * Close WS connection, clear sessionId, and transition to 'disconnected'.
   */
  public disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.sessionId = null;
    this.status = 'disconnected';
    this.errorMessage = null;
    this.notifyListeners();
  }

  /**
   * Execute an MCP command relayed from companion against the browser's EditorSession.
   * Records an entry in the agent log and returns the execution result.
   */
  public handleRelayedCommand(
    operation: string,
    args: Record<string, unknown> = {},
  ): RelayedExecutionResult {
    // Read tools query session state
    if (isReadTool(operation)) {
      try {
        const queryResult = this.session.query(this.mapToolToQuery(operation, args));
        return {
          success: true,
          revision: this.session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          result: queryResult,
        };
      } catch (err) {
        return {
          success: false,
          revision: this.session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          errorCode: 'QUERY_FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Direct undo
    if (operation === 'undo') {
      const res = this.session.undo();
      if (!res || !res.ok) {
        return {
          success: false,
          revision: this.session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          errorCode: 'CANNOT_UNDO',
          errorMessage: 'Nothing to undo',
        };
      }
      const entry: BrowserAgentLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        tool: 'undo',
        projectId: this.projectId,
        revision: res.revision,
        changedCells: res.changed.cells,
        resultSummary: 'Undo executed',
        warnings: [],
        canUndo: false,
        undone: false,
        changedPlacements: res.changed.placementIds,
        args,
      };
      this.entries.push(entry);
      this.notifyListeners();
      return {
        success: true,
        revision: res.revision,
        changedCells: res.changed.cells,
        changedPlacements: res.changed.placementIds,
        warnings: [],
      };
    }

    // Direct redo
    if (operation === 'redo') {
      const res = this.session.redo();
      if (!res || !res.ok) {
        return {
          success: false,
          revision: this.session.revision,
          changedCells: 0,
          changedPlacements: [],
          warnings: [],
          errorCode: 'CANNOT_REDO',
          errorMessage: 'Nothing to redo',
        };
      }
      const entry: BrowserAgentLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        tool: 'redo',
        projectId: this.projectId,
        revision: res.revision,
        changedCells: res.changed.cells,
        resultSummary: 'Redo executed',
        warnings: [],
        canUndo: false,
        undone: false,
        changedPlacements: res.changed.placementIds,
        args,
      };
      this.entries.push(entry);
      this.notifyListeners();
      return {
        success: true,
        revision: res.revision,
        changedCells: res.changed.cells,
        changedPlacements: res.changed.placementIds,
        warnings: [],
      };
    }

    // Add default placement if filling on an empty project
    const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
    if (rawBounds && (operation.startsWith('fill') || operation === 'fill_selection')) {
      ensureDefaultPlacementIfNeeded(this.session, tupleToBounds(rawBounds));
    }

    const cmds = mapToolToCommands(operation, args);
    if (cmds.length === 0) {
      return {
        success: true,
        revision: this.session.revision,
        changedCells: 0,
        changedPlacements: [],
        warnings: [],
      };
    }

    let lastRevision = this.session.revision;
    let totalChangedCells = 0;
    const changedPlacements = new Set<string>();

    for (const cmd of cmds) {
      const res = this.session.execute(cmd, {
        requestId: args.requestId as string | undefined,
        expectedRevision: typeof args.expectedRevision === 'number' ? args.expectedRevision : undefined,
      });

      if (!res.ok) {
        return {
          success: false,
          revision: this.session.revision,
          changedCells: totalChangedCells,
          changedPlacements: Array.from(changedPlacements),
          warnings: [],
          errorCode: res.error.code,
          errorMessage: res.error.message,
        };
      }

      lastRevision = res.revision;
      totalChangedCells += res.changed.cells;
      res.changed.placementIds.forEach((id) => changedPlacements.add(id));
    }

    const entryId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: BrowserAgentLogEntry = {
      id: entryId,
      timestamp: new Date().toISOString(),
      tool: operation,
      projectId: this.projectId,
      revision: lastRevision,
      changedCells: totalChangedCells,
      resultSummary:
        totalChangedCells > 0
          ? `Applied ${operation}: ${totalChangedCells} blocks changed`
          : `Executed ${operation}`,
      warnings: [],
      canUndo: true,
      undone: false,
      changedPlacements: Array.from(changedPlacements),
      args,
    };

    this.entries.push(entry);
    this.notifyListeners();

    return {
      success: true,
      revision: lastRevision,
      changedCells: totalChangedCells,
      changedPlacements: Array.from(changedPlacements),
      warnings: [],
    };
  }

  private mapToolToQuery(tool: string, args: Record<string, unknown>): any {
    switch (tool) {
      case 'get_project_info':
        return { type: 'getProject' };
      case 'list_placements':
        return { type: 'listPlacements', filter: args.filter, limit: args.limit, offset: args.offset };
      case 'get_placement':
        return { type: 'getPlacement', placementId: args.placementId };
      case 'get_selection':
        return { type: 'getSelection' };
      case 'get_material_list':
        return {
          type: 'materialList',
          mode: args.perPlacement ? 'perPlacement' : 'effective',
          placementId: args.placementId,
        };
      case 'detect_conflicts':
      case 'get_conflict_map': {
        const rawBounds = (args.worldBounds ?? args.bounds) as number[] | undefined;
        return {
          type: 'detectConflicts',
          bounds: rawBounds ? tupleToBounds(rawBounds) : undefined,
        };
      }
      case 'get_history':
        return { type: 'getHistory', limit: args.limit, offset: args.offset };
      default:
        return { type: tool, ...args };
    }
  }

  /**
   * Implements D-8 rule:
   * Returns true ONLY if the entry exists, was a mutating operation (changedCells >= 0 and not a read tool),
   * has not already been undone, entry.revision === currentRevision (the latest committed revision),
   * and session.canUndo() is true.
   */
  public isUndoAvailable(
    entryId: string,
    currentRevision: number = this.session.revision,
  ): boolean {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return false;
    if (entry.undone === true) return false;
    if (isReadTool(entry.tool)) return false;
    if (entry.changedCells < 0) return false;
    if (entry.revision !== currentRevision) return false;
    if (!this.session.canUndo()) return false;
    return true;
  }

  /**
   * Undo an agent operation:
   * Verifies isUndoAvailable(entryId), calls session.undo(), marks entry as undone, and notifies listeners.
   */
  public undoAgentEntry(
    entryId: string,
  ): { ok: boolean; revision?: number; error?: string } {
    if (!this.isUndoAvailable(entryId, this.session.revision)) {
      return {
        ok: false,
        error: 'Cannot undo operation: D-8 revision mismatch, already undone, or session cannot undo',
      };
    }

    const res = this.session.undo();
    if (!res || !res.ok) {
      return {
        ok: false,
        error: res?.error?.message ?? 'Session undo failed',
      };
    }

    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.undone = true;
      entry.canUndo = false;
    }

    this.notifyListeners();
    return { ok: true, revision: this.session.revision };
  }

  public destroy(): void {
    this.disconnect();
    this.sessionUnsub();
    this.listeners.clear();
  }
}
