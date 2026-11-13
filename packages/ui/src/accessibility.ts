// packages/ui/src/accessibility.ts
// Accessibility: keyboard nav, focus management, reduced motion, contrast, touch targets.
// Pure TypeScript. SUBSPEC-G §6.7, §8.2 item 17.

// ============================================================================
// Types
// ============================================================================

export type A11yContrastResult = { ratio: number; pass: boolean; level: 'AA' | 'AAA' | 'fail' };

export type FocusTrap = {
  active: boolean;
  containerId: string | null;
};

export type AccessibilityState = {
  reducedMotion: boolean;
  focusStack: string[];
  focusTrap: FocusTrap;
  highContrast: boolean;
};

export type Accessibility = {
  state(): AccessibilityState;
  setReducedMotion(enabled: boolean): void;
  prefersReducedMotion(): boolean;
  // Focus management.
  pushFocus(elementId: string): void;
  popFocus(): string | null;
  currentFocus(): string | null;
  trapFocus(containerId: string): void;
  releaseFocusTrap(): void;
  isFocusTrapped(): boolean;
  // Contrast check (WCAG 2.2).
  checkContrast(foreground: string, background: string, largeText?: boolean): A11yContrastResult;
  // Touch target check (WCAG 2.5.8: min 24px).
  checkTouchTarget(width: number, height: number): boolean;
  // Non-color indicator check.
  hasNonColorIndicator(hasIcon: boolean, hasText: boolean): boolean;
  // High contrast.
  setHighContrast(enabled: boolean): void;
};

export type AccessibilityOptions = {
  reducedMotion?: boolean;
  highContrast?: boolean;
};

// ============================================================================
// Helpers
// ============================================================================

function parseHex(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  if (!fgRgb || !bgRgb) return 0;
  const l1 = relativeLuminance(...fgRgb);
  const l2 = relativeLuminance(...bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================================
// Factory
// ============================================================================

export function createAccessibility(options?: AccessibilityOptions): Accessibility {
  let reducedMotion = options?.reducedMotion ?? false;
  let highContrast = options?.highContrast ?? false;
  const focusStack: string[] = [];
  let focusTrap: FocusTrap = { active: false, containerId: null };

  function state(): AccessibilityState {
    return {
      reducedMotion,
      focusStack: [...focusStack],
      focusTrap: { ...focusTrap },
      highContrast,
    };
  }

  function setReducedMotion(enabled: boolean): void {
    reducedMotion = enabled;
  }

  function prefersReducedMotion(): boolean {
    return reducedMotion;
  }

  function pushFocus(elementId: string): void {
    focusStack.push(elementId);
  }

  function popFocus(): string | null {
    return focusStack.pop() ?? null;
  }

  function currentFocus(): string | null {
    return focusStack.length > 0 ? focusStack[focusStack.length - 1] : null;
  }

  function trapFocus(containerId: string): void {
    focusTrap = { active: true, containerId };
  }

  function releaseFocusTrap(): void {
    focusTrap = { active: false, containerId: null };
  }

  function isFocusTrapped(): boolean {
    return focusTrap.active;
  }

  function checkContrast(fg: string, bg: string, largeText: boolean = false): A11yContrastResult {
    const ratio = contrastRatio(fg, bg);
    const threshold = largeText ? 3 : 4.5;
    const aaaThreshold = largeText ? 4.5 : 7;
    let level: A11yContrastResult['level'] = 'fail';
    if (ratio >= aaaThreshold) level = 'AAA';
    else if (ratio >= threshold) level = 'AA';
    return { ratio: Math.round(ratio * 100) / 100, pass: ratio >= threshold, level };
  }

  function checkTouchTarget(width: number, height: number): boolean {
    return width >= 24 && height >= 24;
  }

  function hasNonColorIndicator(hasIcon: boolean, hasText: boolean): boolean {
    return hasIcon || hasText;
  }

  function setHighContrast(enabled: boolean): void {
    highContrast = enabled;
  }

  return {
    state,
    setReducedMotion,
    prefersReducedMotion,
    pushFocus,
    popFocus,
    currentFocus,
    trapFocus,
    releaseFocusTrap,
    isFocusTrapped,
    checkContrast,
    checkTouchTarget,
    hasNonColorIndicator,
    setHighContrast,
  };
}
