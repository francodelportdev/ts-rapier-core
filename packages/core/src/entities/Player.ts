import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import { Input } from "../systems/Input";

const HALF_W = 0.5;
const HALF_H = 1.0;
/** Velocidad horizontal en metros por segundo. */
const SPEED = 6;

export class Player extends Entity {
  private readonly input = Input.getInstance();

  protected override createBody(): RAPIER.RigidBody {
    // Apoyado sobre el suelo: tope del suelo en y = -4.5.
    return this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.0, -4.5 + HALF_H),
    );
  }

  protected override createCollider(): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(HALF_W, HALF_H), this.body);
  }

  public override update(): void {
    let dir = 0;
    if (this.input.isPressed("ArrowLeft")) dir -= 1;
    if (this.input.isPressed("ArrowRight")) dir += 1;

    const t = this.body.translation();
    const dx = dir * SPEED * this.world.timestep; // desplazamiento por paso físico
    this.body.setNextKinematicTranslation({ x: t.x + dx, y: t.y });
  }

  public override draw(ctx: CanvasRenderingContext2D, escala: number, centroX: number, centroY: number): void {
    this.drawCuboid(ctx, HALF_W, HALF_H, "#48bb78", escala, centroX, centroY);
  }
}
