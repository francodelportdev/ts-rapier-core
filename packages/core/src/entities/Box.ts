import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";

const HALF = 0.5;

interface BoxOptions {
  x: number;
  y: number;
}

export class Box extends Entity<BoxOptions> {
  constructor(world: RAPIER.World, x = 0, y = 5) {
    super(world, { x, y });
  }

  protected override createBody(): RAPIER.RigidBody {
    const { x, y } = this.options;
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y));
  }

  protected override createCollider(): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(HALF, HALF), this.body);
  }

  public applyImpulse(x: number, y: number): void {
    this.body.applyImpulse({ x, y }, true);
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    this.drawCuboid(ctx, HALF, HALF, "#ed8936", scale, centerX, centerY);
  }
}
