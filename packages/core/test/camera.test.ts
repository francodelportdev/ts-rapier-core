import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Platform } from "../src";
import { createGame, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

/** A game with a long floor and a box to follow. The canvas is 800×450 (26.7 × 15 m at zoom 1). */
async function setup() {
  const game = await createGame();
  const world = game.getWorld();
  game.addEntity(new Platform(world, { x: 0, y: -5, width: 400 }));
  const target = new Box(world, 0, -4);
  game.addEntity(target);
  const camera = game.camera;
  const teleport = (x: number, y = -4) => target["body"].setTranslation({ x, y }, true);
  return { game, camera, target, teleport };
}

describe("Camera", () => {
  test("without follow(), it stays at the origin", async () => {
    const { game, camera } = await setup();
    game.start();
    stepGame(game, 30);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.getViewport()).toEqual({ scale: 30, centerX: 400, centerY: 225 });
    game.stop();
  });

  test("follow() eases towards the target and stops at the dead-zone edge", async () => {
    const { game, camera, target, teleport } = await setup();
    camera.follow(target, { smoothing: 0.15, deadZone: { width: 2, height: 1.5 } });
    game.start();
    teleport(10);
    stepGame(game, 5);
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.x).toBeLessThan(8); // eased, not instant
    stepGame(game, 120);
    expect(camera.x).toBeCloseTo(9, 2); // target 10 − half dead zone 1
    game.stop();
  });

  test("smoothing 0 follows instantly", async () => {
    const { game, camera, target, teleport } = await setup();
    camera.follow(target, { smoothing: 0, deadZone: { width: 0, height: 0 } });
    game.start();
    teleport(7);
    stepGame(game, 1);
    expect(camera.x).toBeCloseTo(7, 3);
    game.stop();
  });

  test("inside the dead zone, the camera doesn't move", async () => {
    const { game, camera, target, teleport } = await setup();
    camera.follow(target, { deadZone: { width: 4, height: 4 } });
    game.start(); // snaps to the target
    const startX = camera.x;
    teleport(1.5);
    stepGame(game, 60);
    expect(camera.x).toBe(startX);
    game.stop();
  });

  test("start() snaps to the target, including the offset", async () => {
    const { game, camera, target } = await setup();
    camera.follow(target, { offset: { x: 1, y: 2 } });
    game.start();
    expect(camera.x).toBeCloseTo(1, 3);
    expect(camera.y).toBeCloseTo(-2, 1); // box at y ≈ -4, plus 2
    game.stop();
  });

  test("setBounds() keeps the view inside the level", async () => {
    const { game, camera, target, teleport } = await setup();
    camera.follow(target, { smoothing: 0 });
    camera.setBounds({ minX: 0, maxX: 100, minY: -10, maxY: 10 });
    game.start();
    teleport(-50);
    stepGame(game, 5);
    expect(camera.x).toBeCloseTo(800 / 2 / 30, 3); // left edge of the view at minX
    teleport(500);
    stepGame(game, 5);
    expect(camera.x).toBeCloseTo(100 - 800 / 2 / 30, 3);
    game.stop();
  });

  test("a level smaller than the view is centered", async () => {
    const { game, camera } = await setup();
    camera.setBounds({ minX: 0, maxX: 10, minY: -2, maxY: 2 });
    game.start();
    expect(camera.x).toBeCloseTo(5, 5);
    expect(camera.y).toBeCloseTo(0, 5);
    game.stop();
  });

  test("zoom scales the view, and screen ↔ world conversions round-trip", async () => {
    const { game, camera } = await setup();
    game.start();
    camera.zoom = 2;
    camera.moveTo(3, 1);
    expect(camera.scale).toBe(60);
    expect(camera.worldToScreen(3, 1)).toEqual({ px: 400, py: 225 }); // camera point at the center
    const { px, py } = camera.worldToScreen(4.5, -2);
    const back = camera.screenToWorld(px, py);
    expect(back.x).toBeCloseTo(4.5, 9);
    expect(back.y).toBeCloseTo(-2, 9);
    const view = camera.getVisibleBounds();
    expect(view.maxX - view.minX).toBeCloseTo(800 / 60, 9);
    game.stop();
  });

  test("shake() offsets the view and fades out", async () => {
    const { game, camera } = await setup();
    game.start();
    camera.shake(0.5, 0.2);
    let maxOffset = 0;
    for (let i = 0; i < 12; i++) {
      stepGame(game);
      const v = camera.getViewport();
      maxOffset = Math.max(maxOffset, Math.abs(v.centerX - 400), Math.abs(v.centerY - 225));
    }
    expect(maxOffset).toBeGreaterThan(0);
    expect(maxOffset).toBeLessThanOrEqual(0.5 * 30);
    stepGame(game);
    expect(camera.getViewport()).toEqual({ scale: 30, centerX: 400, centerY: 225 });
    game.stop();
  });

  test("a removed target stops the follow without errors", async () => {
    const { game, camera, target } = await setup();
    camera.follow(target);
    game.start();
    const x = camera.x;
    game.removeEntity(target);
    expect(() => stepGame(game, 10)).not.toThrow();
    expect(camera.x).toBeCloseTo(x, 5);
    game.stop();
  });
});
