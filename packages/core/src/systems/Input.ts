/**
 * Global keyboard state (Singleton). Keys are identified by `KeyboardEvent.code`.
 *
 * When several games share a page, `Game` enables input only while its canvas has focus,
 * so a key press moves only the focused game.
 */
export class Input {
  private static instance: Input | null = null;
  private readonly keys = new Map<string, boolean>();
  /** Keys held from code, such as on-screen buttons and gamepads. Bindings don't apply to them. */
  private readonly virtual = new Set<string>();
  /** Game key → physical keys that trigger it, when remapped. */
  private bindings = new Map<string, readonly string[]>();
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

  public isPressed(code: string): boolean {
    if (!this.enabled) return false;
    if (this.virtual.has(code) || this.virtualTaps.has(code)) return true;
    const physical = this.bindings.get(code) ?? [code];
    return physical.some((c) => (this.keys.get(c) ?? false) || this.taps.has(c));
  }

  /** True if any of the given keys is pressed. */
  public isAnyPressed(codes: readonly string[]): boolean {
    return codes.some((code) => this.isPressed(code));
  }

  /** True if any of the keys is held from code, by on-screen buttons or a gamepad. */
  public isAnyHeldFromCode(codes: readonly string[]): boolean {
    return this.enabled && codes.some((code) => this.virtual.has(code) || this.virtualTaps.has(code));
  }

  /** Holds a key from code, as if it were pressed on the keyboard. On-screen buttons use it. */
  public press(code: string): void {
    this.virtual.add(code);
    this.virtualTaps.add(code);
  }

  public release(code: string): void {
    this.virtual.delete(code);
  }

  /**
   * Remaps the keyboard: each game key is triggered only by the physical keys listed for it.
   * Keys not listed work as usual. `Controls` builds this for you.
   */
  public setBindings(bindings: Record<string, readonly string[]>): void {
    this.bindings = new Map(Object.entries(bindings));
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
