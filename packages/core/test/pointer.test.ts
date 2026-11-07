import { beforeEach, describe, expect, test } from "bun:test";
import { Ground, Input, Player } from "../src";
import { createGame, firePointer, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

async function setup() {
  const game = await createGame();
  game.start();
  const canvas = game["canvas"];
  return { game, canvas };
}

describe("Pointer", () => {
  test("reports positions in pixels and meters, following the camera", async () => {
    const { game, canvas } = await setup();
    firePointer(canvas, "pointerdown", 430, 195);
    expect(game.pointer.x).toBe(430);
    expect(game.pointer.world).toEqual({ x: 1, y: 1 });
    game.camera.moveTo(10, 0);
    expect(game.pointer.world.x).toBe(11);
  });

  test("accounts for CSS scaling and the canvas position", async () => {
    const { game, canvas } = await setup();
    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 225 }) as DOMRect;
    firePointer(canvas, "pointerdown", 300, 162.5);
    expect(game.pointer.x).toBe(400);
    expect(game.pointer.y).toBe(225);
  });

  test("isDown, and wasPressed and wasReleased for one step", async () => {
    const { game, canvas } = await setup();
    firePointer(canvas, "pointerdown", 0, 0);
    expect(game.pointer.isDown).toBe(true);
    expect(game.pointer.wasPressed()).toBe(true);
    stepGame(game);
    expect(game.pointer.wasPressed()).toBe(false);
    firePointer(canvas, "pointerup", 0, 0);
    expect(game.pointer.isDown).toBe(false);
    expect(game.pointer.wasReleased()).toBe(true);
    stepGame(game);
    expect(game.pointer.wasReleased()).toBe(false);
  });

  test("tracks several fingers", async () => {
    const { game, canvas } = await setup();
    firePointer(canvas, "pointerdown", 10, 10, 1, "touch");
    firePointer(canvas, "pointerdown", 20, 20, 2, "touch");
    expect(game.pointer.getActive().map((p) => p.id)).toEqual([1, 2]);
    firePointer(canvas, "pointermove", 30, 30, 2, "touch");
    expect(game.pointer.getActive()[1]!.x).toBe(30);
    firePointer(canvas, "pointerup", 10, 10, 1, "touch");
    expect(game.pointer.isDown).toBe(true);
    firePointer(canvas, "pointercancel", 30, 30, 2, "touch");
    expect(game.pointer.isDown).toBe(false);
  });

  test("emits down, move and up with the world position", async () => {
    const { game, canvas } = await setup();
    const log: string[] = [];
    game.pointer.on("down", (p) => log.push(`down ${p.worldX}`));
    game.pointer.on("move", (p) => log.push(`move ${p.type}`));
    game.pointer.on("up", () => log.push("up"));
    firePointer(canvas, "pointerdown", 430, 225);
    firePointer(canvas, "pointermove", 400, 225);
    firePointer(canvas, "pointerup", 400, 225);
    firePointer(canvas, "pointerup", 400, 225); // not down anymore: ignored
    expect(log).toEqual(["down 1", "move mouse", "up"]);
  });

  test("the canvas keeps touch gestures for the game, and destroy() stops listening", async () => {
    const { game, canvas } = await setup();
    expect(canvas.style.touchAction).toBe("none");
    game.stop();
    const pointer = game.pointer;
    game["listeners"].abort();
    firePointer(canvas, "pointerdown", 0, 0);
    expect(pointer.isDown).toBe(false);
  });
});

