import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Component, Ground, Patrol, Player, Sensor, Shape, type Entity, type Game } from "../src";
import { createGame, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

/** Records the game's collision events as "start A-B" / "end A-B", by constructor name. */
function record(game: Game): string[] {
  const log: string[] = [];
  const name = (e: Entity) => e.constructor.name;
  game.on("collisionStart", ({ a, b }) => log.push(`start ${[name(a), name(b)].sort().join("-")}`));
  game.on("collisionEnd", ({ a, b }) => log.push(`end ${[name(a), name(b)].sort().join("-")}`));
  return log;
}

async function setup() {
  const game = await createGame({ killPlaneY: null });
  const world = game.getWorld();
  game.start();
  return { game, world, log: record(game) };
}

describe("Collisions", () => {
  test("a box landing on the ground starts one contact", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Box(world, 0, 0));
    stepGame(game, 120);
    expect(log).toEqual(["start Box-Ground"]);
  });

  // The controller shoves bodies without Rapier reporting a contact. A 10 kg player sends a
  // 1 kg box flying, so they touch for a couple of steps and the contact ends.
  test("the player pushing a box counts, though Rapier doesn't report it", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Player(world));
    game.addEntity(new Box(world, 2, -4));
    stepGame(game, 30);
    keys.down("ArrowRight");
    stepGame(game, 60);
    const pushes = log.filter((l) => l.endsWith("Box-Player"));
    expect(pushes[0]).toBe("start Box-Player");
    expect(pushes.filter((l) => l === "end Box-Player").length).toBeLessThanOrEqual(pushes.filter((l) => l === "start Box-Player").length);
  });

  test("walking away from a box ends the contact", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Player(world));
    game.addEntity(new Box(world, 2, -4));
    stepGame(game, 30);
    keys.down("ArrowRight");
    stepGame(game, 30);
    keys.reset();
    keys.down("ArrowLeft");
    stepGame(game, 60);
    expect(log).toContain("end Box-Player");
  });

  test("a kinematic enemy walking into the player counts", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Player(world, { x: -3 }));
    const enemy = new Shape(world, { x: 3, y: -3.5, body: "kinematic", geometry: { type: "box", width: 1, height: 2 } });
    enemy.add(new Patrol([{ x: 3, y: -3.5 }, { x: -3, y: -3.5 }], 3));
    game.addEntity(enemy);
    stepGame(game, 150);
    expect(log).toContain("start Player-Shape");
  });

  test("entities and components get onCollisionStart and onCollisionEnd", async () => {
    const { game, world } = await setup();
    const calls: string[] = [];
    class Crate extends Box {
      override onCollisionStart(other: Entity) {
        calls.push(`crate start ${other.constructor.name}`);
      }
      override onCollisionEnd(other: Entity) {
        calls.push(`crate end ${other.constructor.name}`);
      }
    }
    class Listen extends Component {
      override onCollisionStart(other: Entity) {
        calls.push(`component start ${other.constructor.name}`);
      }
    }
    const ground = new Ground(world);
    const crate = new Crate(world, 0, 0);
    crate.add(new Listen());
    game.addEntity(ground);
    game.addEntity(crate);
    stepGame(game, 120);
    expect(calls).toEqual(["crate start Ground", "component start Ground"]);
    game.removeEntity(ground);
    stepGame(game);
    expect(calls).toContain("crate end Ground");
  });

  test("removing an entity ends its contacts once, when the removal applies", async () => {
    const { game, world, log } = await setup();
    const box = new Box(world, 0, 0);
    game.addEntity(new Ground(world));
    game.addEntity(box);
    stepGame(game, 120);
    game.removeEntity(box); // a running game removes it at the end of the step
    stepGame(game);
    expect(log).toEqual(["start Box-Ground", "end Box-Ground"]);
    stepGame(game, 5);
    expect(log).toHaveLength(2);
  });

  test("an entity removed from a listener mid-step ends its contacts once", async () => {
    const { game, world, log } = await setup();
    const box = new Box(world, 0, 0);
    game.on("collisionStart", () => game.removeEntity(box));
    game.addEntity(new Ground(world));
    game.addEntity(box);
    stepGame(game, 120);
    expect(log).toEqual(["start Box-Ground", "end Box-Ground"]);
    expect(box.isDestroyed).toBe(true);
  });

  test("sensors don't report collisions", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Sensor(world, { x: 0, y: 0, geometry: { type: "box", width: 4, height: 20 } }));
    game.addEntity(new Box(world, 0, 0));
    stepGame(game, 120);
    expect(log).toEqual(["start Box-Ground"]);
  });

  test("clear() forgets contacts without events, and new ones start again", async () => {
    const { game, world, log } = await setup();
    game.addEntity(new Ground(world));
    game.addEntity(new Box(world, 0, 0));
    stepGame(game, 120);
    game.clear();
    expect(log).toEqual(["start Box-Ground"]);
    game.addEntity(new Ground(world));
    game.addEntity(new Box(world, 0, 0));
    stepGame(game, 120);
    expect(log).toEqual(["start Box-Ground", "start Box-Ground"]);
  });

  test("a hook that throws doesn't stop the other one or the game", async () => {
    const { game, world, log } = await setup();
    const errors: unknown[] = [];
    game.on("error", ({ error }) => errors.push(error));
    class Fragile extends Box {
      override onCollisionStart() {
        throw new Error("expected in this test");
      }
    }
    game.addEntity(new Ground(world));
    game.addEntity(new Fragile(world, 0, 0));
    stepGame(game, 120);
    expect(errors).toHaveLength(1);
    expect(log).toEqual(["start Fragile-Ground"]);
  });

  test("entities outside the game report nothing", async () => {
    const { game, world, log } = await setup();
    new Ground(world); // in the world, but never added
    game.addEntity(new Box(world, 0, 0));
    stepGame(game, 120);
    expect(log).toEqual([]);
  });
});
