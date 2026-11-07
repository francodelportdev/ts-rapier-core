import { DEFAULT_ACTION_KEYS, type ControlAction } from "./actions";

/**
 * Global input state (Singleton). Keys are identified by `KeyboardEvent.code`. Actions, such as
 * "jump", are what the game asks for: the keyboard, on-screen buttons and gamepads all reach them.
 *
 * When several games share a page, `Game` enables input only while its canvas has focus,
 * so a key press moves only the focused game.
 */
export class Input {
  private static instance: Input | null = null;
  private readonly keys = new Map<string, boolean>();
  /** Actions and keys held from code, such as on-screen buttons and gamepads. */
  private readonly virtual = new Set<string>();
  /** The keyboard keys of each action. */
  private actionKeys: Readonly<Record<ControlAction, readonly string[]>> = DEFAULT_ACTION_KEYS;
  /** Keys pressed since the last step, so a tap between two steps still counts. */
  private readonly taps = new Set<string>();
  private readonly virtualTaps = new Set<string>();
  private enabled = true;

  private constructor() {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      this.keys.set(e.code, true);
      this.taps.add(e.code);
    });
    window.addEventListener("keyup", (e: KeyboardEvent) => this.keys.set(e.code, false));
    // Prevent "stuck" keys when the window loses focus.
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.taps.clear();
      this.virtualTaps.clear();
      this.virtual.clear();
    });
    // Taps made while another element had focus shouldn't reach a game later.
    window.addEventListener("focusin", () => this.taps.clear());
  }

  public static getInstance(): Input {
    if (Input.instance === null) Input.instance = new Input();
    return Input.instance;
  }

  /** True if a key is pressed, on the keyboard or from code. */
  public isPressed(code: string): boolean {
    if (!this.enabled) return false;
    return this.isHeld(code) || (this.keys.get(code) ?? false) || this.taps.has(code);
  }

  /** True if any of the given keys is pressed. */
  public isAnyPressed(codes: readonly string[]): boolean {
    return codes.some((code) => this.isPressed(code));
  }

  /**
   * True if an action is requested by any input. `keys` replaces the action's keyboard keys,
   * for a player with its own.
   */
  public isAction(action: ControlAction, keys: readonly string[] = this.actionKeys[action]): boolean {
    return this.enabled && (this.isHeld(action) || this.isAnyPressed(keys));
  }

  /** Holds an action or a key from code. On-screen buttons and gamepads use it. */
  public press(name: string): void {
    this.virtual.add(name);
    this.virtualTaps.add(name);
  }

  public release(name: string): void {
    this.virtual.delete(name);
  }

  /** True if an action or a key is held from code. */
  public isHeld(name: string): boolean {
    return this.virtual.has(name) || this.virtualTaps.has(name);
  }

  /** Changes the keyboard keys of the actions. `Controls` builds this for you. */
  public setActionKeys(keys: Readonly<Record<ControlAction, readonly string[]>>): void {
    this.actionKeys = keys;
  }

  /** Called by `Game` after each step of the focused game: a tap lasts for one step. */
  public endStep(): void {
    this.taps.clear();
    this.virtualTaps.clear();
  }

  /** While disabled, every key reads as not pressed. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
