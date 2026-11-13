// packages/ui/src/tooltip-types.ts
// Tooltip timing and onboarding state (SUBSPEC-G §2.3, §4.3, §6.6, §6.6.1).
//
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports: the hover intent is a small
// state machine driven by an injected clock, so the 500ms delay is testable without timers.
//
// §6.6.1 adds a requirement slice g-1 does not cover: browser-reserved chords cannot be
// overridden, so the guard lives here and is exported for the shortcut settings panel.

import { normalizeKeys } from './shortcut-types.ts';
import type { ShortcutBinding } from './shortcut-types.ts';

// ============================================================================
// Types (SPEC-G §2.3)
// ============================================================================

export type TooltipConfig = {
  /** Hover delay before the tooltip appears. 500ms per G7. */
  delayMs: number;
  showShortcut: boolean;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** §6.6: max width 300px. */
  maxWidthPx: number;
};

export type OnboardingState = {
  firstLaunch: boolean;
  dismissed: boolean;
  /** §6.6: all onboarding is replayable from settings. */
  replayable: boolean;
  completedSteps: string[];
};

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TOOLTIP_CONFIG: Readonly<TooltipConfig> = Object.freeze({
  delayMs: 500,
  showShortcut: true,
  position: 'auto',
  maxWidthPx: 300,
});

/** §4.3: tooltip delay minimum 200ms, maximum 1000ms. */
export const MIN_TOOLTIP_DELAY_MS = 200;
export const MAX_TOOLTIP_DELAY_MS = 1000;

/** §6.6: `?` opens the keyboard shortcut reference. */
export const SHORTCUT_REFERENCE_KEY = '?';

/**
 * §6.6.1: browser-reserved chords cannot be overridden. Chrome/Firefox/Edge reserve these for
 * tabs, windows and reload; an editor binding to one of them would be silently swallowed.
 */
export const BROWSER_RESERVED_SHORTCUTS: readonly string[] = [
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+N',
  'Ctrl+Shift+T',
  'Ctrl+Shift+W',
  'Ctrl+Shift+N',
  'Ctrl+Q',
  'F5',
  'F11',
  'F12',
];

/** True when the chord is browser-reserved and therefore unbindable. */
export function isBrowserReservedShortcut(keys: string): boolean {
  const canonical = normalizeKeys(keys);
  return BROWSER_RESERVED_SHORTCUTS.some(
    (reserved) => normalizeKeys(reserved) === canonical,
  );
}

// ============================================================================
// Tooltip configuration validation (§4.3)
// ============================================================================

export type TooltipValidation = { ok: boolean; reasons: string[] };

export function validateTooltipConfig(config: TooltipConfig): TooltipValidation {
  const reasons: string[] = [];

  if (
    !Number.isInteger(config.delayMs) ||
    config.delayMs < MIN_TOOLTIP_DELAY_MS ||
    config.delayMs > MAX_TOOLTIP_DELAY_MS
  ) {
    reasons.push(
      `delayMs must be an integer between ${MIN_TOOLTIP_DELAY_MS} and ${MAX_TOOLTIP_DELAY_MS}, got ${config.delayMs}`,
    );
  }
  if (!Number.isInteger(config.maxWidthPx) || config.maxWidthPx <= 0) {
    reasons.push(`maxWidthPx must be a positive integer, got ${config.maxWidthPx}`);
  }
  if (!['top', 'bottom', 'left', 'right', 'auto'].includes(config.position)) {
    reasons.push(`unknown tooltip position: ${String(config.position)}`);
  }
  if (typeof config.showShortcut !== 'boolean') {
    reasons.push('showShortcut must be a boolean');
  }

  return reasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, reasons };
}

// ============================================================================
// Tooltip state machine
// ============================================================================

