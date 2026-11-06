import { beforeEach, describe, expect, test } from "bun:test";
import { Animator, AudioManager, Box, Controls, Game, Ground, Health, Input, Patrol, Platform, Player, Scene, Sensor, Shape, Sprite, SpriteSheet, validateLevel, type LevelData, type SheetImage } from "../src";
import { createCanvas, createGame, createWorld, firePointer, keys, simulate, simulateUntil, stepGame } from "./helpers";
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

describe("Game options and API", () => {
  test("scale sets pixels per meter", async () => {
    const game = await createGame({ scale: 50 });
    expect(game.camera.scale).toBe(50);
  });

  test("background paints the canvas each frame", async () => {
    const game = await createGame({ background: "#123456" });
    game.start();
    game["loop"](0);
    expect(game["ctx"].fillStyle).toBe("#123456");
  });

  test("RAPIER is exported, the same instance the engine uses", async () => {
    const { RAPIER } = await import("../src");
    expect(createWorld()).toBeInstanceOf(RAPIER.World);
  });

  test("once runs a single time on a sensor", () => {
    const world = createWorld();
    world.gravity.y = 0;
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: { type: "box", width: 2, height: 2 } });
    let enters = 0;
    sensor.once("enter", () => enters++);
    const a = new Box(world, 0, 0);
    simulate(world, [a, sensor], 2);
    a.destroy();
    simulate(world, [sensor], 2);
    new Box(world, 0, 0);
    simulate(world, [sensor], 2);
    expect(enters).toBe(1);
  });

  test("Ground and Box are a Platform and a Shape", () => {
    const world = createWorld();
    expect(new Ground(world).top).toBe(-4.5);
    const box = new Box(world, 1, 2);
    expect(box).toBeInstanceOf(Shape);
    expect(box.getPosition()).toEqual({ x: 1, y: 2 });
  });
});

describe("Landing", () => {
  test("after a fast fall, the player keeps its running speed", () => {
    const world = createWorld();
    const player = new Player(world, { x: -40, y: 8 });
    const entities = [new Platform(world, { x: 0, y: -5, width: 200, height: 0.5 }), player];
    keys.down("ArrowRight");
    simulateUntil(world, entities, () => player.isGrounded(), 200);
    simulate(world, entities, 3);
    const start = player.getPosition().x;
    simulate(world, entities, 60);
    expect(player.getPosition().x - start).toBeGreaterThan(7.5); // 8 m/s for 1 s
    expect(player.getPosition().y).toBeCloseTo(-3.75, 1);
  });
});

describe("Leaving a moving platform", () => {
  async function ride() {
    const game = await createGame({ killPlaneY: null });
    const world = game.getWorld();
    const platform = new Shape(world, { x: 0, y: -5, body: "kinematic", geometry: { type: "box", width: 6, height: 1 } });
    platform.add(new Patrol([{ x: 0, y: -5 }, { x: 30, y: -5 }], 4));
    const player = new Player(world, { x: 0, y: -3.49, respawnBelow: -1000 });
    game.addEntity(platform);
    game.addEntity(player);
    game.start();
    keys.reset();
    stepGame(game, 60);
    expect(player.isGrounded()).toBe(true);
    return { game, player };
  }

  function largestStep(game: Game, player: Player, steps: number): number {
    let largest = 0;
    for (let i = 0; i < steps; i++) {
      const before = player.getPosition().x;
      stepGame(game);
      largest = Math.max(largest, Math.abs(player.getPosition().x - before));
    }
    return largest;
  }

  test("jumping off doesn't throw the player sideways", async () => {
    const { game, player } = await ride();
    keys.down("Space");
    expect(largestStep(game, player, 70)).toBeLessThan(0.2);
  });

  test("walking off the edge doesn't throw the player sideways", async () => {
    const { game, player } = await ride();
    keys.down("ArrowRight");
    expect(largestStep(game, player, 120)).toBeLessThan(0.3);
  });
});

