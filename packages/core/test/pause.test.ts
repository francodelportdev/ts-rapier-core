import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Component, Ground, Input, Player, type Game } from "../src";
import { createGame, freed, keys } from "./helpers";

/** Counts physics steps, and can pause the game from inside one. Scenes would clear the entities. */
class Probe extends Component {
  public steps = 0;
  private readonly pauseOnStep: boolean;
  constructor(pauseOnStep = false) {
    super();
    this.pauseOnStep = pauseOnStep;
  }
  override update() {
    this.steps++;
    if (this.pauseOnStep) this.entity.getGame()?.pause();
  }
}

beforeEach(() => keys.reset());

/** Runs animation frames of the loop by hand, 1/60 s apart. */
function framesOf(game: Game) {
  let time = 0;
  const loop = (game as unknown as { loop(time: number): void }).loop;
  return (count = 1) => {
    for (let i = 0; i < count; i++) {
      loop(time);
      time += 1000 / 60;
    }
  };
}

async function setup() {
  const game = await createGame({ killPlaneY: null });
  const world = game.getWorld();
  game.addEntity(new Ground(world));
  const box = new Box(world, 0, 5);
  game.addEntity(box);
  game.start();
  const frames = framesOf(game);
  frames(2);
  return { game, world, box, frames };
}

describe("Pause", () => {
  test("freezes the physics but keeps drawing and emitting frame", async () => {
    const { game, box, frames } = await setup();
    let drawn = 0;
    game.on("frame", () => drawn++);
    game.pause();
    const y = box.getPosition().y;
    frames(30);
    expect(box.getPosition().y).toBe(y);
    expect(drawn).toBe(30);
    game.resume();
    frames(10);
    expect(box.getPosition().y).toBeLessThan(y);
  });

  test("the time spent paused isn't simulated afterwards", async () => {
    const { game, frames } = await setup();
    const { box } = { box: game.getEntities()[1]! };
    const probe = box.add(new Probe());
    game.pause();
    frames(120);
    game.resume();
    probe.steps = 0;
    frames(1);
    expect(probe.steps).toBeLessThanOrEqual(1);
  });

  test("emits pause and resume once, and ignores repeats", async () => {
    const { game } = await setup();
    const log: string[] = [];
    game.on("pause", () => log.push("pause"));
    game.on("resume", () => log.push("resume"));
    game.pause();
    game.pause();
    expect(game.isPaused()).toBe(true);
    game.resume();
    game.resume();
    expect(game.isPaused()).toBe(false);
    expect(log).toEqual(["pause", "resume"]);
  });

  test("pausing from inside a step stops the remaining steps of that frame", async () => {
    const { game, box, frames } = await setup();
    const probe = box.add(new Probe(true));
    const loop = (game as unknown as { loop(time: number): void }).loop;
    loop(10_000); // a long gap: several steps would be due
    const y = box.getPosition().y;
    frames(5);
    expect(probe.steps).toBe(1);
    expect(box.getPosition().y).toBe(y);
  });

  test("a tap while paused reaches the frame listeners for one frame, and not the player", async () => {
    const { game, world, frames } = await setup();
    const player = new Player(world);
    game.addEntity(player);
    frames(20);
    let jumps = 0;
    player.on("jump", () => jumps++);
    const seen: boolean[] = [];
    game.on("frame", () => seen.push(Input.getInstance().isPressed("Space")));
    game.pause();
    keys.down("Space");
    keys.up("Space");
    frames(2);
    expect(seen.slice(-2)).toEqual([true, false]);
    game.resume();
    frames(10);
    expect(jumps).toBe(0);
  });

  test("the key that resumes doesn't also reach the game", async () => {
    const { game, world, frames } = await setup();
    const player = new Player(world);
    game.addEntity(player);
    frames(20);
    let jumps = 0;
    player.on("jump", () => jumps++);
    game.pause();
    frames(2);
    keys.down("Space");
    keys.up("Space");
    game.resume(); // as a keydown handler would, between frames
    frames(10);
    expect(jumps).toBe(0);
  });

  test("a destroyed game can't be paused", async () => {
    const { game } = await setup();
    game.destroy();
    freed.add(game.getWorld()); // already freed: afterEach must not free it again
    game.pause();
    expect(game.isPaused()).toBe(false);
  });
});
