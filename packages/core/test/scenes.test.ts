import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, LevelScene, Player, Scene, Trigger, validateLevel, type LevelData, type LevelStats } from "../src";
import { createGame, createWorld, keys, simulate, stepGame } from "./helpers";

beforeEach(() => keys.reset());

/** Records its lifecycle, and adds one box. */
class TestScene extends Scene<string | undefined> {
  constructor(private readonly log: string[], private readonly label: string) {
    super();
  }
  public override onEnter(data: string | undefined): void {
    this.log.push(`enter ${this.label} ${data ?? ""}`.trim());
    this.game.addEntity(new Box(this.world));
  }
  public override onExit(): void {
    this.log.push(`exit ${this.label}`);
  }
  public override update(): void {
    this.log.push(`update ${this.label}`);
  }
}

async function setup() {
  const game = await createGame();
  const log: string[] = [];
  game.scenes.add("a", () => new TestScene(log, "a")).add("b", () => new TestScene(log, "b"));
  return { game, log };
}

describe("SceneManager", () => {
  test("enters a scene, passing its data", async () => {
    const { game, log } = await setup();
    game.scenes.go("a", { data: "hello" });
    expect(log).toEqual(["enter a hello"]);
    expect(game.scenes.currentSceneName).toBe("a");
  });

  test("an unknown scene throws", async () => {
    const { game } = await setup();
    expect(() => game.scenes.go("nope")).toThrow(/nope/);
  });

  test("changing removes the old entities and resets the camera and gravity", async () => {
    const { game, log } = await setup();
    game.scenes.go("a");
    const old = game.getEntities()[0]!;
    game.camera.zoom = 2;
    game.camera.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    game.getWorld().gravity.y = -1;
    game.scenes.go("b");
    expect(log).toEqual(["enter a", "exit a", "enter b"]);
    expect(old.isDestroyed).toBe(true);
    expect(game.getEntities()).toHaveLength(1);
    expect(game.getBodyCount()).toBe(1);
    expect(game.camera.zoom).toBe(1);
    expect(game.getWorld().gravity.y).toBeCloseTo(-9.81, 5);
  });

  test("while running, go() waits for the end of the step", async () => {
    const { game, log } = await setup();
    game.scenes.go("a");
    game.start();
    game.scenes.go("b");
    expect(game.scenes.currentSceneName).toBe("a");
    stepGame(game);
    expect(game.scenes.currentSceneName).toBe("b");
    expect(log).toEqual(["enter a", "update a", "exit a", "enter b"]);
  });

  test("a second go() during a change is ignored", async () => {
    const { game } = await setup();
    game.scenes.go("a");
    game.start();
    game.scenes.go("b", { fade: 0.1 });
    game.scenes.go("a");
    stepGame(game, 8);
    expect(game.scenes.currentSceneName).toBe("b");
  });

  test("a fade freezes the old scene, then swaps", async () => {
    const { game, log } = await setup();
    game.scenes.go("a");
    game.start();
    game.scenes.go("b", { fade: 0.1 }); // 6 steps
    stepGame(game, 3);
    expect(game.scenes.currentSceneName).toBe("a");
    expect(log).toEqual(["enter a"]); // no updates while fading out
    stepGame(game, 4);
    expect(game.scenes.currentSceneName).toBe("b");
  });

  test("restart() re-enters with the same data, on a fresh scene", async () => {
    const { game, log } = await setup();
    game.scenes.go("a", { data: "x" });
    game.scenes.restart();
    expect(log).toEqual(["enter a x", "exit a", "enter a x"]);
  });

  test("emits change", async () => {
    const { game } = await setup();
    const changes: unknown[] = [];
    game.scenes.on("change", (e) => changes.push(e));
    game.scenes.go("a");
    game.scenes.go("b");
    expect(changes).toEqual([{ from: null, to: "a" }, { from: "a", to: "b" }]);
  });
});

describe("Trigger", () => {
  test("reports enter and exit once each, and doesn't block", () => {
    const world = createWorld();
    const player = new Player(world, { x: -3 });
    const trigger = new Trigger(world, { x: 0, y: -3.5, width: 1, height: 3, target: player });
    const log: string[] = [];
    trigger.on("enter", () => log.push("enter"));
    trigger.on("exit", () => log.push("exit"));
    keys.down("ArrowRight");
    simulate(world, [new Ground(world), trigger, player], 80);
    expect(log).toEqual(["enter", "exit"]);
    expect(player.getPosition().x).toBeGreaterThan(3); // walked through the sensor
  });
});

