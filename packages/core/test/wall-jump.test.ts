import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, Platform, Player, type PlayerEvents, type PlayerOptions } from "../src";
import { createWorld, keys, simulate, simulateUntil } from "./helpers";

beforeEach(() => keys.reset());

/**
 * A tall wall on the right (face at x = 1.5) and a player in the air next to it,
 * holding → so it slides once it touches the wall.
 */
function setup(options: PlayerOptions = {}) {
  const world = createWorld();
  const player = new Player(world, { x: 0, y: 4, wallJump: true, ...options });
  const wall = new Platform(world, { x: 2, y: 2, width: 1, height: 14 });
  const entities = [new Ground(world), wall, player];
  const jumps: PlayerEvents["jump"][] = [];
  const slides: string[] = [];
  player.on("jump", (e) => jumps.push(e));
  player.on("wallSlideStart", ({ side }) => slides.push(`start:${side}`));
  player.on("wallSlideEnd", ({ side }) => slides.push(`end:${side}`));
  return { world, player, entities, jumps, slides };
}

/** Holds → until the player is sliding down the wall. */
function slideDownWall(s: ReturnType<typeof setup>) {
  keys.down("ArrowRight");
  simulateUntil(s.world, s.entities, () => s.player.isWallSliding(), 120);
}

describe("Wall slide", () => {
  test("is off by default", () => {
    const s = setup({ wallJump: false });
    keys.down("ArrowRight");
    simulate(s.world, s.entities, 25); // still in the air (lands after ~37 steps)
    expect(s.player.isWallSliding()).toBe(false);
    expect(s.player.getVelocity().y).toBeLessThan(-10); // falls at full speed along the wall
  });

  test("caps the fall speed at slideSpeed while pushing into the wall", () => {
    const s = setup();
    slideDownWall(s);
    simulate(s.world, s.entities, 20);
    expect(s.player.getState()).toBe("wallSlide");
    expect(s.player.getVelocity().y).toBeCloseTo(-3, 5);
    expect(s.slides).toEqual(["start:1"]);
  });

  test("slideSpeed is configurable", () => {
    const s = setup({ wallJump: { slideSpeed: 1 } });
    slideDownWall(s);
    simulate(s.world, s.entities, 20);
    expect(s.player.getVelocity().y).toBeCloseTo(-1, 5);
  });

  test("touching the wall without pushing into it doesn't slide", () => {
    const s = setup();
    slideDownWall(s);
    keys.up("ArrowRight");
    simulate(s.world, s.entities, 2);
    expect(s.player.isWallSliding()).toBe(false);
    expect(s.slides).toEqual(["start:1", "end:1"]);
  });

  test("landing ends the slide", () => {
    const s = setup();
    slideDownWall(s);
    simulateUntil(s.world, s.entities, () => s.player.isGrounded(), 300);
    simulate(s.world, s.entities, 1);
    expect(s.player.isWallSliding()).toBe(false);
    expect(s.player.getState()).toBe("idle"); // → is still held, but the wall stops it
    expect(s.slides).toEqual(["start:1", "end:1"]);
  });

  test("dynamic bodies (boxes) aren't walls", () => {
    const world = createWorld();
    // Three stacked boxes pinned against a fixed wall, so pushing them doesn't move them away.
    const player = new Player(world, { x: 0, y: -1, wallJump: true });
    const entities = [
      new Ground(world),
      new Platform(world, { x: 4, y: 0, width: 1, height: 10 }), // face at x = 3.5
      new Box(world, 3, -4),
      new Box(world, 3, -3),
      new Box(world, 3, -2),
      player,
    ];
    simulate(world, entities, 30);
    keys.down("ArrowRight");
    let slid = false;
    simulate(world, entities, 40, () => (slid ||= player.isWallSliding()));
    expect(slid).toBe(false);
    expect(player.getPosition().x).toBeGreaterThan(1.6); // it did reach the boxes
  });
});

