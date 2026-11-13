// apps/web/src/editor/viewport/camera-controller.ts
// Orbit and Fly camera controller with presets and framing (Slice E3.2, SUBSPEC-E §6.1).

import * as THREE from 'three';
import type { Bounds3i } from '@easyschemedit/domain';

export type CameraMode = 'orbit' | 'fly';
export type CameraPreset = 'isometric' | 'top' | 'front' | 'right';

export interface CameraStateSnapshot {
  mode: CameraMode;
  target: [number, number, number];
  position: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
  flySpeed: number;
}

/**
 * Viewport camera controller supporting orbit and fly navigation,
 * view presets, bounds framing, and syncing to THREE.PerspectiveCamera.
 */
export class ViewportCameraController {
  private mode: CameraMode = 'orbit';

  // Orbit state
  private target: [number, number, number] = [0, 0, 0];
  private distance = 30;
  private yaw = Math.PI / 4;
  private pitch = Math.PI / 6;

  // Fly state
  private flyPosition: [number, number, number] = [0, 15, 30];
  private flySpeed = 15; // blocks per second

  // Bounds limits
  private minDistance = 1;
  private maxDistance = 2000;

  constructor(options?: {
    mode?: CameraMode;
    target?: [number, number, number];
    distance?: number;
    yaw?: number;
    pitch?: number;
    flyPosition?: [number, number, number];
    flySpeed?: number;
  }) {
    if (options?.mode) this.mode = options.mode;
    if (options?.target) this.target = [...options.target];
    if (options?.distance !== undefined) this.distance = options.distance;
    if (options?.yaw !== undefined) this.yaw = options.yaw;
    if (options?.pitch !== undefined) this.pitch = options.pitch;
    if (options?.flyPosition) this.flyPosition = [...options.flyPosition];
    if (options?.flySpeed !== undefined) this.flySpeed = options.flySpeed;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setMode(mode: CameraMode): void {
    if (this.mode === mode) return;

    if (mode === 'fly') {
      // Transition from orbit to fly: set flyPosition to current orbit position
      const pos = this.getOrbitPosition();
      this.flyPosition = [pos[0], pos[1], pos[2]];
    } else {
      // Transition from fly to orbit: project target ahead of camera
      const fwd = this.getForwardVector();
      this.target = [
        this.flyPosition[0] + fwd[0] * this.distance,
        this.flyPosition[1] + fwd[1] * this.distance,
        this.flyPosition[2] + fwd[2] * this.distance,
      ];
    }
    this.mode = mode;
  }

  public getTarget(): [number, number, number] {
    return [...this.target];
  }

  public setTarget(target: [number, number, number]): void {
    this.target = [...target];
  }

  public getDistance(): number {
    return this.distance;
  }

  public setDistance(dist: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, dist));
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public getFlySpeed(): number {
    return this.flySpeed;
  }

  public setFlySpeed(speed: number): void {
    this.flySpeed = Math.max(1, Math.min(200, speed));
  }

  public adjustFlySpeed(delta: number): void {
    this.setFlySpeed(this.flySpeed + delta);
  }

  /**
   * Computes the current camera position in world space.
   */
  public getPosition(): [number, number, number] {
    return this.mode === 'orbit' ? this.getOrbitPosition() : [...this.flyPosition];
  }

  private getOrbitPosition(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    return [
      this.target[0] + this.distance * cp * sy,
      this.target[1] + this.distance * sp,
      this.target[2] + this.distance * cp * cy,
    ];
  }

  /**
   * Unit forward direction vector the camera is facing.
   */
  public getForwardVector(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    return [-cp * sy, -sp, -cp * cy];
  }

  /**
   * Unit right direction vector perpendicular to camera forward and world up.
   */
  public getRightVector(): [number, number, number] {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    return [cy, 0, -sy];
  }

  /**
   * Unit up direction vector for the camera view.
   */
  public getUpVector(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    return [-sp * sy, cp, -sp * cy];
  }

