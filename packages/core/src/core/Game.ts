import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { Input } from "../systems/Input";
import { SCALE } from "./constants";

/** Keys that would otherwise scroll the page while a game canvas has focus. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
/** Longest frame gap simulated at once, in seconds (avoids a burst of steps after a stall). */
const MAX_FRAME_TIME = 0.25;

let rapierReady: Promise<void> | null = null;

/**
 * Engine entry point. Rapier (WASM) must be initialized before creating the world,
 * so it is constructed with `await Game.create(canvas)`.
 *
 * Physics runs at a fixed step (`world.timestep`, 1/60 s), independent of the display's
 * refresh rate. The canvas receives keyboard input only while it has focus.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly world: RAPIER.World;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = Input.getInstance();
  private entities: Entity[] = [];
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81 });

    canvas.tabIndex = 0; // focusable, so it can receive keyboard input
    canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
    canvas.addEventListener("keydown", (e) => {
      if (SCROLL_KEYS.has(e.code)) e.preventDefault();
    });
  }

  public static async create(canvas: HTMLCanvasElement): Promise<Game> {
    rapierReady ??= RAPIER.init();
    await rapierReady;
    return new Game(canvas);
  }

  public getWorld(): RAPIER.World {
    return this.world;
  }

  public addEntity(e: Entity): void {
    this.entities.push(e);
  }

  /** True while this game's canvas has keyboard focus. */
  public isFocused(): boolean {
    return document.activeElement === this.canvas;
  }

  /** Starts the loop. Focuses the canvas if nothing else on the page has focus. */
  public start(): void {
    if (this.rafId !== null) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      this.canvas.focus({ preventScroll: true });
    }
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readonly loop = (time: number): void => {
    const frameTime = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = time;
    this.accumulator += frameTime;

    const dt = this.world.timestep;
    while (this.accumulator >= dt) {
      this.input.setEnabled(this.isFocused());
      for (const e of this.entities) e.update();
      this.world.step();
      this.accumulator -= dt;
    }

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    for (const e of this.entities) e.draw(this.ctx, SCALE, width / 2, height / 2);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
