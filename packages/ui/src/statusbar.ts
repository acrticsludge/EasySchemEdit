// packages/ui/src/statusbar.ts
// Status bar model: coordinates, tool mode, snap/grid, save status, perf, notifications.
// Pure TypeScript. SUBSPEC-G §6.5 (Status bar, G6).

// ============================================================================
// Types
// ============================================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type PerfSnapshot = {
  fps: number;
  triangles: number;
  degraded: boolean;
};

export type Notification = {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  createdAt: number;
};

export type StatusBarState = {
  coordinates: { x: number; y: number; z: number } | null;
  toolMode: string | null;
  snapStep: number;
  gridVisible: boolean;
  saveStatus: SaveStatus;
  perf: PerfSnapshot;
  notifications: Notification[];
};

export type StatusBar = {
  state(): StatusBarState;
  setCoordinates(x: number, y: number, z: number): void;
  clearCoordinates(): void;
  setToolMode(tool: string | null): void;
  setSnapStep(step: number): void;
  setGridVisible(visible: boolean): void;
  setSaveStatus(status: SaveStatus): void;
  setPerf(fps: number, triangles: number): void;
  pushNotification(message: string, level?: Notification['level']): string;
  dismissNotification(id: string): void;
  clearNotifications(): void;
  coordinateLabel(): string;
};

export type StatusBarOptions = {
  snapStep?: number;
  gridVisible?: boolean;
  perfThresholdFps?: number;
  maxNotifications?: number;
};

// ============================================================================
// Factory
// ============================================================================

export function createStatusBar(options?: StatusBarOptions): StatusBar {
  const snapStep0 = options?.snapStep ?? 1;
  const gridVisible0 = options?.gridVisible ?? true;
  const perfThreshold = options?.perfThresholdFps ?? 30;
  const maxNotifications = options?.maxNotifications ?? 5;

  let coordinates: { x: number; y: number; z: number } | null = null;
  let toolMode: string | null = null;
  let snapStep = snapStep0;
  let gridVisible = gridVisible0;
  let saveStatus: SaveStatus = 'idle';
  let perf: PerfSnapshot = { fps: 60, triangles: 0, degraded: false };
  const notifications: Notification[] = [];
  let nextId = 1;

  function state(): StatusBarState {
    return {
      coordinates: coordinates ? { ...coordinates } : null,
      toolMode,
      snapStep,
      gridVisible,
      saveStatus,
      perf: { ...perf },
      notifications: notifications.map((n) => ({ ...n })),
    };
  }

  function setCoordinates(x: number, y: number, z: number): void {
    coordinates = { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function clearCoordinates(): void {
    coordinates = null;
  }

  function setToolMode(tool: string | null): void {
    toolMode = tool;
  }

  function setSnapStep(step: number): void {
    snapStep = Math.max(0.0625, step);
  }

  function setGridVisible(visible: boolean): void {
    gridVisible = visible;
  }

  function setSaveStatus(status: SaveStatus): void {
    saveStatus = status;
  }

  function setPerf(fps: number, triangles: number): void {
    const clampedFps = Math.max(0, Math.round(fps));
    const clampedTris = Math.max(0, Math.trunc(triangles));
    perf = {
      fps: clampedFps,
      triangles: clampedTris,
      degraded: clampedFps < perfThreshold,
    };
  }

  function pushNotification(message: string, level: Notification['level'] = 'info'): string {
    const id = `n${nextId++}`;
    notifications.push({ id, message, level, createdAt: Date.now() });
    // Cap: drop the oldest when exceeded.
    while (notifications.length > maxNotifications) {
      notifications.shift();
    }
    return id;
  }

  function dismissNotification(id: string): void {
    const idx = notifications.findIndex((n) => n.id === id);
    if (idx !== -1) notifications.splice(idx, 1);
  }

  function clearNotifications(): void {
    notifications.length = 0;
  }

  function coordinateLabel(): string {
    if (!coordinates) return '';
    return `X: ${coordinates.x}  Y: ${coordinates.y}  Z: ${coordinates.z}`;
  }

  return {
    state,
    setCoordinates,
    clearCoordinates,
    setToolMode,
    setSnapStep,
    setGridVisible,
    setSaveStatus,
    setPerf,
    pushNotification,
    dismissNotification,
    clearNotifications,
    coordinateLabel,
  };
}
