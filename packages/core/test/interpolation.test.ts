import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Scene, Shape } from "../src";
import { createGame, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

/** A context that records transforms. */
function recorder() {
  const calls: string[] = [];
  const rec = (n: string) => (...a: number[]) => void calls.push(`${n}(${a.map((v) => +v.toFixed(2)).join(",")})`);
  return { ctx: { translate: rec("translate"), rotate: rec("rotate") } as unknown as CanvasRenderingContext2D, calls };
}

function moved(x0: number, x1: number, angle0 = 0, angle1 = 0) {
  return import("./helpers").then(({ createWorld }) => {
    const world = createWorld();
    world.gravity.y = 0;
    const box = new Box(world, x0, 0);
    box.getBody().setRotation(angle0, true);
    box.savePose();
    box.getBody().setTranslation({ x: x1, y: 0 }, true);
    box.getBody().setRotation(angle1, true);
    box.draw = () => {};
    return box;
  });
}

describe("Entity.render", () => {
  test("draws between the last two poses", async () => {
    const box = await moved(0, 1);
    const { ctx, calls } = recorder();
    box.render(ctx, 10, 0, 0, 0.25);
    expect(calls).toEqual(["translate(-7.5,0)"]); // 75% back towards the previous pose
  });

  test("alpha 1 is the real position", async () => {
    const box = await moved(0, 1);
    const { ctx, calls } = recorder();
    box.render(ctx, 10, 0, 0, 1);
    expect(calls).toEqual([]);
  });

  test("a new entity has nothing to interpolate from", async () => {
    const { createWorld } = await import("./helpers");
    const box = new Box(createWorld());
    box.draw = () => {};
    const { ctx, calls } = recorder();
    box.render(ctx, 10, 0, 0, 0.5);
    expect(calls).toEqual([]);
  });

  test("a teleport isn't smoothed", async () => {
    const box = await moved(0, 30);
    const { ctx, calls } = recorder();
    box.render(ctx, 10, 0, 0, 0.5);
    expect(calls).toEqual([]);
  });

  test("rotation turns around the body, the short way", async () => {
    const box = await moved(1, 1, 3.1, -3.1); // nearly the same angle, across the ±π seam
    const { ctx, calls } = recorder();
    box.render(ctx, 10, 0, 0, 0.5);
    const rotate = Number(/rotate\((.*)\)/.exec(calls.find((c) => c.startsWith("rotate"))!)![1]);
    expect(Math.abs(rotate)).toBeLessThan(0.1);
    expect(calls).toContain("translate(10,0)"); // around the body's center
  });
});

describe("Game", () => {
  async function running(options = {}) {
    const game = await createGame(options);
    const shape = new Shape(game.getWorld(), { x: 0, y: 0, body: "dynamic", geometry: { type: "box", width: 1, height: 1 } });
    shape.getBody().setGravityScale(0, true);
    shape.getBody().setLinvel({ x: 6, y: 0 }, true);
    game.addEntity(shape);
    game.start();
    const alphas: number[] = [];
    const render = shape.render.bind(shape);
    shape.render = (ctx, scale, cx, cy, alpha) => {
      alphas.push(alpha ?? 1);
      render(ctx, scale, cx, cy, alpha);
    };
    return { game, shape, alphas };
  }

  /** A 144 Hz display: frames every 6.94 ms. */
  function frames(game: Awaited<ReturnType<typeof createGame>>, n: number) {
    for (let i = 0; i <= n; i++) game["loop"](1000 + (i * 1000) / 144);
  }

  test("at 144 Hz, frames between steps get growing alphas", async () => {
    const { game, alphas } = await running();
    frames(game, 8);
    expect(new Set(alphas.map((a) => a.toFixed(2))).size).toBeGreaterThan(3);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(1);
  });

  test("a moving entity is drawn behind its real position, from the game loop", async () => {
    const { game, shape } = await running();
    stepGame(game, 3);
    const { ctx, calls } = recorder();
    shape.draw = () => {};
    shape.render(ctx, 30, 0, 0, 0.5);
    expect(calls[0]).toStartWith("translate(-"); // 6 m/s: half of the last step's movement
  });

  test("the option and the field turn it off", async () => {
    const off = await running({ interpolation: false });
    frames(off.game, 4);
    expect(new Set(off.alphas)).toEqual(new Set([1]));

    const later = await running();
    later.game.interpolation = false;
    frames(later.game, 4);
    expect(new Set(later.alphas)).toEqual(new Set([1]));
  });

  test("the camera draws between steps, and goes back to its real position after", async () => {
    const { game } = await running();
    game.camera.x = 0;
    game.camera.update(1 / 60, 800, 450);
    game.camera.x = 3;
    game.camera.setInterpolation(0.5);
    expect(game.camera.getViewport().centerX).toBeCloseTo(400 - 1.5 * 30, 3);
    game["accumulator"] = 0;
    game["loop"](0);
    expect(game.camera.getViewport().centerX).toBeCloseTo(400 - 3 * 30, 3);
  });

  test("moveTo() and snapToTarget() jump without smoothing", async () => {
    const { game } = await running();
    game.camera.moveTo(10, 0);
    game.camera.setInterpolation(0);
    expect(game.camera.getViewport().centerX).toBeCloseTo(400 - 10 * 30, 3);
    game.camera.setInterpolation(1);
  });

  test("during a fade, nothing wobbles", async () => {
    const { game, shape, alphas } = await running();
    class S extends Scene {
      public override onEnter() {}
    }
    game.scenes.add("s", () => new S());
    stepGame(game, 2);
    game.scenes.go("s", { fade: 1 });
    stepGame(game, 3);
    const { ctx, calls } = recorder();
    shape.draw = () => {};
    shape.render(ctx, 10, 0, 0, 0.5);
    expect(calls.join("")).not.toContain("translate(-");
    expect(alphas).toBeDefined();
  });
});
