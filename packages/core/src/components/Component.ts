import type { Entity } from "../entities/Entity";

/** A class that can be passed to `entity.get()`, even an abstract one. */
export type ComponentType<T extends Component> = abstract new (...args: never[]) => T;

/**
 * A reusable piece of behavior that attaches to any entity. `Game` updates it every physics
 * step, after the entity's own `update()`.
 *
 * ```ts
 * class Spin extends Component {
 *   update(dt: number) { this.entity.getBody().setRotation(this.entity.getBody().rotation() + dt, true); }
 * }
 * crate.add(new Spin());
 * ```
 */
export abstract class Component {
  /** The entity it's attached to. Set before `onAttach()`. */
  public entity!: Entity;

  /** Runs when added to an entity. */
  public onAttach(): void {}

  /** Runs when removed, and when its entity is destroyed. */
  public onDetach(): void {}

  /** Runs once per physics step. `dt` is in seconds. */
  public update(_dt: number): void {}

  /** Runs after the entity is drawn, with the same arguments as `Entity.draw()`. */
  public draw(_ctx: CanvasRenderingContext2D, _scale: number, _centerX: number, _centerY: number): void {}
}
