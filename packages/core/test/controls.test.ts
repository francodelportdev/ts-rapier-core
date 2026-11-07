import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Controls, Ground, Input, LevelScene, Player, type ControlInput } from "../src";
import { createGame, keys, stepGame } from "./helpers";

const original = navigator.getGamepads;
let pad: { id: string; mapping: string; connected: boolean; buttons: { pressed: boolean }[]; axes: number[] };

beforeEach(() => {
  keys.reset();
  pad = { id: "Pad", mapping: "", connected: true, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0, 0, 0, 0, 0, 0] };
  (navigator as unknown as { getGamepads: () => unknown }).getGamepads = () => [pad];
});
afterEach(() => {
  (navigator as unknown as { getGamepads: unknown }).getGamepads = original;
});

const K = (code: string): ControlInput => ({ type: "key", code });

async function setup(controls = new Controls()) {
  const game = await createGame();
  game.gamepad.enabled = true;
  game.start();
  const world = game.getWorld();
  const player = new Player(world);
  game.addEntity(new Ground(world));
  game.addEntity(player);
  stepGame(game, 10);
  controls.applyTo(game);
  let jumps = 0;
  player.on("jump", () => jumps++);
  return { game, player, controls, jumps: () => jumps };
}

describe("Controls: editing", () => {
  test("starts with the default controls", () => {
    const c = new Controls();
    expect(c.get("jump")).toContainEqual(K("Space"));
    expect(c.get("left")).toContainEqual({ type: "axis", axis: 0, direction: -1 });
  });

  test("an input used elsewhere moves to the new action", () => {
    const c = new Controls();
    c.add("dash", K("Space"));
    expect(c.get("dash")).toContainEqual(K("Space"));
    expect(c.get("jump")).not.toContainEqual(K("Space"));
  });

  test("adding the same input twice keeps one", () => {
    const c = new Controls();
    c.add("jump", K("KeyJ"));
    c.add("jump", K("KeyJ"));
    expect(c.get("jump").filter((b) => b.type === "key" && b.code === "KeyJ")).toHaveLength(1);
  });

  test("remove and reset", () => {
    const c = new Controls();
    c.remove("jump", K("Space"));
    expect(c.get("jump")).not.toContainEqual(K("Space"));
    c.reset();
    expect(c.get("jump")).toContainEqual(K("Space"));
  });

  test("emits change", () => {
    const c = new Controls();
    let n = 0;
    c.on("change", () => n++);
    c.add("jump", K("KeyJ"));
    c.remove("jump", K("KeyJ"));
    c.reset();
    expect(n).toBe(3);
  });

  test("saves and restores, skipping anything invalid", () => {
    const a = new Controls();
    a.add("jump", { type: "axis", axis: 5, direction: 1 });
    const b = new Controls();
    b.load(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.get("jump")).toEqual(a.get("jump"));

    const c = new Controls();
    c.load({ jump: [K("KeyJ"), { type: "key" }, { type: "axis", axis: 1, direction: 3 }, 7], left: "nope" });
    expect(c.get("jump")).toEqual([K("KeyJ")]);
    expect(c.get("left")).toContainEqual(K("ArrowLeft")); // defaults
    expect(() => c.load(null)).not.toThrow();
  });
});

