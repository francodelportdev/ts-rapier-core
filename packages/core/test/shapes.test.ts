import { beforeEach, describe, expect, test } from "bun:test";
import RAPIER from "@dimforge/rapier2d-compat";
import { Ground, Player, Shape, type Geometry, type PlayerOptions } from "../src";
import { createWorld, keys, simulate, simulateUntil } from "./helpers";

beforeEach(() => keys.reset());

describe("Shape: geometry", () => {
  const cases: [string, Geometry, RAPIER.ShapeType][] = [
    ["box", { type: "box", width: 2, height: 1 }, RAPIER.ShapeType.Cuboid],
    ["circle", { type: "circle", radius: 0.5 }, RAPIER.ShapeType.Ball],
    ["capsule", { type: "capsule", radius: 0.3, height: 1 }, RAPIER.ShapeType.Capsule],
    ["ramp", { type: "ramp", width: 4, height: 2 }, RAPIER.ShapeType.ConvexPolygon],
    ["polygon", { type: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] }, RAPIER.ShapeType.ConvexPolygon],
    ["polyline", { type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }] }, RAPIER.ShapeType.Polyline],
  ];

  for (const [name, geometry, shapeType] of cases) {
    test(`${name} creates a ${RAPIER.ShapeType[shapeType]} collider`, () => {
      const world = createWorld();
      const shape = new Shape(world, { x: 0, y: 0, geometry });
      expect(world.colliders.len()).toBe(1);
      expect(shape["body"].collider(0).shape.type).toBe(shapeType);
    });
  }

  test("a ramp rises on the chosen side", () => {
    const world = createWorld();
    const right = new Shape(world, { x: 0, y: 0, geometry: { type: "ramp", width: 4, height: 2 } });
    const left = new Shape(world, { x: 10, y: 0, geometry: { type: "ramp", width: 4, height: 2, rises: "left" } });
    world.step(); // ray casts need the query pipeline, which is updated by a step
    // Ray straight down onto each ramp, 1.5 m right of its center: high on the right ramp, low on the left one.
    const heightAt = (x: number, exclude: Shape) => {
      const hit = world.castRay(new RAPIER.Ray({ x, y: 10 }, { x: 0, y: -1 }), 20, true, undefined, undefined, exclude["body"].collider(0));
      return hit === null ? NaN : 10 - hit.timeOfImpact;
    };
    expect(heightAt(1.5, left)).toBeCloseTo(1.75, 2); // right ramp: 2 · (1.5 + 2) / 4
    expect(heightAt(11.5, right)).toBeCloseTo(0.25, 2); // left ramp: 2 · (2 − 1.5) / 4
  });

  test("polygons with fewer than 3 points, or all on one line, throw", () => {
    const world = createWorld();
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(() => new Shape(world, { x: 0, y: 0, geometry: { type: "polygon", points: line.slice(0, 2) } })).toThrow();
    expect(() => new Shape(world, { x: 0, y: 0, geometry: { type: "polygon", points: line } })).toThrow();
  });

  test("a dynamic polyline throws", () => {
    const world = createWorld();
    const geometry: Geometry = { type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    expect(() => new Shape(world, { x: 0, y: 0, body: "dynamic", geometry })).toThrow(/polygon instead/);
  });

  test("angle rotates the body", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 0, angle: Math.PI / 4, geometry: { type: "box", width: 1, height: 1 } });
    expect(shape.getAngle()).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe("Shape: body types", () => {
  const ball: Geometry = { type: "circle", radius: 0.5 };

  test("fixed (the default) doesn't move", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 5, geometry: ball });
    simulate(world, [shape], 60);
    expect(shape.getPosition().y).toBe(5);
  });

  test("dynamic falls and lands on the ground", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 5, body: "dynamic", geometry: ball });
    simulate(world, [new Ground(world), shape], 180);
    expect(shape.getPosition().y).toBeCloseTo(-4, 1); // ground top -4.5 + radius
  });

  test("kinematic ignores gravity", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 5, body: "kinematic", geometry: ball });
    simulate(world, [shape], 60);
    expect(shape.getPosition().y).toBe(5);
  });

  test("restitution makes it bounce", () => {
    const drop = (restitution: number) => {
      const world = createWorld();
      const shape = new Shape(world, { x: 0, y: 3, body: "dynamic", restitution, geometry: ball });
      const entities = [new Ground(world), shape];
      simulateUntil(world, entities, () => shape.getPosition().y < -3.9, 300); // touches the ground
      let top = -Infinity;
      simulate(world, entities, 90, () => (top = Math.max(top, shape.getPosition().y)));
      return top;
    };
    expect(drop(0)).toBeLessThan(-3.9);
    expect(drop(0.8)).toBeGreaterThan(-1); // bounces back most of the way (from 3 m)
  });

  test("a ball rolls down a ramp, a box with high friction stays", () => {
    const world = createWorld();
    const ramp = new Shape(world, { x: 0, y: -4.5, geometry: { type: "ramp", width: 8, height: 2, rises: "left" } }); // ~14°
    const rolling = new Shape(world, { x: -2, y: -2.5, body: "dynamic", geometry: ball });
    simulate(world, [new Ground(world), ramp, rolling], 120);
    expect(rolling.getPosition().x).toBeGreaterThan(0.5); // rolled more than 2.5 m down

    const world2 = createWorld();
    const ramp2 = new Shape(world2, { x: 0, y: -4.5, geometry: { type: "ramp", width: 8, height: 2, rises: "left" } });
    const box2 = new Shape(world2, { x: -2, y: -2.6, body: "dynamic", friction: 1, geometry: { type: "box", width: 0.8, height: 0.8 } });
    simulate(world2, [new Ground(world2), ramp2, box2], 120);
    expect(box2.getPosition().x).toBeLessThan(-1.5);
  });

  test("applyImpulse and applyTorqueImpulse move and spin a dynamic shape", () => {
    const world = createWorld();
    const shape = new Shape(world, { x: 0, y: 0, body: "dynamic", geometry: { type: "box", width: 1, height: 1 } });
    shape.applyImpulse(5, 0);
    shape.applyTorqueImpulse(1);
    simulate(world, [shape], 10);
    expect(shape.getPosition().x).toBeGreaterThan(0.5);
    expect(shape.getAngle()).not.toBe(0);
  });
});

