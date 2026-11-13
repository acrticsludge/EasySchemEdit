// packages/ui/src/conflict-nav.ts
// Conflict navigation: list, hover highlight, smooth camera fly, resolve.
// Pure TypeScript. SUBSPEC-G §6.2 / §6.4 (Conflicts tab).

// ============================================================================
// Types
// ============================================================================

export type ConflictSeverity = 'red' | 'yellow';

export type Conflict = {
  id: string;
  region: string;
  owner: string;
  severity: ConflictSeverity;
  target: { x: number; y: number; z: number };
};

export type FlyState = 'idle' | 'flying' | 'arrived';

export type Camera = { x: number; y: number; z: number };

export type ConflictNavigator = {
  conflicts(): Conflict[];
  hoveredId(): string | null;
  setHovered(id: string | null): void;
  flyState(): FlyState;
  flyProgress(): number;
  camera(): Camera;
  targetCamera(): Camera | null;
  navigateTo(id: string): boolean;
  advanceFly(dt: number): void; // dt in seconds
  cancelFly(): void;
  resolveConflict(id: string): boolean;
  sortedConflicts(): Conflict[];
};

export type ConflictNavigatorOptions = {
  conflicts?: Conflict[];
  flyDuration?: number;
  initialCamera?: Camera;
};

// ============================================================================
// Factory
// ============================================================================

export function createConflictNavigator(options?: ConflictNavigatorOptions): ConflictNavigator {
  const flyDuration = options?.flyDuration ?? 0.5;
  let conflicts: Conflict[] = (options?.conflicts ?? []).map((c) => ({ ...c, target: { ...c.target } }));
  let hoveredId: string | null = null;
  let flyState: FlyState = 'idle';
  let flyProgress = 0;
  let camera: Camera = options?.initialCamera ? { ...options.initialCamera } : { x: 0, y: 0, z: 0 };
  let flyTarget: Camera | null = null;
  let flyStart: Camera | null = null;

  function conflictsFn(): Conflict[] {
    return conflicts.map((c) => ({ ...c, target: { ...c.target } }));
  }

  function sortedConflicts(): Conflict[] {
    const severityRank = (s: ConflictSeverity) => (s === 'red' ? 0 : 1);
    return [...conflicts]
      .sort((a, b) => {
        const sev = severityRank(a.severity) - severityRank(b.severity);
        if (sev !== 0) return sev;
        return a.region.localeCompare(b.region);
      })
      .map((c) => ({ ...c, target: { ...c.target } }));
  }

  function setHovered(id: string | null): void {
    hoveredId = id;
    // Hovering never moves the camera.
  }

  function navigateTo(id: string): boolean {
    const conflict = conflicts.find((c) => c.id === id);
    if (!conflict) return false;
    if (flyState === 'flying') return false; // already in flight
    flyTarget = { ...conflict.target };
    flyStart = { ...camera };
    flyProgress = 0;
    flyState = 'flying';
    return true;
  }

  function advanceFly(dt: number): void {
    if (flyState !== 'flying' || !flyTarget || !flyStart) return;
    flyProgress = Math.min(1, flyProgress + dt / flyDuration);
    // Lerp camera.
    camera = {
      x: flyStart.x + (flyTarget.x - flyStart.x) * flyProgress,
      y: flyStart.y + (flyTarget.y - flyStart.y) * flyProgress,
      z: flyStart.z + (flyTarget.z - flyStart.z) * flyProgress,
    };
    if (flyProgress >= 1) {
      flyState = 'arrived';
      camera = { ...flyTarget };
    }
  }

  function cancelFly(): void {
    if (flyState !== 'flying') return;
    flyState = 'idle';
    flyProgress = 0;
    flyTarget = null;
    flyStart = null;
    // Camera stays where it was (no jump).
  }

  function resolveConflict(id: string): boolean {
    const idx = conflicts.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    conflicts.splice(idx, 1);
    if (hoveredId === id) hoveredId = null;
    return true;
  }

  return {
    conflicts: conflictsFn,
    hoveredId: () => hoveredId,
    setHovered,
    flyState: () => flyState,
    flyProgress: () => flyProgress,
    camera: () => ({ ...camera }),
    targetCamera: () => (flyTarget ? { ...flyTarget } : null),
    navigateTo,
    advanceFly,
    cancelFly,
    resolveConflict,
    sortedConflicts,
  };
}
