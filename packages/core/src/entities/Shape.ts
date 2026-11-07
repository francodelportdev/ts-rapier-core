import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import type { CollisionFilter } from "../systems/layers";
import { registerOneWay, toWorld, unregisterOneWay } from "../systems/oneWay";

import type { Point } from "../core/Point";
export type { Point };

/** The geometry of a `Shape`. Sizes are in meters; points are relative to the shape's position. */
export type Geometry =
  /** A rectangle, centered on the position. */
  | { type: "box"; width: number; height: number }
  /** A circle, centered on the position. */
  | { type: "circle"; radius: number }
  /** A rounded rectangle: a vertical segment of `height` with half-circles of `radius` at each end. */
  | { type: "capsule"; radius: number; height: number }
  /**
   * A right triangle, like a ramp. Its bottom edge is centered on the position.
   * `rises` is the side of the tall edge: "right" goes up to the right. Default: "right".
   */
  | { type: "ramp"; width: number; height: number; rises?: "left" | "right" }
  /**
   * A convex polygon through `points` (at least 3). If the points don't form a convex shape,
   * Rapier uses their convex hull, the smallest convex polygon that contains them all.
   */
  | { type: "polygon"; points: readonly Point[] }
  /**
   * A chain of line segments, for terrain such as hills. It can be concave, but it has no
   * thickness or inside, so it only works on fixed (or kinematic) bodies.
   */
  | { type: "polyline"; points: readonly Point[] };

export type BodyType = "fixed" | "dynamic" | "kinematic";

export interface ShapeOptions {
  geometry: Geometry;
  /** Position, in meters. */
  x: number;
  y: number;
  /** Rotation in radians, counterclockwise. Default: 0. */
  angle?: number;
  /** "fixed" never moves, "dynamic" falls and collides, "kinematic" moves only from code. Default: "fixed". */
  body?: BodyType;
  /** Mass per square meter, for dynamic bodies. Default: 1. */
  density?: number;
  /** 0 = ice, 1 = rubber. Default: 0.5. */
  friction?: number;
  /**
   * Bounciness: 0 = no bounce, 1 = bounces back to the same height. When two surfaces touch,
   * the bouncier one wins. Default: 0.
   */
  restitution?: number;
  /** Default: gray for fixed, orange for dynamic, blue for kinematic. */
  color?: string;
  /**
   * One-way platform: the player stands on it from above, but passes through it from below
   * and the sides, and drops through it with ↓ + jump. Other bodies always collide with it.
   * Only for fixed bodies (it throws otherwise). Default: false.
   */
  oneWay?: boolean;
  /** What it is and what it collides with. Default: everything. */
  collision?: CollisionFilter;
}

const DEFAULT_COLORS: Record<BodyType, string> = {
  fixed: "#4a5568",
  dynamic: "#ed8936",
  kinematic: "#4299e1",
};

const ONE_WAY_COLOR = "#718096";

/** Polyline drawing thickness, in meters (the collider itself has no thickness). */
const LINE_WIDTH = 0.15;

function toFloat32(points: readonly Point[]): Float32Array {
  return new Float32Array(points.flatMap((p) => [p.x, p.y]));
}

/** The triangle of a ramp, in local coordinates (bottom edge centered on the origin). */
function rampPoints(width: number, height: number, rises: "left" | "right"): Point[] {
  const tall = rises === "right" ? width / 2 : -width / 2;
  return [
    { x: -width / 2, y: 0 },
    { x: width / 2, y: 0 },
    { x: tall, y: height },
  ];
}

/**
 * A physics body with any geometry: box, circle, capsule, ramp, convex polygon or polyline.
 * Use it for level geometry (`body: "fixed"`, the default) or for objects that fall, roll and
 * bounce (`body: "dynamic"`).
 *
 * ```ts
 * new Shape(world, { x: 4, y: -4.5, geometry: { type: "ramp", width: 6, height: 2 } });
 * new Shape(world, { x: 0, y: 5, body: "dynamic", restitution: 0.6, geometry: { type: "circle", radius: 0.5 } });
 * ```
 */
export class Shape extends Entity<ShapeOptions> {
  constructor(world: RAPIER.World, options: ShapeOptions) {
    const type = options.body ?? "fixed";
    if (options.geometry.type === "polyline" && type === "dynamic") {
      throw new Error("A polyline has no inside, so it can't be dynamic. Use a polygon instead.");
    }
    if (options.oneWay && type !== "fixed") throw new Error("Only fixed shapes can be one-way platforms");
    super(world, options);
  }

  /** Changes the velocity instantly. Only affects dynamic bodies. */
  public applyImpulse(x: number, y: number): void {
    this.body.applyImpulse({ x, y }, true);
  }

  /** Spin impulse. Positive is counterclockwise. Only affects dynamic bodies. */
  public applyTorqueImpulse(torque: number): void {
    this.body.applyTorqueImpulse(torque, true);
  }