export type TooltipStateApi = {
  config(): TooltipConfig;
  /** Record a hover intent; returns whether the tooltip should now be visible. */
  hover(targetId: string, now: number): boolean;
  /** Record a leave; the tooltip hides immediately. */
  leave(targetId: string): void;
  /** Move between targets without the delay restarting (the pointer is still over the surface). */
  moveTo(targetId: string, now: number): boolean;
  visibleTarget(): string | null;
  reset(): void;
  /** §6.6: `?` opens the keyboard shortcut reference. */
  isShortcutReferenceRequest(key: string): boolean;
  /** §4.3: shortcuts are shown only when a binding exists. */
  shortcutFor(action: string): string | null;
};

export type TooltipStateOptions = {
  config?: Partial<TooltipConfig>;
  /** Bindings used to resolve the shortcut shown in a tooltip. */
  bindings?: Map<string, ShortcutBinding>;
};

export function createTooltipState(options: TooltipStateOptions = {}): TooltipStateApi {
  const config: TooltipConfig = { ...DEFAULT_TOOLTIP_CONFIG, ...(options.config ?? {}) };
  const bindings = options.bindings ?? new Map<string, ShortcutBinding>();

  /** The target the pointer is over, and when it was entered. */
  let hovered: { targetId: string; since: number } | null = null;
  let visible: string | null = null;

  function config_(): TooltipConfig {
    return { ...config };
  }

  function evaluate(now: number): boolean {
    if (hovered === null) {
      visible = null;
      return false;
    }
    const elapsed = now - hovered.since;
    if (elapsed >= config.delayMs) {
      visible = hovered.targetId;
      return true;
    }
    visible = null;
    return false;
  }

  function hover(targetId: string, now: number): boolean {
    // Hovering the same target again keeps the original start time (the pointer never left).
    if (hovered !== null && hovered.targetId === targetId) return evaluate(now);
    hovered = { targetId, since: now };
    return evaluate(now);
  }

  function leave(targetId: string): void {
    if (hovered !== null && hovered.targetId === targetId) hovered = null;
    if (visible === targetId) visible = null;
  }

  function moveTo(targetId: string, now: number): boolean {
    if (hovered !== null && hovered.targetId === targetId) return evaluate(now);
    hovered = { targetId, since: now };
    return evaluate(now);
  }

  function visibleTarget(): string | null {
    return visible;
  }

  function reset(): void {
    hovered = null;
    visible = null;
  }

  function isShortcutReferenceRequest(key: string): boolean {
    return key === SHORTCUT_REFERENCE_KEY;
  }

  function shortcutFor(action: string): string | null {
    if (!config.showShortcut) return null;
    const binding = bindings.get(action);
    if (binding === undefined || !binding.enabled) return null;
    return binding.keys;
  }

  return {
    config: config_,
    hover,
    leave,
    moveTo,
    visibleTarget,
    reset,
    isShortcutReferenceRequest,
    shortcutFor,
  };
}

// ============================================================================
// Onboarding state machine
// ============================================================================

export type OnboardingStateApi = {
  state(): OnboardingState;
  dismiss(): void;
  completeStep(stepId: string): void;
  replay(): void;
  isVisible(): boolean;
};

export function createOnboardingState(initial: Partial<OnboardingState> = {}): OnboardingStateApi {
  let state: OnboardingState = {
    firstLaunch: initial.firstLaunch ?? true,
    dismissed: initial.dismissed ?? false,
    replayable: initial.replayable ?? true,
    completedSteps: [...(initial.completedSteps ?? [])],
  };

  function snapshot(): OnboardingState {
    return { ...state, completedSteps: [...state.completedSteps] };
  }

  function isVisible(): boolean {
    return !state.dismissed;
  }

  function dismiss(): void {
    state = { ...state, dismissed: true, firstLaunch: false };
  }

  function completeStep(stepId: string): void {
    if (state.completedSteps.includes(stepId)) return;
    state = { ...state, completedSteps: [...state.completedSteps, stepId] };
  }

  function replay(): void {
    // Replay shows the flow again without discarding what the user already completed.
    state = { ...state, dismissed: false, firstLaunch: false };
  }

  return { state: snapshot, dismiss, completeStep, replay, isVisible };
}
