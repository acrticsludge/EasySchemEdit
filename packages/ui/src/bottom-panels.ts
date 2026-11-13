// packages/ui/src/bottom-panels.ts
// Bottom panels: tab switching, content model, UX safeguards.
// Pure TypeScript. SUBSPEC-G §6.4, §6.5.

// ============================================================================
// Types
// ============================================================================

export type BottomTabId = 'materials' | 'conflicts' | 'history' | 'diagnostics' | 'agent-log' | 'assets';

export type Severity = 'info' | 'warning' | 'error';

export type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
};

export type ProgressState = {
  active: boolean;
  label: string;
  percent: number; // 0..100
  cancellable: boolean;
};

export type Warning = {
  id: string;
  message: string;
  severity: Severity;
  icon: string; // non-color signal
};

export type BottomPanelState = {
  activeTab: BottomTabId;
  tabStates: Record<BottomTabId, Record<string, unknown>>;
  confirmDialog: ConfirmDialog | null;
  progress: ProgressState | null;
  warnings: Warning[];
};

export type BottomPanels = {
  state(): BottomPanelState;
  activeTab(): BottomTabId;
  setActiveTab(tab: BottomTabId): void;
  getTabState(tab: BottomTabId): Record<string, unknown>;
  setTabState(tab: BottomTabId, state: Record<string, unknown>): void;
  // UX safeguards.
  requestConfirm(dialog: ConfirmDialog): void;
  resolveConfirm(confirmed: boolean): boolean;
  cancelConfirm(): void;
  startProgress(label: string, cancellable?: boolean): void;
  updateProgress(percent: number): void;
  finishProgress(): void;
  cancelProgress(): boolean;
  pushWarning(warning: Warning): void;
  dismissWarning(id: string): void;
  clearWarnings(): void;
  // Lock targets: show which placements are locked (not just color).
  lockedTargets(): string[];
  setLockedTargets(targets: string[]): void;
};

export type BottomPanelsOptions = {
  activeTab?: BottomTabId;
  tabs?: BottomTabId[];
};

const DEFAULT_TABS: BottomTabId[] = ['materials', 'conflicts', 'history', 'diagnostics', 'agent-log', 'assets'];

// ============================================================================
// Factory
// ============================================================================

export function createBottomPanels(options?: BottomPanelsOptions): BottomPanels {
  const tabs = options?.tabs ?? DEFAULT_TABS;
  let activeTab: BottomTabId = options?.activeTab ?? tabs[0] ?? 'materials';

  const tabStates: Record<BottomTabId, Record<string, unknown>> = {} as Record<BottomTabId, Record<string, unknown>>;
  for (const tab of tabs) tabStates[tab] = {};

  let confirmDialog: ConfirmDialog | null = null;
  let confirmResolver: ((confirmed: boolean) => void) | null = null;
  let progress: ProgressState | null = null;
  const warnings: Warning[] = [];
  let lockedTargets: string[] = [];

  function state(): BottomPanelState {
    return {
      activeTab,
      tabStates: Object.fromEntries(
        Object.entries(tabStates).map(([k, v]) => [k, { ...v }]),
      ) as Record<BottomTabId, Record<string, unknown>>,
      confirmDialog: confirmDialog ? { ...confirmDialog } : null,
      progress: progress ? { ...progress } : null,
      warnings: warnings.map((w) => ({ ...w })),
    };
  }

  function setActiveTab(tab: BottomTabId): void {
    if (tabs.includes(tab)) activeTab = tab;
  }

  function getTabState(tab: BottomTabId): Record<string, unknown> {
    return { ...(tabStates[tab] ?? {}) };
  }

  function setTabState(tab: BottomTabId, s: Record<string, unknown>): void {
    tabStates[tab] = { ...s };
  }

  function requestConfirm(dialog: ConfirmDialog): void {
    confirmDialog = { ...dialog };
  }

  function resolveConfirm(confirmed: boolean): boolean {
    const result = confirmed;
    confirmDialog = null;
    if (confirmResolver) {
      confirmResolver(confirmed);
      confirmResolver = null;
    }
    return result;
  }

  function cancelConfirm(): void {
    confirmDialog = null;
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
  }

  function startProgress(label: string, cancellable: boolean = false): void {
    progress = { active: true, label, percent: 0, cancellable };
  }

  function updateProgress(percent: number): void {
    if (progress) {
      progress = { ...progress, percent: Math.max(0, Math.min(100, percent)) };
    }
  }

  function finishProgress(): void {
    if (progress) {
      progress = { ...progress, active: false, percent: 100 };
    }
  }

  function cancelProgress(): boolean {
    if (progress && progress.cancellable) {
      progress = null;
      return true;
    }
    return false;
  }

  function pushWarning(warning: Warning): void {
    if (!warnings.some((w) => w.id === warning.id)) {
      warnings.push({ ...warning });
    }
  }

  function dismissWarning(id: string): void {
    const idx = warnings.findIndex((w) => w.id === id);
    if (idx !== -1) warnings.splice(idx, 1);
  }

  function clearWarnings(): void {
    warnings.length = 0;
  }

  function lockedTargetsFn(): string[] {
    return [...lockedTargets];
  }

  function setLockedTargets(targets: string[]): void {
    lockedTargets = [...targets];
  }

  return {
    state,
    activeTab: () => activeTab,
    setActiveTab,
    getTabState,
    setTabState,
    requestConfirm,
    resolveConfirm,
    cancelConfirm,
    startProgress,
    updateProgress,
    finishProgress,
    cancelProgress,
    pushWarning,
    dismissWarning,
    clearWarnings,
    lockedTargets: lockedTargetsFn,
    setLockedTargets,
  };
}
