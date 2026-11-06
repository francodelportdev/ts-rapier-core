import type { Input } from "./Input";
import type { Pointer } from "./Pointer";

/** A round on-screen button that holds a key while touched. */
export interface TouchButton {
  /** The `KeyboardEvent.code` it presses. */
  key: string;
  label: string;
  /** Center, in canvas pixels. Negative values count from the right or bottom edge. */
  x: number;
  y: number;
  /** Default: 32. */
  radius?: number;
}

const LAYOUT: readonly TouchButton[] = [
  { key: "ArrowLeft", label: "←", x: 42, y: -42 },
  { key: "ArrowRight", label: "→", x: 116, y: -42 },
  { key: "Space", label: "↑", x: -42, y: -42 },
];

/**
 * On-screen buttons for touch screens, at `game.touch`. They press the same keys as the
 * keyboard, so `Player` and your own code work unchanged. Off until you set `enabled`, and then
 * hidden until the first touch, unless `alwaysVisible` is on.
 */
export class TouchControls {
  /** Turns them on. */
  public enabled = false;
  /** Show them even before a touch. Mouse clicks also press them. */
  public alwaysVisible = false;
  private buttons: readonly TouchButton[] = LAYOUT;
  private readonly held = new Set<string>();
  private touched = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly view: { width: number; height: number };
  private readonly input: Input;
  private readonly pointer: Pointer;

  constructor(canvas: HTMLCanvasElement, view: { width: number; height: number }, input: Input, pointer: Pointer) {
    this.canvas = canvas;
    this.view = view;
    this.input = input;
    this.pointer = pointer;
    const sync = () => this.sync();
    pointer.on("down", ({ type }) => {
      if (type === "touch") this.touched = true;
      sync();
    });
    pointer.on("move", sync);
    pointer.on("up", sync);
  }

  /** Replaces the buttons. The default is ←, → and jump. */
  public setButtons(buttons: readonly TouchButton[]): void {
    this.releaseAll();
    this.buttons = buttons;
  }

  /** Adds a button to the current ones. */
  public addButton(button: TouchButton): void {
    this.buttons = [...this.buttons, button];
  }

  /** True if the buttons are on screen and reacting. */
  public get isVisible(): boolean {
    return this.enabled && (this.touched || this.alwaysVisible);
  }

  /** @internal Lifts every key the buttons are holding. */
  public releaseAll(): void {
    for (const key of this.held) this.input.release(key);
    this.held.clear();
  }

  /** Presses the buttons under a pointer, and lifts the others. A finger can slide between them. */
  private sync(): void {
    if (!this.isVisible) return this.releaseAll();
    const wanted = new Set<string>();
    for (const p of this.pointer.getActive()) {
      for (const button of this.buttons) {
        const { x, y, radius } = this.layout(button);
        if (Math.hypot(p.x - x, p.y - y) <= radius) wanted.add(button.key);
      }
    }
    for (const key of [...this.held]) {
      if (wanted.has(key)) continue;
      this.held.delete(key);
      this.input.release(key);
    }
    for (const key of wanted) {
      if (this.held.has(key)) continue;
      this.held.add(key);
      this.input.press(key);
    }
  }

  /**
   * Where a button goes, in canvas pixels. On a canvas shrunk by CSS, as on a phone, buttons grow
   * to compensate, so they stay big enough for a finger.
   */
  private layout(button: TouchButton): { x: number; y: number; radius: number } {
    const shrink = Math.max(1, this.view.width / this.canvas.getBoundingClientRect().width);
    return {
      x: button.x < 0 ? this.view.width + button.x * shrink : button.x * shrink,
      y: button.y < 0 ? this.view.height + button.y * shrink : button.y * shrink,
      radius: (button.radius ?? 32) * shrink,
    };
  }

  /** @internal Called by `Game` after everything else. */
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.isVisible) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const button of this.buttons) {
      const { x, y, radius } = this.layout(button);
      ctx.font = `bold ${Math.round(radius * 0.7)}px system-ui`;
      ctx.fillStyle = this.held.has(button.key) ? "rgb(255 255 255 / 0.4)" : "rgb(255 255 255 / 0.15)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgb(255 255 255 / 0.8)";
      ctx.fillText(button.label, x, y);
    }
    ctx.restore();
  }
}
