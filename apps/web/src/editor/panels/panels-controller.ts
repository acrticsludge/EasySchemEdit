// apps/web/src/editor/panels/panels-controller.ts
// Pure TypeScript view-models / controllers for Conflicts Panel, Bake Dialog,
// and Material List Panel (Slice E3.8, SUBSPEC-D §§8-10, SUBSPEC-G §6.4).
// Can be executed and unit-tested in Node without DOM/Three.js dependencies.

import type { Bounds3i, BlockStateId, Vec3i, Project } from '@easyschemedit/domain';
import type {
  ConflictResult,
  ConflictEntry,
  ConflictCategory,
  MaterialReport,
  Result,
} from '@easyschemedit/operations';

export type {
  ConflictResult,
  ConflictEntry,
  ConflictCategory,
  MaterialReport,
};
import {
  createConflictNavigator,
  type ConflictNavigator,
  type Conflict,
} from '@easyschemedit/ui';
import type { EditorSessionStore } from '../session-store.ts';

// ============================================================================
// Types
// ============================================================================

export type OverlayMode = 'off' | 'all' | 'conflicts-only';
export type OverlapPolicy = 'top-wins' | 'bottom-wins';
export type MaterialListMode = 'effective' | 'perPlacement';
export type SortOrder = 'count-desc' | 'count-asc' | 'id-asc';

export interface ConflictStats {
  totalOverlaps: number;
  realConflicts: number;       // state-conflict (different-block)
  identicalOverlaps: number;   // same-state (same-block)
  airOverrides: number;
}

export interface MaterialItem {
  blockId: string;
  count: number;
  percentage: number;
  stacks: number;
  remainder: number;
  shulkerBoxes: number;
}

export interface BakeControllerOptions {
  placementIds?: string[];
  createNewPlacement?: boolean;
  newPlacementName?: string;
  overlapPolicy?: OverlapPolicy;
}

export interface ConflictsPanelControllerOptions {
  active?: boolean;
}

export interface MaterialListControllerOptions {
  active?: boolean;
}

export interface IEditorSessionStore {
  query<T>(q: any): Promise<T>;
  execute(cmd: any, opts?: any): Promise<Result<any>>;
  undo(): Promise<Result<any>>;
  redo(): Promise<Result<any>>;
  getSnapshot(): { project: Project; revision: number; [key: string]: any };
  subscribe(listener: () => void): () => void;
}

// ============================================================================
// Conflicts Panel Controller
// ============================================================================

export class ConflictsPanelController {
  private store: IEditorSessionStore;
  private overlayMode: OverlayMode = 'conflicts-only';
  private overlapPolicy: OverlapPolicy = 'top-wins';
  private conflictResult: ConflictResult | null = null;
  private navigator: ConflictNavigator;
  private activeIndex: number = -1;
  private cameraFlyCallback: ((pos: [number, number, number]) => void) | null = null;
  private listeners: Set<() => void> = new Set();
  private unsubscribeStore?: () => void;
  private active: boolean = true;
  private dirty: boolean = false;
  private lastRevision: number = -1;

