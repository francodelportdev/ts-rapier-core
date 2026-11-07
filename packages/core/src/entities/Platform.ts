import type RAPIER from "@dimforge/rapier2d-compat";
import type { CollisionFilter } from "../systems/layers";
import { Shape } from "./Shape";

export interface PlatformOptions {
  /** Center X, in meters. */
  x: number;
  /** Center Y, in meters. */
  y: number;
  /** Full width, in meters. */
  width: number;
  /** Full height, in meters. Default: 0.5. */
  height?: number;
  /** Fill color. Default: "#4a5568" ("#718096" for one-way platforms). */
  color?: string;
  /**
   * One-way platform: the player stands on it from above, but passes through it from below
   * and the sides, and drops through it with ↓ + jump. Other bodies always collide with it.
   * Default: false.
   */
  oneWay?: boolean;
  /** What it is and what it collides with. Default: everything. */
  collision?: CollisionFilter;
}

/** A shortcut: a fixed, axis-aligned rectangle to stand on. One-way platforms show a bright top edge. */
export class Platform extends Shape {
  constructor(world: RAPIER.World, { width, height = 0.5, ...options }: PlatformOptions) {
    super(world, { ...options, geometry: { type: "box", width, height } });
  }

  private get size(): { width: number; height: number } {
    const g = this.options.geometry as { width: number; height: number };
    return { width: g.width, height: g.height };
  }

  /** Y of the top surface, in meters. */
  public get top(): number {
    return this.getPosition().y + this.size.height / 2;
  }

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    super.draw(ctx, scale, centerX, centerY);
    if (!this.options.oneWay) return;
    // A bright top edge marks the side you can stand on.
    const { width } = this.size;
    const { px, py } = this.toCanvas(this.getPosition().x - width / 2, this.top, scale, centerX, centerY);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(px, py, width * scale, Math.max(2, 0.06 * scale));
  }
}
