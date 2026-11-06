import RAPIER from "@dimforge/rapier2d-compat";

/** Outline colors, by what the collider is. */
export const DEBUG_COLORS = {
  fixed: "#a0aec0",
  kinematic: "#63b3ed",
  dynamic: "#ed8936",
  sleeping: "#975a16",
  sensor: "#48bb78",
  velocity: "#f687b3",
} as const;

export interface DebugStats {
  bodies: number;
  colliders: number;
  sensors: number;
  /** Dynamic bodies that Rapier has put to sleep. */
  sleeping: number;
}

/** How long a velocity arrow is, in seconds of travel. */
const VELOCITY_SCALE = 0.25;
/** Half the size of the cross at each body's center, in pixels. */
const CROSS = 4;

/**
 * Draws what the physics sees, over the game, at `game.debug`. It reads Rapier's colliders
 * directly, so it shows the real shapes rather than the sprites. Off by default.
 */
export class DebugRenderer {
  /** Turns the whole overlay on or off. */
  public enabled = false;
  /** Draw the outline of every collider. */
  public colliders = true;
  /** Draw a cross at each body's center. */
  public centers = true;
  /** Draw an arrow with the velocity of dynamic bodies. */
  public velocities = true;

  private readonly world: RAPIER.World;

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  /** Flips `enabled`, and returns the new value. */
  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** Counts what's in the physics world. It works while the overlay is off too. */
  public getStats(): DebugStats {
    const stats: DebugStats = { bodies: this.world.bodies.len(), colliders: this.world.colliders.len(), sensors: 0, sleeping: 0 };
    this.world.forEachCollider((collider) => {
      if (collider.isSensor()) stats.sensors++;
    });
    this.world.forEachRigidBody((body) => {
      if (body.isDynamic() && body.isSleeping()) stats.sleeping++;
    });
    return stats;
  }

  /** @internal Called by `Game` after everything else. */
  public draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    if (!this.enabled) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    if (this.colliders) this.world.forEachCollider((c) => this.drawCollider(ctx, c, scale, centerX, centerY));
    this.world.forEachRigidBody((body) => {
      const p = body.translation();
      const px = centerX + p.x * scale;
      const py = centerY - p.y * scale;
      if (this.centers) this.drawCross(ctx, px, py, colorOf(body));
      if (this.velocities && body.isDynamic()) this.drawVelocity(ctx, body, px, py, scale);
    });
    ctx.restore();
  }

  private drawCollider(ctx: CanvasRenderingContext2D, c: RAPIER.Collider, scale: number, centerX: number, centerY: number): void {
    const p = c.translation();
    ctx.save();
    ctx.translate(centerX + p.x * scale, centerY - p.y * scale);
    ctx.rotate(-c.rotation()); // canvas Y is flipped → flip rotation
    ctx.strokeStyle = c.isSensor() ? DEBUG_COLORS.sensor : colorOf(c.parent());
    ctx.setLineDash(c.isSensor() ? [6, 4] : []);
    ctx.beginPath();
    this.traceShape(ctx, c, scale);
    ctx.stroke();
    ctx.restore();
  }

  /** Traces a collider's shape around the origin, in pixels. */
  private traceShape(ctx: CanvasRenderingContext2D, c: RAPIER.Collider, scale: number): void {
    switch (c.shapeType()) {
      case RAPIER.ShapeType.Ball:
        ctx.arc(0, 0, c.radius() * scale, 0, Math.PI * 2);
        break;
      case RAPIER.ShapeType.Cuboid: {
        const extents = c.halfExtents();
        if (extents === null) break;
        const { x, y } = extents;
        ctx.rect(-x * scale, -y * scale, x * 2 * scale, y * 2 * scale);
        break;
      }
      case RAPIER.ShapeType.Capsule: {
        const r = c.radius() * scale;
        const h = c.halfHeight() * scale;
        ctx.arc(0, -h, r, Math.PI, 0);
        ctx.arc(0, h, r, 0, Math.PI);
        ctx.closePath();
        break;
      }
      case RAPIER.ShapeType.ConvexPolygon:
        this.tracePoints(ctx, c.vertices(), scale);
        ctx.closePath();
        break;
      case RAPIER.ShapeType.Polyline:
        this.tracePoints(ctx, c.vertices(), scale);
        break;
      default:
        break; // shapes the engine doesn't create; their center is still drawn
    }
  }

  private tracePoints(ctx: CanvasRenderingContext2D, vertices: Float32Array, scale: number): void {
    for (let i = 0; i + 1 < vertices.length; i += 2) {
      const x = vertices[i]! * scale;
      const y = -vertices[i + 1]! * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  private drawCross(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px - CROSS, py);
    ctx.lineTo(px + CROSS, py);
    ctx.moveTo(px, py - CROSS);
    ctx.lineTo(px, py + CROSS);
    ctx.stroke();
  }

  private drawVelocity(ctx: CanvasRenderingContext2D, body: RAPIER.RigidBody, px: number, py: number, scale: number): void {
    const v = body.linvel();
    if (Math.hypot(v.x, v.y) < 0.05) return;
    ctx.strokeStyle = DEBUG_COLORS.velocity;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + v.x * VELOCITY_SCALE * scale, py - v.y * VELOCITY_SCALE * scale);
    ctx.stroke();
  }
}

function colorOf(body: RAPIER.RigidBody | null): string {
  if (body === null || body.isFixed()) return DEBUG_COLORS.fixed;
  if (body.isKinematic()) return DEBUG_COLORS.kinematic;
  return body.isSleeping() ? DEBUG_COLORS.sleeping : DEBUG_COLORS.dynamic;
}