  /**
   * Rotates orbit camera around look target.
   */
  public orbit(deltaYaw: number, deltaPitch: number): void {
    this.yaw = (this.yaw + deltaYaw) % (Math.PI * 2);
    // Clamp pitch to avoid gimbal flip (-89.9° to +89.9°)
    const maxPitch = Math.PI / 2 - 0.005;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + deltaPitch));
  }

  /**
   * Pans the camera target horizontally and vertically relative to view orientation.
   */
  public pan(deltaRight: number, deltaUp: number): void {
    const right = this.getRightVector();
    const up = this.getUpVector();

    this.target[0] += right[0] * deltaRight + up[0] * deltaUp;
    this.target[1] += right[1] * deltaRight + up[1] * deltaUp;
    this.target[2] += right[2] * deltaRight + up[2] * deltaUp;

    if (this.mode === 'fly') {
      this.flyPosition[0] += right[0] * deltaRight + up[0] * deltaUp;
      this.flyPosition[1] += right[1] * deltaRight + up[1] * deltaUp;
      this.flyPosition[2] += right[2] * deltaRight + up[2] * deltaUp;
    }
  }

  /**
   * Zooms in or out. Accepts a delta (e.g. from mouse wheel) or relative scale.
   */
  public zoom(delta: number): void {
    const factor = Math.exp(-delta * 0.0015);
    this.setDistance(this.distance * factor);
  }

  /**
   * Moves the camera in fly mode along local axes.
   * forward: +1 forward, -1 backward
   * right: +1 right, -1 left
   * up: +1 up, -1 down
   */
  public moveFly(forward: number, right: number, up: number, dtSeconds: number): void {
    if (this.mode !== 'fly') return;

    const fwd = this.getForwardVector();
    const rgt = this.getRightVector();
    const speed = this.flySpeed * dtSeconds;

    this.flyPosition[0] += (fwd[0] * forward + rgt[0] * right) * speed;
    this.flyPosition[1] += (fwd[1] * forward + rgt[1] * right + up) * speed;
    this.flyPosition[2] += (fwd[2] * forward + rgt[2] * right) * speed;
  }

  /**
   * Rotates look direction in fly mode.
   */
  public lookFly(deltaYaw: number, deltaPitch: number): void {
    this.orbit(deltaYaw, deltaPitch);
  }

  /**
   * Frames the camera around the provided 3D bounding box.
   */
  public frameBounds(bounds: Bounds3i): void {
    const cx = (bounds.min[0] + bounds.maxExclusive[0]) / 2;
    const cy = (bounds.min[1] + bounds.maxExclusive[1]) / 2;
    const cz = (bounds.min[2] + bounds.maxExclusive[2]) / 2;

    const sx = bounds.maxExclusive[0] - bounds.min[0];
    const sy = bounds.maxExclusive[1] - bounds.min[1];
    const sz = bounds.maxExclusive[2] - bounds.min[2];
    const maxDim = Math.max(sx, sy, sz, 1);

    this.target = [cx, cy, cz];
    this.setDistance(maxDim * 1.6 + 6);

    if (this.mode === 'fly') {
      const pos = this.getOrbitPosition();
      this.flyPosition = [pos[0], pos[1], pos[2]];
    }
  }

  /**
   * Applies a standard camera viewpoint preset (isometric, top, front, right).
   */
  public applyPreset(preset: CameraPreset, bounds?: Bounds3i): void {
    if (bounds) {
      this.frameBounds(bounds);
    }

    switch (preset) {
      case 'isometric':
        this.yaw = Math.PI / 4;
        this.pitch = Math.atan(1 / Math.SQRT2); // ~35.264°
        break;
      case 'top':
        this.yaw = 0;
        this.pitch = Math.PI / 2 - 0.001; // Avoid exact gimbal lock
        break;
      case 'front':
        this.yaw = 0;
        this.pitch = 0;
        break;
      case 'right':
        this.yaw = Math.PI / 2;
        this.pitch = 0;
        break;
    }

    if (this.mode === 'fly') {
      const pos = this.getOrbitPosition();
      this.flyPosition = [pos[0], pos[1], pos[2]];
    }
  }

  /**
   * Synchronizes position and orientation to a THREE.PerspectiveCamera.
   */
  public syncToThreeCamera(camera: THREE.PerspectiveCamera): void {
    if (this.mode === 'orbit') {
      const pos = this.getOrbitPosition();
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.lookAt(this.target[0], this.target[1], this.target[2]);
    } else {
      camera.position.set(this.flyPosition[0], this.flyPosition[1], this.flyPosition[2]);
      const fwd = this.getForwardVector();
      camera.lookAt(
        this.flyPosition[0] + fwd[0],
        this.flyPosition[1] + fwd[1],
        this.flyPosition[2] + fwd[2]
      );
    }
    camera.updateMatrixWorld();
  }

  /**
   * Snapshot of full camera state.
   */
  public snapshot(): CameraStateSnapshot {
    return {
      mode: this.mode,
      target: [...this.target],
      position: this.getPosition(),
      distance: this.distance,
      yaw: this.yaw,
      pitch: this.pitch,
      flySpeed: this.flySpeed,
    };
  }
}
