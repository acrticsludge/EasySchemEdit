// packages/ui/src/onboarding.ts
// Onboarding controller: wraps the g-2 state machine with step tracking and persistence.
// Pure TypeScript. SUBSPEC-G §6.6.

import {
  createOnboardingState,
  type OnboardingState,
  type OnboardingStateApi,
} from './tooltip-types.ts';

// ============================================================================
// Types
// ============================================================================

export type OnboardingController = {
  state(): OnboardingState;
  isVisible(): boolean;
  dismiss(): void;
  replay(): void;
  completeStep(stepId: string): void;
  isStepCompleted(stepId: string): boolean;
  completedSteps(): string[];
  /** Serialise for persistence. */
  exportState(): OnboardingState;
  /** Restore from a persisted state. */
  importState(state: Partial<OnboardingState>): void;
  /** Reset to first-launch defaults. */
  reset(): void;
};

export type OnboardingControllerOptions = {
  initial?: Partial<OnboardingState>;
};

// ============================================================================
// Factory
// ============================================================================

export function createOnboarding(options?: OnboardingControllerOptions): OnboardingController {
  let inner: OnboardingStateApi = createOnboardingState(options?.initial ?? { firstLaunch: true });

  function state(): OnboardingState {
    return inner.state();
  }

  function isVisible(): boolean {
    return inner.isVisible();
  }

  function dismiss(): void {
    inner.dismiss();
  }

  function replay(): void {
    inner.replay();
  }

  function completeStep(stepId: string): void {
    inner.completeStep(stepId);
  }

  function isStepCompleted(stepId: string): boolean {
    return inner.state().completedSteps.includes(stepId);
  }

  function completedSteps(): string[] {
    return [...inner.state().completedSteps];
  }

  function exportState(): OnboardingState {
    return inner.state();
  }

  function importState(s: Partial<OnboardingState>): void {
    inner = createOnboardingState(s);
  }

  function reset(): void {
    inner = createOnboardingState({ firstLaunch: true });
  }

  return {
    state,
    isVisible,
    dismiss,
    replay,
    completeStep,
    isStepCompleted,
    completedSteps,
    exportState,
    importState,
    reset,
  };
}