  protected override createBody(): RAPIER.RigidBody {
    const { x, y, angle = 0, body = "fixed" } = this.options;
    const desc =
      body === "dynamic"
        ? RAPIER.RigidBodyDesc.dynamic()
        : body === "kinematic"
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.fixed();
    return this.world.createRigidBody(desc.setTranslation(x, y).setRotation(angle));
  }

  protected override createCollider(): RAPIER.Collider {
    const { density = 1, friction = 0.5, restitution = 0 } = this.options;
    const desc = this.describeCollider(this.colliderDesc())
      .setDensity(density)
      .setFriction(friction)
      .setRestitution(restitution)
      // Use the bouncier of the two surfaces (Rapier averages them by default), so a ball with
      // restitution 1 bounces back to its height even on a ground with 0.
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    const collider = this.world.createCollider(desc, this.body);
    if (this.options.oneWay) {
      const { x, y, angle = 0, geometry } = this.options;
      registerOneWay(this.world, collider, toWorld(this.localOutline(collider), x, y, angle), geometry.type !== "polyline");
    }
    return collider;
  }

  protected override onDestroy(): void {
    if (this.options.oneWay) unregisterOneWay(this.world, this.body.collider(0));
  }

  /** The shape's outline in local coordinates (circles and capsules as polygons). */
  private localOutline(collider: RAPIER.Collider): Point[] {
    const g = this.options.geometry;
    const arc = (cx: number, cy: number, r: number, from: number, to: number): Point[] =>
      Array.from({ length: 9 }, (_, i) => {
        const a = from + ((to - from) * i) / 8;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      });
    switch (g.type) {
      case "box":
        return [
          { x: -g.width / 2, y: -g.height / 2 },
          { x: g.width / 2, y: -g.height / 2 },
          { x: g.width / 2, y: g.height / 2 },
          { x: -g.width / 2, y: g.height / 2 },
        ];
      case "circle":
        return arc(0, 0, g.radius, 0, Math.PI * 2).slice(0, 8);
      case "capsule":
        return [...arc(0, g.height / 2, g.radius, 0, Math.PI), ...arc(0, -g.height / 2, g.radius, Math.PI, Math.PI * 2)];
      case "polyline":
        return [...g.points];
      case "ramp":
      case "polygon":
        return this.hullPoints(collider);
    }
  }

  /** Vertices of the convex hull Rapier built, in local coordinates. */
  private hullPoints(collider: RAPIER.Collider): Point[] {
    const shape = collider.shape;
    const vertices = shape instanceof RAPIER.ConvexPolygon ? shape.vertices : new Float32Array();
    const points: Point[] = [];
    for (let i = 0; i + 1 < vertices.length; i += 2) points.push({ x: vertices[i]!, y: vertices[i + 1]! });
    return points;
  }

  /** Override to adjust the collider before it's created. */
  protected describeCollider(desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc {
    return desc;
  }

  private colliderDesc(): RAPIER.ColliderDesc {
    const g = this.options.geometry;
    switch (g.type) {
      case "box":
        return RAPIER.ColliderDesc.cuboid(g.width / 2, g.height / 2);
      case "circle":
        return RAPIER.ColliderDesc.ball(g.radius);
      case "capsule":
        return RAPIER.ColliderDesc.capsule(g.height / 2, g.radius);
      case "ramp":
        return this.hull(rampPoints(g.width, g.height, g.rises ?? "right"));
      case "polygon":
        return this.hull(g.points);
      case "polyline":
        if (g.points.length < 2) throw new Error("A polyline needs at least 2 points");
        return RAPIER.ColliderDesc.polyline(toFloat32(g.points));
    }
  }

  private hull(points: readonly Point[]): RAPIER.ColliderDesc {
    const desc = points.length >= 3 ? RAPIER.ColliderDesc.convexHull(toFloat32(points)) : null;
    if (desc === null) throw new Error("A polygon needs at least 3 points that aren't all on one line");
    return desc;
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const g = this.options.geometry;
    const color = this.options.color ?? (this.options.oneWay ? ONE_WAY_COLOR : DEFAULT_COLORS[this.options.body ?? "fixed"]);
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.body.rotation()); // canvas Y is flipped → flip rotation
    ctx.scale(scale, -scale); // draw in meters, with Y up, from here on
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    switch (g.type) {
      case "box":
        ctx.fillRect(-g.width / 2, -g.height / 2, g.width, g.height);
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
        ctx.fill();
        // A line from the center, so you can see it roll.
        ctx.strokeStyle = "rgb(0 0 0 / 0.35)";
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(g.radius, 0);
        ctx.stroke();
        break;
      case "capsule":
        ctx.beginPath();
        ctx.arc(0, g.height / 2, g.radius, 0, Math.PI);
        ctx.arc(0, -g.height / 2, g.radius, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        break;
      case "polyline":
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        this.tracePath(ctx, g.points);
        ctx.stroke();
        break;
      case "ramp":
      case "polygon": {
        // Draw the hull Rapier actually built, so the picture matches the collisions.
        this.tracePath(ctx, this.hullPoints(this.body.collider(0)));
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  private tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  }
}
