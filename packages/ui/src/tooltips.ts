// packages/ui/src/tooltips.ts
// Tooltip controller: wraps the g-2 state machine with a reference panel (opened by "?")
// and an onboarding controller. Pure TypeScript.
// SUBSPEC-G §4.3, §6.6.

import {
  createTooltipState,
  createOnboardingState,
  DEFAULT_TOOLTIP_CONFIG,
  SHORTCUT_REFERENCE_KEY,
  type TooltipStateApi,
  type OnboardingStateApi,
  type TooltipConfig,
} from './tooltip-types.ts';

import type { ShortcutBinding } from './shortcut-types.ts';

// ============================================================================
// Types
// ============================================================================

export type TooltipController = {
  tooltip(): TooltipStateApi;
  onboarding(): OnboardingStateApi;
  /** True when the shortcut reference panel is open. */
  referenceOpen(): boolean;
  openReference(): void;
  closeReference(): void;
  toggleReference(): void;
  /** Handle a key press; returns true if it opened/closed the reference. */
  handleKey(key: string): boolean;
  /** Current tooltip target (or null). */
  currentTooltip(): string | null;
  /** Hover a target; returns whether the tooltip is visible. */
  hover(targetId: string, now: number): boolean;
  leave(targetId: string): void;
  /** Shortcut text for an action (or null). */
  shortcutFor(action: string): string | null;
};

export type TooltipControllerOptions = {
  config?: Partial<TooltipConfig>;
  bindings?: Map<string, ShortcutBinding>;
  onboardingInitial?: Partial<{ firstLaunch: boolean; dismissed: boolean; replayable: boolean; completedSteps: string[] }>;
};

// ============================================================================
// Factory
// ============================================================================

export function createTooltipController(options?: TooltipControllerOptions): TooltipController {
  const tooltip = createTooltipState({
    config: options?.config,
    bindings: options?.bindings,
  });
  const onboarding = createOnboardingState(options?.onboardingInitial ?? { firstLaunch: true });

  let referenceOpen = false;

  function openReference(): void {
    referenceOpen = true;
  }

  function closeReference(): void {
    referenceOpen = false;
  }

  function toggleReference(): void {
    referenceOpen = !referenceOpen;
  }

  function handleKey(key: string): boolean {
    if (key === SHORTCUT_REFERENCE_KEY) {
      toggleReference();
      return true;
    }
    if (key === 'Escape' && referenceOpen) {
      closeReference();
      return true;
    }
    return false;
  }

  function currentTooltip(): string | null {
    return tooltip.visibleTarget();
  }

  function hover(targetId: string, now: number): boolean {
    return tooltip.hover(targetId, now);
  }

  function leave(targetId: string): void {
    tooltip.leave(targetId);
  }

  function shortcutFor(action: string): string | null {
    return tooltip.shortcutFor(action);
  }

  return {
    tooltip: () => tooltip,
    onboarding: () => onboarding,
    referenceOpen: () => referenceOpen,
    openReference,
    closeReference,
    toggleReference,
    handleKey,
    currentTooltip,
    hover,
    leave,
    shortcutFor,
  };
}
