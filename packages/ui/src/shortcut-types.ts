// packages/ui/src/shortcut-types.ts
// Shortcut registry: G5 bindings, canonical key matching, conflict detection, typing guard.
// (SUBSPEC-G §2.2, §3.2, §4.2, §6.7 / G5)
//
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports: a keydown arrives as a
// `KeyDescriptor`, so this module never touches `window`, `document`, or an event object.
//
// Two spec rules drive the design:
//   §3.2 "Keydown event → check typingGuard (if in input, skip) → check editorSurfaceFocused →
//        lookup binding → if found and enabled: execute, preventDefault → if not found: pass through"
//   §4.2 "Shortcuts must not fire while typing in text/number inputs. No duplicate bindings for the
//        same action. Editable shortcuts stored in user preferences. Default shortcuts cannot be
//        deleted, only remapped."

// ============================================================================
// Types (SPEC-G §2.2)
// ============================================================================

export type ShortcutBinding = {
  action: string;
  /** Human-facing chord, e.g. "Ctrl+Z", "1", "Delete". Canonicalised by `normalizeKeys`. */
  keys: string;
  editable: boolean;
  category: 'tools' | 'editing' | 'view' | 'file';
  enabled: boolean;
};

export type ShortcutRegistry = {
  bindings: Map<string, ShortcutBinding>;
  /** True while focus is in a text/number input (§4.2). */
  typingGuard: boolean;
  editorSurfaceFocused: boolean;
};

export type KeyDescriptor = {
  /** Normalised key: a lowercase single character, or a named key such as "escape"/"delete". */
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export type ShortcutFailureReason =
  | 'typing-guard'
  | 'surface-not-focused'
  | 'no-binding'
  | 'disabled';

export type ShortcutResolution =
  | { fired: true; action: string; preventDefault: true }
  | { fired: false; reason: ShortcutFailureReason };

export type ShortcutConflict = { keys: string; actions: string[] };

export type ShortcutRegistryApi = {
  get(action: string): ShortcutBinding | undefined;
  all(): ShortcutBinding[];
  setTypingGuard(typing: boolean): void;
  setEditorSurfaceFocused(focused: boolean): void;
  state(): ShortcutRegistry;
  resolve(descriptor: KeyDescriptor): ShortcutResolution;
  byKeys(keys: string): ShortcutBinding | undefined;
  remap(action: string, keys: string): boolean;
  add(binding: ShortcutBinding): boolean;
  remove(action: string): boolean;
  enable(action: string): boolean;
  disable(action: string): boolean;
  conflicts(): ShortcutConflict[];
};

// ============================================================================
// G5 table (SPEC-G §6.7)
// ============================================================================

/**
 * The spec's shortcut table, verbatim. Kept as data so the tests can assert the registry against the
 * document rather than against a second hand-typed list.
 */
export const G5_SHORTCUT_TABLE: ReadonlyArray<{
  action: string;
  label: string;
  keys: string;
  category: ShortcutBinding['category'];
}> = [
  { action: 'placement-mode', label: 'Placement mode', keys: '1', category: 'tools' },
  { action: 'region-mode', label: 'Region mode', keys: '2', category: 'tools' },
  { action: 'move', label: 'Move', keys: 'W', category: 'tools' },
  { action: 'rotate', label: 'Rotate', keys: 'E', category: 'tools' },
  { action: 'picker', label: 'Picker', keys: 'P', category: 'tools' },
  { action: 'focus-selection', label: 'Focus selection', keys: 'F', category: 'tools' },
  { action: 'select-all-placements', label: 'Select all placements', keys: 'Ctrl+A', category: 'editing' },
  { action: 'cancel', label: 'Clear selection / cancel', keys: 'Esc', category: 'editing' },
  { action: 'undo', label: 'Undo', keys: 'Ctrl+Z', category: 'editing' },
  { action: 'redo', label: 'Redo', keys: 'Ctrl+Shift+Z', category: 'editing' },
  { action: 'duplicate-selection', label: 'Duplicate selection', keys: 'Ctrl+D', category: 'editing' },
  { action: 'delete-selection', label: 'Delete selection', keys: 'Delete', category: 'editing' },
  { action: 'toggle-conflict-overlay', label: 'Toggle conflict overlay', keys: 'C', category: 'view' },
  { action: 'toggle-borders', label: 'Toggle borders', keys: 'B', category: 'view' },
  { action: 'focus-origin-editor', label: 'Focus origin editor', keys: 'O', category: 'view' },
  { action: 'save-project', label: 'Save project', keys: 'Ctrl+S', category: 'file' },
  { action: 'export', label: 'Export', keys: 'Ctrl+E', category: 'file' },
];

/**
 * The default bindings. Note there is no Bake entry: G5 removed `Ctrl+Shift+B` because it collides
 * with Chrome's bookmarks bar, leaving Bake on the context menu and toolbar with an optional
 * user-assigned shortcut.
 */
export const DEFAULT_BINDINGS: readonly ShortcutBinding[] = G5_SHORTCUT_TABLE.map((row) => ({
  action: row.action,
  keys: row.keys,
  editable: true,
  category: row.category,
  enabled: true,
}));

/** Actions whose bindings may never be deleted (§4.2 "cannot be deleted, only remapped"). */
const DEFAULT_ACTION_SET: ReadonlySet<string> = new Set(DEFAULT_BINDINGS.map((b) => b.action));

// ============================================================================
// Key normalisation
// ============================================================================

/** Aliases collapsed onto the canonical spelling the spec table uses. */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  escape: 'Esc',
  esc: 'Esc',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  spacebar: 'Space',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/**
 * Canonicalise a chord: modifier order fixed (Ctrl, Alt, Shift), `Cmd`/`Meta`/`Command` collapse onto
 * `Ctrl` (G-1.4, so a Mac and a Windows binding are comparable), key spelling normalised, letters
 * uppercased.
 */
export function normalizeKeys(keys: string): string {
  const parts = keys
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return '';

  const modifiers = new Set<string>();
  let keyPart = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command' || lower === 'meta') {
      modifiers.add('Ctrl');
    } else if (lower === 'shift') {
      modifiers.add('Shift');
    } else if (lower === 'alt' || lower === 'option' || lower === 'opt') {
      modifiers.add('Alt');
    } else {
      keyPart = part;
    }
  }

  const alias = KEY_ALIASES[keyPart.toLowerCase()];
  const key = alias ?? (keyPart.length === 1 ? keyPart.toUpperCase() : capitalize(keyPart));

  const ordered: string[] = [];
  if (modifiers.has('Ctrl')) ordered.push('Ctrl');
  if (modifiers.has('Alt')) ordered.push('Alt');
  if (modifiers.has('Shift')) ordered.push('Shift');
  if (key.length > 0) ordered.push(key);

  return ordered.join('+');
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  // Preserve camel-case named keys such as ArrowUp / Backspace; only fix all-lowercase input.
  if (value === value.toLowerCase()) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

