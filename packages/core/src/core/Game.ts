import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { Input } from "../systems/Input";
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
}

/** Why an entity was removed. */
export type RemoveReason = "manual" | "killPlane";

export interface GameEvents {
  /** An entity was removed from the game and its body freed. */
  entityRemoved: { entity: Entity; reason: RemoveReason };
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
  private entities: Entity[] = [];
  /** Entities to remove after the current step (removing mid-step would break the loop). */
  private readonly pendingRemovals = new Map<Entity, RemoveReason>();
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;

  private constructor(canvas: HTMLCanvasElement, options: GameOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81 });
    this.killPlaneY = options.killPlaneY === undefined ? -30 : options.killPlaneY;

    canvas.tabIndex = 0; // focusable, so it can receive keyboard input
    canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
    canvas.addEventListener("keydown", (e) => {
      if (SCROLL_KEYS.has(e.code)) e.preventDefault();
    });
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

  /** Runs one physics step: update every entity, step the world, then apply removals. */
  private step(): void {
    this.input.setEnabled(this.isFocused());
    for (const e of this.entities) e.update();
    this.world.step();

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
    for (const e of this.entities) e.draw(this.ctx, SCALE, width / 2, height / 2);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