  constructor(
    store: IEditorSessionStore,
    initialOverlayMode: OverlayMode = 'conflicts-only',
    options?: ConflictsPanelControllerOptions
  ) {
    this.store = store;
    this.overlayMode = initialOverlayMode;
    this.active = options?.active ?? true;
    this.dirty = !this.active;
    this.navigator = createConflictNavigator();

    this.unsubscribeStore = this.store.subscribe(() => {
      const snapshot = this.store.getSnapshot();
      const revision = snapshot.revision ?? 0;
      if (revision === this.lastRevision) {
        return;
      }
      if (!this.active) {
        this.dirty = true;
        return;
      }
      void this.refresh();
    });
  }

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active && (this.dirty || this.conflictResult === null)) {
      void this.refresh();
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public getOverlayMode(): OverlayMode {
    return this.overlayMode;
  }

  public setOverlayMode(mode: OverlayMode): void {
    if (this.overlayMode !== mode) {
      this.overlayMode = mode;
      const snapshot = this.store.getSnapshot();
      if (snapshot.project) {
        snapshot.project.conflictOverlay = mode === 'all' ? 'full' : mode === 'conflicts-only' ? 'conflicts' : 'off';
      }
      this.rebuildNavigator();
      this.notify();
    }
  }

  public getOverlapPolicy(): OverlapPolicy {
    return this.overlapPolicy;
  }

  public async setOverlapPolicy(policy: OverlapPolicy): Promise<void> {
    if (this.overlapPolicy !== policy) {
      this.overlapPolicy = policy;
      await this.refresh();
    }
  }

  public async refresh(): Promise<void> {
    const snapshot = this.store.getSnapshot();
    const revision = snapshot.revision ?? 0;
    this.lastRevision = revision;
    this.dirty = false;

    const placements = snapshot.project?.placements ?? [];
    const visiblePlacements = placements.filter((p) => p.visible !== false);
    if (visiblePlacements.length <= 1) {
      this.conflictResult = {
        category: 'clean',
        entries: [],
        hasConflicts: false,
        cleanPositions: [],
        sameStatePositions: [],
        stateConflictPositions: [],
      };
      this.rebuildNavigator();
      this.notify();
      return;
    }

    try {
      const result = await this.store.query<ConflictResult>({
        type: 'detectConflicts',
        overlapPolicy: this.overlapPolicy,
      });
      this.conflictResult = result;
      this.rebuildNavigator();
      this.notify();
    } catch (err) {
      console.error('Failed to query detectConflicts:', err);
    }
  }

  private rebuildNavigator(): void {
    const list = this.getConflictList();
    const conflictsForNav: Conflict[] = list.map((e, idx) => ({
      id: `conflict-${idx}-${e.position.join('_')}`,
      region: `[${e.position.join(', ')}]`,
      owner: e.winningOwner ?? e.owners.join(', '),
      severity: e.category === 'state-conflict' ? 'red' : 'yellow',
      target: { x: e.position[0], y: e.position[1], z: e.position[2] },
    }));

    this.navigator = createConflictNavigator({ conflicts: conflictsForNav });
    if (list.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex < 0 || this.activeIndex >= list.length) {
      this.activeIndex = 0;
    }
  }

  public getStats(): ConflictStats {
    if (!this.conflictResult) {
      return {
        totalOverlaps: 0,
        realConflicts: 0,
        identicalOverlaps: 0,
        airOverrides: 0,
      };
    }

    const entries = this.conflictResult.entries ?? [];
    const realConflicts = entries.filter((e) => e.category === 'state-conflict').length;
    const identicalOverlaps = entries.filter((e) => e.category === 'same-state').length;
    const totalOverlaps = entries.filter((e) => e.owners.length >= 2).length;

    return {
      totalOverlaps,
      realConflicts,
      identicalOverlaps,
      airOverrides: 0,
    };
  }

  public getEntries(): ConflictEntry[] {
    return this.conflictResult?.entries ?? [];
  }

  public getRelevantEntries(): ConflictEntry[] {
    const entries = this.getEntries();
    if (this.overlayMode === 'off') {
      return [];
    }
    if (this.overlayMode === 'conflicts-only') {
      return entries.filter((e) => e.category === 'state-conflict');
    }
    // 'all' includes state-conflict, same-state, or any cell with multiple owners
    return entries.filter((e) => e.owners.length >= 2 || e.category === 'state-conflict' || e.category === 'same-state');
  }

  public getConflictList(): ConflictEntry[] {
    const entries = this.getEntries();
    if (this.overlayMode === 'off') {
      return [];
    }
    if (this.overlayMode === 'conflicts-only') {
      return entries.filter((e) => e.category === 'state-conflict');
    }
    // Return all conflicts/overlaps for table & navigation
    return entries.filter((e) => e.category === 'state-conflict' || e.category === 'same-state');
  }

  public getNavigator(): ConflictNavigator {
    return this.navigator;
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public getActiveConflict(): ConflictEntry | null {
    const list = this.getConflictList();
    if (this.activeIndex >= 0 && this.activeIndex < list.length) {
      return list[this.activeIndex]!;
    }
    return null;
  }

  public next(): boolean {
    const list = this.getConflictList();
    if (list.length === 0) return false;
    this.activeIndex = (this.activeIndex + 1) % list.length;
    const current = list[this.activeIndex]!;
    this.navigator.navigateTo(`conflict-${this.activeIndex}-${current.position.join('_')}`);
    if (this.cameraFlyCallback) {
      this.cameraFlyCallback([current.position[0], current.position[1], current.position[2]]);
    }
    this.notify();
    return true;
  }

  public prev(): boolean {
    const list = this.getConflictList();
    if (list.length === 0) return false;
    this.activeIndex = (this.activeIndex - 1 + list.length) % list.length;
    const current = list[this.activeIndex]!;
    this.navigator.navigateTo(`conflict-${this.activeIndex}-${current.position.join('_')}`);
    if (this.cameraFlyCallback) {
      this.cameraFlyCallback([current.position[0], current.position[1], current.position[2]]);
    }
    this.notify();
    return true;
  }

  public jumpTo(index: number): boolean {
    const list = this.getConflictList();
    if (index < 0 || index >= list.length) return false;
    this.activeIndex = index;
    const current = list[index]!;
    this.navigator.navigateTo(`conflict-${index}-${current.position.join('_')}`);
    if (this.cameraFlyCallback) {
      this.cameraFlyCallback([current.position[0], current.position[1], current.position[2]]);
    }
    this.notify();
    return true;
  }

  public onCameraFly(callback: (pos: [number, number, number]) => void): void {
    this.cameraFlyCallback = callback;
  }

  public async resolveKeepWinner(cell: ConflictEntry, winnerPlacementId: string): Promise<Result<any>> {
    const losingOwners = cell.owners.filter((id) => id !== winnerPlacementId);
    let lastResult: Result<any> = { ok: true, success: true, value: undefined };

    for (const loserId of losingOwners) {
      const deleteCmd = {
        type: 'region:delete' as const,
        bounds: {
          min: [...cell.position] as Vec3i,
          maxExclusive: [cell.position[0] + 1, cell.position[1] + 1, cell.position[2] + 1] as Vec3i,
        },
        placementId: loserId,
      };
      lastResult = await this.store.execute(deleteCmd);
      if (!lastResult.ok) {
        break;
      }
    }

    await this.refresh();
    return lastResult;
  }

  public async resolveHideLosers(cell: ConflictEntry, winnerPlacementId: string): Promise<Result<any>> {
    const losingOwners = cell.owners.filter((id) => id !== winnerPlacementId);
    let lastResult: Result<any> = { ok: true, success: true, value: undefined };

    for (const loserId of losingOwners) {
      lastResult = await this.store.execute({
        type: 'placement:setHidden',
        placementId: loserId,
        hidden: true,
      });
      if (!lastResult.ok) {
        break;
      }
    }

    await this.refresh();
    return lastResult;
  }

  public async resolveBakeAll(opts?: {
    createNewPlacement?: boolean;
    newPlacementName?: string;
    overlapPolicy?: OverlapPolicy;
    placementIds?: string[];
  }): Promise<Result<any>> {
    const res = await this.store.execute({
      type: 'bake',
      overlapPolicy: opts?.overlapPolicy ?? this.overlapPolicy,
      createNewPlacement: opts?.createNewPlacement ?? false,
      newPlacementName: opts?.newPlacementName,
      placementIds: opts?.placementIds,
    });
    await this.refresh();
    return res;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('ConflictsPanelController listener error:', err);
      }
    }
  }

  public dispose(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = undefined;
    }
    this.listeners.clear();
  }
}

