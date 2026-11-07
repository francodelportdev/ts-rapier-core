import type { Input } from "./Input";

/**
 * The actions and keys an input source holds down from code, such as on-screen buttons or a
 * gamepad. Each frame, the source says what it wants held, and this presses and releases the rest.
 */
export class HeldKeys {
  private readonly held = new Set<string>();
  private readonly input: Input;

  constructor(input: Input) {
    this.input = input;
  }

  public has(name: string): boolean {
    return this.held.has(name);
  }

  /** Holds exactly `wanted`. Returns true if something new was pressed. */
  public sync(wanted: ReadonlySet<string>): boolean {
    for (const name of [...this.held]) {
      if (wanted.has(name)) continue;
      this.held.delete(name);
      this.input.release(name);
    }
    let pressed = false;
    for (const name of wanted) {
      if (this.held.has(name) && this.input.isHeld(name)) continue; // losing window focus lifts keys
      this.held.add(name);
      this.input.press(name);
      pressed = true;
    }
    return pressed;
  }

  public releaseAll(): void {
    for (const name of this.held) this.input.release(name);
    this.held.clear();
  }
}
