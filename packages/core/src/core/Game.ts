import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { SCALE } from "./constants";

/**
 * Engine entry point. Rapier (WASM) must be initialized before creating the world,
 * so it is constructed with `await Game.create(canvas)`.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly world: RAPIER.World;
  private readonly ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private rafId: number | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not get 2D canvas context");
    this.ctx = ctx;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81 });
  }

  public static async create(canvas: HTMLCanvasElement): Promise<Game> {
    await RAPIER.init();
    return new Game(canvas);
  }

  public getWorld(): RAPIER.World {
    return this.world;
  }

  public addEntity(e: Entity): void {
    this.entities.push(e);
  }

  public start(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readonly loop = (): void => {
    for (const e of this.entities) e.update();
    this.world.step();

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    for (const e of this.entities) e.draw(this.ctx, SCALE, width / 2, height / 2);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
