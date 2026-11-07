import RAPIER from "@dimforge/rapier2d-compat";
import type { Sprite } from "../animation/Sprite";
import type { Component, ComponentType } from "../components/Component";
import type { Game } from "../core/Game";
import { registerEntity, unregisterEntity } from "../systems/entityRegistry";
import { ALL_LAYERS, toInteractionGroups, type CollisionFilter } from "../systems/layers";
import { CONTACT_TYPES } from "../systems/Contacts";

/**
 * Stands in for the body of a destroyed entity. Rapier panics inside WebAssembly when a removed
 * body is used, which breaks its memory for everything after, so this throws a clear error first.
 */
const DESTROYED_BODY = new Proxy({} as RAPIER.RigidBody, {
  get(_, key) {
    if (typeof key === "symbol" || key === "then") return undefined; // inspection and promise checks
    throw new Error(`This entity was destroyed, so its physics body is gone (it tried to use "${key}")`);
  },
});

/** Moving further than this in one step, in meters, is a teleport: it isn't interpolated. */
const MAX_INTERPOLATED_STEP = 2;

/**
 * Base class for every physics entity. Works in meters (Rapier, Y axis up);
 * conversion to pixels (Y axis down) happens only in `draw` via `toCanvas`.
 */
export abstract class Entity<TOptions extends object = object> {
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;
  /** Constructor options. Set before `createBody()` runs, so it is safe to read there. */
  protected readonly options: TOptions;
  private destroyed = false;
  /** Where the body was before the current physics step, to draw between the two. */
  private previousPose: { x: number; y: number; angle: number } | null = null;
  /** Where the body was when the entity was destroyed. */
  private finalPose: { x: number; y: number; angle: number } | null = null;
  private sprite: Sprite | null = null;
  private readonly components = new Map<ComponentType<Component>, Component>();
  private game: Game | null = null;
  private collision: CollisionFilter = { layers: ALL_LAYERS, mask: ALL_LAYERS };
  private static nextContactId = 0;
  /** @internal Orders pairs of touching entities. */
  public readonly contactId = Entity.nextContactId++;

  constructor(world: RAPIER.World, options: TOptions = {} as TOptions) {
    this.world = world;
    this.options = options;
    this.body = this.createBody();
    this.createCollider();
    for (let i = 0; i < this.body.numColliders(); i++) {
      const collider = this.body.collider(i);
      registerEntity(world, collider, this as unknown as Entity);
      if (collider.isSensor()) continue; // sensors report through their own events
      collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      collider.setActiveCollisionTypes(CONTACT_TYPES);
    }
    const { collision } = options as { collision?: CollisionFilter };
    if (collision !== undefined) this.setCollision(collision);
  }

  /** Attaches a component and returns it. It throws if the entity already has one of that class. */
  public add<T extends Component>(component: T): T {
    const type = component.constructor as ComponentType<Component>;
    if (this.components.has(type)) throw new Error(`The entity already has a ${type.name}`);
    this.components.set(type, component);
    component.entity = this as unknown as Entity;
    try {
      component.onAttach();
    } catch (error) {
      this.components.delete(type);
      throw error;
    }
    return component;
  }

  /** The component of that exact class, or undefined. */
  public get<T extends Component>(type: ComponentType<T>): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  public has(type: ComponentType<Component>): boolean {
    return this.components.has(type);
  }

  /** Detaches a component. Removing one the entity doesn't have does nothing. */
  public remove(type: ComponentType<Component>): void {
    const component = this.components.get(type);
    if (component === undefined) return;
    this.components.delete(type);
    component.onDetach();
  }

  /** Runs once per physics step, before the physics moves. `dt` is in seconds. Optional. */
  public update(_dt: number): void {}

  /** Runs when it starts touching another entity in the game. Sensors don't count. */
  public onCollisionStart(_other: Entity): void {}

  /** Runs when it stops touching another entity, or when either one leaves the game. */
  public onCollisionEnd(_other: Entity): void {}

  /** @internal Called by `Game`: runs the hooks of the entity, then of its components. */
  public notifyCollision(other: Entity, started: boolean): void {
    if (started) this.onCollisionStart(other);
    else this.onCollisionEnd(other);
    for (const component of [...this.components.values()]) {
      if (started) component.onCollisionStart(other);
      else component.onCollisionEnd(other);
    }
  }

  /** @internal Entities touched in a way Rapier doesn't report, such as by a character controller. */
  public collectContacts(): readonly Entity[] {
    return [];
  }

  /** Called by `Game` every physics step. */
  public updateComponents(dt: number): void {
    for (const component of this.components.values()) component.update(dt); // a Map allows removing while iterating
  }

  /** The Rapier body, for components and anything the engine doesn't wrap. Once destroyed, using it throws. */
  public getBody(): RAPIER.RigidBody {
    return this.body;
  }

  /** The game this entity was added to, or null. */
  public getGame(): Game | null {
    return this.game;
  }

  /** @internal Called by `Game`. */
  public setGame(game: Game | null): void {
    this.game = game;
  }

  /** Shows an image instead of `draw()`. `null` goes back to `draw()`. */
  public setSprite(sprite: Sprite | null): void {
    this.sprite = sprite;
  }

  public getSprite(): Sprite | null {
    return this.sprite;
  }

  /** @internal Called by `Game` before each physics step. */
  public savePose(): void {
    const { x, y } = this.body.translation();
    this.previousPose = { x, y, angle: this.body.rotation() };
  }

