import RAPIER from "@dimforge/rapier2d-compat";

/**
 * Base class for every physics entity. Works in meters (Rapier, Y axis up);
 * conversion to pixels (Y axis down) happens only in `draw` via `toCanvas`.
 */
export abstract class Entity {
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;

  constructor(world: RAPIER.World) {
    this.world = world;
    this.body = this.createBody();
    this.createCollider();
  }

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
