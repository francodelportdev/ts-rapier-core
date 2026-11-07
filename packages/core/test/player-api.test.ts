import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, LevelScene, Patrol, Player, Shape, validateLevel, type LevelData } from "../src";
import { createGame, createWorld, keys, simulate, stepGame } from "./helpers";

beforeEach(() => keys.reset());

function standing(options = {}) {
  const world = createWorld();
  const player = new Player(world, options);
  const entities = [new Ground(world), player];
  simulate(world, entities, 20);
  return { world, player, entities };
}

describe("Entity: position and velocity", () => {
  test("setPosition() teleports a dynamic body, which keeps falling from there", () => {
    const world = createWorld();
    const box = new Box(world, 0, 0);
    box.setPosition(4, 6);
    expect(box.getPosition()).toEqual({ x: 4, y: 6 });
    simulate(world, [box], 10);
    expect(box.getPosition().y).toBeLessThan(6);
    expect(box.getPosition().x).toBeCloseTo(4, 3);
  });

  test("a teleport isn't drawn sliding there", () => {
    const box = new Box(createWorld(), 0, 0);
    box.savePose();
    box.setPosition(1, 0); // close enough that it would be interpolated otherwise
    expect(box["previousPose"]).toBeNull();
  });

  test("setVelocity() and getVelocity() on a dynamic body", () => {
    const world = createWorld();
    const box = new Box(world, 0, 0);
    box.setVelocity(5, 0);
    expect(box.getVelocity().x).toBeCloseTo(5, 3);
    simulate(world, [box], 6);
    expect(box.getPosition().x).toBeGreaterThan(0.3);
  });

  test("a kinematic body moved by Patrol ignores setVelocity()", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 0, body: "kinematic", geometry: { type: "box", width: 1, height: 1 } });
    shape.add(new Patrol([{ x: 0, y: 0 }, { x: 0, y: 0.001 }], 0));
    shape.setVelocity(9, 0);
    simulate(world, [shape], 10);
    expect(shape.getPosition().x).toBeCloseTo(0, 3);
  });
});

describe("Player: moving from code", () => {
  test("setPosition() teleports the player, and it lands from there", () => {
    const { world, player, entities } = standing();
    player.setPosition(5, 2);
    expect(player.getPosition()).toEqual({ x: 5, y: 2 });
    simulate(world, entities, 90);
    expect(player.getPosition().x).toBeCloseTo(5, 1);
    expect(player.isGrounded()).toBe(true);
  });

  test("setVelocity() moves the player, and the jump cut doesn't shorten an upward push", () => {
    const { world, player, entities } = standing();
    player.setVelocity(0, 15);
    let top = -Infinity;
    simulate(world, entities, 40, () => (top = Math.max(top, player.getPosition().y)));
    // v² / 2g = 225 / 80 ≈ 2.8 m above the start (-3.5)
    expect(top).toBeGreaterThan(-1);
  });

  test("knockback() holds against the arrow keys for the lock, then they work again", () => {
    const { world, player, entities } = standing();
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    expect(player.getVelocity().x).toBeGreaterThan(7);
    player.knockback(-10, 6, 0.2);
    simulate(world, entities, 10); // 0.17 s, inside the lock
    expect(player.getVelocity().x).toBeLessThan(-5);
    simulate(world, entities, 40);
    expect(player.getVelocity().x).toBeGreaterThan(0);
  });

  test("without the lock, setVelocity() is undone by the arrow keys at once", () => {
    const { world, player, entities } = standing();
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    player.setVelocity(-10, 0);
    simulate(world, entities, 10);
    expect(player.getVelocity().x).toBeGreaterThan(-5);
  });

  test("knockback() ends a dash", () => {
    const { world, player, entities } = standing({ dash: true });
    keys.down("ShiftLeft");
    simulate(world, entities, 2);
    expect(player.isDashing()).toBe(true);
    player.knockback(-8, 4);
    simulate(world, entities, 1);
    expect(player.isDashing()).toBe(false);
    expect(player.getVelocity().x).toBeLessThan(0);
  });

  test("setSpawn() changes where respawn() and falls send the player", () => {
    const { world, player, entities } = standing({ respawnBelow: -10 });
    player.setSpawn(6, -3.5);
    expect(player.getSpawn()).toEqual({ x: 6, y: -3.5 });
    player.respawn();
    expect(player.getPosition()).toEqual({ x: 6, y: -3.5 });
    player.setPosition(30, 0); // off the ground: it falls below respawnBelow
    let fell = false;
    player.on("respawn", (e) => (fell = e.fell));
    simulate(world, entities, 120);
    expect(fell).toBe(true);
    expect(player.getPosition().x).toBeCloseTo(6, 1);
    expect(() => player.setSpawn(NaN, 0)).toThrow(/spawn/);
  });
});

describe("Level checkpoints", () => {
  const level: LevelData = {
    name: "Checkpoints",
    bounds: { minX: -10, maxX: 40, minY: -9, maxY: 9 },
    spawn: { x: 0, y: -3.5 },
    goal: { x: 38, y: -3.5, width: 1, height: 2 },
    platforms: [{ x: 15, y: -5, width: 50 }],
    checkpoints: [{ x: 5, y: -3.5 }],
    hazards: [{ x: 10, y: -4.25, width: 1, height: 0.5 }],
  };

  test("touching a checkpoint makes the hazards send the player back there", async () => {
    const game = await createGame();
    game.scenes.add("level", () => new LevelScene(level, { next: "level" }));
    game.scenes.go("level");
    game.start();
    const player = (game.scenes.current as LevelScene).getPlayer();
    keys.down("ArrowRight");
    let respawnedAt: number | null = null;
    player.on("respawn", () => (respawnedAt = player.getPosition().x));
    for (let i = 0; i < 300 && respawnedAt === null; i++) stepGame(game);
    expect(respawnedAt).not.toBeNull();
    expect(respawnedAt!).toBeCloseTo(5, 1);
  });

  test("validateLevel checks the checkpoints", () => {
    expect(() => validateLevel({ ...level, checkpoints: [{ x: 1 } as { x: number; y: number }] })).toThrow(/checkpoints 0/);
  });
});
