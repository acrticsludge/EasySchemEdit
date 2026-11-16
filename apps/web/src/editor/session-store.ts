// apps/web/src/editor/session-store.ts
// React external store wrapping EditorSession (AD-1).
// Provides single document API for UI with reactive synchronization via useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import {
  EditorSession,
  type Command,
  type CommandExecutionOptions,
  type Query,
  type Result,
  type SessionChangeEvent,
} from '@easyschemedit/operations';
import type { Project } from '@easyschemedit/domain';

export interface EditorStoreState {
  readonly revision: number;
  readonly selectedTool: string;
  readonly activeBottomTab: string | null;
  readonly importReport: any | null;
  readonly statusMessage: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly project: Project;
}

export interface CustomUndoEntry {
  label: string;
  undo: () => void;
  redo: () => void;
}

type TimelineEntry = { kind: 'session' } | ({ kind: 'custom' } & CustomUndoEntry);

/**
 * Singleton-capable reactive store that wraps EditorSession.
 * Bridges EditorSession document state and history with UI-specific reactive state.
 */
export class EditorSessionStore {
  public readonly session: EditorSession;
  private selectedTool: string = 'select';
  private activeBottomTab: string | null = null;
  private importReport: any | null = null;
  private statusMessage: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentSnapshot: EditorStoreState;
  private unsubscribeSession: () => void;

  private undoTimeline: TimelineEntry[] = [];
  private redoTimeline: TimelineEntry[] = [];
  private lastSessionUndoCount = 0;
  private lastSessionRedoCount = 0;
  private isApplyingStoreUndoRedo = false;

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    const { undoCount, redoCount } = this.getSessionHistoryCounts();
    this.lastSessionUndoCount = undoCount;
    this.lastSessionRedoCount = redoCount;
    for (let i = 0; i < undoCount; i++) {
      this.undoTimeline.push({ kind: 'session' });
    }
    for (let i = 0; i < redoCount; i++) {
      this.redoTimeline.push({ kind: 'session' });
    }
    this.currentSnapshot = this.buildSnapshot();

