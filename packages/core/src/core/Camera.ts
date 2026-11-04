import type { Entity } from "../entities/Entity";

/** A rectangle in world space, in meters. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FollowOptions {
  /**
   * How long the camera takes to catch up, in seconds (a time constant: it covers about 63%
   * of the remaining distance in this time). 0 follows instantly. Default: 0.15.
   */
  smoothing?: number;
  /**
   * Size of a box around the screen center, in meters, inside which the target can move
   * without moving the camera. Default: 2 × 1.5.
   */
  deadZone?: { width: number; height: number };
  /** Shifts the followed point, in meters. For example, `{ x: 0, y: 2 }` shows more above the target. Default: (0, 0). */
  offset?: { x: number; y: number };
}

/** Converts world coordinates to the canvas, for `Entity.draw()`. */
export interface Viewport {
  scale: number;
  centerX: number;
  centerY: number;
}

/**
 * The view into the world. Its position is the world point (in meters) shown at the center
 * of the canvas. It can follow an entity, stay inside level bounds, zoom and shake.
 *
 * Entities don't need to know about it: `Game` passes the camera's `scale`, `centerX` and
 * `centerY` to `draw()`, so the usual `px = centerX + x * scale` already accounts for it.
 */
export class Camera {
  /** World point at the center of the canvas, in meters. */
  public x = 0;
  public y = 0;
  /** 1 = default size, 2 = everything twice as big. */
  public zoom = 1;

  private target: Entity | null = null;
  private smoothing = 0.15;
  private deadZone = { width: 2, height: 1.5 };
  private offset = { x: 0, y: 0 };
  private bounds: Bounds | null = null;

  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private shakeX = 0;
  private shakeY = 0;

  /** Pixels per meter at zoom 1. */
  private readonly baseScale: number;
  private viewWidth = 0;
  private viewHeight = 0;

  constructor(baseScale: number) {
    this.baseScale = baseScale;
  }

  /** Pixels per meter, including zoom. */
  public get scale(): number {
    return this.baseScale * this.zoom;
  }

  /** Starts following an entity. Pass `null` to stop. */
  public follow(target: Entity | null, options: FollowOptions = {}): void {
    this.target = target;
    this.smoothing = options.smoothing ?? 0.15;
    this.deadZone = options.deadZone ?? { width: 2, height: 1.5 };
    this.offset = options.offset ?? { x: 0, y: 0 };
  }

  /**
   * Keeps the view inside a rectangle (usually the level), so the camera never shows what's
   * beyond it. If the level is smaller than the view on an axis, the camera centers on it. `null` removes the limit.
   */
  public setBounds(bounds: Bounds | null): void {
    this.bounds = bounds;
  }

  /** Moves the camera to a point immediately, without smoothing. */
  public moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clampToBounds();
  }

  /** Jumps straight to the followed target, skipping smoothing. Call it after a respawn or a teleport. */
  public snapToTarget(): void {
    if (this.target === null) return;
    const p = this.target.getPosition();
    this.moveTo(p.x + this.offset.x, p.y + this.offset.y);
  }

  /** Shakes the view. `intensity` is the maximum offset in meters, and it fades out over `duration` seconds. */
  public shake(intensity: number, duration = 0.3): void {
    // A stronger shake replaces a weaker one in progress; a weaker one doesn't interrupt it.
    if (this.shakeTimer > 0 && intensity < this.currentShake()) return;
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  /** Canvas pixels → world meters. Useful for mouse input. */
  public screenToWorld(px: number, py: number): { x: number; y: number } {
    const v = this.getViewport();
    return { x: (px - v.centerX) / v.scale, y: (v.centerY - py) / v.scale };
  }

  /** World meters → canvas pixels. */
  public worldToScreen(x: number, y: number): { px: number; py: number } {
    const v = this.getViewport();
    return { px: v.centerX + x * v.scale, py: v.centerY - y * v.scale };
  }

  /** The part of the world visible on the canvas, in meters. */
  public getVisibleBounds(): Bounds {
    const halfW = this.viewWidth / 2 / this.scale;
    const halfH = this.viewHeight / 2 / this.scale;
    return { minX: this.x - halfW, maxX: this.x + halfW, minY: this.y - halfH, maxY: this.y + halfH };
  }

  /** @internal Called by `Game` once per physics step. */
  public update(dt: number, viewWidth: number, viewHeight: number): void {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;

    if (this.target !== null) {
      if (this.target.isDestroyed) {
        this.target = null;
      } else {
        const p = this.target.getPosition();
        const goalX = this.deadZoneGoal(this.x, p.x + this.offset.x, this.deadZone.width / 2);
        const goalY = this.deadZoneGoal(this.y, p.y + this.offset.y, this.deadZone.height / 2);
        // Exponential smoothing: frame-rate independent, never overshoots.
        const t = this.smoothing <= 0 ? 1 : 1 - Math.exp(-dt / this.smoothing);
        this.x += (goalX - this.x) * t;
        this.y += (goalY - this.y) * t;
      }
    }
    this.clampToBounds();

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const amount = this.currentShake();
      this.shakeX = (Math.random() * 2 - 1) * amount;
      this.shakeY = (Math.random() * 2 - 1) * amount;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** @internal The values `Game` passes to `Entity.draw()`. */
  public getViewport(): Viewport {
    const scale = this.scale;
    return {
      scale,
      centerX: this.viewWidth / 2 - (this.x + this.shakeX) * scale,
      centerY: this.viewHeight / 2 + (this.y + this.shakeY) * scale,
    };
  }

  private currentShake(): number {
    return this.shakeDuration <= 0 ? 0 : this.shakeIntensity * (this.shakeTimer / this.shakeDuration);
  }

  /** Where the camera must be so that `target` is inside the dead zone around it. */
  private deadZoneGoal(camera: number, target: number, halfZone: number): number {
    if (target > camera + halfZone) return target - halfZone;
    if (target < camera - halfZone) return target + halfZone;
    return camera;
  }

  private clampToBounds(): void {
    if (this.bounds === null || this.viewWidth === 0) return;
    const halfW = this.viewWidth / 2 / this.scale;
    const halfH = this.viewHeight / 2 / this.scale;
    this.x = clampOrCenter(this.x, this.bounds.minX + halfW, this.bounds.maxX - halfW);
    this.y = clampOrCenter(this.y, this.bounds.minY + halfH, this.bounds.maxY - halfH);
  }
}

/** Clamps to [min, max], or returns the midpoint if the range is empty (level smaller than the view). */
function clampOrCenter(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}
