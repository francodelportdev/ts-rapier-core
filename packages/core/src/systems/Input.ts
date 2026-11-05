/**
 * Global keyboard state (Singleton). Keys are identified by `KeyboardEvent.code`.
 *
 * When several games share a page, `Game` enables input only while its canvas has focus,
 * so a key press moves only the focused game.
 */
export class Input {
  private static instance: Input | null = null;
  private readonly keys = new Map<string, boolean>();
  /** Keys pressed since the last step, so a tap between two steps still counts. */
  private readonly taps = new Set<string>();
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
    });
    // Taps made while another element had focus shouldn't reach a game later.
    window.addEventListener("focusin", () => this.taps.clear());
  }

  public static getInstance(): Input {
    if (Input.instance === null) Input.instance = new Input();
    return Input.instance;
  }

  public isPressed(code: string): boolean {
    return this.enabled && ((this.keys.get(code) ?? false) || this.taps.has(code));
  }

  /** True if any of the given keys is pressed. */
  public isAnyPressed(codes: readonly string[]): boolean {
    return codes.some((code) => this.isPressed(code));
  }

  /** Called by `Game` after each step of the focused game: a tap lasts for one step. */
  public endStep(): void {
    this.taps.clear();
  }

  /** While disabled, every key reads as not pressed. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
