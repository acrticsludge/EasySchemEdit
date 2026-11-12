# Subspec E — Slice e-8: Camera Controls

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.2 (CameraState), §4 (Camera controls), §9.2 (Acceptance item 15)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Three.js types abstracted as `any`. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement camera control types: CameraState, CameraControlState, CameraPreset, CameraControls. These are pure type definitions for orbit, pan, zoom, focus, fit all, reset, presets, orthographic toggle.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/camera.ts` | create | `CameraControlState`, `CameraPreset`, `CameraControls` types (CameraState already in types.ts) |

## Types / APIs

```ts
export type CameraPreset = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric';

export type CameraControlState = {
  cameraState: CameraState;
  target: Vec3d;              // orbit target (look-at point)
  distance: number;           // distance from target
  theta: number;              // horizontal angle (radians)
  phi: number;                // vertical angle (radians)
  minDistance: number;        // minimum zoom distance
  maxDistance: number;        // maximum zoom distance
  minPolarAngle: number;      // minimum vertical angle (radians)
  maxPolarAngle: number;      // maximum vertical angle (radians)
  enableDamping: boolean;     // smooth damping on movement
  dampingFactor: number;      // damping factor (0-1)
  enableZoom: boolean;        // enable zoom
  zoomSpeed: number;          // zoom speed multiplier
  enableRotate: boolean;      // enable rotation
  rotateSpeed: number;        // rotation speed multiplier
  enablePan: boolean;         // enable pan
  panSpeed: number;           // pan speed multiplier
};

export type CameraControls = {
  state: CameraControlState;
  orbit: (deltaX: number, deltaY: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  zoom: (delta: number) => void;
  focusOn: (target: Vec3d, distance?: number) => void;
  fitAll: (bounds: Bounds3i) => void;
  reset: () => void;
  setPreset: (preset: CameraPreset) => void;
  toggleOrthographic: () => void;
  applyDamping: () => boolean;  // returns true if still damping
};
```

Key rules:
- Orbit, pan, zoom, focus selected, fit all, reset camera
- Perspective/orthographic toggle
- Configurable camera speed
- Presets: top, bottom, front, back, left, right, isometric

## Acceptance criteria

1. `CameraControlState` has cameraState, target, distance, theta, phi, minDistance, maxDistance, minPolarAngle, maxPolarAngle, enableDamping, dampingFactor, enableZoom, zoomSpeed, enableRotate, rotateSpeed, enablePan, panSpeed
2. `CameraControls` has state, orbit, pan, zoom, focusOn, fitAll, reset, setPreset, toggleOrthographic, applyDamping
3. `CameraPreset` is 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric'
4. CameraState (from types.ts) has position, target, fov, orthographic, zoom, preset?
5. Camera controls configurable speed

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-8-camera.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