    this.unsubscribeSession = this.session.subscribe((_event: SessionChangeEvent) => {
      if (!this.isApplyingStoreUndoRedo) {
        const { undoCount, redoCount } = this.getSessionHistoryCounts();
        if (undoCount > this.lastSessionUndoCount) {
          const diff = undoCount - this.lastSessionUndoCount;
          for (let i = 0; i < diff; i++) {
            this.undoTimeline.push({ kind: 'session' });
          }
          this.redoTimeline = [];
        } else if (undoCount === 0 && redoCount === 0) {
          this.undoTimeline = [];
          this.redoTimeline = [];
        } else if (undoCount < this.lastSessionUndoCount) {
          let toRemove = this.lastSessionUndoCount - undoCount;
          for (let i = this.undoTimeline.length - 1; i >= 0 && toRemove > 0; i--) {
            if (this.undoTimeline[i]!.kind === 'session') {
              this.undoTimeline.splice(i, 1);
              toRemove--;
            }
          }
        }
        this.lastSessionUndoCount = undoCount;
        this.lastSessionRedoCount = redoCount;
      }
      this.updateSnapshotAndNotify();
    });
  }

  private getSessionHistoryCounts(): { undoCount: number; redoCount: number } {
    try {
      const history = this.session.query<{ undoCount: number; redoCount: number }>({ type: 'getHistory' });
      return {
        undoCount: typeof history?.undoCount === 'number' ? history.undoCount : 0,
        redoCount: typeof history?.redoCount === 'number' ? history.redoCount : 0,
      };
    } catch {
      return { undoCount: 0, redoCount: 0 };
    }
  }

  private buildSnapshot(): EditorStoreState {
    return {
      revision: this.session.revision,
      selectedTool: this.selectedTool,
      activeBottomTab: this.activeBottomTab,
      importReport: this.importReport,
      statusMessage: this.statusMessage,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      project: this.session.peekProject(),
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('EditorSessionStore listener error:', err);
      }
    }
  }

  private updateSnapshotAndNotify(): void {
    this.currentSnapshot = this.buildSnapshot();
    this.notify();
  }

  public getSnapshot = (): EditorStoreState => {
    return this.currentSnapshot;
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public setSelectedTool(tool: string): void {
    if (this.selectedTool !== tool) {
      this.selectedTool = tool;
      this.currentSnapshot = {
        ...this.currentSnapshot,
        selectedTool: tool,
      };
      this.notify();
    }
  }

  public setActiveBottomTab(tab: string | null): void {
    if (this.activeBottomTab !== tab) {
      this.activeBottomTab = tab;
      this.currentSnapshot = {
        ...this.currentSnapshot,
        activeBottomTab: tab,
      };
      this.notify();
    }
  }

  public setImportReport(report: any | null): void {
    this.importReport = report;
    this.currentSnapshot = {
      ...this.currentSnapshot,
      importReport: report,
    };
    this.notify();
  }

  public setStatusMessage(message: string | null): void {
    if (this.statusMessage !== message) {
      this.statusMessage = message;
      this.currentSnapshot = {
        ...this.currentSnapshot,
        statusMessage: message,
      };
      this.notify();
    }
  }

  public async execute(cmd: Command, opts?: CommandExecutionOptions): Promise<Result<any>> {
    return this.session.execute(cmd, opts);
  }

  public async query<T>(q: Query): Promise<T> {
    return this.session.query<T>(q);
  }

  public pushCustomUndo(entry: CustomUndoEntry): void {
    this.undoTimeline.push({ kind: 'custom', ...entry });
    this.redoTimeline = [];
    this.updateSnapshotAndNotify();
  }

  public clearCustomUndoHistory(): void {
    this.undoTimeline = this.undoTimeline.filter((e) => e.kind !== 'custom');
    this.redoTimeline = this.redoTimeline.filter((e) => e.kind !== 'custom');
    this.updateSnapshotAndNotify();
  }

  public async undo(): Promise<Result<any>> {
    if (this.undoTimeline.length === 0) {
      return this.session.undo();
    }

    const top = this.undoTimeline.pop()!;
    if (top.kind === 'custom') {
      try {
        top.undo();
      } catch (err) {
        console.error('Custom undo error:', err);
      }
      this.redoTimeline.push(top);
      this.updateSnapshotAndNotify();
      return {
        ok: true,
        success: true,
        value: {
          revision: this.session.revision,
          changed: { cells: 0, placementIds: [] },
        },
        revision: this.session.revision,
        changed: { cells: 0, placementIds: [] },
      } as any;
    } else {
      this.isApplyingStoreUndoRedo = true;
      try {
        const res = this.session.undo();
        if (res && (res as any).ok !== false) {
          this.redoTimeline.push({ kind: 'session' });
        } else {
          this.undoTimeline.push(top);
        }
        const { undoCount, redoCount } = this.getSessionHistoryCounts();
        this.lastSessionUndoCount = undoCount;
        this.lastSessionRedoCount = redoCount;
        this.updateSnapshotAndNotify();
        return res as any;
      } finally {
        this.isApplyingStoreUndoRedo = false;
      }
    }
  }

  public async redo(): Promise<Result<any>> {
    if (this.redoTimeline.length === 0) {
      return this.session.redo();
    }

    const top = this.redoTimeline.pop()!;
    if (top.kind === 'custom') {
      try {
        top.redo();
      } catch (err) {
        console.error('Custom redo error:', err);
      }
      this.undoTimeline.push(top);
      this.updateSnapshotAndNotify();
      return {
        ok: true,
        success: true,
        value: {
          revision: this.session.revision,
          changed: { cells: 0, placementIds: [] },
        },
        revision: this.session.revision,
        changed: { cells: 0, placementIds: [] },
      } as any;
    } else {
      this.isApplyingStoreUndoRedo = true;
      try {
        const res = this.session.redo();
        if (res && (res as any).ok !== false) {
          this.undoTimeline.push({ kind: 'session' });
        } else {
          this.redoTimeline.push(top);
        }
        const { undoCount, redoCount } = this.getSessionHistoryCounts();
        this.lastSessionUndoCount = undoCount;
        this.lastSessionRedoCount = redoCount;
        this.updateSnapshotAndNotify();
        return res as any;
      } finally {
        this.isApplyingStoreUndoRedo = false;
      }
    }
  }

  public canUndo(): boolean {
    return this.undoTimeline.length > 0 || this.session.canUndo();
  }

  public canRedo(): boolean {
    return this.redoTimeline.length > 0 || this.session.canRedo();
  }

  public dispose(): void {
    this.unsubscribeSession();
    this.listeners.clear();
  }
}

/**
 * Creates a new independent EditorSessionStore instance.
 */
export function createEditorSessionStore(initialProject?: Project): EditorSessionStore {
  return new EditorSessionStore(initialProject);
}

/**
 * Default global singleton instance of EditorSessionStore.
 */
export const editorSessionStore = new EditorSessionStore();

/**
 * React hook to subscribe to the EditorSessionStore using useSyncExternalStore.
 */
export function useEditorSession(store: EditorSessionStore = editorSessionStore): EditorStoreState {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
