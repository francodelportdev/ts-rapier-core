import type { Camera } from "../core/Camera";
import { EventEmitter, type Listener } from "./EventEmitter";

/** One finger, or the mouse. Positions are in canvas pixels and in world meters. */
export interface PointerInfo {
  id: number;
  /** "mouse", "touch" or "pen". */
  type: string;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

export interface PointerEvents {
  down: PointerInfo;
  move: PointerInfo;
  up: PointerInfo;
}

/**
 * Mouse and touch on the game's canvas, at `game.pointer`. Both work the same way, and
 * positions already account for CSS scaling and the camera. Several fingers are tracked at once.
 */
export class Pointer {
  private readonly canvas: HTMLCanvasElement;
  private readonly view: { width: number; height: number };
  private readonly camera: Camera;
  private readonly events = new EventEmitter<PointerEvents>();
  private readonly active = new Map<number, { x: number; y: number; type: string }>();
  private last = { x: 0, y: 0 };
  private pressed = false;
  private released = false;

  constructor(canvas: HTMLCanvasElement, view: { width: number; height: number }, camera: Camera, signal: AbortSignal) {
    this.canvas = canvas;
    this.view = view;
    this.camera = camera;
    // The finger controls the game here, not the page: no scrolling or zooming from the canvas.
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this.onDown(e), { signal });
    canvas.addEventListener("pointermove", (e) => this.onMove(e), { signal });
    canvas.addEventListener("pointerup", (e) => this.onUp(e), { signal });
    canvas.addEventListener("pointercancel", (e) => this.onUp(e), { signal });
  }

  /** Where the pointer is, or was last, in canvas pixels. */
  public get x(): number {
    return this.last.x;
  }

  public get y(): number {
    return this.last.y;
  }

  /** The same position, in world meters. It follows the camera. */
  public get world(): { x: number; y: number } {
    return this.camera.screenToWorld(this.last.x, this.last.y);
  }

  /** True while any button or finger is down. */
  public get isDown(): boolean {
    return this.active.size > 0;
  }

  /** True during the step after a press. */
  public wasPressed(): boolean {
    return this.pressed;
  }

  /** True during the step after a release. */
  public wasReleased(): boolean {
    return this.released;
  }

  /** Everything touching the canvas right now. */
  public getActive(): PointerInfo[] {
    return [...this.active].map(([id, p]) => this.info(id, p.x, p.y, p.type));
  }

  public on<K extends keyof PointerEvents>(event: K, listener: Listener<PointerEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** Like `on()`, but the listener runs only once. */
  public once<K extends keyof PointerEvents>(event: K, listener: Listener<PointerEvents[K]>): () => void {
    return this.events.once(event, listener);
  }

  public off<K extends keyof PointerEvents>(event: K, listener: Listener<PointerEvents[K]>): void {
    this.events.off(event, listener);
  }

  /** @internal Called by `Game` after each step. */
  public endStep(): void {
    this.pressed = false;
    this.released = false;
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId); // keep receiving it outside the canvas
    const p = this.toCanvas(e);
    this.active.set(e.pointerId, { ...p, type: e.pointerType });
    this.last = p;
    this.pressed = true;
    this.events.emit("down", this.info(e.pointerId, p.x, p.y, e.pointerType));
  }

  private onMove(e: PointerEvent): void {
    const p = this.toCanvas(e);
    this.last = p;
    if (this.active.has(e.pointerId)) this.active.set(e.pointerId, { ...p, type: e.pointerType });
    this.events.emit("move", this.info(e.pointerId, p.x, p.y, e.pointerType));
  }

  private onUp(e: PointerEvent): void {
    if (!this.active.delete(e.pointerId)) return;
    const p = this.toCanvas(e);
    this.last = p;
    this.released = true;
    this.events.emit("up", this.info(e.pointerId, p.x, p.y, e.pointerType));
  }

  /** Page position → canvas pixels (the canvas may be scaled by CSS). */
  private toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.view.width,
      y: ((e.clientY - rect.top) / rect.height) * this.view.height,
    };
  }

  private info(id: number, x: number, y: number, type: string): PointerInfo {
    const world = this.camera.screenToWorld(x, y);
    return { id, type, x, y, worldX: world.x, worldY: world.y };
  }
}
