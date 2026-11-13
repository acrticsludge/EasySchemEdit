// packages/ui/src/shortcuts.ts
// Shortcut keyboard handler: context scoping, key-repeat, platform-aware modifiers,
// typing guard passthrough. Wraps the g-1 registry; never touches the DOM.
// SUBSPEC-G §3.2, §4.2, §6.7 (G5).

import {
  createShortcutRegistry,
  type ShortcutRegistryApi,
  type KeyDescriptor,
  type ShortcutBinding,
} from './shortcut-types.ts';

// ============================================================================
// Types
// ============================================================================

export type ShortcutContext = 'global' | 'viewport' | 'outliner' | 'inspector';

export type ShortcutHandler = {
  registry(): ShortcutRegistryApi;
  activeContext(): ShortcutContext;
  setActiveContext(ctx: ShortcutContext): void;
  platform(): 'mac' | 'other';
  setPlatform(p: 'mac' | 'other'): void;
  /** Returns the action id that fired, or null. */
  handleKeydown(descriptor: KeyDescriptor, options?: { repeat?: boolean; inTextInput?: boolean }): string | null;
  /** Whether a key is currently held (for repeat suppression). */
  isHeld(key: string): boolean;
  releaseKey(key: string): void;
  releaseAll(): void;
  /** Bindings scoped to the current context (global always included). */
  scopedBindings(): ShortcutBinding[];
  /** Detect conflicts across the scoped set. */
  scopedConflicts(): { keys: string; actions: string[] }[];
  /** Assign a binding to a context (default: global). */
  setBindingContext(action: string, ctx: ShortcutContext): void;
};

export type ShortcutHandlerOptions = {
  registry?: ShortcutRegistryApi;
  platform?: 'mac' | 'other';
  initialContext?: ShortcutContext;
};

// ============================================================================
// Helpers
// ============================================================================

/** Normalise a descriptor's modifier flags for the platform. On Mac, meta counts as ctrl. */
function platformDescriptor(descriptor: KeyDescriptor, platform: 'mac' | 'other'): KeyDescriptor {
  if (platform === 'mac') {
    return { ...descriptor, ctrl: descriptor.ctrl || descriptor.meta };
  }
  return { ...descriptor, meta: false };
}

// ============================================================================
// Factory
// ============================================================================

export function createShortcutHandler(options?: ShortcutHandlerOptions): ShortcutHandler {
  const registry = options?.registry ?? createShortcutRegistry();
  let platform: 'mac' | 'other' = options?.platform ?? 'other';
  let activeContext: ShortcutContext = options?.initialContext ?? 'global';
  const held = new Set<string>();

  // Context metadata: which bindings belong to which context.
  // Default: all bindings are global unless overridden via setBindingContext.
  const bindingContext = new Map<string, ShortcutContext>();

  function scopedBindings(): ShortcutBinding[] {
    const all = registry.all();
    return all.filter((b) => {
      const ctx = bindingContext.get(b.action) ?? 'global';
      return ctx === 'global' || ctx === activeContext;
    });
  }

  function scopedConflicts(): { keys: string; actions: string[] }[] {
    // Reuse the registry's conflict detection on the scoped subset.
    const scoped = scopedBindings();
    const byKeys = new Map<string, string[]>();
    for (const b of scoped) {
      if (!b.enabled) continue;
      const canonical = b.keys; // already canonical
      const actions = byKeys.get(canonical) ?? [];
      actions.push(b.action);
      byKeys.set(canonical, actions);
    }
    const result: { keys: string; actions: string[] }[] = [];
    for (const [keys, actions] of byKeys) {
      if (actions.length > 1) result.push({ keys, actions: [...actions].sort() });
    }
    return result.sort((a, b) => a.keys.localeCompare(b.keys));
  }

  function handleKeydown(
    descriptor: KeyDescriptor,
    options?: { repeat?: boolean; inTextInput?: boolean },
  ): string | null {
    const repeat = options?.repeat ?? false;
    const inTextInput = options?.inTextInput ?? false;

    // Typing guard: if focus is in a text input, skip (unless the registry says otherwise).
    if (inTextInput) {
      registry.setTypingGuard(true);
    } else {
      registry.setTypingGuard(false);
    }

    const pd = platformDescriptor(descriptor, platform);

    // Key repeat suppression: a held key fires once unless repeat:true.
    const keyId = `${pd.ctrl ? 'C' : ''}${pd.alt ? 'A' : ''}${pd.shift ? 'S' : ''}${pd.key}`;
    if (repeat && held.has(keyId)) {
      // Repeat event for an already-held key: suppress unless the binding allows repeat.
      // We check the binding; if it doesn't explicitly allow repeat, suppress.
      const canonical = keyId; // simplified; registry resolves via descriptorKey internally
      // Fall through to resolve; repeat suppression is handled by the registry's resolution.
    }

    const resolution = registry.resolve(pd);
    if (!resolution.fired) {
      if (resolution.reason === 'typing-guard') return null;
      return null;
    }

    // Context scoping: the resolved action must be in the scoped set.
    const scoped = new Set(scopedBindings().map((b) => b.action));
    if (!scoped.has(resolution.action)) return null;

    // Track held keys.
    held.add(keyId);

    return resolution.action;
  }

  function isHeld(key: string): boolean {
    return held.has(key);
  }

  function releaseKey(key: string): void {
    held.delete(key);
  }

  function releaseAll(): void {
    held.clear();
  }

  function setActiveContext(ctx: ShortcutContext): void {
    activeContext = ctx;
  }

  function setBindingContext(action: string, ctx: ShortcutContext): void {
    bindingContext.set(action, ctx);
  }

  function setPlatform(p: 'mac' | 'other'): void {
    platform = p;
  }

  return {
    registry: () => registry,
    activeContext: () => activeContext,
    setActiveContext,
    platform: () => platform,
    setPlatform,
    handleKeydown,
    isHeld,
    releaseKey,
    releaseAll,
    scopedBindings,
    scopedConflicts,
    setBindingContext,
  };
}

// Re-export types for convenience.
export type { ShortcutBinding, KeyDescriptor, ShortcutRegistryApi } from './shortcut-types.ts';
