import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCanvas, createGame, firePointer, keys } from "./helpers";
import { Game, Input } from "../src";

const screen = globalThis as { devicePixelRatio?: number };

beforeEach(() => keys.reset());
afterEach(() => void delete screen.devicePixelRatio);

describe("Pixel ratio", () => {
  test("renders at the screen's ratio, keeping the logical size", async () => {
    screen.devicePixelRatio = 2;
    const game = await createGame();
    const canvas = game["canvas"];
    expect([canvas.width, canvas.height]).toEqual([1600, 900]);
    expect([game.width, game.height]).toEqual([800, 450]);
  });

  test("a ratio of 1 changes nothing", async () => {
    const game = await createGame();
    expect(game["canvas"].width).toBe(800);
  });

  test("maxPixelRatio limits it, by default to 2", async () => {
    screen.devicePixelRatio = 3;
    expect((await createGame())["canvas"].width).toBe(1600);
    expect((await createGame({ maxPixelRatio: 1 }))["canvas"].width).toBe(800);
  });

  test("maxPixelRatio can change while running", async () => {
    screen.devicePixelRatio = 2;
    const game = await createGame();
    game.start();
    game.maxPixelRatio = 1;
    game["loop"](0);
    expect(game["canvas"].width).toBe(800);
  });

  test("each frame draws with the ratio as the transform", async () => {
    screen.devicePixelRatio = 2;
    const game = await createGame();
    const calls: number[][] = [];
    game["ctx"].setTransform = ((...a: number[]) => void calls.push(a)) as never;
    game.start();
    game["loop"](0);
    expect(calls[0]).toEqual([2, 0, 0, 2, 0, 0]);
  });

  test("moving to another screen updates the canvas", async () => {
    const game = await createGame();
    game.start();
    screen.devicePixelRatio = 2;
    game["loop"](0);
    expect(game["canvas"].width).toBe(1600);
    expect(game.width).toBe(800);
  });

  test("the camera works in the logical size", async () => {
    screen.devicePixelRatio = 2;
    const game = await createGame();
    game.start();
    expect(game.camera.getViewport()).toEqual({ scale: 30, centerX: 400, centerY: 225 });
    expect(game.camera.screenToWorld(400, 225)).toEqual({ x: 0, y: 0 });
  });

  test("the pointer and buttons stay in logical pixels", async () => {
    screen.devicePixelRatio = 2;
    const game = await createGame();
    game.start();
    game.touch.enabled = true;
    game.touch.alwaysVisible = true;
    const canvas = game["canvas"];
    firePointer(canvas, "pointerdown", 758, 408, 1, "touch");
    expect(game.pointer.x).toBe(758);
    expect(Input.getInstance().isAction("jump")).toBe(true);
  });

  test("a canvas without CSS sizing keeps its size on screen", async () => {
    screen.devicePixelRatio = 2;
    const g = globalThis as { getComputedStyle?: unknown };
    g.getComputedStyle = () => ({ width: "800px" });
    try {
      const canvas = createCanvas();
      await Game.create(canvas).then((game) => game.destroy());
      expect(canvas.style.width).toBe("800px");
      expect(canvas.style.height).toBe("450px");
    } finally {
      delete g.getComputedStyle;
    }
  });

  test("a canvas sized by CSS stays responsive", async () => {
    const g = globalThis as { getComputedStyle?: unknown };
    g.getComputedStyle = () => ({ width: "360px" });
    try {
      const canvas = createCanvas();
      await Game.create(canvas).then((game) => game.destroy());
      expect(canvas.style.width).toBeUndefined();
    } finally {
      delete g.getComputedStyle;
    }
  });
});

test("resize() changes the view and the canvas", async () => {
  screen.devicePixelRatio = 2;
  const game = await createGame();
  game.resize(400, 300);
  expect([game.width, game.height]).toEqual([400, 300]);
  expect(game["canvas"].width).toBe(800);
  expect(game.camera.getViewport()).toMatchObject({ centerX: 200, centerY: 150 });
});