  /**
   * Moves the canvas from where the body is to where it should appear, `alpha` of the way from
   * its previous pose. Working on the canvas means `draw()`, sprites and components need no changes.
   */
  private applyInterpolation(ctx: CanvasRenderingContext2D, alpha: number, scale: number, centerX: number, centerY: number): void {
    const previous = this.previousPose;
    if (alpha >= 1 || previous === null) return;
    const t = this.body.translation();
    const dx = (previous.x - t.x) * (1 - alpha);
    const dy = (previous.y - t.y) * (1 - alpha);
    if (Math.hypot(previous.x - t.x, previous.y - t.y) > MAX_INTERPOLATED_STEP) return; // a teleport
    let turn = previous.angle - this.body.rotation();
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - alpha); // the short way around
    ctx.translate(dx * scale, -dy * scale);
    if (turn !== 0) {
      const px = centerX + t.x * scale;
      const py = centerY - t.y * scale;
      ctx.translate(px, py);
      ctx.rotate(-turn);
      ctx.translate(-px, -py);
    }
  }

  /**
   * Called by `Game` every frame: draws the sprite if there is one, and `draw()` otherwise.
   * `alpha` is how far the frame is between the last two physics steps.
   */
  public render(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number, alpha = 1): void {
    this.applyInterpolation(ctx, alpha, scale, centerX, centerY);
    if (this.sprite === null) {
      this.draw(ctx, scale, centerX, centerY);
    } else {
      const t = this.body.translation();
      const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);
      this.sprite.draw(ctx, px, py, this.body.rotation(), scale);
    }
    for (const component of this.components.values()) component.draw(ctx, scale, centerX, centerY);
  }

  /** Changes what this entity is and what it collides with. It can be called at any time. */
  public setCollision(filter: CollisionFilter): void {
    this.collision = filter;
    const groups = toInteractionGroups(filter);
    for (let i = 0; i < this.body.numColliders(); i++) this.body.collider(i).setCollisionGroups(groups);
    this.body.wakeUp(); // a sleeping body wouldn't notice its new contacts
  }

  public getCollision(): CollisionFilter {
    return this.collision;
  }

  /** True for entities that handle falling by themselves, so the kill plane leaves them alone. */
  public get survivesKillPlane(): boolean {
    return false;
  }

  /** True once `destroy()` has run. A destroyed entity must not be updated or drawn. */
  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Center of the body, in meters. Once destroyed, where it was then. */
  public getPosition(): { x: number; y: number } {
    if (this.finalPose !== null) return { x: this.finalPose.x, y: this.finalPose.y };
    const t = this.body.translation();
    return { x: t.x, y: t.y };
  }

  /**
   * Moves it to a point at once, in meters: a teleport, so it isn't drawn sliding there. The camera
   * smooths its way to it, unless you call `game.camera.snapToTarget()`.
   */
  public setPosition(x: number, y: number): void {
    this.body.setTranslation({ x, y }, true);
    this.previousPose = null;
  }

  /** Velocity, in m/s. Kinematic bodies moved by code, such as with `Patrol`, report 0. */
  public getVelocity(): { x: number; y: number } {
    const v = this.body.linvel();
    return { x: v.x, y: v.y };
  }

  /** Sets the velocity, in m/s. It moves dynamic bodies, and the player; other bodies ignore it. */
  public setVelocity(x: number, y: number): void {
    this.body.setLinvel({ x, y }, true);
  }

  /** Rotation in radians, counterclockwise. Once destroyed, the rotation it had then. */
  public getAngle(): number {
    return this.finalPose?.angle ?? this.body.rotation();
  }

  /**
   * Removes the body and its colliders from the physics world, freeing their memory.
   * In a game, this is the same as `game.removeEntity()`, so it may wait for the current step
   * to end. Calling it twice has no effect.
   */
  public destroy(): void {
    if (this.destroyed) return;
    if (this.game !== null) {
      this.game.removeEntity(this as unknown as Entity);
      return;
    }
    for (const type of [...this.components.keys()]) this.remove(type);
    this.onDestroy();
    for (let i = 0; i < this.body.numColliders(); i++) unregisterEntity(this.world, this.body.collider(i));
    const { x, y } = this.body.translation();
    this.finalPose = { x, y, angle: this.body.rotation() };
    this.world.removeRigidBody(this.body); // also removes the colliders attached to it
    this.body = DESTROYED_BODY;
    this.destroyed = true;
  }

  /** Override to free extra Rapier objects (for example, a character controller). */
  protected onDestroy(): void {}

  protected abstract createBody(): RAPIER.RigidBody;
  protected abstract createCollider(): RAPIER.Collider;
  public abstract draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void;

  /** Meters (world) → pixels (canvas). */
  protected toCanvas(x: number, y: number, scale: number, centerX: number, centerY: number): { px: number; py: number } {
    return { px: centerX + x * scale, py: centerY - y * scale };
  }

  /** Draws a rectangle centered on the body, rotated by its angle. */
  protected drawCuboid(
    ctx: CanvasRenderingContext2D, halfW: number, halfH: number, color: string,
    scale: number, centerX: number, centerY: number,
  ): void {
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);
    const w = halfW * 2 * scale;
    const h = halfH * 2 * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.body.rotation()); // canvas Y is flipped → flip rotation
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