/** Convert a chord into the descriptor shape a keydown handler produces. */
export function toKeyDescriptor(keys: string): KeyDescriptor {
  const canonical = normalizeKeys(keys);
  const parts = canonical.split('+').filter((part) => part.length > 0);
  const modifiers = new Set(parts.slice(0, -1));
  const key = parts[parts.length - 1] ?? '';

  const named: Readonly<Record<string, string>> = {
    Esc: 'escape',
    Delete: 'delete',
    Backspace: 'backspace',
    Enter: 'enter',
    Space: ' ',
    ArrowUp: 'arrowup',
    ArrowDown: 'arrowdown',
    ArrowLeft: 'arrowleft',
    ArrowRight: 'arrowright',
  };

  return {
    key: named[key] ?? key.toLowerCase(),
    ctrl: modifiers.has('Ctrl'),
    meta: false,
    shift: modifiers.has('Shift'),
    alt: modifiers.has('Alt'),
  };
}

/** Canonical identity of a descriptor, so a keydown and a binding compare in one shape. */
function descriptorKey(descriptor: KeyDescriptor): string {
  const parts: string[] = [];
  if (descriptor.ctrl || descriptor.meta) parts.push('Ctrl');
  if (descriptor.alt) parts.push('Alt');
  if (descriptor.shift) parts.push('Shift');

  const named: Readonly<Record<string, string>> = {
    escape: 'Esc',
    delete: 'Delete',
    backspace: 'Backspace',
    enter: 'Enter',
    ' ': 'Space',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
  };
  const raw = descriptor.key;
  const display = named[raw] ?? (raw.length === 1 ? raw.toUpperCase() : capitalize(raw));
  if (display.length > 0) parts.push(display);
  return parts.join('+');
}

// ============================================================================
// Conflict detection (§4.2)
// ============================================================================

/**
 * Report every canonical key set claimed by more than one *enabled* binding. A disabled binding
 * cannot fire, so it cannot conflict.
 */
export function findConflicts(bindings: readonly ShortcutBinding[]): ShortcutConflict[] {
  const byKeys = new Map<string, string[]>();
  for (const binding of bindings) {
    if (!binding.enabled) continue;
    const canonical = normalizeKeys(binding.keys);
    if (canonical.length === 0) continue;
    const actions = byKeys.get(canonical) ?? [];
    actions.push(binding.action);
    byKeys.set(canonical, actions);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [keys, actions] of byKeys) {
    if (actions.length > 1) conflicts.push({ keys, actions: actions.sort() });
  }
  return conflicts.sort((a, b) => a.keys.localeCompare(b.keys));
}

