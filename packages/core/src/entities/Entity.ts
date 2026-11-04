import RAPIER from "@dimforge/rapier2d-compat";

/**
 * Base class for every physics entity. Works in meters (Rapier, Y axis up);
 * conversion to pixels (Y axis down) happens only in `draw` via `toCanvas`.
 */
export abstract class Entity<TOptions extends object = object> {
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;
  /** Constructor options. Set before `createBody()` runs, so it is safe to read there. */
  protected readonly options: TOptions;
  private destroyed = false;

  constructor(world: RAPIER.World, options: TOptions = {} as TOptions) {
    this.world = world;
    this.options = options;
    this.body = this.createBody();
    this.createCollider();
  }

  /** True once `destroy()` has run. A destroyed entity must not be updated or drawn. */
  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Center of the body, in meters. */
  public getPosition(): { x: number; y: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y };
  }

  /**
   * Removes the body and its colliders from the physics world, freeing their memory.
   * Usually called by `game.removeEntity()`. Calling it twice has no effect.
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.onDestroy();
    this.world.removeRigidBody(this.body); // also removes the colliders attached to it
    this.destroyed = true;
  }

  /** Override to free extra Rapier objects (for example, a character controller). */
  protected onDestroy(): void {}

  protected abstract createBody(): RAPIER.RigidBody;
  protected abstract createCollider(): RAPIER.Collider;
  public abstract update(): void;
  public abstract draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void;

  /** Meters (world) → pixels (canvas). */
  protected toCanvas(x: number, y: number, scale: number, centerX: number, centerY: number): { px: number; py: number } {
    return { px: centerX + x * scale, py: centerY - y * scale };
  }

  /** Draws a rectangle centered on the body, rotated by its angle. */
  protected drawCuboid(
    ctx: CanvasRenderingContext2D, halfW: number, halfH: number, color: string,
    scale: number, centerX: number, centerY: number,
  ): void {
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);
    const w = halfW * 2 * scale;
    const h = halfH * 2 * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.body.rotation()); // canvas Y is flipped → flip rotation
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
