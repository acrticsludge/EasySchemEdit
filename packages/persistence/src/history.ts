// packages/persistence/src/history.ts
// History with undo/redo stack (SUBSPEC-C §4.4, §2.3.6).
// In-memory stack: record/edit entries, undo/redo, stack limits, redo-clear on new edit.

export type HistoryEntryType = 'edit' | 'paste' | 'delete' | 'move' | 'transform';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  projectId: string;
  timestamp: number;
  beforeRevision: number;
  afterRevision: number;
  data: unknown;           // serialized before/after state or delta
}

export interface HistoryManagerOptions {
  projectId: string;
  maxEntries: number;        // e.g. 100
}

export class HistoryManager {
  private readonly projectId: string;
  private readonly maxEntries: number;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(options: HistoryManagerOptions) {
    this.projectId = options.projectId;
    this.maxEntries = options.maxEntries;
  }

  // Record a new entry: push to undo stack, clear redo stack.
  // Enforces stack limit: drop oldest entries when exceeding maxEntries.
  record(entry: HistoryEntry): void {
    // Clear redo stack on new edit
    this.redoStack = [];

    // Push to undo stack
    this.undoStack.push(entry);

    // Enforce stack limit: drop oldest entries
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack = this.undoStack.slice(this.undoStack.length - this.maxEntries);
    }
  }

  // Undo: pop from undo stack, push to redo stack.
  // Returns the undone entry, or null if nothing to undo.
  undo(): HistoryEntry | null {
    if (this.undoStack.length === 0) {
      return null;
    }

    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);
    return entry;
  }

  // Redo: pop from redo stack, push to undo stack.
  // Returns the redone entry, or null if nothing to redo.
  redo(): HistoryEntry | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // Clear both stacks.
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // Get current undo stack (most recent entry last).
  getUndoStack(): HistoryEntry[] {
    return [...this.undoStack];
  }

  // Get current redo stack (most recent entry last).
  getRedoStack(): HistoryEntry[] {
    return [...this.redoStack];
  }

  // Get number of undo entries.
  undoCount(): number {
    return this.undoStack.length;
  }

  // Get number of redo entries.
  redoCount(): number {
    return this.redoStack.length;
  }
}
