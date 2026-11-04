/** Global keyboard state (Singleton). Keys are identified by `KeyboardEvent.code`. */
export class Input {
  private static instance: Input | null = null;
  private readonly keys = new Map<string, boolean>();

  private constructor() {
    window.addEventListener("keydown", (e: KeyboardEvent) => this.keys.set(e.code, true));
    window.addEventListener("keyup", (e: KeyboardEvent) => this.keys.set(e.code, false));
    // Prevent "stuck" keys when the window loses focus.
    window.addEventListener("blur", () => this.keys.clear());
  }

  public static getInstance(): Input {
    if (Input.instance === null) Input.instance = new Input();
    return Input.instance;
  }

  public isPressed(code: string): boolean {
    return this.keys.get(code) ?? false;
  }
}
