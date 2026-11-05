import RAPIER from "@dimforge/rapier2d-compat";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { entityOf } from "../systems/entityRegistry";
import { toInteractionGroups } from "../systems/layers";
import type { Entity } from "./Entity";
import { Shape, type ShapeOptions } from "./Shape";

export interface SensorOptions extends Omit<ShapeOptions, "body" | "density" | "friction" | "restitution" | "oneWay" | "color"> {
  /** Keeps the sensor on this entity, for example a detection radius or an attack hitbox. */
  follow?: Entity;
  /** Where the sensor sits relative to `follow`, in meters. Default: (0, 0). */
  offset?: { x: number; y: number };
  /** Extra condition for what counts. Default: every moving entity. */
  filter?: (entity: Entity) => boolean;
  /** Also detect fixed entities, such as platforms. Default: false. */
  detectFixed?: boolean;
  /** Turn off after the first `enter`. Default: false. */
  once?: boolean;
  /** Fill color, drawn translucent. Default: invisible. */
  color?: string;
}

export interface SensorEvents {
  /** An entity started overlapping the sensor. */
  enter: { entity: Entity };
  /** An entity stopped overlapping it, or was destroyed while inside. */
  exit: { entity: Entity };
}

/**
 * An area of any shape that nothing collides with and that reports what's inside it. It uses
 * its `collision` filter to choose what to detect. Other sensors are never detected.
 */
export class Sensor extends Shape {
  private readonly sensorOptions: SensorOptions;
  private readonly events = new EventEmitter<SensorEvents>();
  private readonly inside = new Set<Entity>();
  private enabled = true;
  /** Replaces `collider.shape` after `setRadius()`, because Rapier caches that one. */
  private resizedShape: RAPIER.Shape | null = null;

  constructor(world: RAPIER.World, options: SensorOptions) {
    if (options.geometry.type === "polyline") throw new Error("A polyline has no inside, so it can't be a sensor");
    super(world, { ...options, body: options.follow ? "kinematic" : "fixed", color: options.color });
    this.sensorOptions = options;
  }

  public on<K extends keyof SensorEvents>(event: K, listener: Listener<SensorEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** The entities inside right now. */
  public getInside(): readonly Entity[] {
    return [...this.inside];
  }

  public isOccupied(): boolean {
    return this.inside.size > 0;
  }

  /** While disabled it detects nothing, and whatever was inside gets an `exit`. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Changes the radius of a circular sensor, in meters, while the game runs. It throws on other shapes. */
  public setRadius(radius: number): void {
    if (this.options.geometry.type !== "circle") throw new Error("setRadius() only works on circular sensors");
    if (!(radius > 0)) throw new Error("The radius must be greater than 0");
    this.options.geometry = { type: "circle", radius };
    this.body.collider(0).setRadius(radius);
    this.resizedShape = new RAPIER.Ball(radius);
  }

  /** The radius of a circular sensor, or null for other shapes. */
  public getRadius(): number | null {
    const { geometry } = this.options;
    return geometry.type === "circle" ? geometry.radius : null;
  }

  protected override onDestroy(): void {
    const left = [...this.inside];
    this.inside.clear();
    for (const entity of left) this.events.emit("exit", { entity });
    super.onDestroy();
  }

  protected override describeCollider(desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc {
    return desc.setSensor(true);
  }

  public override update(): void {
    const { follow, offset, filter, detectFixed, once } = this.sensorOptions;
    if (follow && !follow.isDestroyed) {
      const p = follow.getPosition();
      this.body.setTranslation({ x: p.x + (offset?.x ?? 0), y: p.y + (offset?.y ?? 0) }, true);
    }

    const now = new Set<Entity>();
    if (this.enabled) {
      const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | (detectFixed ? 0 : RAPIER.QueryFilterFlags.EXCLUDE_FIXED);
      this.world.intersectionsWithShape(
        this.body.translation(),
        this.body.rotation(),
        this.resizedShape ?? this.body.collider(0).shape,
        (collider) => {
          // Runs inside Rapier: only plain JavaScript here, and events wait until it's over.
          const entity = entityOf(this.world, collider);
          if (entity !== undefined && entity !== follow) now.add(entity);
          return true;
        },
        flags,
        toInteractionGroups(this.getCollision()),
      );
    }

    for (const entity of [...this.inside]) {
      if (now.has(entity)) continue;
      this.inside.delete(entity);
      this.events.emit("exit", { entity });
    }
    for (const entity of now) {
      if (this.inside.has(entity) || entity.isDestroyed || (filter && !filter(entity))) continue;
      this.inside.add(entity);
      this.events.emit("enter", { entity });
      if (once) this.enabled = false;
    }
  }

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    if (this.sensorOptions.color === undefined) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    super.draw(ctx, scale, centerX, centerY);
    ctx.restore();
  }
}
