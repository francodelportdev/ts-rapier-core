import RAPIER from "@dimforge/rapier2d-compat";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { Entity } from "./Entity";

export interface TriggerOptions {
  /** Center, in meters. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The entity to watch. */
  target: Entity;
  /** Half size of the target, added around the area. Default: (0, 0), its center point. */
  targetHalfWidth?: number;
  targetHalfHeight?: number;
  /** Fill color. Default: invisible. */
  color?: string;
  /** Draw as a circle instead of a rectangle. Default: false. */
  round?: boolean;
}

export interface TriggerEvents {
  enter: Record<string, never>;
  exit: Record<string, never>;
}

/** An area nothing collides with, which tells you when an entity enters or leaves it. */
export class Trigger extends Entity<TriggerOptions> {
  private readonly events = new EventEmitter<TriggerEvents>();
  private inside = false;

  constructor(world: RAPIER.World, options: TriggerOptions) {
    super(world, options);
  }

  public on<K extends keyof TriggerEvents>(event: K, listener: Listener<TriggerEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  protected override createBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.options.x, this.options.y));
  }

  protected override createCollider(): RAPIER.Collider {
    const { width, height } = this.options;
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2).setSensor(true), this.body);
  }

  public override update(): void {
    const { x, y, width, height, target, targetHalfWidth = 0, targetHalfHeight = 0 } = this.options;
    if (target.isDestroyed) return;
    const p = target.getPosition();
    const inside = Math.abs(p.x - x) <= width / 2 + targetHalfWidth && Math.abs(p.y - y) <= height / 2 + targetHalfHeight;
    if (inside === this.inside) return;
    this.inside = inside;
    this.events.emit(inside ? "enter" : "exit", {});
  }

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const { width, height, color, round } = this.options;
    if (color === undefined) return;
    if (!round) return this.drawCuboid(ctx, width / 2, height / 2, color, scale, centerX, centerY);
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, (width / 2) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