describe("Game lifecycle", () => {
  const globals = globalThis as unknown as Record<string, unknown>;

  test("destroy() ends the current scene", async () => {
    const calls: string[] = [];
    class Level extends Scene {
      override onEnter() {
        this.listen(() => calls.push("cleanup"));
      }
      override onExit() {
        calls.push("exit");
      }
    }
    const game = await Game.create(createCanvas());
    game.scenes.add("level", () => new Level());
    game.scenes.go("level");
    game.destroy();
    expect(calls).toEqual(["exit", "cleanup"]);
    expect(game.scenes.current).toBeNull();
  });

  test("a failing onExit() still destroys the game and runs the cleanups", async () => {
    let cleaned = false;
    class Level extends Scene {
      override onEnter() {
        this.listen(() => (cleaned = true));
      }
      override onExit() {
        throw new Error("expected in this test");
      }
    }
    const game = await Game.create(createCanvas());
    game.scenes.add("level", () => new Level());
    game.scenes.go("level");
    game.destroy();
    expect(cleaned).toBe(true);
    expect(game.isRunning()).toBe(false);
  });

  test("a canvas can be reused on a high-density screen", async () => {
    globals.devicePixelRatio = 2;
    try {
      const canvas = createCanvas();
      (await Game.create(canvas)).destroy();
      const second = await Game.create(canvas);
      expect(second.width).toBe(800);
      expect(canvas.width).toBe(1600);
      second.destroy();
    } finally {
      delete globals.devicePixelRatio;
    }
  });

  test("resize() changes the size of a canvas without CSS sizing, also on a reused canvas", async () => {
    globals.getComputedStyle = (c: HTMLCanvasElement) => ({ width: c.style.width || `${c.width}px` });
    try {
      const canvas = createCanvas();
      const first = await Game.create(canvas);
      first.resize(1000, 300);
      expect([canvas.style.width, canvas.style.height]).toEqual(["1000px", "300px"]);
      first.destroy();
      const second = await Game.create(canvas);
      second.resize(640, 360);
      expect([canvas.style.width, canvas.style.height]).toEqual(["640px", "360px"]);
      second.destroy();
    } finally {
      delete globals.getComputedStyle;
    }
  });

  test("resize() leaves a canvas sized by CSS alone", async () => {
    globals.getComputedStyle = () => ({ width: "100%" });
    try {
      const canvas = createCanvas();
      const game = await Game.create(canvas);
      game.resize(1000, 300);
      expect(canvas.style.width).toBeUndefined();
      game.destroy();
    } finally {
      delete globals.getComputedStyle;
    }
  });

  test("stop() and start() from a listener keep a single loop", async () => {
    const original = { request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame };
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    globalThis.requestAnimationFrame = (callback) => {
      pending.set(++nextId, callback);
      return nextId;
    };
    globalThis.cancelAnimationFrame = (id) => void pending.delete(id);
    try {
      const game = await createGame();
      game.once("frame", () => {
        game.stop();
        game.start();
      });
      game.start();
      for (let frame = 0; frame < 3; frame++) {
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback(frame * 16);
        expect(pending.size).toBe(1);
      }
      game.stop();
      expect(pending.size).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = original.request;
      globalThis.cancelAnimationFrame = original.cancel;
    }
  });
});

describe("A player with its own keys", () => {
  test("still follows on-screen buttons and gamepads", () => {
    const world = createWorld();
    const player = new Player(world, { keys: { left: ["KeyJ"], right: ["KeyL"], jump: ["KeyK"] } });
    const entities = [new Ground(world), player];
    simulate(world, entities, 10);
    const input = Input.getInstance();
    input.press("ArrowRight");
    simulate(world, entities, 20);
    input.release("ArrowRight");
    expect(player.getVelocity().x).toBeGreaterThan(0);
  });

  test("doesn't take the default keys from the keyboard", () => {
    const world = createWorld();
    const player = new Player(world, { keys: { right: ["KeyL"] } });
    const entities = [new Ground(world), player];
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    simulate(world, entities, 20);
    expect(player.getVelocity().x).toBe(0);
  });
});

