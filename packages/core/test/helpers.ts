import { afterEach } from "bun:test";
import RAPIER from "@dimforge/rapier2d-compat";
import { Game, Input, type Entity } from "../src";
import { dispatchWindowEvent, fakeDocument } from "./setup";

/** Physics steps per second (Rapier's default timestep is 1/60 s). */
export const STEPS_PER_SECOND = 60;

/** Keyboard control for tests. `reset()` releases every key and re-enables input. */
export const keys = {
  down(code: string): void {
    dispatchWindowEvent("keydown", code);
  },
  up(code: string): void {
    dispatchWindowEvent("keyup", code);
  },
  reset(): void {
    dispatchWindowEvent("blur"); // Input clears every key on blur
    Input.getInstance().setEnabled(true);
  },
};

/** Worlds created by this test, freed after it so WebAssembly memory doesn't keep growing. */
const worlds: RAPIER.World[] = [];
const games: Game[] = [];
/** Worlds a test already freed through `game.destroy()`. */
export const freed = new WeakSet<RAPIER.World>();

afterEach(() => {
  for (const game of games.splice(0)) game.stop();
  for (const world of worlds.splice(0)) if (!freed.has(world)) world.free();
});

export function createWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: -9.81 });
  worlds.push(world);
  return world;
}

/**
 * Runs `steps` physics steps over a hand-made entity list, the same way `Game` does
 * (update every entity, then step the world). `onStep` runs before each step.
 */
export function simulate(
  world: RAPIER.World,
  entities: readonly Entity[],
  steps: number,
  onStep?: (step: number) => void,
): void {
  for (let i = 0; i < steps; i++) {
    onStep?.(i);
    for (const e of entities) e.update();
    world.step();
    Input.getInstance().endStep();
  }
}

/** Runs steps until `done()` returns true, or fails after `maxSteps`. Returns the number of steps run. */
export function simulateUntil(
  world: RAPIER.World,
  entities: readonly Entity[],
  done: () => boolean,
  maxSteps = 600,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done()) return i;
    for (const e of entities) e.update();
    world.step();
    Input.getInstance().endStep();
  }
  throw new Error(`Condition not reached after ${maxSteps} steps`);
}

/** A stand-in for an 800×450 canvas. Focusing it updates `document.activeElement`. */
export function createCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 800,
    height: 450,
    tabIndex: -1,
    listeners: [] as { type: string; signal?: AbortSignal; handler: (e: unknown) => void }[],
    addEventListener(type: string, handler: (e: unknown) => void, options?: { signal?: AbortSignal }): void {
      canvas.listeners.push({ type, handler, signal: options?.signal });
    },
    focus(): void {
      fakeDocument.activeElement = canvas;
    },
    getContext: () => ({ clearRect(): void {}, save(): void {}, restore(): void {} }),
  };
  return canvas as unknown as HTMLCanvasElement;
}

/** Creates a game on a fake canvas, with focus reset so `start()` focuses it. */
export async function createGame(options?: Parameters<typeof Game.create>[1]): Promise<Game> {
  fakeDocument.activeElement = null;
  const game = await Game.create(createCanvas(), options);
  games.push(game);
  worlds.push(game.getWorld());
  return game;
}

/** Runs physics steps on a game without animation frames (calls its private step). */
export function stepGame(game: Game, steps = 1): void {
  const runStep = (game as unknown as { step(): void }).step.bind(game);
  for (let i = 0; i < steps; i++) runStep();
}
