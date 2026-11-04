import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter, Ground, Player } from "../src";
import { createWorld, keys, simulate, simulateUntil } from "./helpers";

beforeEach(() => keys.reset());

describe("EventEmitter", () => {
  type Events = { hit: { damage: number }; heal: { amount: number } };

  test("calls listeners with the payload", () => {
    const events = new EventEmitter<Events>();
    const listener = mock((_: { damage: number }) => {});
    events.on("hit", listener);
    events.emit("hit", { damage: 3 });
    expect(listener).toHaveBeenCalledWith({ damage: 3 });
  });

  test("only calls listeners of the emitted event", () => {
    const events = new EventEmitter<Events>();
    const heal = mock(() => {});
    events.on("heal", heal);
    events.emit("hit", { damage: 1 });
    expect(heal).not.toHaveBeenCalled();
  });

  test("on() returns a function that unsubscribes", () => {
    const events = new EventEmitter<Events>();
    const listener = mock(() => {});
    const off = events.on("hit", listener);
    off();
    events.emit("hit", { damage: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  test("off() removes a listener", () => {
    const events = new EventEmitter<Events>();
    const listener = mock(() => {});
    events.on("hit", listener);
    events.off("hit", listener);
    events.emit("hit", { damage: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  test("once() runs a single time", () => {
    const events = new EventEmitter<Events>();
    const listener = mock(() => {});
    events.once("hit", listener);
    events.emit("hit", { damage: 1 });
    events.emit("hit", { damage: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a listener can unsubscribe another while emitting", () => {
    const events = new EventEmitter<Events>();
    const second = mock(() => {});
    events.on("hit", () => events.off("hit", second));
    events.on("hit", second);
    events.emit("hit", { damage: 1 }); // the copy made before emitting still calls it
    events.emit("hit", { damage: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("Player events", () => {
  function setup(options: ConstructorParameters<typeof Player>[1] = {}) {
    const world = createWorld();
    const player = new Player(world, options);
    const entities = [new Ground(world), player];
    const log: string[] = [];
    player.on("stateChange", ({ to }) => log.push(to));
    player.on("jump", ({ airJump }) => log.push(airJump ? "event:airJump" : "event:jump"));
    player.on("land", () => log.push("event:land"));
    player.on("dash", () => log.push("event:dash"));
    player.on("respawn", ({ fell }) => log.push(fell ? "event:respawn(fell)" : "event:respawn"));
    return { world, player, entities, log };
  }

  test("spawning on the ground emits nothing", () => {
    const { world, entities, log } = setup();
    simulate(world, entities, 30);
    expect(log).toEqual([]);
  });

  test("run → idle", () => {
    const { world, entities, log } = setup();
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    simulate(world, entities, 20);
    keys.up("ArrowRight");
    simulate(world, entities, 30);
    expect(log).toEqual(["run", "idle"]);
  });

  test("jump → double jump → fall → land, in order", () => {
    const { world, player, entities, log } = setup({ maxJumps: 2 });
    simulate(world, entities, 10);
    keys.down("Space");
    simulate(world, entities, 10);
    keys.up("Space");
    simulate(world, entities, 2);
    keys.down("Space");
    simulateUntil(world, entities, () => player.isGrounded() && player.getState() === "idle");
    expect(log).toEqual(["event:jump", "jump", "event:airJump", "fall", "event:land", "idle"]);
  });

  test("land reports the fall speed", () => {
    const world = createWorld();
    const player = new Player(world, { y: 6.5 }); // 10 m above the ground
    const speeds: number[] = [];
    player.on("land", ({ fallSpeed }) => speeds.push(fallSpeed));
    simulateUntil(world, [new Ground(world), player], () => speeds.length > 0);
    expect(speeds[0]).toBeGreaterThan(20); // √(2 · 40 · 10) ≈ 28, capped at maxFallSpeed 25
    expect(speeds[0]).toBeLessThanOrEqual(25);
  });

  test("a dash on the ground goes dash → run without a fake fall or land", () => {
    const { world, entities, log } = setup({ dash: true });
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    keys.down("ShiftLeft");
    simulate(world, entities, 20);
    expect(log).toEqual(["event:dash", "dash", "run"]);
  });

  test("respawn: fell = true when falling, false when called", () => {
    const world = createWorld();
    const player = new Player(world, { respawnBelow: -10 });
    const log: boolean[] = [];
    player.on("respawn", ({ fell }) => log.push(fell));
    simulateUntil(world, [player], () => log.length > 0); // no ground
    player.respawn();
    expect(log).toEqual([true, false]);
  });
});
