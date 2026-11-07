import type RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";

/** Per world: collider handle → entity. Plain JavaScript, so it's safe inside Rapier callbacks. */
const entities = new WeakMap<RAPIER.World, Map<number, Entity>>();

/** @internal */
export function registerEntity(world: RAPIER.World, collider: RAPIER.Collider, entity: Entity): void {
  let map = entities.get(world);
  if (map === undefined) {
    map = new Map();
    entities.set(world, map);
  }
  map.set(collider.handle, entity);
}

/** @internal */
export function unregisterEntity(world: RAPIER.World, collider: RAPIER.Collider): void {
  entities.get(world)?.delete(collider.handle);
}

/** @internal The entity of a collider handle, for code that can't get the collider. */
export function entityOfHandle(world: RAPIER.World, handle: number): Entity | undefined {
  return entities.get(world)?.get(handle);
}

/** The entity a collider belongs to, or undefined for colliders made outside the engine. */
export function entityOf(world: RAPIER.World, collider: RAPIER.Collider): Entity | undefined {
  return entities.get(world)?.get(collider.handle);
}