// ============================================================================
// Bake Controller
// ============================================================================

export class BakeController {
  private store: IEditorSessionStore;
  private placementIds?: string[];
  private createNewPlacement: boolean = false;
  private newPlacementName: string = 'Baked Result';
  private overlapPolicy: OverlapPolicy = 'top-wins';
  private listeners: Set<() => void> = new Set();

  constructor(store: IEditorSessionStore, options?: BakeControllerOptions) {
    this.store = store;
    if (options?.placementIds) this.placementIds = [...options.placementIds];
    if (options?.createNewPlacement !== undefined) this.createNewPlacement = options.createNewPlacement;
    if (options?.newPlacementName) this.newPlacementName = options.newPlacementName;
    if (options?.overlapPolicy) this.overlapPolicy = options.overlapPolicy;
  }

  public getOptions(): BakeControllerOptions {
    return {
      placementIds: this.placementIds ? [...this.placementIds] : undefined,
      createNewPlacement: this.createNewPlacement,
      newPlacementName: this.newPlacementName,
      overlapPolicy: this.overlapPolicy,
    };
  }

  public setPlacementIds(ids?: string[]): void {
    this.placementIds = ids ? [...ids] : undefined;
    this.notify();
  }

  public setCreateNewPlacement(create: boolean): void {
    if (this.createNewPlacement !== create) {
      this.createNewPlacement = create;
      this.notify();
    }
  }

