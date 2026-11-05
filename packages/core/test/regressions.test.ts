import { beforeEach, describe, expect, test } from "bun:test";
import { Animator, Box, Game, Ground, Input, Patrol, Player, Scene, Sensor, Shape, Sprite, SpriteSheet, type SheetImage } from "../src";
import { createCanvas, createGame, createWorld, keys, simulate, stepGame } from "./helpers";
import { dispatchWindowEvent } from "./setup";

beforeEach(() => keys.reset());

describe("Input: taps", () => {
  function ready() {
    const world = createWorld();
    const player = new Player(world, { dash: true });
    const entities = [new Ground(world), player];
    simulate(world, entities, 10);
    let jumps = 0;
    player.on("jump", () => jumps++);
    return { world, player, entities, jumps: () => jumps };
  }

  test("a key pressed and released between two steps still counts, once", () => {
    const s = ready();
    keys.down("Space");
    keys.up("Space");
    simulate(s.world, s.entities, 30);
    expect(s.jumps()).toBe(1);
  });

  test("a dash tap works too", () => {
    const s = ready();
    let dashes = 0;
    s.player.on("dash", () => dashes++);
    keys.down("KeyX");
    keys.up("KeyX");
    simulate(s.world, s.entities, 3);
    expect(dashes).toBe(1);
  });

  test("a tap reads as pressed for just one step", () => {
    const input = Input.getInstance();
    keys.down("KeyQ");
    keys.up("KeyQ");
    expect(input.isPressed("KeyQ")).toBe(true);
    input.endStep();
    expect(input.isPressed("KeyQ")).toBe(false);
  });

  test("a tap made elsewhere is dropped when focus moves", () => {
    keys.down("KeyQ");
    keys.up("KeyQ");
    dispatchWindowEvent("focusin");
    expect(Input.getInstance().isPressed("KeyQ")).toBe(false);
  });

  test("an unfocused game doesn't eat the taps of the focused one", async () => {
    const focused = await createGame();
    focused.start();
    const other = await Game.create(createCanvas());
    other.start();
    keys.down("KeyQ");
    keys.up("KeyQ");
    stepGame(other);
    expect(Input.getInstance()["taps"].has("KeyQ")).toBe(true);
    other.stop();
    other.destroy();
  });
});

describe("Game", () => {
  test("snapToTarget ignores a removed target", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    game.addEntity(box);
    game.camera.follow(box);
    game.removeEntity(box);
    expect(() => game.camera.snapToTarget()).not.toThrow();
  });

  test("the gravity option is used, and clear() goes back to it", async () => {
    const game = await createGame({ gravity: 3 });
    expect(game.getWorld().gravity.y).toBeCloseTo(-3, 5);
    game.getWorld().gravity.y = -20;
    game.clear();
    expect(game.getWorld().gravity.y).toBeCloseTo(-3, 5);
  });

  test("an entity can't be added twice, or to two games", async () => {
    const a = await createGame();
    const b = await createGame();
    const box = new Box(a.getWorld());
    a.addEntity(box);
    expect(() => a.addEntity(box)).toThrow(/already/);
    expect(() => b.addEntity(box)).toThrow(/already/);
  });

  test("camera conversions work before start()", async () => {
    const game = await createGame();
    expect(game.camera.screenToWorld(400, 225)).toEqual({ x: 0, y: 0 });
  });
});

describe("Scene listeners", () => {
  async function setup(onEnter: (scene: Scene, count: () => void) => void) {
    const game = await createGame();
    let calls = 0;
    class S extends Scene {
      public override onEnter() {
        onEnter(this, () => calls++);
      }
    }
    game.scenes.add("s", () => new S());
    game.scenes.go("s");
    game.scenes.restart();
    game.scenes.restart();
    game.start();
    game["loop"](0);
    return { game, calls: () => calls };
  }

  test("game.on() in onEnter doesn't pile up across entries", async () => {
    const { calls } = await setup((scene, count) => scene.game.on("frame", count));
    expect(calls()).toBe(1);
  });

  test("listen() ends other subscriptions with the scene", async () => {
    let offs = 0;
    await setup((scene) => scene["listen"](() => offs++));
    expect(offs).toBe(2);
  });

  test("a listener added outside a scene stays", async () => {
    const game = await createGame();
    let calls = 0;
    game.on("frame", () => calls++);
    class S extends Scene {
      public override onEnter() {}
    }
    game.scenes.add("s", () => new S());
    game.scenes.go("s");
    game.scenes.restart();
    game.start();
    game["loop"](0);
    expect(calls).toBe(1);
  });
});