describe("Player on slopes", () => {
  /** A ramp rising to the right from x = 2, with the player standing left of it. */
  function setup(degrees: number, options: PlayerOptions = {}) {
    const world = createWorld();
    const width = 6;
    const height = width * Math.tan((degrees * Math.PI) / 180);
    const ramp = new Shape(world, { x: 2 + width / 2, y: -4.5, geometry: { type: "ramp", width, height } });
    const player = new Player(world, { x: 0, ...options });
    const entities = [new Ground(world), ramp, player];
    simulate(world, entities, 10);
    return { world, player, entities, height };
  }

  test("walks up a 30° slope", () => {
    const { world, player, entities } = setup(30);
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(player.getPosition().y).toBeGreaterThan(-2); // climbed well above the ground (-3.5)
    expect(player.isGrounded()).toBe(true);
  });

  test("can't walk up a slope steeper than maxSlope", () => {
    const { world, player, entities } = setup(60);
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(player.getPosition().y).toBeLessThan(-3.2);
  });

  test("maxSlope is configurable", () => {
    const { world, player, entities } = setup(30, { maxSlope: 20 });
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(player.getPosition().y).toBeLessThan(-3.2);
  });

  test("stands still on a 45° slope without sliding down", () => {
    const { world, player, entities } = setup(45);
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    keys.up("ArrowRight");
    simulate(world, entities, 30); // decelerate
    const { x, y } = player.getPosition();
    simulate(world, entities, 120);
    expect(player.getPosition().x).toBeCloseTo(x, 1);
    expect(player.getPosition().y).toBeCloseTo(y, 1);
    expect(player.getState()).toBe("idle");
  });

  test("a walkable slope isn't a wall: no wall slide while jumping onto it", () => {
    const { world, player, entities } = setup(30, { wallJump: true });
    keys.down("ArrowRight");
    keys.down("Space");
    let slid = false;
    simulate(world, entities, 90, () => (slid ||= player.isWallSliding()));
    expect(slid).toBe(false);
  });

  test("a surface steeper than maxSlope counts as a wall for wall sliding", () => {
    const world = createWorld();
    // A 75° slab rising to the right: its face starts at x = 2.
    const steep = new Shape(world, { x: 2, y: -4.5, geometry: { type: "polygon", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 14 }, { x: 3.75, y: 14 }] } });
    const player = new Player(world, { x: 0, y: 3, wallJump: true });
    const entities = [new Ground(world), steep, player];
    keys.down("ArrowRight");
    let slid = false;
    simulate(world, entities, 90, () => (slid ||= player.isWallSliding()));
    expect(slid).toBe(true);
  });

  test("can't stand on (or jump up) a surface steeper than maxSlope", () => {
    const world = createWorld();
    const steep = new Shape(world, { x: 2, y: -4.5, geometry: { type: "polygon", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 14 }, { x: 3.75, y: 14 }] } });
    const player = new Player(world, { x: 0, y: 3 });
    const entities = [new Ground(world), steep, player];
    keys.down("ArrowRight");
    let groundedHigh = false;
    simulate(world, entities, 120, (i) => {
      if (i % 10 === 0) keys.down("Space");
      if (i % 10 === 5) keys.up("Space");
      groundedHigh ||= player.isGrounded() && player.getPosition().y > -3;
    });
    expect(groundedHigh).toBe(false); // it only ever stands on the flat ground
  });

  test("walks down a slope staying on the ground", () => {
    const world = createWorld();
    const ramp = new Shape(world, { x: 0, y: -4.5, geometry: { type: "ramp", width: 8, height: 3, rises: "left" } });
    const player = new Player(world, { x: -3, y: -1 });
    const entities = [new Ground(world), ramp, player];
    simulate(world, entities, 30);
    keys.down("ArrowRight");
    let airborne = 0;
    simulate(world, entities, 40, () => (airborne += player.isGrounded() ? 0 : 1));
    expect(airborne).toBeLessThan(3); // snap-to-ground keeps it on the slope
    expect(player.getPosition().x).toBeGreaterThan(1);
  });
});
