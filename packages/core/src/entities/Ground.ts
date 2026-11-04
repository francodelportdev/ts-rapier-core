import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";

const HALF_W = 10.0;
const HALF_H = 0.5;

export class Ground extends Entity {
  protected override createBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, -5.0));
  }

  protected override createCollider(): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(HALF_W, HALF_H), this.body);
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, escala: number, centroX: number, centroY: number): void {
    this.drawCuboid(ctx, HALF_W, HALF_H, "#4a5568", escala, centroX, centroY);
  }
}
