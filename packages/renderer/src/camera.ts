// packages/renderer/src/camera.ts
// Camera controls types (SUBSPEC-E §2.2, §4).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3d from domain/types.ts via relative paths.

import type { Vec3d } from '../../domain/types.ts';
import type { Bounds3i } from '../../domain/types.ts';
import type { CameraState } from './types.ts';

// ============================================================================
// Camera Preset
// ============================================================================

export type CameraPreset = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric';

// ============================================================================
// Camera Control State
// ============================================================================

export type CameraControlState = {
  cameraState: CameraState;
  target: Vec3d;                // orbit target (look-at point)
  distance: number;             // distance from target
  theta: number;                // horizontal angle (radians)
  phi: number;                  // vertical angle (radians)
  minDistance: number;          // minimum zoom distance
  maxDistance: number;          // maximum zoom distance
  minPolarAngle: number;        // minimum vertical angle (radians)
  maxPolarAngle: number;        // maximum vertical angle (radians)
  enableDamping: boolean;       // smooth damping on movement
  dampingFactor: number;        // damping factor (0-1)
  enableZoom: boolean;          // enable zoom
  zoomSpeed: number;            // zoom speed multiplier
  enableRotate: boolean;        // enable rotation
  rotateSpeed: number;          // rotation speed multiplier
  enablePan: boolean;           // enable pan
  panSpeed: number;             // pan speed multiplier
};

// ============================================================================
// Camera Controls
// ============================================================================

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