  public setNewPlacementName(name: string): void {
    if (this.newPlacementName !== name) {
      this.newPlacementName = name;
      this.notify();
    }
  }

  public setOverlapPolicy(policy: OverlapPolicy): void {
    if (this.overlapPolicy !== policy) {
      this.overlapPolicy = policy;
      this.notify();
    }
  }

  public getAvailablePlacements(): Array<{ id: string; name: string; locked: boolean; nonAirCount: number }> {
    const placements = this.store.getSnapshot().project?.placements ?? [];
    return placements.map((p) => ({
      id: p.id,
      name: p.name,
      locked: p.locked,
      nonAirCount: p.volume.nonAirCount,
    }));
  }

  public canBake(): { ok: boolean; reason?: string } {
    const all = this.store.getSnapshot().project?.placements ?? [];
    const targetIds = this.placementIds ?? all.map((p) => p.id);

    if (targetIds.length < 2) {
      return { ok: false, reason: 'Bake requires at least 2 placements' };
    }

    const targets = all.filter((p) => targetIds.includes(p.id));
    if (targets.length < 2) {
      return { ok: false, reason: 'Bake requires at least 2 existing placements' };
    }

    const locked = targets.find((p) => p.locked);
    if (locked) {
      return { ok: false, reason: `Placement "${locked.name}" is locked. Unlock it first.` };
    }

    return { ok: true };
  }

  public async executeBake(overrideOpts?: Partial<BakeControllerOptions>): Promise<Result<any>> {
    const targetIds = overrideOpts?.placementIds ?? this.placementIds;
    const createNew = overrideOpts?.createNewPlacement ?? this.createNewPlacement;
    const name = overrideOpts?.newPlacementName ?? this.newPlacementName;
    const policy = overrideOpts?.overlapPolicy ?? this.overlapPolicy;

    return this.store.execute({
      type: 'bake',
      placementIds: targetIds,
      createNewPlacement: createNew,
      newPlacementName: name,
      overlapPolicy: policy,
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('BakeController listener error:', err);
      }
    }
  }
}

// ============================================================================
// Material List Controller
// ============================================================================

export class MaterialListController {
  private store: IEditorSessionStore;
  private mode: MaterialListMode = 'effective';
  private placementId?: string;
  private bounds?: Bounds3i;
  private searchQuery: string = '';
  private sortOrder: SortOrder = 'count-desc';
  private items: MaterialItem[] = [];
  private totalBlocks: number = 0;
  private totalTypes: number = 0;
  private listeners: Set<() => void> = new Set();
  private unsubscribeStore?: () => void;
  private active: boolean = true;
  private dirty: boolean = false;
  private lastRevision: number = -1;

