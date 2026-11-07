import type RAPIER from "@dimforge/rapier2d-compat";
import type { Game } from "../core/Game";

/**
 * One screen of the game: a menu, a level, a game-over screen. On entering, it builds its
 * entities with `this.game`. On leaving, the game removes every entity and resets the camera,
 * so a scene only has to clean up what it created outside the game.
 */
export abstract class Scene<TData = void> {
  /** Set by the scene manager before `onEnter()`. */
  public game!: Game;
  private readonly cleanups: (() => void)[] = [];

  protected get world(): RAPIER.World {
    return this.game.getWorld();
  }

  /**
   * Keeps a subscription until the scene ends: `this.listen(health.on("death", ...))`.
   * `this.game.on()` inside `onEnter()` is already handled.
   */
  protected listen(off: () => void): void {
    this.cleanups.push(off);
  }

  /** @internal Called by the scene manager when the scene ends. */
  public runCleanups(): void {
    for (const off of this.cleanups.splice(0)) off();
  }

  /** Builds the scene. `data` is what `game.scenes.go()` received. */
  public abstract onEnter(data: TData): void;

  /** Runs just before the scene's entities are removed. */
  public onExit(): void {}

  /** Runs once per physics step, before the entities update. `dt` is in seconds. */
  public update(_dt: number): void {}

  /** Runs after the entities are drawn, in canvas pixels. For menus and HUDs. */
  public draw(_ctx: CanvasRenderingContext2D, _width: number, _height: number): void {}
}