describe("Controls: playing", () => {
  test("a new key jumps", async () => {
    const c = new Controls();
    c.add("jump", K("KeyJ"));
    const s = await setup(c);
    keys.down("KeyJ");
    stepGame(s.game, 2);
    expect(s.jumps()).toBe(1);
  });

  test("a removed key stops working, also the aliases of the action", async () => {
    const c = new Controls();
    c.remove("jump", K("Space"));
    c.remove("jump", K("KeyW"));
    const s = await setup(c);
    keys.down("Space");
    keys.down("KeyW");
    stepGame(s.game, 2);
    expect(s.jumps()).toBe(0);
  });

  test("a key moved to another action only does that", async () => {
    const c = new Controls();
    c.add("left", K("Space"));
    const s = await setup(c);
    keys.down("Space");
    stepGame(s.game, 10);
    expect(s.jumps()).toBe(0);
    expect(s.player.getVelocity().x).toBeLessThan(0);
  });

  test("gamepad buttons and single axes are bound per action", async () => {
    const c = new Controls();
    c.add("jump", { type: "button", button: 7 });
    c.add("right", { type: "axis", axis: 5, direction: 1 });
    const s = await setup(c);
    pad.buttons[7]!.pressed = true;
    pad.axes[5] = 1;
    stepGame(s.game, 10);
    expect(s.jumps()).toBe(1);
    expect(s.player.getVelocity().x).toBeGreaterThan(0);
  });

  test("a removed button and axis stop working", async () => {
    const c = new Controls();
    c.remove("jump", { type: "button", button: 0 });
    c.remove("right", { type: "axis", axis: 0, direction: 1 });
    const s = await setup(c);
    pad.buttons[0]!.pressed = true;
    pad.axes[0] = 1;
    stepGame(s.game, 10);
    expect(s.jumps()).toBe(0);
    expect(s.player.getVelocity().x).toBe(0);
  });

  test("on-screen buttons keep working whatever the keyboard bindings", async () => {
    const c = new Controls();
    c.remove("jump", K("Space"));
    const s = await setup(c);
    Input.getInstance().press("jump");
    stepGame(s.game, 2);
    Input.getInstance().release("jump");
    expect(s.jumps()).toBe(1);
  });

  test("players created by a scene follow the bindings too", async () => {
    const c = new Controls();
    c.add("right", K("KeyL"));
    const game = await createGame();
    c.applyTo(game);
    game.scenes.add("l", () => new LevelScene({ name: "T", bounds: { minX: -20, maxX: 20, minY: -9, maxY: 9 }, spawn: { x: 0, y: -3.5 }, goal: { x: 15, y: 0, width: 1, height: 1 }, platforms: [{ x: 0, y: -5, width: 40 }] }, { next: "l" }));
    game.scenes.go("l");
    game.start();
    keys.down("KeyL");
    stepGame(game, 15);
    expect((game.scenes.current as unknown as LevelScene).getPlayer().getVelocity().x).toBeGreaterThan(0);
  });

  test("keys outside the actions keep working", async () => {
    const s = await setup();
    keys.down("Enter");
    expect(Input.getInstance().isPressed("Enter")).toBe(true);
    expect(s.game).toBeDefined();
  });
});

describe("Actions", () => {
  test("isAction reads the keyboard and code alike, and stops while disabled", () => {
    const input = Input.getInstance();
    keys.down("KeyW");
    expect(input.isAction("jump")).toBe(true);
    keys.reset();
    input.press("jump");
    expect(input.isAction("jump")).toBe(true);
    input.setEnabled(false);
    expect(input.isAction("jump")).toBe(false);
    input.setEnabled(true);
    input.release("jump");
    input.endStep();
    expect(input.isAction("jump")).toBe(false);
  });

  test("a pad button can still press a plain key", async () => {
    const game = await createGame();
    game.gamepad.enabled = true;
    game.gamepad.setMapping({ buttons: { KeyE: [1] } });
    game.start();
    pad.buttons[1]!.pressed = true;
    stepGame(game);
    expect(Input.getInstance().isPressed("KeyE")).toBe(true);
  });

  test("a player with its own keys ignores Controls on the keyboard, but not on a pad", async () => {
    const game = await createGame();
    game.gamepad.enabled = true;
    game.start();
    const world = game.getWorld();
    const player = new Player(world, { keys: { right: ["KeyL"] } });
    game.addEntity(new Ground(world));
    game.addEntity(player);
    stepGame(game, 10);
    const c = new Controls();
    c.add("right", K("KeyP"));
    c.add("right", { type: "button", button: 7 });
    c.applyTo(game);
    keys.down("KeyP");
    stepGame(game, 10);
    expect(player.getVelocity().x).toBe(0);
    keys.up("KeyP");
    pad.buttons[7]!.pressed = true;
    stepGame(game, 10);
    expect(player.getVelocity().x).toBeGreaterThan(0);
  });
});
