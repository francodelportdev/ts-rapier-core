import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";

const HALF = 0.5;

export class Box extends Entity {
  constructor(world: RAPIER.World, x = 0, y = 5) {
    // createBody() se ejecuta dentro de super(), antes de inicializar campos propios;
    // por eso la posición se aplica justo después.
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

  public override draw(ctx: CanvasRenderingContext2D, escala: number, centroX: number, centroY: number): void {
    this.drawCuboid(ctx, HALF, HALF, "#ed8936", escala, centroX, centroY);
  }
}
