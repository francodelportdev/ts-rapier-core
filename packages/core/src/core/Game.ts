import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { AudioManager } from "../systems/Audio";
import { Input } from "../systems/Input";
import { Pointer } from "../systems/Pointer";
import { TouchControls } from "../systems/TouchControls";
import { SceneManager } from "../scenes/SceneManager";
import { Camera } from "./Camera";
import { DebugRenderer } from "./DebugRenderer";
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
  /** World gravity, in m/s² (positive = down). `clear()` goes back to it. Default: 9.81. */
  gravity?: number;
  /** Pixels per meter at zoom 1. Default: 30. */
  scale?: number;
  /** Canvas color behind everything. Default: transparent. */
  background?: string;
  /**
   * Highest pixel ratio to render at. Screens with more pixels than CSS pixels look sharp up to
   * this value; 1 turns it off. Higher values cost more to draw. Default: 2.
   */
  maxPixelRatio?: number;
  /** Draw between physics steps, so movement stays smooth on any refresh rate. Default: true. */
  interpolation?: boolean;
}

/** Why an entity was removed. */
export type RemoveReason = "manual" | "killPlane";

export interface GameEvents {
  /** An entity was removed from the game and its body freed. */
  entityRemoved: { entity: Entity; reason: RemoveReason };
  /** A frame was drawn. Use it for per-frame work such as updating a HUD; it stops with the game. */
  frame: Record<string, never>;
  /** Something threw during a step, a draw or a listener. The game keeps running. */
  error: { error: unknown };
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
  private killPlaneY: number | null;
  private readonly defaultKillPlaneY: number | null;
  private readonly defaultGravity: number;
  /** While entering a scene, listeners go here, to be removed when it ends. */
  private scopedListeners: (() => void)[] | null = null;
  private readonly events = new EventEmitter<GameEvents>();
  private readonly grid: { size: number; color: string } | null;
  private readonly background: string | null;
  /** The size everything works in, in canvas pixels. Not `canvas.width`, which also has the pixel ratio. */
  private readonly view: { width: number; height: number };
  /** Highest pixel ratio to render at. It can be changed at any time. */
  public maxPixelRatio: number;
  private pixelRatio = 1;
  /** The view into the world. Use it to follow the player, set level bounds, zoom or shake. */
  public readonly camera: Camera;
  /** Switches between scenes, such as a menu and levels. Optional: a game can use none. */
  public readonly scenes = new SceneManager(this);
  /** Draws colliders, bodies and sensors over the game. Off until you set `enabled`. */
  public readonly debug: DebugRenderer;
  /** Mouse and touch on the canvas, with positions in pixels and in meters. */
  public readonly pointer: Pointer;
  /** On-screen buttons for touch screens. Off until you set `enabled`. */
  public readonly touch: TouchControls;
  /** Sound effects and music. Music keeps playing across scene changes. */
  public readonly audio = new AudioManager();
  /** Draw between physics steps. It can be changed at any time. */
  public interpolation: boolean;
  private entities: Entity[] = [];
  /** Entities to remove after the current step (removing mid-step would break the loop). */
  private readonly pendingRemovals = new Map<Entity, RemoveReason>();
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private destroyed = false;
  /** True while stepping or drawing: nothing may free physics objects until it ends. */
  private busy = false;
  private clearRequested = false;
  private destroyRequested = false;
  /** The last error logged, so that one failing every frame doesn't flood the console. */
  private lastErrorMessage: string | null = null;
  /** Removes the canvas listeners on `destroy()`. */
  private readonly listeners = new AbortController();

