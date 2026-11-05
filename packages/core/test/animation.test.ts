import { beforeEach, describe, expect, test } from "bun:test";
import { Animator, Box, Ground, Player, Sprite, SpriteSheet, animatePlayer, type SheetImage } from "../src";
import { createGame, createWorld, keys, simulate, stepGame } from "./helpers";

beforeEach(() => keys.reset());

const image = { width: 128, height: 64 } as SheetImage; // 4 × 2 frames of 32 px
const sheet = new SpriteSheet(image, 32, 32);

function fakeCtx() {
  const calls: string[] = [];
  const record = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.filter((a) => a !== image).join(",")})`);
  const ctx = { imageSmoothingEnabled: true, save: record("save"), restore: record("restore"), translate: record("translate"), rotate: record("rotate"), scale: record("scale"), drawImage: record("drawImage") };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
}

describe("Animator", () => {
  const clips = {
    idle: { frames: [0, 1, 2], fps: 10 },
    attack: { frames: [4, 5], fps: 10, loop: false, next: "idle" },
    die: { frames: [6, 7], fps: 10, loop: false },
  };

  test("advances at its fps and loops", () => {
    const a = new Animator(clips, "idle");
    expect(a.frame).toBe(0);
    a.update(0.05);
    expect(a.frame).toBe(0); // half a frame
    a.update(0.051);
    expect(a.frame).toBe(1);
    a.update(0.2);
    expect(a.frame).toBe(0); // wrapped around
  });

  test("a long update skips the right number of frames", () => {
    const a = new Animator(clips, "idle");
    a.update(0.45); // 4 frames
    expect(a.frame).toBe(1);
  });

  test("speed scales time, and pause stops it", () => {
    const a = new Animator(clips, "idle");
    a.speed = 2;
    a.update(0.051);
    expect(a.frame).toBe(1);
    a.pause();
    a.update(1);
    expect(a.frame).toBe(1);
    a.resume();
    a.update(0.051);
    expect(a.frame).toBe(2);
  });

  test("a non-looping clip stops on its last frame and emits end once", () => {
    const a = new Animator(clips, "die");
    const ends: string[] = [];
    a.on("end", ({ clip }) => ends.push(clip));
    a.update(1);
    a.update(1);
    expect(a.frame).toBe(7);
    expect(a.isFinished).toBe(true);
    expect(ends).toEqual(["die"]);
  });

  test("next plays another clip at the end", () => {
    const a = new Animator(clips, "attack");
    a.update(0.21);
    expect(a.clip).toBe("idle");
    expect(a.isFinished).toBe(false);
  });

  test("an end listener can choose another clip", () => {
    const a = new Animator(clips, "attack");
    a.on("end", () => a.play("die"));
    a.update(0.21);
    expect(a.clip).toBe("die");
  });

  test("play() keeps the current clip running, unless restart is on", () => {
    const a = new Animator(clips, "idle");
    a.update(0.11);
    a.play("idle");
    expect(a.frame).toBe(1);
    a.play("idle", { restart: true });
    expect(a.frame).toBe(0);
  });

  test("emits change and frame", () => {
    const a = new Animator(clips, "idle");
    const log: string[] = [];
    a.on("change", ({ from, to }) => log.push(`${from}>${to}`));
    a.on("frame", ({ clip, index }) => log.push(`${clip}:${index}`));
    a.update(0.11);
    a.play("die");
    expect(log).toEqual(["idle:1", "idle>die"]);
  });

  test("rejects bad clips", () => {
    expect(() => new Animator({ a: { frames: [], fps: 1 } }, "a")).toThrow(/no frames/);
    expect(() => new Animator({ a: { frames: [0], fps: 0 } }, "a")).toThrow(/fps/);
    expect(() => new Animator({ a: { frames: [0], fps: 1, next: "b" } }, "a")).toThrow(/"b"/);
    expect(() => new Animator(clips, "nope")).toThrow(/nope/);
    expect(() => new Animator(clips, "idle").play("nope")).toThrow(/nope/);
  });
});

describe("SpriteSheet", () => {
  test("numbers frames left to right, top to bottom", () => {
    expect(sheet.frameCount).toBe(8);
    expect(sheet.frameRect(0)).toEqual({ x: 0, y: 0 });
    expect(sheet.frameRect(5)).toEqual({ x: 32, y: 32 });
  });

  test("rejects frames outside the sheet and images too small", () => {
    expect(() => sheet.frameRect(8)).toThrow(/outside/);
    expect(() => new SpriteSheet(image, 256, 32)).toThrow(/smaller/);
  });
});

describe("Sprite", () => {
  test("draws the animator's frame, sized in meters", () => {
    const animator = new Animator({ a: { frames: [5], fps: 1 } }, "a");
    const { ctx, calls, raw } = fakeCtx();
    new Sprite({ sheet, animator, width: 2, height: 1 }).draw(ctx, 100, 50, 0, 30);
    expect(calls).toContain("drawImage(32,32,32,32,-30,-15,60,30)");
    expect(raw.imageSmoothingEnabled).toBe(false);
  });

  test("follows the body's rotation, flipped for the canvas", () => {
    const { ctx, calls } = fakeCtx();
    new Sprite({ sheet, width: 1, height: 1 }).draw(ctx, 0, 0, 0.5, 30);
    expect(calls).toContain("rotate(-0.5)");
  });

  test("flipX mirrors, also as a function", () => {
    const flipped = fakeCtx();
    new Sprite({ sheet, width: 1, height: 1, flipX: () => true }).draw(flipped.ctx, 0, 0, 0, 30);
    expect(flipped.calls).toContain("scale(-1,1)");
    const normal = fakeCtx();
    new Sprite({ sheet, width: 1, height: 1 }).draw(normal.ctx, 0, 0, 0, 30);
    expect(normal.calls).not.toContain("scale(-1,1)");
  });

  test("an offset is in meters with Y up, and a bad frame fails early", () => {
    const { ctx, calls } = fakeCtx();
    new Sprite({ sheet, width: 1, height: 1, offsetY: 1 }).draw(ctx, 0, 0, 0, 30);
    expect(calls).toContain("translate(0,-30)");
    expect(() => new Sprite({ sheet, width: 1, height: 1, frame: 99 })).toThrow(/outside/);
  });
});

describe("Entities", () => {
  test("render() uses the sprite, and null goes back to draw()", () => {
    const world = createWorld();
    const box = new Box(world, 0, 0);
    let drew = 0;
    box.draw = () => void drew++;
    const { ctx, calls } = fakeCtx();
    box.setSprite(new Sprite({ sheet, width: 1, height: 1 }));
    box.render(ctx, 30, 0, 0);
    expect(calls.some((c) => c.startsWith("drawImage"))).toBe(true);
    expect(drew).toBe(0);
    box.setSprite(null);
    box.render(ctx, 30, 0, 0);
    expect(drew).toBe(1);
  });

  test("Game advances animators with the physics", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    const animator = new Animator({ a: { frames: [0, 1, 2, 3], fps: 30 } }, "a");
    box.setSprite(new Sprite({ sheet, animator, width: 1, height: 1 }));
    game.addEntity(box);
    game.start();
    stepGame(game, 5); // 5/60 s at 30 fps = 2.5 frames
    expect(animator.frame).toBe(2);
  });
});

describe("animatePlayer", () => {
  const frames = { frames: [0], fps: 1 };
  function setup(clips?: Parameters<typeof animatePlayer>[2], names = { idle: frames, run: frames, jump: frames, fall: frames } as Record<string, typeof frames>) {
    const world = createWorld();
    const player = new Player(world);
    const animator = new Animator(names, Object.keys(names)[0]!);
    const sprite = new Sprite({ sheet, animator, width: 1, height: 2 });
    const stop = animatePlayer(player, sprite, clips);
    const entities = [new Ground(world), player];
    simulate(world, entities, 10);
    return { world, player, animator, sprite, entities, stop };
  }

  test("follows the state, and a missing clip falls back to idle", () => {
    const { world, player, animator, entities } = setup();
    expect(player.getSprite()).not.toBeNull();
    keys.down("ArrowRight");
    simulate(world, entities, 10);
    expect(animator.clip).toBe("run");
    keys.down("Space");
    simulate(world, entities, 5);
    expect(animator.clip).toBe("jump");
  });

  test("a state without a clip plays idle", () => {
    const world = createWorld();
    const player = new Player(world, { dash: true });
    const animator = new Animator({ idle: frames, run: frames }, "run");
    animatePlayer(player, new Sprite({ sheet, animator, width: 1, height: 2 }));
    const entities = [new Ground(world), player];
    simulate(world, entities, 10);
    keys.down("ShiftLeft");
    simulate(world, entities, 2);
    expect(player.getState()).toBe("dash");
    expect(animator.clip).toBe("idle");
  });

  test("mirrors to the facing direction", () => {
    const { world, sprite, entities } = setup();
    keys.down("ArrowLeft");
    simulate(world, entities, 2);
    const { ctx, calls } = fakeCtx();
    sprite.draw(ctx, 0, 0, 0, 30);
    expect(calls).toContain("scale(-1,1)");
  });

  test("clips can be renamed, and stop() ends it", () => {
    const { world, animator, entities, stop } = setup({ run: "walk", idle: "stand" }, { stand: frames, walk: frames });
    expect(animator.clip).toBe("stand");
    keys.down("ArrowRight");
    simulate(world, entities, 10);
    expect(animator.clip).toBe("walk");
    stop();
    keys.reset();
    simulate(world, entities, 30);
    expect(animator.clip).toBe("walk");
  });

  test("needs an animator", () => {
    const world = createWorld();
    expect(() => animatePlayer(new Player(world), new Sprite({ sheet, width: 1, height: 1 }))).toThrow(/animator/);
  });
});
