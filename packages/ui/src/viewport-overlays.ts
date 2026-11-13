// packages/ui/src/viewport-overlays.ts
// Viewport overlays: chunk borders, section borders, block borders.
// Pure TypeScript. SUBSPEC-G §6.1.

// ============================================================================
// Types
// ============================================================================

export type OverlayType = 'chunk-borders' | 'section-borders' | 'block-borders';

export type OverlayState = Record<OverlayType, boolean>;

export type ViewportOverlays = {
  state(): OverlayState;
  isVisible(type: OverlayType): boolean;
  toggle(type: OverlayType): void;
  set(type: OverlayType, visible: boolean): void;
  showAll(): void;
  hideAll(): void;
  exportState(): OverlayState;
  importState(state: Partial<OverlayState>): void;
  reset(): void;
};

export type ViewportOverlaysOptions = {
  initial?: Partial<OverlayState>;
};

const DEFAULTS: OverlayState = {
  'chunk-borders': true,
  'section-borders': false,
  'block-borders': false,
};

// ============================================================================
// Factory
// ============================================================================

export function createViewportOverlays(options?: ViewportOverlaysOptions): ViewportOverlays {
  let state: OverlayState = { ...DEFAULTS, ...(options?.initial ?? {}) };

  function stateFn(): OverlayState {
    return { ...state };
  }

  function isVisible(type: OverlayType): boolean {
    return state[type];
  }

  function toggle(type: OverlayType): void {
    state = { ...state, [type]: !state[type] };
  }

  function set(type: OverlayType, visible: boolean): void {
    state = { ...state, [type]: visible };
  }

  function showAll(): void {
    state = { 'chunk-borders': true, 'section-borders': true, 'block-borders': true };
  }

  function hideAll(): void {
    state = { 'chunk-borders': false, 'section-borders': false, 'block-borders': false };
  }

  function exportState(): OverlayState {
    return { ...state };
  }

  function importState(s: Partial<OverlayState>): void {
    state = { ...state, ...s };
  }

  function reset(): void {
    state = { ...DEFAULTS };
  }

  return {
    state: stateFn,
    isVisible,
    toggle,
    set,
    showAll,
    hideAll,
    exportState,
    importState,
    reset,
  };
}