  private constructor(canvas: HTMLCanvasElement, options: GameOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;
    this.defaultGravity = options.gravity ?? 9.81;
    this.world = new RAPIER.World({ x: 0.0, y: -this.defaultGravity });
    this.debug = new DebugRenderer(this.world);
    this.camera = new Camera(options.scale ?? SCALE);
    this.background = options.background ?? null;
    this.interpolation = options.interpolation ?? true;
    this.killPlaneY = options.killPlaneY === undefined ? -30 : options.killPlaneY;
    this.defaultKillPlaneY = this.killPlaneY;
    const grid = options.grid === true ? {} : options.grid || null;
    this.grid = grid && { size: grid.size ?? 1, color: grid.color ?? "rgb(255 255 255 / 0.05)" };

    this.view = { width: canvas.width, height: canvas.height };
    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    this.keepDisplaySize();
    this.syncResolution();
    this.camera.update(0, this.view.width, this.view.height); // so conversions work before start()

    canvas.tabIndex = 0; // focusable, so it can receive keyboard input
    const { signal } = this.listeners;
    this.pointer = new Pointer(canvas, this.view, this.camera, signal);
    this.touch = new TouchControls(canvas, this.view, this.input, this.pointer);
    canvas.addEventListener(
      "pointerdown",
      () => {
        canvas.focus({ preventScroll: true });
        this.audio.unlock();
      },
      { signal },
    );
    canvas.addEventListener(
      "keydown",
      (e) => {
        this.audio.unlock();
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

  /** The canvas size to work with, in pixels, whatever the screen's pixel ratio. */
  public get width(): number {
    return this.view.width;
  }

  public get height(): number {
    return this.view.height;
  }

  /** Changes the size of the game's view, in pixels. */
  public resize(width: number, height: number): void {
    this.view.width = width;
    this.view.height = height;
    this.applyResolution();
    this.camera.update(0, width, height);
  }

  public getWorld(): RAPIER.World {
    return this.world;
  }

  public addEntity(e: Entity): void {
    if (e.isDestroyed) throw new Error("Cannot add an entity that was already destroyed");
    if (e.getGame() !== null) throw new Error("This entity is already in a game");
    this.entities.push(e);
    e.setGame(this);
  }

  /**
   * Removes an entity from the game and frees its physics body. It's safe to call at any
   * time, even from inside `update()` or an event listener: the removal happens right after
   * the current physics step. Removing an entity twice has no effect.
   */
  public removeEntity(e: Entity): void {
    this.queueRemoval(e, "manual");
  }

  /** Changes the kill plane (see `GameOptions.killPlaneY`) until the next `clear()`. */
  public setKillPlane(y: number | null): void {
    this.killPlaneY = y;
  }

  /**
   * Removes every entity, and resets the camera, the gravity and the kill plane. The scene
   * manager calls it on every scene change. No `entityRemoved` events are emitted.
   * Called during a step or a draw (for example, from a listener), it waits for that to end.
   */
  public clear(): void {
    if (this.busy) {
      this.clearRequested = true;
      return;
    }
    this.pendingRemovals.clear();
    for (const e of this.entities.splice(0)) {
      e.setGame(null);
      e.destroy();
    }
    this.camera.reset();
    this.world.gravity.x = 0;
    this.world.gravity.y = -this.defaultGravity;
    this.killPlaneY = this.defaultKillPlaneY;
  }

  /** True while the loop is running. */
  public isRunning(): boolean {
    return this.rafId !== null;
  }

  /** The entities currently in the game. */
  public getEntities(): readonly Entity[] {
    return this.entities;
  }

  /** Subscribes to an event. Inside a scene's `onEnter()`, it lasts until the scene ends. */
  public on<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): () => void {
    const off = this.events.on(event, listener);
    this.scopedListeners?.push(off);
    return off;
  }

  /** @internal Collects the listeners added during `work`, for the scene manager. */
  public collectListeners(work: () => void): (() => void)[] {
    const collected: (() => void)[] = [];
    this.scopedListeners = collected;
    try {
      work();
    } finally {
      this.scopedListeners = null;
    }
    return collected;
  }

  /** Like `on()`, but the listener runs only once. */
  public once<K extends keyof GameEvents>(event: K, listener: Listener<GameEvents[K]>): () => void {
    const off = this.events.once(event, listener);
    this.scopedListeners?.push(off);
    return off;
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
    this.camera.update(0, this.view.width, this.view.height);
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
   * twice has no effect. Called during a step or a draw, it waits for that to end.
   */
  public destroy(): void {
    if (this.destroyed) return;
    if (this.busy) {
      this.destroyRequested = true;
      return;
    }
    this.destroyed = true;
    this.stop();
    this.listeners.abort();
    this.touch.releaseAll();
    this.audio.destroy();
    this.clear(); // destroys the entities, so their components get onDetach()
    this.world.free();
  }

  /** Runs one physics step: update every entity, step the world, then apply removals. */
  private step(): void {
    this.input.setEnabled(this.isFocused());
    for (const e of this.entities) e.savePose();
    if (this.scenes.tick(this.world.timestep)) {
      this.pointer.endStep();
      return; // frozen during a fade out
    }
    this.whileBusy(() => {
      this.scenes.update();
      for (const e of this.entities) {
        e.update();
        e.updateComponents(this.world.timestep);
        e.getSprite()?.animator?.update(this.world.timestep);
      }
      this.world.step();
      this.camera.update(this.world.timestep, this.view.width, this.view.height);

      if (this.killPlaneY !== null) {
        for (const e of this.entities) {
          if (e.getPosition().y < this.killPlaneY) this.queueRemoval(e, "killPlane");
        }
      }
    });
    if (this.destroyed) return;
    if (this.isFocused()) this.input.endStep();
    this.pointer.endStep();
    this.flushRemovals();
    this.scenes.flushInstant();
  }

  /** Runs `work` with physics objects protected, then applies what it asked for. */
  private whileBusy(work: () => void): void {
    this.busy = true;
    try {
      work();
    } finally {
      this.busy = false;
      if (this.destroyRequested) this.destroy();
      else if (this.clearRequested) {
        this.clearRequested = false;
        this.clear();
      }
    }
  }

  /** A failure in game code shouldn't freeze the game: report it and carry on. */
  private guard(work: () => void): void {
    try {
      work();
    } catch (error) {
      const message = String(error);
      if (message !== this.lastErrorMessage) console.error(error);
      this.lastErrorMessage = message;
      try {
        this.events.emit("error", { error });
      } catch (listenerError) {
        console.error(listenerError);
      }
    }
  }

  private queueRemoval(e: Entity, reason: RemoveReason): void {
    if (!this.pendingRemovals.has(e)) this.pendingRemovals.set(e, reason);
    // With the loop stopped (for example, from a click handler), remove right away.
    if (this.rafId === null && !this.busy) this.flushRemovals();
  }

  private flushRemovals(): void {
    if (this.pendingRemovals.size === 0) return;
    const removals = [...this.pendingRemovals];
    this.pendingRemovals.clear();
    for (const [entity, reason] of removals) {
      const index = this.entities.indexOf(entity);
      if (index === -1) continue; // not in this game, or already removed
      this.entities.splice(index, 1);
      entity.setGame(null);
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
      ctx.lineTo(Math.round(px) + 0.5, this.view.height);
    }
    for (let y = Math.floor(view.minY / size) * size; y <= view.maxY; y += size) {
      const { py } = this.camera.worldToScreen(0, y);
      ctx.moveTo(0, Math.round(py) + 0.5);
      ctx.lineTo(this.view.width, Math.round(py) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private readonly loop = (time: number): void => {
    const frameTime = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = time;
    this.accumulator += frameTime;

    const dt = this.world.timestep;
    while (this.accumulator >= dt && !this.destroyed) {
      this.guard(() => this.step());
      this.accumulator -= dt; // even after a failure, or the backlog would grow forever
    }
    if (!this.destroyed) {
      // Removals requested between steps (for example, from a key handler) apply before drawing.
      this.guard(() => this.flushRemovals());
      this.guard(() =>
        this.whileBusy(() => {
          try {
            this.render();
          } finally {
            this.camera.setInterpolation(1); // the pointer and your code read the latest position
          }
        }),
      );
    }
    if (!this.destroyed) this.guard(() => this.events.emit("frame", {}));
    if (this.rafId !== null) this.rafId = requestAnimationFrame(this.loop); // a listener may have stopped it
  };

  /**
   * A canvas without CSS sizing displays at its attribute size, so raising the attributes would
   * enlarge it. Pin that size; one sized by CSS (like `width: 100%`) stays responsive.
   */
  private keepDisplaySize(): void {
    const canvas = this.canvas;
    if (typeof getComputedStyle !== "function" || (canvas.style.width ?? "") !== "") return;
    if (getComputedStyle(canvas).width !== `${canvas.width}px`) return;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }

  private syncResolution(): void {
    const ratio = Math.min(globalThis.devicePixelRatio ?? 1, this.maxPixelRatio);
    if (ratio !== this.pixelRatio || this.canvas.width !== Math.round(this.view.width * ratio)) this.applyResolution();
  }

  private applyResolution(): void {
    this.pixelRatio = Math.min(globalThis.devicePixelRatio ?? 1, this.maxPixelRatio);
    this.canvas.width = Math.round(this.view.width * this.pixelRatio);
    this.canvas.height = Math.round(this.view.height * this.pixelRatio);
  }

  private render(): void {
    this.syncResolution(); // the window may have moved to another screen
    const { width, height } = this.view;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    if (this.background !== null) {
      this.ctx.fillStyle = this.background;
      this.ctx.fillRect(0, 0, width, height);
    }
    // The physics runs behind the screen by less than a step: draw that fraction of the way.
    const alpha = this.interpolation ? Math.min(1, this.accumulator / this.world.timestep) : 1;
    this.camera.setInterpolation(alpha);
    const { scale, centerX, centerY } = this.camera.getViewport();
    if (this.grid !== null) this.drawGrid(this.grid.size, this.grid.color);
    for (const e of this.entities) {
      this.ctx.save(); // a draw that throws can't leave its transform behind
      try {
        e.render(this.ctx, scale, centerX, centerY, alpha);
      } finally {
        this.ctx.restore();
      }
    }
    this.scenes.draw(this.ctx, width, height);
    this.touch.draw(this.ctx);
    this.debug.draw(this.ctx, scale, centerX, centerY);
  }
}
