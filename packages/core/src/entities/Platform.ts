import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import type { CollisionFilter } from "../systems/layers";
import { registerOneWay, unregisterOneWay } from "../systems/oneWay";

export interface PlatformOptions {
  /** Center X, in meters. */
  x: number;
  /** Center Y, in meters. */
  y: number;
  /** Full width, in meters. */
  width: number;
  /** Full height, in meters. Default: 0.5. */
  height?: number;
  /** Fill color. Default: "#4a5568" ("#718096" for one-way platforms). */
  color?: string;
  /**
   * One-way platform: the player stands on it from above, but passes through it from below
   * and the sides, and drops through it with ↓ + jump. Other bodies always collide with it.
   * Default: false.
   */
  oneWay?: boolean;
  /** What it is and what it collides with. Default: everything. */
  collision?: CollisionFilter;
}

/** A static, axis-aligned rectangle to stand on. */
export class Platform extends Entity<PlatformOptions> {
  constructor(world: RAPIER.World, options: PlatformOptions) {
    super(world, options);
  }

  private get halfWidth(): number {
    return this.options.width / 2;
  }

  private get halfHeight(): number {
    return (this.options.height ?? 0.5) / 2;
  }

  /** Y of the top surface, in meters. */
  public get top(): number {
    return this.options.y + this.halfHeight;
  }

  protected override createBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.options.x, this.options.y));
  }

  protected override createCollider(): RAPIER.Collider {
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(this.halfWidth, this.halfHeight), this.body);
    if (this.options.oneWay) {
      const { x, y } = this.options;
      const [w, h] = [this.halfWidth, this.halfHeight];
      registerOneWay(this.world, collider, [
        { x: x - w, y: y - h },
        { x: x + w, y: y - h },
        { x: x + w, y: y + h },
        { x: x - w, y: y + h },
      ]);
    }
    return collider;
  }

  protected override onDestroy(): void {
    if (this.options.oneWay) unregisterOneWay(this.world, this.body.collider(0));
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const color = this.options.color ?? (this.options.oneWay ? "#718096" : "#4a5568");
    this.drawCuboid(ctx, this.halfWidth, this.halfHeight, color, scale, centerX, centerY);
    if (this.options.oneWay) {
      // A bright top edge marks the side you can stand on.
      const { px, py } = this.toCanvas(this.options.x - this.halfWidth, this.top, scale, centerX, centerY);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(px, py, this.options.width * scale, Math.max(2, 0.06 * scale));
    }
  }
}