describe("Medium-severity audit bugs", () => {
  test("a tap during a fade doesn't reach the next scene", async () => {
    let jumps = 0;
    class Empty extends Scene {
      override onEnter() {}
    }
    class Level extends Scene {
      override onEnter() {
        this.game.addEntity(new Ground(this.world));
        const player = new Player(this.world);
        player.on("jump", () => jumps++);
        this.game.addEntity(player);
      }
    }
    const game = await createGame();
    game.scenes.add("empty", () => new Empty());
    game.scenes.add("level", () => new Level());
    game.scenes.go("empty");
    game.start();
    stepGame(game);
    game.scenes.go("level", { fade: 0.1 });
    stepGame(game, 2);
    keys.down("Space");
    keys.up("Space");
    stepGame(game, 12);
    expect(jumps).toBe(0);
  });

  test("configure({ jumpHeight }) reaches wall jumps that inherit it, and only those", () => {
    const inherits = new Player(createWorld(), { wallJump: true });
    inherits.configure({ jumpHeight: 6 });
    expect(inherits.getTuning().wallJump?.jumpHeight).toBe(6);
    const own = new Player(createWorld(), { wallJump: { jumpHeight: 2 } });
    own.configure({ jumpHeight: 6 });
    expect(own.getTuning().wallJump?.jumpHeight).toBe(2);
    inherits.configure({ wallJump: { jumpHeight: 1 } });
    inherits.configure({ jumpHeight: 7 });
    expect(inherits.getTuning().wallJump?.jumpHeight).toBe(1);
  });

  test("a once sensor enters once when two entities arrive together", async () => {
    const game = await createGame();
    const world = game.getWorld();
    const sensor = new Sensor(world, { x: 0, y: 0, once: true, geometry: { type: "box", width: 4, height: 4 } });
    let enters = 0;
    sensor.on("enter", () => enters++);
    game.addEntity(sensor);
    game.addEntity(new Box(world, 0, 0));
    game.addEntity(new Box(world, 1, 0));
    stepGame(game, 3);
    expect(enters).toBe(1);
  });

  test("a component that fails to attach isn't left on the entity", () => {
    const box = new Box(createWorld(), 0, 0);
    expect(() => box.add(new Patrol([{ x: 0, y: 0 }, { x: 1, y: 0 }]))).toThrow();
    expect(box.has(Patrol)).toBe(false);
  });

  test("Controls.load() keeps an input in one action, also against defaults", () => {
    const controls = new Controls();
    const q = { type: "key", code: "KeyQ" } as const;
    const a = { type: "key", code: "KeyA" } as const;
    controls.load({ left: [q], right: [q], jump: [a] });
    expect(controls.get("right")).toEqual([]);
    expect(controls.get("jump")).toEqual([a]);
    controls.load({ jump: [a] });
    expect(controls.get("left")).not.toContainEqual(a);
  });

  test("Health ignores NaN damage", () => {
    const health = new Health(5);
    expect(health.damage(NaN)).toBe(false);
    expect(health.value).toBe(5);
  });

  test("validateLevel checks the optional lists", () => {
    const level = { name: "L", bounds: { minX: 0, maxX: 9, minY: 0, maxY: 9 }, spawn: { x: 1, y: 1 }, goal: { x: 5, y: 5, width: 1, height: 1 } };
    const bad = (extra: object) => () => validateLevel({ ...level, ...extra } as LevelData);
    expect(bad({ platforms: [{ x: 0, y: 0 }] })).toThrow(/platform 0/);
    expect(bad({ shapes: [{ x: 0, y: 0 }] })).toThrow(/shape 0/);
    expect(bad({ hazards: [{ x: 0, y: 0 }] })).toThrow(/hazard 0/);
    expect(bad({ boxes: [{ x: 0 }] })).toThrow(/boxes 0/);
    expect(bad({ coins: [{ y: 0 }] })).toThrow(/coins 0/);
    expect(bad({ platforms: [{ x: 0, y: 0, width: 2 }] })).not.toThrow();
  });

  test("the kill plane leaves the player to its own respawn", async () => {
    const game = await createGame({ killPlaneY: -10 });
    const player = new Player(game.getWorld(), { y: 0 });
    game.addEntity(player);
    let respawned = false;
    player.on("respawn", () => (respawned = true));
    game.start();
    stepGame(game, 120);
    expect(player.isDestroyed).toBe(false);
    expect(respawned).toBe(true);
  });

  test("a touch held through a window blur works again on the next move", async () => {
    const game = await createGame();
    game.touch.enabled = true;
    game.touch.alwaysVisible = true;
    const canvas = game["canvas"];
    game.start();
    firePointer(canvas, "pointerdown", 42, 408, 1, "touch");
    dispatchWindowEvent("blur");
    firePointer(canvas, "pointermove", 43, 408, 1, "touch");
    expect(Input.getInstance().isPressed("ArrowLeft")).toBe(true);
    firePointer(canvas, "pointerup", 43, 408, 1, "touch");
    Input.getInstance().endStep(); // the tap from pressing lasts until the end of the step
    expect(Input.getInstance().isPressed("ArrowLeft")).toBe(false);
  });

  test("a grid size of 0 is rejected", async () => {
    await expect(Game.create(createCanvas(), { grid: { size: 0 } })).rejects.toThrow(/grid/);
  });

  test("audio creates no context after destroy()", () => {
    const g = globalThis as { AudioContext?: unknown };
    let created = 0;
    g.AudioContext = class {
      constructor() {
        created++;
      }
    };
    try {
      const audio = new AudioManager();
      audio.destroy();
      audio.synth("beep");
      audio.play("beep");
      expect(created).toBe(0);
    } finally {
      delete g.AudioContext;
    }
  });
});
