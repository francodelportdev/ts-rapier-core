import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, Player, Sensor, Trigger, defineLayers, entityOf, type Entity } from "../src";
import { createGame, createWorld, keys, simulate, stepGame } from "./helpers";

beforeEach(() => keys.reset());

const box = (width: number, height: number) => ({ type: "box", width, height }) as const;

function record(sensor: Sensor) {
  const log: string[] = [];
  const name = (e: Entity) => e.constructor.name;
  sensor.on("enter", ({ entity }) => log.push(`enter ${name(entity)}`));
  sensor.on("exit", ({ entity }) => log.push(`exit ${name(entity)}`));
  return log;
}

describe("Sensor", () => {
  test("reports a falling box entering and resting inside, without stopping it", () => {
    const world = createWorld();
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: box(2, 1) });
    const log = record(sensor);
    const falling = new Box(world, 0, 3);
    simulate(world, [new Ground(world), sensor, falling], 150);
    expect(log).toEqual(["enter Box", "exit Box"]); // passed through and landed below
    expect(falling.getPosition().y).toBeCloseTo(-4, 1);
    expect(sensor.isOccupied()).toBe(false);
  });

  test("tracks several entities at once", () => {
    const world = createWorld();
    const sensor = new Sensor(world, { x: 0, y: -4, geometry: box(6, 2) });
    const a = new Box(world, -1, -4);
    const b = new Box(world, 1, -4);
    simulate(world, [new Ground(world), a, b, sensor], 5);
    expect(sensor.getInside()).toHaveLength(2);
    expect(sensor.getInside()).toContain(a);
  });

  test("works with a kinematic player and with circles", () => {
    const world = createWorld();
    const player = new Player(world, { x: -3 });
    const sensor = new Sensor(world, { x: 0, y: -3.5, geometry: { type: "circle", radius: 1 } });
    const log = record(sensor);
    keys.down("ArrowRight");
    simulate(world, [new Ground(world), player, sensor], 80);
    expect(log).toEqual(["enter Player", "exit Player"]);
  });

  test("ignores fixed entities unless detectFixed is on", () => {
    const world = createWorld();
    const ground = new Ground(world);
    const off = new Sensor(world, { x: 0, y: -5, geometry: box(2, 2) });
    const on = new Sensor(world, { x: 0, y: -5, geometry: box(2, 2), detectFixed: true });
    simulate(world, [ground, off, on], 3);
    expect(off.getInside()).toHaveLength(0);
    expect(on.getInside()).toEqual([ground]);
  });

  test("sensors don't detect each other", () => {
    const world = createWorld();
    const a = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2), detectFixed: true });
    const b = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2), detectFixed: true });
    simulate(world, [a, b], 3);
    expect(a.isOccupied()).toBe(false);
  });

  test("respects collision layers and the filter", () => {
    const layers = defineLayers(["a", "b", "sensor"]);
    const world = createWorld();
    const inA = new Box(world, 0, 0, layers.filter("a", ["sensor"]));
    const inB = new Box(world, 0.2, 0, layers.filter("b", ["sensor"]));
    const byLayer = new Sensor(world, { x: 0, y: 0, geometry: box(3, 3), collision: layers.filter("sensor", ["a"]) });
    const byFilter = new Sensor(world, { x: 0, y: 0, geometry: box(3, 3), filter: (e) => e === inB });
    simulate(world, [inA, inB, byLayer, byFilter], 3);
    expect(byLayer.getInside()).toEqual([inA]);
    expect(byFilter.getInside()).toEqual([inB]);
  });

  test("follow keeps it on an entity with an offset, and skips that entity", () => {
    const world = createWorld();
    const player = new Player(world);
    const radar = new Sensor(world, { x: 0, y: 0, follow: player, offset: { x: 2, y: 0 }, geometry: { type: "circle", radius: 1 } });
    const entities = [new Ground(world), player, radar];
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    expect(radar.getPosition().x).toBeCloseTo(player.getPosition().x + 2, 0);
  });

  test("doesn't detect the entity it follows", () => {
    const world = createWorld();
    const player = new Player(world);
    const radar = new Sensor(world, { x: 0, y: 0, follow: player, geometry: { type: "circle", radius: 3 } });
    simulate(world, [new Ground(world), player, radar], 5);
    expect(radar.getInside()).toHaveLength(0);
  });

  test("once detects a single enter", () => {
    const world = createWorld();
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2), once: true });
    const log = record(sensor);
    const a = new Box(world, 0, 0);
    simulate(world, [a, sensor], 3);
    expect(log).toEqual(["enter Box", "exit Box"]); // turned off, so what was inside leaves
    simulate(world, [a, sensor], 3);
    expect(log).toHaveLength(2);
  });

  test("setEnabled(false) empties it, and true detects again", () => {
    const world = createWorld();
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2) });
    world.gravity.y = 0;
    const log = record(sensor);
    const a = new Box(world, 0, 0);
    simulate(world, [a, sensor], 2);
    sensor.setEnabled(false);
    simulate(world, [a, sensor], 2);
    sensor.setEnabled(true);
    simulate(world, [a, sensor], 2);
    expect(log).toEqual(["enter Box", "exit Box", "enter Box"]);
  });

  test("a destroyed entity gets an exit", async () => {
    const game = await createGame();
    const world = game.getWorld();
    world.gravity.y = 0;
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2) });
    const log = record(sensor);
    const a = new Box(world, 0, 0);
    game.addEntity(sensor);
    game.addEntity(a);
    game.start();
    stepGame(game, 3);
    game.removeEntity(a);
    stepGame(game, 3);
    expect(log).toEqual(["enter Box", "exit Box"]);
  });

  test("a listener can remove the entity that entered", async () => {
    const game = await createGame();
    const world = game.getWorld();
    world.gravity.y = 0;
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: box(2, 2) });
    sensor.on("enter", ({ entity }) => game.removeEntity(entity));
    game.addEntity(sensor);
    game.addEntity(new Box(world, 0, 0));
    game.start();
    expect(() => stepGame(game, 5)).not.toThrow();
    expect(game.getEntities()).toEqual([sensor]);
  });

  test("a polyline can't be a sensor", () => {
    const world = createWorld();
    expect(() => new Sensor(world, { x: 0, y: 0, geometry: { type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } })).toThrow(/polyline/);
  });
});

test("entityOf finds an entity from its collider, until it's destroyed", () => {
  const world = createWorld();
  const a = new Box(world);
  const collider = a["body"].collider(0);
  expect(entityOf(world, collider)).toBe(a);
  a.destroy();
  expect(entityOf(world, collider)).toBeUndefined();
});

describe("Trigger", () => {
  test("only reacts to its target", () => {
    const world = createWorld();
    const target = new Box(world, 0, 0);
    const other = new Box(world, 0.3, 0);
    const trigger = new Trigger(world, { x: 0, y: 0, width: 3, height: 3, target });
    simulate(world, [target, other, trigger], 3);
    expect(trigger.getInside()).toEqual([target]);
  });

  test("round uses a circle", () => {
    const world = createWorld();
    const corner = new Box(world, 2.2, 2.2);
    const round = new Trigger(world, { x: 0, y: 0, width: 4, height: 4, target: corner, round: true });
    const square = new Trigger(world, { x: 0, y: 0, width: 4, height: 4, target: corner });
    simulate(world, [corner, round, square], 2);
    expect(round.isOccupied()).toBe(false);
    expect(square.isOccupied()).toBe(true);
  });
});
