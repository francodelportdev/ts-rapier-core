import type RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "./Entity";
import { Sensor } from "./Sensor";

export interface TriggerOptions {
  /** Center, in meters. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The only entity it reacts to. */
  target: Entity;
  /** Fill color. Default: invisible. */
  color?: string;
  /** Use a circle of diameter `width` instead of a rectangle. Default: false. */
  round?: boolean;
  /** Turn off after the first `enter`. Default: false. */
  once?: boolean;
}

/** The simple case of a `Sensor`: an area that watches a single entity. */
export class Trigger extends Sensor {
  constructor(world: RAPIER.World, { width, height, target, round, ...rest }: TriggerOptions) {
    super(world, {
      ...rest,
      geometry: round ? { type: "circle", radius: width / 2 } : { type: "box", width, height },
      filter: (entity) => entity === target,
    });
  }
}