describe("TouchControls", () => {
  // Default buttons on an 800×450 canvas: ← at (42, 408), → at (116, 408), jump at (758, 408).
  async function touchGame() {
    const s = await setup();
    s.game.touch.enabled = true;
    s.game.touch.alwaysVisible = true;
    return s;
  }
  const input = () => Input.getInstance();

  test("is off by default", async () => {
    const { canvas } = await setup();
    firePointer(canvas, "pointerdown", 42, 408, 1, "touch");
    expect(input().isAction("left")).toBe(false);
  });

  test("appears on the first touch, not with a mouse", async () => {
    const { game, canvas } = await setup();
    game.touch.enabled = true;
    firePointer(canvas, "pointerdown", 42, 408, 1, "mouse");
    expect(game.touch.isVisible).toBe(false);
    firePointer(canvas, "pointerup", 42, 408, 1, "mouse");
    firePointer(canvas, "pointerdown", 42, 408, 2, "touch");
    expect(game.touch.isVisible).toBe(true);
    expect(input().isAction("left")).toBe(true);
  });

  test("holds the key while touched, and two fingers press two buttons", async () => {
    const { canvas } = await touchGame();
    firePointer(canvas, "pointerdown", 142, 408, 1, "touch");
    firePointer(canvas, "pointerdown", 758, 408, 2, "touch");
    expect(input().isAction("right")).toBe(true);
    expect(input().isAction("jump")).toBe(true);
    firePointer(canvas, "pointerup", 758, 408, 2, "touch");
    input().endStep();
    expect(input().isAction("jump")).toBe(false);
    expect(input().isAction("right")).toBe(true);
  });

  test("a finger can slide from one button to another", async () => {
    const { canvas } = await touchGame();
    firePointer(canvas, "pointerdown", 42, 408, 1, "touch");
    firePointer(canvas, "pointermove", 142, 408, 1, "touch");
    input().endStep();
    expect(input().isAction("left")).toBe(false);
    expect(input().isAction("right")).toBe(true);
  });

  test("touching elsewhere presses nothing", async () => {
    const { canvas } = await touchGame();
    firePointer(canvas, "pointerdown", 400, 100, 1, "touch");
    expect(input().isAction("left")).toBe(false);
  });

  test("setButtons() replaces them, with negative positions from the far edges", async () => {
    const { game, canvas } = await touchGame();
    game.touch.setButtons([{ press: "KeyX", label: "X", x: -100, y: 50, radius: 10 }]);
    firePointer(canvas, "pointerdown", 700, 50, 1, "touch");
    expect(input().isPressed("KeyX")).toBe(true);
  });

  test("addButton() keeps the others", async () => {
    const { game, canvas } = await touchGame();
    game.touch.addButton({ press: "KeyX", label: "X", x: -116, y: -42 });
    firePointer(canvas, "pointerdown", 684, 408, 1, "touch");
    firePointer(canvas, "pointerdown", 758, 408, 2, "touch");
    expect(input().isPressed("KeyX")).toBe(true);
    expect(input().isAction("jump")).toBe(true);
  });

  test("on a canvas shrunk by CSS, buttons keep their size on screen", async () => {
    const { canvas } = await touchGame();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 225 }) as DOMRect;
    // Half size: the jump button sits 42 px from the corner on screen, so at (358, 183).
    firePointer(canvas, "pointerdown", 358, 183, 1, "touch");
    expect(input().isAction("jump")).toBe(true);
    firePointer(canvas, "pointerup", 358, 183, 1, "touch");
    input().endStep();
    // 30 px on screen from its center: inside the 32 px radius.
    firePointer(canvas, "pointerdown", 328, 183, 2, "touch");
    expect(input().isAction("jump")).toBe(true);
  });

  test("the player moves and jumps with them", async () => {
    const { game, canvas } = await touchGame();
    const world = game.getWorld();
    const player = new Player(world);
    game.addEntity(new Ground(world));
    game.addEntity(player);
    stepGame(game, 10);
    let jumps = 0;
    player.on("jump", () => jumps++);
    firePointer(canvas, "pointerdown", 142, 408, 1, "touch");
    firePointer(canvas, "pointerdown", 758, 408, 2, "touch");
    firePointer(canvas, "pointerup", 758, 408, 2, "touch"); // a quick tap, between steps
    stepGame(game, 10);
    expect(player.getVelocity().x).toBeGreaterThan(0);
    expect(jumps).toBe(1);
  });

  test("destroying the game lifts held keys", async () => {
    const { game, canvas } = await touchGame();
    firePointer(canvas, "pointerdown", 142, 408, 1, "touch");
    game["touch"].releaseAll();
    input().endStep();
    expect(input().isAction("right")).toBe(false);
  });
});
