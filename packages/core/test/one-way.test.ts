import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, Platform, Player, Shape, isOneWay, type PlayerOptions } from "../src";
import { createWorld, keys, simulate, simulateUntil } from "./helpers";

beforeEach(() => keys.reset());

/** A one-way platform 2.5 m above the ground (top at y = -2), just above the head of the player standing below it. */
function setup(options: PlayerOptions = {}, platformX = 0) {
  const world = createWorld();
  const platform = new Platform(world, { x: platformX, y: -2.25, width: 4, oneWay: true });
  const player = new Player(world, options);
  const entities = [new Ground(world), platform, player];
  simulate(world, entities, 10);
  const drops: number[] = [];
  player.on("dropThrough", () => drops.push(1));
  return { world, player, entities, drops };
}

/** Jumps and holds until the player lands somewhere. */
function jumpAndLand(s: ReturnType<typeof setup>) {
  keys.down("Space");
  simulate(s.world, s.entities, 5);
  simulateUntil(s.world, s.entities, () => s.player.isGrounded() && s.player.getVelocity().y === 0, 120);
  keys.up("Space");
  simulate(s.world, s.entities, 1); // let the player see the release, so the next press is new
}

describe("One-way platforms", () => {
  test("Platform and Shape mark their bodies as one-way", () => {
    const world = createWorld();
    const platform = new Platform(world, { x: 0, y: 0, width: 2, oneWay: true });
    const shape = new Shape(world, { x: 5, y: 0, oneWay: true, geometry: { type: "box", width: 2, height: 0.5 } });
    const normal = new Platform(world, { x: 10, y: 0, width: 2 });
    expect(isOneWay(world, platform["body"].collider(0))).toBe(true);
    expect(isOneWay(world, shape["body"].collider(0))).toBe(true);
    expect(isOneWay(world, normal["body"].collider(0))).toBe(false);
  });

  test("jumping from below passes through and lands on top", () => {
    const s = setup();
    jumpAndLand(s);
    expect(s.player.getPosition().y).toBeCloseTo(-1, 1); // standing on the top (-2) + half height
  });

  test("a normal platform blocks the same jump from below", () => {
    const world = createWorld();
    const player = new Player(world);
    const entities = [new Ground(world), new Platform(world, { x: 0, y: -2.25, width: 4 }), player];
    simulate(world, entities, 10);
    keys.down("Space");
    let top = -Infinity;
    simulate(world, entities, 60, () => (top = Math.max(top, player.getPosition().y)));
    expect(top).toBeLessThan(-3.4); // the head (top + 1) is already touching the underside
  });

  test("landing with only one side over the edge still stands on it", () => {
    const world = createWorld();
    // Platform spans x = -2..2; the player's center is past the edge, its left side is over it.
    const player = new Player(world, { x: 2.3, y: 1 });
    const entities = [new Ground(world), new Platform(world, { x: 0, y: -2.25, width: 4, oneWay: true }), player];
    simulateUntil(world, entities, () => player.isGrounded(), 120);
    expect(player.getPosition().y).toBeCloseTo(-1, 1); // on the platform, not the ground
  });

  test("walking into its side passes through", () => {
    // Platform low enough to hit the player's body: top at -3, the player spans -4.5 to -2.5.
    const world = createWorld();
    const player = new Player(world, { x: -5 });
    const entities = [new Ground(world), new Platform(world, { x: 0, y: -3.25, width: 4, oneWay: true }), player];
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    simulate(world, entities, 90);
    expect(player.getPosition().x).toBeGreaterThan(3); // walked all the way through
  });

  test("↓ + jump drops through it", () => {
    const s = setup();
    jumpAndLand(s);
    keys.down("ArrowDown");
    keys.down("Space");
    simulate(s.world, s.entities, 2);
    expect(s.drops).toHaveLength(1);
    keys.up("Space");
    keys.up("ArrowDown");
    simulateUntil(s.world, s.entities, () => s.player.isGrounded() && s.player.getPosition().y < -3, 120);
    expect(s.player.getPosition().y).toBeCloseTo(-3.5, 1); // back on the ground
  });

  test("↓ + jump on a normal platform is just a jump", () => {
    const { world, player, entities, drops } = setup();
    const jumps: number[] = [];
    player.on("jump", () => jumps.push(1));
    keys.down("ArrowDown");
    keys.down("Space");
    simulate(world, entities, 2); // standing on the ground, which isn't one-way
    expect(drops).toHaveLength(0);
    expect(jumps).toHaveLength(1);
  });

  test("dropping doesn't land back on the same platform", () => {
    const s = setup({ dropThroughTime: 0.25 });
    jumpAndLand(s);
    const top = s.player.getPosition().y;
    keys.down("ArrowDown");
    keys.down("Space");
    let landedOnPlatform = false;
    simulate(s.world, s.entities, 60, (i) => {
      if (i === 2) keys.up("Space");
      landedOnPlatform ||= i > 5 && s.player.isGrounded() && Math.abs(s.player.getPosition().y - top) < 0.2;
    });
    expect(landedOnPlatform).toBe(false);
  });

  test("with dropThroughTime 0, the player can't drop through", () => {
    const s = setup({ dropThroughTime: 0 });
    jumpAndLand(s);
    const y = s.player.getPosition().y;
    keys.down("ArrowDown");
    keys.down("Space");
    simulate(s.world, s.entities, 30);
    expect(s.player.getPosition().y).toBeCloseTo(y, 1);
  });

  test("isn't a wall for wall slides", () => {
    const world = createWorld();
    // A tall one-way slab beside the player's fall: without the filter it would be a wall.
    const player = new Player(world, { x: 0, y: 3, wallJump: true });
    const entities = [new Ground(world), new Platform(world, { x: 2, y: 0, width: 2, height: 8, oneWay: true }), player];
    keys.down("ArrowRight");
    let slid = false;
    simulate(world, entities, 60, () => (slid ||= player.isWallSliding()));
    expect(slid).toBe(false);
  });

  test("works with rotated shapes: jump up through a tilted one-way plank and stand on it", () => {
    const world = createWorld();
    const plank = new Shape(world, { x: 0, y: -2, angle: 0.2, oneWay: true, geometry: { type: "box", width: 6, height: 0.3 } });
    const player = new Player(world);
    const entities = [new Ground(world), plank, player];
    simulate(world, entities, 10);
    keys.down("Space");
    simulate(world, entities, 5);
    simulateUntil(world, entities, () => player.isGrounded() && player.getVelocity().y === 0, 120);
    expect(player.getPosition().y).toBeGreaterThan(-1.5); // on the plank (around -0.85), not the ground
  });

  test("only fixed shapes can be one-way", () => {
    const world = createWorld();
    expect(() => new Shape(world, { x: 0, y: 0, body: "dynamic", oneWay: true, geometry: { type: "box", width: 1, height: 1 } })).toThrow();
  });

  test("destroying a one-way platform unregisters it", () => {
    const world = createWorld();
    const platform = new Platform(world, { x: 0, y: 0, width: 2, oneWay: true });
    const collider = platform["body"].collider(0);
    platform.destroy();
    expect(isOneWay(world, collider)).toBe(false);
  });

  test("dynamic bodies always collide with it", () => {
    const world = createWorld();
    const box = new Box(world, 0, 3);
    simulate(world, [new Ground(world), new Platform(world, { x: 0, y: -2.75, width: 4, oneWay: true }), box], 120);
    expect(box.getPosition().y).toBeCloseTo(-2, 1); // resting on the one-way platform
  });
});
