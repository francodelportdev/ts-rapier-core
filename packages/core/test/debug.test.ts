import { beforeEach, describe, expect, test } from "bun:test";
import { Box, DEBUG_COLORS, DebugRenderer, Ground, Player, Sensor, Shape, type Geometry } from "../src";
import { createGame, createWorld, keys, simulate, stepGame } from "./helpers";

beforeEach(() => keys.reset());

/** A canvas context that records each stroke with its color, dash and path. */
function recorder() {
  const strokes: { color: string; dashed: boolean; path: string[] }[] = [];
  let path: string[] = [];
  let dash: number[] = [];
  let transform: string[] = [];
  const remember = (name: string) => (...a: number[]) => void transform.push(`${name}(${a.map((n) => +n.toFixed(2)).join(",")})`);
  const record = (name: string) => (...a: number[]) => void path.push(`${name}(${a.map((n) => +n.toFixed(2)).join(",")})`);
  const ctx = {
    lineWidth: 1, strokeStyle: "", save() {}, restore: () => void (transform = []), translate: remember("translate"), rotate: remember("rotate"),
    moveTo: record("moveTo"), lineTo: record("lineTo"), arc: record("arc"), rect: record("rect"), closePath: record("closePath"),
    setLineDash: (d: number[]) => void (dash = d),
    beginPath: () => void (path = []),
    stroke() {
      strokes.push({ color: ctx.strokeStyle, dashed: dash.length > 0, path: [...transform, ...path] });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

function render(debug: DebugRenderer) {
  const { ctx, strokes } = recorder();
  debug.enabled = true;
  debug.draw(ctx, 10, 0, 0);
  return strokes;
}

function outline(geometry: Geometry) {
  const world = createWorld();
  new Shape(world, { x: 5, y: 2, geometry });
  const debug = new DebugRenderer(world);
  debug.centers = false;
  return render(debug)[0]!.path.join(" ");
}

describe("DebugRenderer: shapes", () => {
  test("is off by default and draws nothing", () => {
    const world = createWorld();
    new Box(world);
    const { ctx, strokes } = recorder();
    new DebugRenderer(world).draw(ctx, 10, 0, 0);
    expect(strokes).toHaveLength(0);
  });

  test("box, circle and capsule", () => {
    expect(outline({ type: "box", width: 2, height: 4 })).toContain("rect(-10,-20,20,40)");
    expect(outline({ type: "circle", radius: 1 })).toContain("arc(0,0,10,0,6.28)");
    expect(outline({ type: "capsule", radius: 1, height: 2 })).toContain("arc(0,-10,10,");
  });

  test("polygons close; polylines stay open; points are relative to the body, with Y flipped", () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }];
    const polygon = outline({ type: "polygon", points });
    expect(polygon).toContain("lineTo(20,0)");
    expect(polygon).toContain("lineTo(0,-10)");
    expect(polygon).toContain("closePath()");
    expect(outline({ type: "polyline", points })).not.toContain("closePath");
  });

  test("moves to the collider's position, in canvas coordinates", () => {
    expect(outline({ type: "circle", radius: 1 })).toContain("translate(50,-20)");
  });

  test("follows the collider's rotation, flipped for the canvas", () => {
    const world = createWorld();
    new Shape(world, { x: 0, y: 0, angle: 0.5, geometry: { type: "box", width: 1, height: 1 } });
    const debug = new DebugRenderer(world);
    debug.centers = false;
    expect(render(debug)[0]!.path).toContain("rotate(-0.5)");
  });

  test("shows a sensor's current radius after setRadius()", () => {
    const world = createWorld();
    const sensor = new Sensor(world, { x: 0, y: 0, geometry: { type: "circle", radius: 1 } });
    sensor.setRadius(3);
    const debug = new DebugRenderer(world);
    debug.centers = false;
    expect(render(debug)[0]!.path.join(" ")).toContain("arc(0,0,30,");
  });
});

describe("DebugRenderer: colors and layers of information", () => {
  test("colors colliders by body type, and sensors dashed", () => {
    const world = createWorld();
    new Ground(world);
    new Box(world, 0, 5);
    new Player(world);
    new Sensor(world, { x: 9, y: 9, geometry: { type: "circle", radius: 1 } });
    const debug = new DebugRenderer(world);
    debug.centers = false;
    debug.velocities = false;
    const strokes = render(debug);
    expect(strokes.map((s) => s.color)).toEqual([DEBUG_COLORS.fixed, DEBUG_COLORS.dynamic, DEBUG_COLORS.kinematic, DEBUG_COLORS.sensor]);
    expect(strokes.map((s) => s.dashed)).toEqual([false, false, false, true]);
  });

  test("a sleeping body changes color", () => {
    const world = createWorld();
    const ground = new Ground(world);
    const box = new Box(world, 0, -4);
    simulate(world, [ground, box], 400);
    const debug = new DebugRenderer(world);
    debug.centers = false;
    expect(render(debug).map((s) => s.color)).toContain(DEBUG_COLORS.sleeping);
  });

  test("centers and velocities can be switched off", () => {
    const world = createWorld();
    const box = new Box(world, 0, 5);
    simulate(world, [box], 20);
    const debug = new DebugRenderer(world);
    debug.colliders = false;
    expect(render(debug)).toHaveLength(2); // a cross and an arrow
    debug.velocities = false;
    expect(render(debug)).toHaveLength(1);
    debug.centers = false;
    expect(render(debug)).toHaveLength(0);
  });

  test("the velocity arrow points the way the body moves on screen", () => {
    const world = createWorld();
    const box = new Box(world, 0, 0);
    simulate(world, [box], 30); // falling
    const debug = new DebugRenderer(world);
    debug.colliders = false;
    debug.centers = false;
    const end = render(debug)[0]!.path.at(-1);
    const y = Number(/lineTo\(.*,(.*)\)/.exec(end!)![1]);
    const py = -box.getPosition().y * 10;
    expect(y).toBeGreaterThan(py); // down on the canvas
  });

  test("a body at rest has no arrow", () => {
    const world = createWorld();
    const box = new Box(world);
    world.gravity.y = 0;
    const debug = new DebugRenderer(world);
    debug.colliders = false;
    debug.centers = false;
    expect(box.isDestroyed).toBe(false);
    expect(render(debug)).toHaveLength(0);
  });
});

describe("DebugRenderer: stats and Game", () => {
  test("counts bodies, colliders, sensors and sleepers", () => {
    const world = createWorld();
    const ground = new Ground(world);
    const box = new Box(world, 0, -4);
    new Sensor(world, { x: 9, y: 9, geometry: { type: "circle", radius: 1 } });
    simulate(world, [ground, box], 400);
    expect(new DebugRenderer(world).getStats()).toEqual({ bodies: 3, colliders: 3, sensors: 1, sleeping: 1 });
  });

  test("toggle() flips it", () => {
    const debug = new DebugRenderer(createWorld());
    expect(debug.toggle()).toBe(true);
    expect(debug.toggle()).toBe(false);
  });

  test("Game draws it last, using the camera", async () => {
    const game = await createGame();
    game.addEntity(new Box(game.getWorld(), 0, 0));
    const calls: unknown[][] = [];
    const original = game.debug.draw.bind(game.debug);
    game.debug.draw = (...args) => {
      calls.push(args.slice(1));
      original(...args);
    };
    game.camera.zoom = 2;
    game.getEntities()[0]!.render = () => {};
    game.start();
    stepGame(game);
    game["loop"](0);
    expect(calls[0]).toEqual([60, 400, 225]);
  });
});
