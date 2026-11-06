import type { Game } from "../core/Game";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import type { Scene } from "./Scene";

export interface SceneEvents {
  /** A scene was entered. `from` is null for the first one. */
  change: { from: string | null; to: string };
}

export interface GoOptions {
  /** Passed to the scene's `onEnter()`. */
  data?: unknown;
  /** Length of the fade out, and of the fade in that follows, in seconds. Default: 0 (instant). */
  fade?: number;
}

type SceneFactory = () => Scene<never>;

interface Pending {
  name: string;
  data: unknown;
  fade: number;
}

/**
 * Switches between scenes, at `game.scenes`. Changes wait for the end of the current physics
 * step, so `go()` is safe anywhere, even inside `update()` or an event listener. The physics
 * is frozen during a fade out. While a change is under way, further `go()` calls are ignored.
 */
export class SceneManager {
  private readonly game: Game;
  private readonly factories = new Map<string, SceneFactory>();
  private readonly events = new EventEmitter<SceneEvents>();
  private scene: Scene<never> | null = null;
  private currentName: string | null = null;
  private lastData: unknown;
  private pending: Pending | null = null;
  /** Black overlay opacity, 0 to 1. */
  private alpha = 0;
  private fadeIn = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /** Registers a scene. The factory runs on every entry, so each visit starts fresh. */
  public add<TData>(name: string, factory: () => Scene<TData>): this {
    this.factories.set(name, factory as unknown as SceneFactory);
    return this;
  }

  /** Changes scene. It throws if the name isn't registered. */
  public go(name: string, options: GoOptions = {}): void {
    if (!this.factories.has(name)) throw new Error(`Unknown scene "${name}"`);
    if (this.pending !== null) return;
    this.pending = { name, data: options.data, fade: options.fade ?? 0 };
    if (!this.game.isRunning() && this.pending.fade === 0) this.flush();
  }

  /** Enters the current scene again from the start, with the same data. */
  public restart(options: Omit<GoOptions, "data"> = {}): void {
    if (this.currentName !== null) this.go(this.currentName, { ...options, data: this.lastData });
  }

  /** The current scene, or null before the first `go()`. */
  public get current(): Scene<never> | null {
    return this.scene;
  }

  public get currentSceneName(): string | null {
    return this.currentName;
  }

  public on<K extends keyof SceneEvents>(event: K, listener: Listener<SceneEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** Like `on()`, but the listener runs only once. */
  public once<K extends keyof SceneEvents>(event: K, listener: Listener<SceneEvents[K]>): () => void {
    return this.events.once(event, listener);
  }

  public off<K extends keyof SceneEvents>(event: K, listener: Listener<SceneEvents[K]>): void {
    this.events.off(event, listener);
  }

  /** @internal Ends the current scene for good. Called by `Game` on `destroy()`. */
  public shutdown(): void {
    const scene = this.scene;
    this.pending = null;
    this.scene = null;
    this.currentName = null;
    try {
      scene?.onExit();
    } finally {
      scene?.runCleanups();
    }
  }

  /** @internal Advances fades. Returns true while the physics must stay frozen. */
  public tick(dt: number): boolean {
    if (this.pending !== null && this.pending.fade > 0) {
      this.alpha = Math.min(1, this.alpha + dt / this.pending.fade);
      if (this.alpha === 1) {
        this.fadeIn = this.pending.fade;
        this.flush();
      }
      return true;
    }
    if (this.alpha > 0) this.alpha = Math.max(0, this.alpha - dt / this.fadeIn);
    return false;
  }

  /** @internal Applies a pending instant change. Called at the end of each step. */
  public flushInstant(): void {
    if (this.pending !== null && this.pending.fade === 0) this.flush();
  }

  /** @internal */
  public update(): void {
    this.scene?.update();
  }

  /** @internal */
  public draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.scene?.draw(ctx, width, height);
    if (this.alpha > 0) {
      ctx.fillStyle = `rgb(0 0 0 / ${this.alpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private flush(): void {
    const next = this.pending;
    if (next === null) return;
    this.pending = null;
    const from = this.currentName;
    this.scene?.onExit();
    this.scene?.runCleanups();
    this.game.clear();

    const scene = this.factories.get(next.name)!();
    scene.game = this.game;
    this.scene = scene;
    this.currentName = next.name;
    this.lastData = next.data;
    const listeners = this.game.collectListeners(() => scene.onEnter(next.data as never));
    for (const off of listeners) scene["listen"](off);
    this.game.camera.snapToTarget();
    this.events.emit("change", { from, to: next.name });
  }
}