describe("LevelScene", () => {
  const level: LevelData = {
    name: "Test",
    bounds: { minX: -20, maxX: 40, minY: -10, maxY: 10 },
    spawn: { x: -5, y: -3.5 },
    goal: { x: 12, y: -3.5, width: 1, height: 2 },
    platforms: [{ x: 5, y: -5, width: 40 }],
    boxes: [{ x: -10, y: -4 }],
    coins: [{ x: 0, y: -3.5 }, { x: 2, y: -3.5 }],
  };

  async function play(data: LevelData) {
    const game = await createGame();
    let stats: LevelStats | undefined;
    class End extends Scene<LevelStats> {
      public override onEnter(s: LevelStats): void {
        stats = s;
      }
    }
    game.scenes.add("level", () => new LevelScene(data, { next: "end", fade: 0.05 })).add("end", () => new End());
    game.scenes.go("level");
    game.start();
    return { game, scene: game.scenes.current as unknown as LevelScene, stats: () => stats };
  }

  test("builds the level from its data", async () => {
    const { game, scene } = await play(level);
    // platform, box, 2 coins, goal, player
    expect(game.getEntities()).toHaveLength(6);
    expect(scene.getPlayer().getPosition().x).toBe(-5);
  });

  test("walking collects coins and reaching the goal goes to the next scene with the stats", async () => {
    const { game, stats } = await play(level);
    keys.down("ArrowRight");
    stepGame(game, 200);
    expect(game.scenes.currentSceneName).toBe("end");
    expect(stats()).toMatchObject({ coins: 2, totalCoins: 2, deaths: 0 });
    expect(stats()!.time).toBeGreaterThan(1);
    expect(game.getEntities()).toHaveLength(0);
  });

  test("a hazard counts a death and sends the player back", async () => {
    const { game, scene } = await play({ ...level, hazards: [{ x: 0, y: -4, width: 1, height: 1 }] });
    keys.down("ArrowRight");
    stepGame(game, 60);
    expect(scene.getStats().deaths).toBeGreaterThanOrEqual(1);
    expect(scene.getPlayer().getPosition().x).toBeLessThan(0);
  });

  test("falling out counts a death", async () => {
    const { game, scene } = await play({ ...level, platforms: [] });
    stepGame(game, 120);
    expect(scene.getStats().deaths).toBeGreaterThanOrEqual(1);
    expect(game.getEntities()).toContain(scene.getPlayer()); // respawned, not removed by the kill plane
  });

  test("a collected coin is removed from the game", async () => {
    const { game, scene } = await play(level);
    const before = game.getEntities().length;
    keys.down("ArrowRight");
    stepGame(game, 45); // past the first coin at x = 0, before the second at x = 2
    expect(scene.getStats().coins).toBe(1);
    expect(game.getEntities()).toHaveLength(before - 1);
  });

  test("in a deep level, the kill plane moves below the respawn line", async () => {
    const { game, scene } = await play({ ...level, platforms: [], bounds: { ...level.bounds, minY: -60 } });
    stepGame(game, 400); // falls past the default kill plane at -30
    expect(game.getEntities()).toContain(scene.getPlayer());
    expect(scene.getPlayer().isDestroyed).toBe(false);
  });

  test("level gravity and player options apply", async () => {
    const { game, scene } = await play({ ...level, gravity: 2, player: { speed: 3 } });
    expect(game.getWorld().gravity.y).toBeCloseTo(-2, 5);
    expect(scene.getPlayer().getTuning().speed).toBe(3);
  });

  test("validateLevel reports problems by name", () => {
    expect(() => validateLevel({ ...level, spawn: { x: 0 } as LevelData["spawn"] })).toThrow(/"Test".*spawn/);
    expect(() => validateLevel({ ...level, bounds: { minX: 5, maxX: 1, minY: 0, maxY: 1 } })).toThrow(/bounds/);
    expect(() => validateLevel(level)).not.toThrow();
  });
});