describe("Wall jump", () => {
  test("jumps up and away from the wall", () => {
    const s = setup();
    slideDownWall(s);
    keys.down("Space");
    simulate(s.world, s.entities, 1);
    expect(s.jumps).toEqual([{ airJump: false, wallJump: true, jumpNumber: 1 }]);
    expect(s.player.getVelocity().x).toBeCloseTo(-10, 5);
    expect(s.player.getVelocity().y).toBeGreaterThan(14);
    expect(s.player.getFacing()).toBe(-1);
    expect(s.player.isWallSliding()).toBe(false);
  });

  test("ignores the arrow keys for controlLock seconds", () => {
    const s = setup({ wallJump: { controlLock: 0.15 } });
    slideDownWall(s); // → is still held
    keys.down("Space");
    simulate(s.world, s.entities, 8); // 0.13 s: still locked
    expect(s.player.getVelocity().x).toBeCloseTo(-10, 5);
    simulate(s.world, s.entities, 10); // unlocked: → takes over again
    expect(s.player.getVelocity().x).toBeGreaterThan(-10);
  });

  test("works shortly after moving away from the wall (wall coyote time)", () => {
    const s = setup();
    slideDownWall(s);
    keys.up("ArrowRight");
    keys.down("ArrowLeft");
    simulateUntil(s.world, s.entities, () => s.player.getPosition().x < 0.94, 30); // probe reaches 0.05 m past the side (x = 1)
    keys.down("Space");
    simulate(s.world, s.entities, 1);
    expect(s.jumps.map((j) => j.wallJump)).toEqual([true]);
    expect(s.player.getVelocity().x).toBeCloseTo(-10, 5); // still pushed away from the right wall
  });

  test("doesn't work long after leaving the wall", () => {
    const s = setup();
    slideDownWall(s);
    keys.up("ArrowRight");
    keys.down("ArrowLeft");
    simulate(s.world, s.entities, 15); // moved away, 0.25 s
    keys.down("Space");
    simulate(s.world, s.entities, 1);
    expect(s.jumps).toHaveLength(0);
  });

  test("keeps the double jump available", () => {
    const s = setup({ maxJumps: 2 });
    slideDownWall(s);
    keys.down("Space");
    simulate(s.world, s.entities, 15);
    keys.up("Space");
    keys.up("ArrowRight");
    simulate(s.world, s.entities, 1);
    keys.down("Space");
    simulate(s.world, s.entities, 1);
    expect(s.jumps.map((j) => (j.wallJump ? "wall" : j.airJump ? "air" : "ground"))).toEqual(["wall", "air"]);
  });

  test("climbs a shaft by jumping between two walls", () => {
    const world = createWorld();
    const player = new Player(world, { x: 0, y: -3.5, wallJump: true });
    // Walls 4 m apart (faces at x = ±2), 30 m tall.
    const entities = [
      new Ground(world),
      new Platform(world, { x: -2.5, y: 10, width: 1, height: 30 }),
      new Platform(world, { x: 2.5, y: 10, width: 1, height: 30 }),
      player,
    ];
    simulate(world, entities, 10);
    keys.down("Space");
    keys.down("ArrowRight");
    simulate(world, entities, 2);
    keys.up("Space");

    // Each time the player slides on a wall: push towards it, then jump off.
    let wallJumps = 0;
    player.on("jump", ({ wallJump }) => wallJump && wallJumps++);
    player.on("wallSlideStart", ({ side }) => {
      keys.up(side === 1 ? "ArrowRight" : "ArrowLeft");
      keys.down(side === 1 ? "ArrowLeft" : "ArrowRight"); // next wall, once the lock ends
      keys.down("Space");
    });
    player.on("jump", () => keys.up("Space"));

    simulate(world, entities, 600);
    expect(wallJumps).toBeGreaterThan(5);
    expect(player.getPosition().y).toBeGreaterThan(6); // far above the 3 m a single jump reaches
  });
});