  constructor(store: IEditorSessionStore, options?: MaterialListControllerOptions) {
    this.store = store;
    this.active = options?.active ?? true;
    this.dirty = !this.active;
    this.unsubscribeStore = this.store.subscribe(() => {
      const snapshot = this.store.getSnapshot();
      const revision = snapshot.revision ?? 0;
      if (revision === this.lastRevision) {
        return;
      }
      if (!this.active) {
        this.dirty = true;
        return;
      }
      void this.refresh();
    });
  }

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active && (this.dirty || (this.items.length === 0 && this.totalBlocks === 0 && this.lastRevision === -1))) {
      void this.refresh();
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public getMode(): MaterialListMode {
    return this.mode;
  }

  public async setMode(mode: MaterialListMode): Promise<void> {
    if (this.mode !== mode) {
      this.mode = mode;
      await this.refresh();
    }
  }

  public getPlacementId(): string | undefined {
    return this.placementId;
  }

  public async setPlacementId(id?: string): Promise<void> {
    if (this.placementId !== id) {
      this.placementId = id;
      await this.refresh();
    }
  }

  public getBounds(): Bounds3i | undefined {
    return this.bounds;
  }

  public async setBounds(bounds?: Bounds3i): Promise<void> {
    this.bounds = bounds;
    await this.refresh();
  }

  public getSearchQuery(): string {
    return this.searchQuery;
  }

  public setSearchQuery(query: string): void {
    if (this.searchQuery !== query) {
      this.searchQuery = query;
      this.notify();
    }
  }

  public getSortOrder(): SortOrder {
    return this.sortOrder;
  }

  public setSortOrder(order: SortOrder): void {
    if (this.sortOrder !== order) {
      this.sortOrder = order;
      this.notify();
    }
  }

  public async refresh(): Promise<void> {
    const snapshot = this.store.getSnapshot();
    const revision = snapshot.revision ?? 0;
    this.lastRevision = revision;
    this.dirty = false;

    const placements = snapshot.project?.placements ?? [];
    if (placements.length === 0) {
      this.items = [];
      this.totalBlocks = 0;
      this.totalTypes = 0;
      this.notify();
      return;
    }

    try {
      const report = await this.store.query<any>({
        type: 'materialList',
        mode: this.mode,
        placementId: this.placementId,
        bounds: this.bounds,
      });

      let typeCounts: Array<{ blockId: string; count: number; percentage: number }> = [];

      if (this.mode === 'effective' || this.placementId) {
        typeCounts = report?.typeCounts ?? [];
        this.totalBlocks = report?.totalBlocks ?? 0;
        this.totalTypes = report?.totalTypes ?? 0;
      } else {
        // Per-placement across all placements: report is Record<string, MaterialReport>
        const countMap = new Map<string, number>();
        let sum = 0;
        if (report && typeof report === 'object') {
          for (const key of Object.keys(report)) {
            const rep = report[key] as MaterialReport;
            if (rep && Array.isArray(rep.typeCounts)) {
              for (const tc of rep.typeCounts) {
                countMap.set(tc.blockId, (countMap.get(tc.blockId) ?? 0) + tc.count);
                sum += tc.count;
              }
            }
          }
        }
        this.totalBlocks = sum;
        this.totalTypes = countMap.size;
        typeCounts = Array.from(countMap.entries()).map(([blockId, count]) => ({
          blockId,
          count,
          percentage: sum > 0 ? (count / sum) * 100 : 0,
        }));
      }

      this.items = typeCounts.map((tc) => {
        const count = tc.count;
        return {
          blockId: tc.blockId,
          count,
          percentage: tc.percentage,
          stacks: Math.floor(count / 64),
          remainder: count % 64,
          shulkerBoxes: +(count / 1728).toFixed(2),
        };
      });

      this.notify();
    } catch (err) {
      console.error('Failed to query materialList:', err);
    }
  }

  public getItems(): MaterialItem[] {
    return this.items;
  }

  public getFilteredItems(): MaterialItem[] {
    let result = this.items;

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter((item) => item.blockId.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      switch (this.sortOrder) {
        case 'count-desc':
          return b.count - a.count;
        case 'count-asc':
          return a.count - b.count;
        case 'id-asc':
          return a.blockId.localeCompare(b.blockId);
        default:
          return 0;
      }
    });

    return result;
  }

  public getTotalBlocks(): number {
    return this.totalBlocks;
  }

  public getTotalFilteredBlocks(): number {
    return this.getFilteredItems().reduce((acc, item) => acc + item.count, 0);
  }

  public getTotalTypes(): number {
    return this.totalTypes;
  }

  public toCsv(): string {
    const header = 'Block ID,Count,Stacks,Remainder,Shulker Boxes,Percentage';
    const rows = this.getFilteredItems().map(
      (item) => `${item.blockId},${item.count},${item.stacks},${item.remainder},${item.shulkerBoxes},${item.percentage.toFixed(2)}%`
    );
    return [header, ...rows].join('\n');
  }

  public toJson(): string {
    return JSON.stringify(this.getFilteredItems(), null, 2);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('MaterialListController listener error:', err);
      }
    }
  }

  public dispose(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = undefined;
    }
    this.listeners.clear();
  }
}
