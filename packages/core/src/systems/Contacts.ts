import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { entityOfHandle } from "./entityRegistry";

/** Steps a pair reported only by a character controller stays touching after its last hit. */
const CONTROLLER_GRACE = 3;

/** Which kinds of bodies report touching: the default (dynamic with anything) plus kinematic bodies. */
export const CONTACT_TYPES =
  RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED;

interface Pair {
  a: Entity;
  b: Entity;
}

function keyOf(a: Entity, b: Entity): string {
  return a.contactId < b.contactId ? `${a.contactId}:${b.contactId}` : `${b.contactId}:${a.contactId}`;
}

/**
 * Which entities touch, for `Game`. It joins Rapier's collision events with the hits of
 * character controllers, which push bodies without touching them, and reports each pair
 * once when it starts and once when it ends.
 */
export class Contacts {
  private readonly queue = new RAPIER.EventQueue(true);
  /** Pairs Rapier reports as touching, by collider handles. */
  private readonly physical = new Map<string, Pair>();
  /** Pairs from controller hits, with the steps they have left. */
  private readonly controller = new Map<string, Pair & { left: number }>();
  private touching = new Map<string, Pair>();

  private readonly world: RAPIER.World;

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  /** @internal The queue to pass to `world.step()`. */
  public get eventQueue(): RAPIER.EventQueue {
    return this.queue;
  }

  /**
   * Reads what happened during the last step. `entities` are the ones in the game; the
   * callbacks run for each pair that started or stopped touching.
   */
  public update(entities: readonly Entity[], start: (pair: Pair) => void, end: (pair: Pair) => void): void {
    // Rapier can't be called while it drains, so collect the handles first.
    const events: [number, number, boolean][] = [];
    this.queue.drainCollisionEvents((h1, h2, started) => events.push([h1, h2, started]));
    for (const [h1, h2, started] of events) {
      const key = h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`;
      if (!started) {
        this.physical.delete(key);
        continue;
      }
      const a = entityOfHandle(this.world, h1);
      const b = entityOfHandle(this.world, h2);
      if (a === undefined || b === undefined || a === b) continue;
      if (this.world.getCollider(h1)?.isSensor() || this.world.getCollider(h2)?.isSensor()) continue;
      this.physical.set(key, { a, b });
    }

    for (const [key, pair] of this.controller) {
      pair.left--;
      if (pair.left <= 0) this.controller.delete(key);
    }
    for (const a of entities) {
      for (const b of a.collectContacts()) {
        if (b !== a) this.controller.set(keyOf(a, b), { a, b, left: CONTROLLER_GRACE });
      }
    }

    const inGame = new Set(entities);
    const now = new Map<string, Pair>();
    for (const pair of [...this.physical.values(), ...this.controller.values()]) {
      if (!inGame.has(pair.a) || !inGame.has(pair.b)) continue;
      const key = keyOf(pair.a, pair.b);
      if (!now.has(key)) now.set(key, { a: pair.a, b: pair.b });
    }
    const before = this.touching;
    this.touching = now;
    for (const [key, pair] of before) if (!now.has(key)) end(pair);
    for (const [key, pair] of now) if (!before.has(key)) start(pair);
  }

  /** Forgets an entity that left the game, and returns the pairs it was in, to end them. */
  public remove(entity: Entity): Pair[] {
    const ended: Pair[] = [];
    for (const map of [this.physical, this.controller] as Map<string, Pair>[]) {
      for (const [key, pair] of map) if (pair.a === entity || pair.b === entity) map.delete(key);
    }
    for (const [key, pair] of this.touching) {
      if (pair.a !== entity && pair.b !== entity) continue;
      this.touching.delete(key);
      ended.push(pair);
    }
    return ended;
  }

  /** Forgets everything, without ending any pair. */
  public clear(): void {
    this.physical.clear();
    this.controller.clear();
    this.touching.clear();
  }

  public free(): void {
    this.queue.free();
  }
}
