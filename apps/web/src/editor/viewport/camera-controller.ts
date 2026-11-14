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
  private targetDistance = 30;
  private zoomAnchor: [number, number, number] | null = null;
  private pendingDollyPush = 0;
  private yaw = Math.PI / 4;
  private pitch = Math.PI / 6;

  // Fly state
  private flyPosition: [number, number, number] = [0, 15, 30];
  private flySpeed = 15; // blocks per second

  // Bounds limits
  private minDistance = 1;
  private maxDistance = 10000;

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
    this.targetDistance = this.distance;
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
    this.targetDistance = this.distance;
    this.pendingDollyPush = 0;
    this.zoomAnchor = null;
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

  public getTargetDistance(): number {
    return this.targetDistance;
  }

  public setDistance(dist: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, dist));
    this.targetDistance = this.distance;
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
    this.flySpeed = Math.max(2, Math.min(200, speed));
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
   * Synchronously zooms in or out. Accepts a delta (e.g. from mouse wheel) or relative scale.
   */
  public zoom(delta: number): void {
    const factor = Math.exp(-delta * 0.0015);
    const rawNext = this.distance * factor;
    if (delta > 0 && rawNext < this.minDistance) {
      this.distance = this.minDistance;
      const fwd = this.getForwardVector();
      const push = Math.max(0.25, delta * 0.015);
      this.target[0] += fwd[0] * push;
      this.target[1] += fwd[1] * push;
      this.target[2] += fwd[2] * push;
    } else {
      this.setDistance(rawNext);
    }
    this.targetDistance = this.distance;
    this.pendingDollyPush = 0;
    this.zoomAnchor = null;
  }

  /**
   * Queues a smooth damped zoom toward an optional 3D anchor point (e.g. under cursor).
   */
  public queueZoom(delta: number, anchorPoint?: [number, number, number] | null): void {
    const factor = Math.exp(-delta * 0.0012);
    const rawNext = this.targetDistance * factor;
    if (delta > 0 && rawNext < this.minDistance) {
      this.targetDistance = this.minDistance;
      this.pendingDollyPush += Math.max(0.15, delta * 0.012);
    } else {
      this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, rawNext));
    }
    this.zoomAnchor = anchorPoint ? [...anchorPoint] : null;
  }

  /**
   * Advances smooth damped zoom and dolly push towards target distance.
   */
  public stepDamping(dtSeconds: number): void {
    if (this.mode !== 'orbit') return;

    const alpha = 1 - Math.exp(-14 * Math.min(dtSeconds, 0.1));

    const prevDist = this.distance;
    let nextDist = prevDist + (this.targetDistance - prevDist) * alpha;
    if (Math.abs(this.targetDistance - nextDist) < 1e-4) {
      nextDist = this.targetDistance;
    }

    if (this.zoomAnchor && prevDist > 1e-5 && nextDist !== prevDist) {
      const ratio = nextDist / prevDist;
      this.target[0] = this.zoomAnchor[0] + (this.target[0] - this.zoomAnchor[0]) * ratio;
      this.target[1] = this.zoomAnchor[1] + (this.target[1] - this.zoomAnchor[1]) * ratio;
      this.target[2] = this.zoomAnchor[2] + (this.target[2] - this.zoomAnchor[2]) * ratio;
    }
    this.distance = nextDist;

    if (this.pendingDollyPush > 1e-4) {
      const pushStep = this.pendingDollyPush * alpha;
      this.pendingDollyPush -= pushStep;
      if (this.pendingDollyPush < 1e-4) {
        this.pendingDollyPush = 0;
      }
      const fwd = this.getForwardVector();
      this.target[0] += fwd[0] * pushStep;
      this.target[1] += fwd[1] * pushStep;
      this.target[2] += fwd[2] * pushStep;
      if (this.zoomAnchor) {
        this.zoomAnchor[0] += fwd[0] * pushStep;
        this.zoomAnchor[1] += fwd[1] * pushStep;
        this.zoomAnchor[2] += fwd[2] * pushStep;
        if (this.distance <= this.minDistance + 0.01) {
          this.zoomAnchor = null;
        }
      }
    }
  }

  /**
   * Sets a new look target (pivot) for orbit mode while keeping the
   * current camera position unchanged in world space. Recalculates
   * yaw, pitch, and distance so that no camera jump occurs.
   */
  public setPivotPreservingCamera(pivot: [number, number, number]): void {
    const camPos = this.getOrbitPosition();
    const dx = camPos[0] - pivot[0];
    const dy = camPos[1] - pivot[1];
    const dz = camPos[2] - pivot[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return;

    const clampedDist = Math.max(this.minDistance, Math.min(this.maxDistance, dist));
    this.target = [...pivot];
    this.distance = clampedDist;
    this.targetDistance = clampedDist;
    this.pendingDollyPush = 0;
    this.zoomAnchor = null;

    const maxPitch = Math.PI / 2 - 0.005;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.asin(Math.max(-1, Math.min(1, dy / dist)))));
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
    this.pendingDollyPush = 0;
    this.zoomAnchor = null;

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

    this.targetDistance = this.distance;
    this.pendingDollyPush = 0;
    this.zoomAnchor = null;

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
