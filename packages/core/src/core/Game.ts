import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { Input } from "../systems/Input";
import { Camera } from "./Camera";
import { SCALE } from "./constants";

/** Keys that would otherwise scroll the page while a game canvas has focus. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
/** Longest frame gap simulated at once, in seconds (avoids a burst of steps after a stall). */
const MAX_FRAME_TIME = 0.25;

let rapierReady: Promise<void> | null = null;

export interface GameOptions {
  /**
   * Entities whose center falls below this Y (meters) are removed automatically, so objects
   * that fall out of the level stop using CPU and memory. `null` disables it. Default: -30.
   */
  killPlaneY?: number | null;
  /**
   * Draws a grid in world space behind the entities, which makes camera movement easy to see.
   * `true` draws a line every 1 m. Default: false.
   */
  grid?: boolean | { size?: number; color?: string };
}

/** Why an entity was removed. */
export type RemoveReason = "manual" | "killPlane";

export interface GameEvents {
  /** An entity was removed from the game and its body freed. */
  entityRemoved: { entity: Entity; reason: RemoveReason };
  /** A frame was drawn. Use it for per-frame work such as updating a HUD; it stops with the game. */
  frame: Record<string, never>;
}

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
  private readonly killPlaneY: number | null;
  private readonly events = new EventEmitter<GameEvents>();
  private readonly grid: { size: number; color: string } | null;
  /** The view into the world. Use it to follow the player, set level bounds, zoom or shake. */
  public readonly camera = new Camera(SCALE);
  private entities: Entity[] = [];
  /** Entities to remove after the current step (removing mid-step would break the loop). */
  private readonly pendingRemovals = new Map<Entity, RemoveReason>();
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private destroyed = false;
  /** Removes the canvas listeners on `destroy()`. */
  private readonly listeners = new AbortController();

  private constructor(canvas: HTMLCanvasElement, options: GameOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81 });
    this.killPlaneY = options.killPlaneY === undefined ? -30 : options.killPlaneY;
    const grid = options.grid === true ? {} : options.grid || null;
    this.grid = grid && { size: grid.size ?? 1, color: grid.color ?? "rgb(255 255 255 / 0.05)" };

    canvas.tabIndex = 0; // focusable, so it can receive keyboard input
    const { signal } = this.listeners;
    canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }), { signal });
    canvas.addEventListener(
      "keydown",
      (e) => {
        if (SCROLL_KEYS.has(e.code)) e.preventDefault();
      },
      { signal },
    );
  }

  public static async create(canvas: HTMLCanvasElement, options: GameOptions = {}): Promise<Game> {
    rapierReady ??= RAPIER.init();
    await rapierReady;
    return new Game(canvas, options);
  }

  public getWorld(): RAPIER.World {
    return this.world;
  }

  public addEntity(e: Entity): void {
    if (e.isDestroyed) throw new Error("Cannot add an entity that was already destroyed");
    this.entities.push(e);
  }

  /**
   * Removes an entity from the game and frees its physics body. It's safe to call at any
   * time, even from inside `update()` or an event listener: the removal happens right after
   * the current physics step. Removing an entity twice has no effect.
   */
  public removeEntity(e: Entity): void {
    this.queueRemoval(e, "manual");
  }

  /** The entities currently in the game. */
  public getEntities(): readonly Entity[] {
    return this.entities;
  }

  /** Number of rigid bodies in the physics world. Useful to check that removed entities were freed. */
  public getBodyCount(): number {
    return this.world.bodies.len();
  }

  public on<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  public off<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): void {
    this.events.off(event, listener);
  }

  /** True while this game's canvas has keyboard focus. */
  public isFocused(): boolean {
    return document.activeElement === this.canvas;
  }

  /** Starts the loop. Focuses the canvas if nothing else on the page has focus. */
  public start(): void {
    if (this.rafId !== null || this.destroyed) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      this.canvas.focus({ preventScroll: true });
    }
    this.lastTime = null;
    this.camera.update(0, this.canvas.width, this.canvas.height);
    this.camera.snapToTarget();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * Stops the game for good: ends the loop, removes its canvas listeners and frees the physics
   * world with everything in it. Don't use the game or its entities afterwards. Calling it
   * twice has no effect.
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.listeners.abort();
    this.entities = [];
    this.pendingRemovals.clear();
    this.world.free();
  }

  /** Runs one physics step: update every entity, step the world, then apply removals. */
  private step(): void {
    this.input.setEnabled(this.isFocused());
    for (const e of this.entities) e.update();
    this.world.step();
    this.camera.update(this.world.timestep, this.canvas.width, this.canvas.height);

    if (this.killPlaneY !== null) {
      for (const e of this.entities) {
        if (e.getPosition().y < this.killPlaneY) this.queueRemoval(e, "killPlane");
      }
    }
    this.flushRemovals();
  }

  private queueRemoval(e: Entity, reason: RemoveReason): void {
    if (!this.pendingRemovals.has(e)) this.pendingRemovals.set(e, reason);
    // Outside the loop (for example, from a click handler), remove right away.
    if (this.rafId === null) this.flushRemovals();
  }

  private flushRemovals(): void {
    if (this.pendingRemovals.size === 0) return;
    const removals = [...this.pendingRemovals];
    this.pendingRemovals.clear();
    for (const [entity, reason] of removals) {
      const index = this.entities.indexOf(entity);
      if (index === -1) continue; // not in this game, or already removed
      this.entities.splice(index, 1);
      entity.destroy();
      this.events.emit("entityRemoved", { entity, reason });
    }
  }

  /** Lines every `size` meters, covering only the visible part of the world. */
  private drawGrid(size: number, color: string): void {
    const ctx = this.ctx;
    const view = this.camera.getVisibleBounds();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(view.minX / size) * size; x <= view.maxX; x += size) {
      const { px } = this.camera.worldToScreen(x, 0);
      ctx.moveTo(Math.round(px) + 0.5, 0);
      ctx.lineTo(Math.round(px) + 0.5, this.canvas.height);
    }
    for (let y = Math.floor(view.minY / size) * size; y <= view.maxY; y += size) {
      const { py } = this.camera.worldToScreen(0, y);
      ctx.moveTo(0, Math.round(py) + 0.5);
      ctx.lineTo(this.canvas.width, Math.round(py) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private readonly loop = (time: number): void => {
    const frameTime = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = time;
    this.accumulator += frameTime;

    const dt = this.world.timestep;
    while (this.accumulator >= dt) {
      this.step();
      this.accumulator -= dt;
    }
    // Removals requested between steps (for example, from a key handler) apply before drawing.
    this.flushRemovals();

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    const { scale, centerX, centerY } = this.camera.getViewport();
    if (this.grid !== null) this.drawGrid(this.grid.size, this.grid.color);
    for (const e of this.entities) e.draw(this.ctx, scale, centerX, centerY);

    this.events.emit("frame", {});
    if (this.rafId !== null) this.rafId = requestAnimationFrame(this.loop); // a listener may have stopped it
  };
}
