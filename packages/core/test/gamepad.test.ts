import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Ground, Input, Player } from "../src";
import { createGame, keys, stepGame } from "./helpers";

interface FakePad {
  id: string;
  mapping: string;
  connected: boolean;
  buttons: { pressed: boolean }[];
  axes: number[];
  vibrationActuator?: { playEffect(type: string, options: object): Promise<string> };
}

function makePad(mapping = "standard"): FakePad {
  return { id: "Fake pad", mapping, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
}

let pads: (FakePad | null)[] = [];
const original = navigator.getGamepads;

beforeEach(() => {
  keys.reset();
  pads = [];
  (navigator as unknown as { getGamepads: () => unknown }).getGamepads = () => pads;
});
afterEach(() => {
  (navigator as unknown as { getGamepads: unknown }).getGamepads = original;
});

async function setup() {
  const game = await createGame();
  game.gamepad.enabled = true;
  game.start();
  return game;
}
const input = () => Input.getInstance();

describe("Gamepad", () => {
  test("is off by default", async () => {
    const game = await createGame();
    game.start();
    const pad = makePad();
    pad.buttons[0]!.pressed = true;
    pads = [pad];
    stepGame(game);
    expect(game.gamepad.isConnected).toBe(true);
    input().endStep();
    expect(input().isPressed("Space")).toBe(false);
  });

  test("no pad, or no API, does nothing", async () => {
    const game = await setup();
    expect(game.gamepad.getState()).toBeNull();
    expect(() => stepGame(game)).not.toThrow();
    (navigator as unknown as { getGamepads: unknown }).getGamepads = undefined;
    expect(() => stepGame(game)).not.toThrow();
    expect(game.gamepad.isConnected).toBe(false);
  });

  test("finds the pad in any slot", async () => {
    const game = await setup();
    pads = [null, null, makePad()];
    expect(game.gamepad.isConnected).toBe(true);
  });

  test("buttons hold keys while pressed", async () => {
    const game = await setup();
    const pad = makePad();
    pads = [pad];
    pad.buttons[0]!.pressed = true;
    game.gamepad.poll();
    expect(input().isPressed("Space")).toBe(true);
    pad.buttons[0]!.pressed = false;
    game.gamepad.poll();
    input().endStep();
    expect(input().isPressed("Space")).toBe(false);
  });

  test("holding a button isn't a new press", async () => {
    const game = await setup();
    const pad = makePad();
    pad.buttons[0]!.pressed = true;
    pads = [pad];
    expect(game.gamepad.poll()).toBe(true);
    expect(game.gamepad.poll()).toBe(false);
  });

  test("the stick respects the dead zone", async () => {
    const game = await setup();
    const pad = makePad();
    pads = [pad];
    pad.axes[0] = 0.2;
    game.gamepad.poll();
    expect(input().isPressed("ArrowRight")).toBe(false);
    pad.axes[0] = 0.8;
    game.gamepad.poll();
    expect(input().isPressed("ArrowRight")).toBe(true);
    pad.axes[0] = -0.8;
    game.gamepad.poll();
    input().endStep();
    expect(input().isPressed("ArrowRight")).toBe(false);
    expect(input().isPressed("ArrowLeft")).toBe(true);
  });

  test("the stick down presses ↓, and two controls for one key don't fight", async () => {
    const game = await setup();
    const pad = makePad();
    pads = [pad];
    pad.axes[1] = 0.9;
    pad.buttons[13]!.pressed = true;
    game.gamepad.poll();
    expect(input().isPressed("ArrowDown")).toBe(true);
    pad.buttons[13]!.pressed = false;
    game.gamepad.poll();
    input().endStep();
    expect(input().isPressed("ArrowDown")).toBe(true); // the stick still holds it
  });

  test("the keyboard keeps working next to a pad", async () => {
    const game = await setup();
    pads = [makePad()];
    keys.down("ArrowLeft");
    game.gamepad.poll();
    input().endStep();
    expect(input().isPressed("ArrowLeft")).toBe(true);
  });

  test("setMapping() adapts a pad with its own layout", async () => {
    const game = await setup();
    const pad = makePad("");
    pads = [pad];
    game.gamepad.setMapping({ buttons: { Space: [2], KeyX: [3] }, moveAxes: [[0, 1], [4, 5]] });
    pad.buttons[2]!.pressed = true;
    pad.axes[4] = 1;
    pad.axes.push(0, 0);
    game.gamepad.poll();
    expect(input().isPressed("Space")).toBe(true);
    expect(input().isPressed("ArrowRight")).toBe(true);
  });

  test("getState() shows what the browser reports", async () => {
    const game = await setup();
    const pad = makePad("");
    pad.buttons[5]!.pressed = true;
    pad.axes[1] = 0.5;
    pads = [pad];
    expect(game.gamepad.getState()).toEqual({ id: "Fake pad", mapping: "", pressed: [5], axes: [0, 0.5, 0, 0] });
  });

  test("unplugging it releases what it held", async () => {
    const game = await setup();
    const pad = makePad();
    pad.buttons[0]!.pressed = true;
    pads = [pad];
    game.gamepad.poll();
    pads = [];
    game.gamepad.poll();
    input().endStep();
    expect(input().isPressed("Space")).toBe(false);
  });

  test("only the focused game polls the pad", async () => {
    const game = await setup();
    const pad = makePad();
    pad.buttons[0]!.pressed = true;
    pads = [pad];
    const { fakeDocument } = await import("./setup");
    fakeDocument.activeElement = null;
    stepGame(game);
    input().endStep();
    input().setEnabled(true);
    expect(input().isPressed("Space")).toBe(false);
  });

  test("vibrate() asks the pad to rumble, if it can", async () => {
    const game = await setup();
    const effects: unknown[] = [];
    const pad = makePad();
    pads = [pad];
    expect(() => game.gamepad.vibrate(0.2)).not.toThrow(); // this pad has no actuator
    pad.vibrationActuator = { playEffect: async (type, options) => (effects.push([type, options]), "complete") };
    game.gamepad.vibrate(0.2, 0.5);
    expect(effects).toEqual([["dual-rumble", { duration: 200, strongMagnitude: 0.5, weakMagnitude: 0.5 }]]);
  });

  test("the player moves and jumps with it", async () => {
    const game = await setup();
    const world = game.getWorld();
    const player = new Player(world);
    game.addEntity(new Ground(world));
    game.addEntity(player);
    stepGame(game, 10);
    let jumps = 0;
    player.on("jump", () => jumps++);
    const pad = makePad();
    pads = [pad];
    pad.axes[0] = 1;
    pad.buttons[0]!.pressed = true;
    stepGame(game, 10);
    expect(player.getVelocity().x).toBeGreaterThan(0);
    expect(jumps).toBe(1);
  });
});
