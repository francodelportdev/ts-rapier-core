import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";

export interface PlatformOptions {
  /** Center X, in meters. */
  x: number;
  /** Center Y, in meters. */
  y: number;
  /** Full width, in meters. */
  width: number;
  /** Full height, in meters. Default: 0.5. */
  height?: number;
  /** Fill color. Default: "#4a5568". */
  color?: string;
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
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(this.halfWidth, this.halfHeight), this.body);
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    this.drawCuboid(ctx, this.halfWidth, this.halfHeight, this.options.color ?? "#4a5568", scale, centerX, centerY);
  }
}
