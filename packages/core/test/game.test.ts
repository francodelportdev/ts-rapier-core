import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, Player, type GameEvents } from "../src";
import { createGame, createWorld, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

describe("Entity.destroy()", () => {
  test("removes the body and its colliders from the world", () => {
    const world = createWorld();
    const box = new Box(world);
    expect(world.bodies.len()).toBe(1);
    expect(world.colliders.len()).toBe(1);
    box.destroy();
    expect(world.bodies.len()).toBe(0);
    expect(world.colliders.len()).toBe(0);
    expect(box.isDestroyed).toBe(true);
  });

  test("calling it twice has no effect", () => {
    const world = createWorld();
    const box = new Box(world);
    box.destroy();
    expect(() => box.destroy()).not.toThrow();
  });

  test("the player also frees its character controller", () => {
    const world = createWorld();
    const player = new Player(world);
    let removedController = false;
    const original = world.removeCharacterController.bind(world);
    world.removeCharacterController = (c) => {
      removedController = true;
      original(c);
    };
    player.destroy();
    expect(removedController).toBe(true);
    expect(world.bodies.len()).toBe(0);
  });
});

describe("Game: removing entities", () => {
  async function setup(options?: Parameters<typeof createGame>[0]) {
    const game = await createGame(options);
    const world = game.getWorld();
    const removed: GameEvents["entityRemoved"][] = [];
    game.on("entityRemoved", (e) => removed.push(e));
    return { game, world, removed };
  }

  test("removeEntity() frees the body and emits entityRemoved", async () => {
    const { game, world, removed } = await setup();
    const box = new Box(world);
    game.addEntity(box);
    game.removeEntity(box);
    expect(game.getEntities()).toHaveLength(0);
    expect(game.getBodyCount()).toBe(0);
    expect(removed).toEqual([{ entity: box, reason: "manual" }]);
  });

  test("while the loop runs, removal waits until the step ends", async () => {
    const { game, world, removed } = await setup();
    const box = new Box(world);
    game.addEntity(box);
    game.start();
    game.removeEntity(box);
    expect(game.getEntities()).toHaveLength(1); // still there
    stepGame(game);
    expect(game.getEntities()).toHaveLength(0);
    expect(removed).toHaveLength(1);
    game.stop();
  });

  test("removing from inside an event listener is safe", async () => {
    const { game, world } = await setup();
    const player = new Player(world, { respawnBelow: -10 });
    game.addEntity(player);
    player.on("respawn", () => game.removeEntity(player)); // remove instead of respawning
    game.start();
    stepGame(game, 120); // no ground: falls below -10
    expect(game.getEntities()).toHaveLength(0);
    expect(player.isDestroyed).toBe(true);
    game.stop();
  });

  test("removing twice emits once", async () => {
    const { game, world, removed } = await setup();
    const box = new Box(world);
    game.addEntity(box);
    game.removeEntity(box);
    game.removeEntity(box);
    expect(removed).toHaveLength(1);
  });

  test("a destroyed entity can't be added again", async () => {
    const { game, world } = await setup();
    const box = new Box(world);
    box.destroy();
    expect(() => game.addEntity(box)).toThrow();
  });

  test("the kill plane removes entities that fall out of the level", async () => {
    const { game, world, removed } = await setup();
    game.addEntity(new Ground(world));
    const onGround = new Box(world, 0, 0);
    const offEdge = new Box(world, 15, 0); // past the 20 m ground
    game.addEntity(onGround);
    game.addEntity(offEdge);
    stepGame(game, 300);
    expect(removed).toEqual([{ entity: offEdge, reason: "killPlane" }]);
    expect(game.getEntities()).toContain(onGround);
    expect(game.getBodyCount()).toBe(2);
  });

  test("killPlaneY changes the height, and null disables it", async () => {
    const high = await setup({ killPlaneY: 0 });
    high.game.addEntity(new Box(high.world, 0, 1));
    stepGame(high.game, 60);
    expect(high.removed).toHaveLength(1);

    const off = await setup({ killPlaneY: null });
    off.game.addEntity(new Box(off.world, 0, 1));
    stepGame(off.game, 300);
    expect(off.removed).toHaveLength(0);
  });
});

describe("Game: input focus", () => {
  test("only the focused game receives keys", async () => {
    const a = await createGame();
    const playerA = new Player(a.getWorld());
    a.addEntity(new Ground(a.getWorld()));
    a.addEntity(playerA);
    a.start(); // focuses a's canvas (nothing else had focus)

    const b = await createGame();
    const playerB = new Player(b.getWorld());
    b.addEntity(new Ground(b.getWorld()));
    b.addEntity(playerB);
    b.start(); // focuses b's canvas; a loses focus

    keys.down("ArrowRight");
    stepGame(a, 30);
    stepGame(b, 30);
    expect(playerA.getVelocity().x).toBe(0);
    expect(playerB.getVelocity().x).toBeGreaterThan(0);
    a.stop();
    b.stop();
  });
});
