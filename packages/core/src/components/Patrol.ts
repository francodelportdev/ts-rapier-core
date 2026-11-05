import type { Point } from "../systems/oneWay";
import { Component } from "./Component";

/** Moves a kinematic entity back and forth along a list of points, at `speed` m/s. */
export class Patrol extends Component {
  public speed: number;
  private readonly points: readonly Point[];
  private target = 1;
  private direction: 1 | -1 = 1;

  constructor(points: readonly Point[], speed = 2) {
    super();
    if (points.length < 2) throw new Error("Patrol needs at least 2 points");
    this.points = points;
    this.speed = speed;
  }

  public override onAttach(): void {
    if (!this.entity.getBody().isKinematic()) throw new Error("Patrol only works on kinematic entities");
    const start = this.points[0]!;
    this.entity.getBody().setTranslation(start, true);
  }

  public override update(dt: number): void {
    const body = this.entity.getBody();
    const p = body.translation();
    const goal = this.points[this.target]!;
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (distance <= step) {
      body.setNextKinematicTranslation(goal);
      if (this.target + this.direction < 0 || this.target + this.direction >= this.points.length) this.direction = this.direction === 1 ? -1 : 1;
      this.target += this.direction;
    } else {
      body.setNextKinematicTranslation({ x: p.x + (dx / distance) * step, y: p.y + (dy / distance) * step });
    }
  }
}
