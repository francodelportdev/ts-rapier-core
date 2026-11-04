import RAPIER from "@dimforge/rapier2d-compat";

/**
 * Base de toda entidad física. Trabaja en metros (Rapier, eje Y hacia arriba);
 * la conversión a píxeles (eje Y hacia abajo) ocurre solo en `draw` vía `toCanvas`.
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
  public abstract draw(ctx: CanvasRenderingContext2D, escala: number, centroX: number, centroY: number): void;

  /** Metros (mundo) → píxeles (canvas). */
  protected toCanvas(x: number, y: number, escala: number, centroX: number, centroY: number): { px: number; py: number } {
    return { px: centroX + x * escala, py: centroY - y * escala };
  }

  /** Dibuja un rectángulo centrado en el cuerpo, rotado según su ángulo. */
  protected drawCuboid(
    ctx: CanvasRenderingContext2D, halfW: number, halfH: number, color: string,
    escala: number, centroX: number, centroY: number,
  ): void {
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, escala, centroX, centroY);
    const w = halfW * 2 * escala;
    const h = halfH * 2 * escala;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.body.rotation()); // Y invertido en canvas → rotación invertida
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
