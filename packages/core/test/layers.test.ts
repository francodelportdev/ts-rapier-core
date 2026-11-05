import { beforeEach, describe, expect, test } from "bun:test";
import { ALL_LAYERS, Box, Ground, Platform, Player, Shape, defineLayers, toInteractionGroups } from "../src";
import { createWorld, keys, simulate } from "./helpers";

beforeEach(() => keys.reset());

const layers = defineLayers(["world", "player", "red", "blue"]);
const ball = { type: "circle", radius: 0.5 } as const;

describe("defineLayers", () => {
  test("gives each name its own bit, and combines them", () => {
    expect(layers.bit("world")).toBe(1);
    expect(layers.bit("blue")).toBe(8);
    expect(layers.filter(["red", "blue"], ["world", "player"])).toEqual({ layers: 12, mask: 3 });
  });

  test("packs layers in the high bits and the mask in the low bits", () => {
    expect(toInteractionGroups({ layers: 1, mask: 2 })).toBe(0x00010002);
    expect(toInteractionGroups({ layers: ALL_LAYERS, mask: ALL_LAYERS })).toBe(0xffffffff);
  });

  test("rejects too many, repeated and unknown names", () => {
    expect(() => defineLayers(Array.from({ length: 17 }, (_, i) => `l${i}`))).toThrow(/16/);
    expect(() => defineLayers(["a", "a"])).toThrow(/unique/);
    expect(() => (layers as { bit(n: string): number }).bit("nope")).toThrow(/nope/);
  });
});

describe("Dynamic bodies", () => {
  /** Drops a ball onto a floor and returns where it ends up. */
  function drop(floor: ReturnType<typeof layers.filter>, falling: ReturnType<typeof layers.filter>) {
    const world = createWorld();
    const entities = [
      new Platform(world, { x: 0, y: -5, width: 20, collision: floor }),
      new Shape(world, { x: 0, y: 0, body: "dynamic", geometry: ball, collision: falling }),
    ];
    simulate(world, entities, 120);
    return entities[1]!.getPosition().y;
  }

  test("collide when both masks include each other", () => {
    expect(drop(layers.filter("world", ["red"]), layers.filter("red", ["world"]))).toBeGreaterThan(-5);
  });

  test("pass through if either mask leaves the other out", () => {
    expect(drop(layers.filter("world", []), layers.filter("red", ["world"]))).toBeLessThan(-6);
    expect(drop(layers.filter("world", ["red"]), layers.filter("red", []))).toBeLessThan(-6);
  });

  test("setCollision() applies at runtime, even to a sleeping body", () => {
    const world = createWorld();
    const floor = new Ground(world);
    const box = new Box(world, 0, -4);
    simulate(world, [floor, box], 400);
    expect(box["body"].isSleeping()).toBe(true);
    box.setCollision(layers.filter("red", []));
    simulate(world, [floor, box], 60);
    expect(box.getPosition().y).toBeLessThan(-6);
    expect(box.getCollision()).toEqual(layers.filter("red", []));
  });

  test("Box takes a filter in its constructor", () => {
    const world = createWorld();
    const box = new Box(world, 0, 0, layers.filter("red", []));
    simulate(world, [new Ground(world), box], 120);
    expect(box.getPosition().y).toBeLessThan(-6);
  });
});

describe("Player", () => {
  const world_ = layers.filter("world", ["player"]);

  test("stands on what its mask includes", () => {
    const world = createWorld();
    const player = new Player(world, { y: 0, collision: layers.filter("player", ["world"]) });
    const entities = [new Platform(world, { x: 0, y: -5, width: 20, collision: world_ }), player];
    simulate(world, entities, 90);
    expect(player.isGrounded()).toBe(true);
  });

  test("falls through a floor outside its mask", () => {
    const world = createWorld();
    const player = new Player(world, { y: 0, respawnBelow: -100, collision: layers.filter("player", ["red"]) });
    simulate(world, [new Platform(world, { x: 0, y: -5, width: 20, collision: world_ }), player], 60);
    expect(player.getPosition().y).toBeLessThan(-6);
  });

  test("walks through a wall outside its mask, and doesn't wall slide on it", () => {
    const world = createWorld();
    const player = new Player(world, { y: 0, wallJump: true, collision: layers.filter("player", ["world"]) });
    const entities = [
      new Platform(world, { x: 0, y: -5, width: 40, collision: world_ }),
      new Platform(world, { x: 2, y: 0, width: 1, height: 10, collision: layers.filter("red", ["player"]) }),
      player,
    ];
    keys.down("ArrowRight");
    let slid = false;
    simulate(world, entities, 60, () => (slid ||= player.isWallSliding()));
    expect(slid).toBe(false);
    expect(player.getPosition().x).toBeGreaterThan(3);
  });

  test("a body outside its mask doesn't affect whether it's grounded", () => {
    const world = createWorld();
    const player = new Player(world, { collision: layers.filter("player", ["world"]) });
    const entities = [
      new Platform(world, { x: 0, y: -5, width: 20, collision: world_ }),
      // A ghost right under the player's feet, with a steep side: it must not count as the ground.
      new Shape(world, { x: 0, y: -4.6, geometry: { type: "polygon", points: [{ x: -0.2, y: 0 }, { x: 0.2, y: 0 }, { x: 0, y: 3 }] }, collision: layers.filter("red", ["red"]) }),
      player,
    ];
    simulate(world, entities, 20);
    expect(player.isGrounded()).toBe(true);
  });

  test("doesn't push boxes outside its mask", () => {
    const world = createWorld();
    const box = new Box(world, 2, -4, layers.filter("red", ["world"]));
    const player = new Player(world, { collision: layers.filter("player", ["world"]) });
    const entities = [new Platform(world, { x: 0, y: -5, width: 40, collision: layers.filter("world", ["player", "red"]) }), box, player];
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(box.getPosition().x).toBeCloseTo(2, 1);
    expect(player.getPosition().x).toBeGreaterThan(3);
  });

  test("setCollision() also changes the controller's queries", () => {
    const world = createWorld();
    const player = new Player(world, { respawnBelow: -100 });
    const entities = [new Platform(world, { x: 0, y: -5, width: 20, collision: world_ }), player];
    simulate(world, entities, 20);
    expect(player.isGrounded()).toBe(true);
    player.setCollision(layers.filter("player", []));
    simulate(world, entities, 60);
    expect(player.getPosition().y).toBeLessThan(-6);
  });
});
