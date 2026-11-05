import type RAPIER from "@dimforge/rapier2d-compat";
import type { CollisionFilter } from "../systems/layers";
import { Platform } from "./Platform";

/** A shortcut: a 20 m wide `Platform` at y = -5, whose top surface is at y = -4.5. */
export class Ground extends Platform {
  constructor(world: RAPIER.World, collision?: CollisionFilter) {
    super(world, { x: 0, y: -5, width: 20, height: 1, collision });
  }
}