// ============================================================================
// Registry
// ============================================================================

export function createShortcutRegistry(initial?: readonly ShortcutBinding[]): ShortcutRegistryApi {
  const bindings = new Map<string, ShortcutBinding>();
  for (const binding of initial ?? DEFAULT_BINDINGS) {
    bindings.set(binding.action, { ...binding, keys: normalizeKeys(binding.keys) });
  }

  let typingGuard = false;
  let editorSurfaceFocused = true;

  function get(action: string): ShortcutBinding | undefined {
    const binding = bindings.get(action);
    return binding === undefined ? undefined : { ...binding };
  }

  function all(): ShortcutBinding[] {
    return [...bindings.values()].map((binding) => ({ ...binding }));
  }

  function setTypingGuard(typing: boolean): void {
    typingGuard = typing;
  }

  function setEditorSurfaceFocused(focused: boolean): void {
    editorSurfaceFocused = focused;
  }

  function state(): ShortcutRegistry {
    return {
      bindings: new Map(bindings),
      typingGuard,
      editorSurfaceFocused,
    };
  }

  function byKeys(keys: string): ShortcutBinding | undefined {
    const canonical = normalizeKeys(keys);
    for (const binding of bindings.values()) {
      if (binding.enabled && normalizeKeys(binding.keys) === canonical) return { ...binding };
    }
    return undefined;
  }

  /**
   * §3.2 exactly: typing guard first, then surface focus, then the lookup, then enabled.
   * A key with no binding is reported `no-binding` and the caller must NOT preventDefault.
   */
  function resolve(descriptor: KeyDescriptor): ShortcutResolution {
    if (typingGuard) return { fired: false, reason: 'typing-guard' };
    if (!editorSurfaceFocused) return { fired: false, reason: 'surface-not-focused' };

    const canonical = descriptorKey(descriptor);
    const match = [...bindings.values()].find(
      (binding) => normalizeKeys(binding.keys) === canonical,
    );
    if (match === undefined) return { fired: false, reason: 'no-binding' };
    if (!match.enabled) return { fired: false, reason: 'disabled' };

    return { fired: true, action: match.action, preventDefault: true };
  }

  /** Remap an existing binding. Refuses a chord already claimed by another enabled binding. */
  function remap(action: string, keys: string): boolean {
    const binding = bindings.get(action);
    if (binding === undefined) return false;

    const canonical = normalizeKeys(keys);
    if (canonical.length === 0) return false;
    if (canonical === normalizeKeys(binding.keys)) return true;

    for (const other of bindings.values()) {
      if (other.action === action) continue;
      if (other.enabled && normalizeKeys(other.keys) === canonical) return false;
    }

    bindings.set(action, { ...binding, keys: canonical });
    return true;
  }

  function add(binding: ShortcutBinding): boolean {
    if (bindings.has(binding.action)) return false;
    const canonical = normalizeKeys(binding.keys);
    if (canonical.length === 0) return false;
    for (const other of bindings.values()) {
      if (other.enabled && normalizeKeys(other.keys) === canonical) return false;
    }
    bindings.set(binding.action, { ...binding, keys: canonical });
    return true;
  }

  /** §4.2: a default binding cannot be deleted, only remapped. */
  function remove(action: string): boolean {
    if (DEFAULT_ACTION_SET.has(action)) return false;
    return bindings.delete(action);
  }

  function enable(action: string): boolean {
    const binding = bindings.get(action);
    if (binding === undefined) return false;
    bindings.set(action, { ...binding, enabled: true });
    return true;
  }

  function disable(action: string): boolean {
    const binding = bindings.get(action);
    if (binding === undefined) return false;
    bindings.set(action, { ...binding, enabled: false });
    return true;
  }

  function conflicts(): ShortcutConflict[] {
    return findConflicts(all());
  }

  return {
    get,
    all,
    setTypingGuard,
    setEditorSurfaceFocused,
    state,
    resolve,
    byKeys,
    remap,
    add,
    remove,
    enable,
    disable,
    conflicts,
  };
}

/** Human-facing chord for a tooltip, honouring the platform's primary modifier (§6.6). */
export function displayKeys(keys: string, platform: 'mac' | 'other' = 'other'): string {
  const canonical = normalizeKeys(keys);
  if (platform !== 'mac') return canonical;
  return canonical.replace(/\bCtrl\b/g, '⌘');
}