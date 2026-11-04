import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";

const HALF = 0.5;

export class Box extends Entity {
  constructor(world: RAPIER.World, x = 0, y = 5) {
    // createBody() runs inside super(), before subclass fields are initialized,
    // so the position is applied right after.
    super(world);
    this.body.setTranslation({ x, y }, true);
  }

  protected override createBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
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
