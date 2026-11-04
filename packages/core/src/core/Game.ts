import RAPIER from "@dimforge/rapier2d-compat";
import type { Entity } from "../entities/Entity";
import { ESCALA } from "./constants";

/**
 * Punto de entrada del motor. Rapier (WASM) debe inicializarse antes de crear el mundo,
 * por eso se construye con `await Game.create(canvas)`.
 */
export class Game {
  private readonly world: RAPIER.World;
  private readonly ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private rafId: number | null = null;

  private constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("No se pudo obtener el contexto 2D del canvas");
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
    for (const e of this.entities) e.draw(this.ctx, ESCALA, width / 2, height / 2);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
