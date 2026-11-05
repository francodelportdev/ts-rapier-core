import type RAPIER from "@dimforge/rapier2d-compat";
import type { CollisionFilter } from "../systems/layers";
import { Shape } from "./Shape";

/** A shortcut: a dynamic `Shape`, 1 m wide. */
export class Box extends Shape {
  constructor(world: RAPIER.World, x = 0, y = 5, collision?: CollisionFilter) {
    super(world, { x, y, body: "dynamic", collision, geometry: { type: "box", width: 1, height: 1 } });
  }
}
