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

  constructor(initialProject?: Project) {
    this.session = new EditorSession(initialProject);
    this.currentSnapshot = this.buildSnapshot();

    this.unsubscribeSession = this.session.subscribe((_event: SessionChangeEvent) => {
      this.updateSnapshotAndNotify();
    });
  }

  private buildSnapshot(): EditorStoreState {
    return {
      revision: this.session.revision,
      selectedTool: this.selectedTool,
      activeBottomTab: this.activeBottomTab,
      importReport: this.importReport,
      statusMessage: this.statusMessage,
      canUndo: this.session.canUndo(),
      canRedo: this.session.canRedo(),
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

  public async undo(): Promise<Result<any>> {
    return this.session.undo();
  }

  public async redo(): Promise<Result<any>> {
    return this.session.redo();
  }

  public canUndo(): boolean {
    return this.session.canUndo();
  }

  public canRedo(): boolean {
    return this.session.canRedo();
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
