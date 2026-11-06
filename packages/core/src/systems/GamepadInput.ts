import type { Input } from "./Input";

/** Which controls press which keys. Buttons and axes are numbers as the browser reports them. */
export interface GamepadMapping {
  /** Key (`KeyboardEvent.code`) → buttons that press it. */
  buttons: Record<string, readonly number[]>;
  /** Pairs of axes that work as left/right and up/down, such as a stick or a D-pad. */
  moveAxes: readonly (readonly [number, number])[];
  /** Key → single axis directions that press it. */
  axes?: Record<string, readonly { axis: number; direction: 1 | -1 }[]>;
  /** Keys for the four directions of `moveAxes`. */
  directions: { left: string; right: string; up: string; down: string };
}

/** For pads the browser reports as "standard": A, X and the D-pad. */
const DEFAULT_MAPPING: GamepadMapping = {
  buttons: { Space: [0], KeyX: [2], ArrowUp: [], ArrowLeft: [14], ArrowRight: [15], ArrowDown: [13] },
  moveAxes: [[0, 1]],
  directions: { left: "ArrowLeft", right: "ArrowRight", up: "", down: "ArrowDown" },
};

/** What the browser reports right now. Useful to find a pad's button numbers. */
export interface GamepadSnapshot {
  id: string;
  /** "standard", or "" for pads with their own layout. */
  mapping: string;
  /** Numbers of the buttons being pressed. */
  pressed: number[];
  axes: number[];
}

/**
 * A physical gamepad, at `game.gamepad`. Like the on-screen buttons, it presses keyboard keys,
 * so `Player` works unchanged. Off until you set `enabled`. Browsers reveal a pad only after a
 * button is pressed on it.
 */
export class GamepadInput {
  /** Turns it on. */
  public enabled = false;
  /** How far an axis must move to count, from 0 to 1. Default: 0.3. */
  public deadZone = 0.3;
  private mapping: GamepadMapping = DEFAULT_MAPPING;
  private readonly held = new Set<string>();
  private readonly input: Input;

  constructor(input: Input) {
    this.input = input;
  }

  /** Changes what's mapped, keeping whatever isn't given. */
  public setMapping(mapping: Partial<GamepadMapping>): void {
    this.releaseAll();
    this.mapping = { ...this.mapping, ...mapping };
  }

  /** The first connected pad, or null. */
  public getState(): GamepadSnapshot | null {
    const pad = this.pad();
    if (pad === null) return null;
    return {
      id: pad.id,
      mapping: pad.mapping,
      pressed: pad.buttons.flatMap((button, i) => (button.pressed ? [i] : [])),
      axes: [...pad.axes],
    };
  }

  public get isConnected(): boolean {
    return this.pad() !== null;
  }

  /** Rumbles the pad, on pads and browsers that allow it. `strength` goes from 0 to 1. */
  public vibrate(seconds: number, strength = 1): void {
    void this.pad()?.vibrationActuator?.playEffect("dual-rumble", {
      duration: seconds * 1000,
      strongMagnitude: strength,
      weakMagnitude: strength,
    });
  }

  /** @internal Called by `Game` before each step of the focused game. Returns true on a new press. */
  public poll(): boolean {
    const pad = this.enabled ? this.pad() : null;
    if (pad === null) {
      this.releaseAll();
      return false;
    }
    const wanted = this.wantedKeys(pad);
    for (const key of [...this.held]) {
      if (wanted.has(key)) continue;
      this.held.delete(key);
      this.input.release(key);
    }
    let pressed = false;
    for (const key of wanted) {
      if (this.held.has(key) && this.input.isAnyHeldFromCode([key])) continue; // losing window focus lifts keys
      this.held.add(key);
      this.input.press(key);
      pressed = true;
    }
    return pressed;
  }

  /** @internal Lifts every key the pad is holding. */
  public releaseAll(): void {
    for (const key of this.held) this.input.release(key);
    this.held.clear();
  }

  private wantedKeys(pad: Gamepad): Set<string> {
    const { buttons, moveAxes, directions, axes = {} } = this.mapping;
    const wanted = new Set<string>();
    for (const [key, numbers] of Object.entries(buttons)) {
      if (numbers.some((n) => pad.buttons[n]?.pressed)) wanted.add(key);
    }
    for (const [horizontal, vertical] of moveAxes) {
      const x = pad.axes[horizontal] ?? 0;
      const y = pad.axes[vertical] ?? 0;
      if (x < -this.deadZone) wanted.add(directions.left);
      if (x > this.deadZone) wanted.add(directions.right);
      if (y < -this.deadZone) wanted.add(directions.up);
      if (y > this.deadZone) wanted.add(directions.down);
    }
    for (const [key, list] of Object.entries(axes)) {
      if (list.some(({ axis, direction }) => (pad.axes[axis] ?? 0) * direction > this.deadZone)) wanted.add(key);
    }
    wanted.delete("");
    return wanted;
  }

  private pad(): Gamepad | null {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    return navigator.getGamepads().find((pad) => pad !== null && pad.connected) ?? null;
  }
}