describe("Validation", () => {
  test("a clip with a frame outside the sheet fails at creation", () => {
    const sheet = new SpriteSheet({ width: 32, height: 32 } as SheetImage, 32, 32);
    const animator = new Animator({ a: { frames: [0] , fps: 1 }, b: { frames: [99], fps: 1 } }, "a");
    expect(() => new Sprite({ sheet, animator, width: 1, height: 1 })).toThrow(/99/);
  });

  test("configure() skips undefined and rejects bad numbers", () => {
    const player = new Player(createWorld(), { dash: true });
    player.configure({ speed: undefined, dash: { speed: undefined } });
    expect(player.getTuning().speed).toBe(8);
    expect(player.getTuning().dash?.speed).toBe(20);
    expect(() => player.configure({ speed: Number.NaN })).toThrow(/speed/);
    expect(() => player.configure({ dash: { duration: Infinity } })).toThrow(/duration/);
  });
});

test("destroying a sensor emits exit for what's inside", () => {
  const world = createWorld();
  world.gravity.y = 0;
  const box = new Box(world, 0, 0);
  const sensor = new Sensor(world, { x: 0, y: 0, geometry: { type: "box", width: 2, height: 2 } });
  const exits: unknown[] = [];
  sensor.on("exit", ({ entity }) => exits.push(entity));
  simulate(world, [box, sensor], 3);
  sensor.destroy();
  expect(exits).toEqual([box]);
});

describe("Moving platforms", () => {
  function ride(from: { x: number; y: number }, to: { x: number; y: number }) {
    const world = createWorld();
    const player = new Player(world, { x: from.x, y: from.y + 1.3 });
    const platform = new Shape(world, { ...from, body: "kinematic", geometry: { type: "box", width: 6, height: 0.5 } });
    const patrol = platform.add(new Patrol([from, to], 2));
    const entities = [platform, player];
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        simulate(world, entities, 1);
        patrol.update(1 / 60);
      }
    };
    step(20); // landed
    return { player, platform, step };
  }

  test("a player rides a platform moving sideways", () => {
    const { player, platform, step } = ride({ x: 0, y: 0 }, { x: 20, y: 0 });
    const gap = platform.getPosition().x - player.getPosition().x;
    step(60);
    expect(platform.getPosition().x - player.getPosition().x).toBeCloseTo(gap, 1);
    expect(player.isGrounded()).toBe(true);
  });

  test("a player rides a platform going up and down", () => {
    const up = ride({ x: 0, y: 0 }, { x: 0, y: 20 });
    up.step(60);
    expect(up.player.getPosition().y - up.platform.getPosition().y).toBeCloseTo(1.25, 0);
    const down = ride({ x: 0, y: 20 }, { x: 0, y: 0 });
    down.step(60);
    expect(down.player.getPosition().y - down.platform.getPosition().y).toBeCloseTo(1.25, 0);
    expect(down.player.isGrounded()).toBe(true);
  });

  test("on a fast descending platform, it stays grounded and can jump", () => {
    const world = createWorld();
    const from = { x: 0, y: 20 };
    const player = new Player(world, { x: 0, y: 21.3 });
    const platform = new Shape(world, { ...from, body: "kinematic", geometry: { type: "box", width: 6, height: 0.5 } });
    const patrol = platform.add(new Patrol([from, { x: 0, y: 0 }], 5));
    const entities = [platform, player];
    let grounded = 0;
    for (let i = 0; i < 120; i++) {
      simulate(world, entities, 1);
      patrol.update(1 / 60);
      if (i >= 20 && player.isGrounded()) grounded++;
    }
    expect(grounded).toBeGreaterThan(95); // of 100
    let jumps = 0;
    player.on("jump", () => jumps++);
    keys.down("Space");
    simulate(world, entities, 3);
    expect(jumps).toBe(1);
  });

  test("removing the platform under the player is safe", () => {
    const world = createWorld();
    const player = new Player(world, { x: 0, y: 1.3 });
    const platform = new Shape(world, { x: 0, y: 0, body: "kinematic", geometry: { type: "box", width: 6, height: 0.5 } });
    simulate(world, [platform, player], 20);
    platform.destroy();
    expect(() => simulate(world, [player], 10)).not.toThrow();
    expect(player.isGrounded()).toBe(false);
  });
});
