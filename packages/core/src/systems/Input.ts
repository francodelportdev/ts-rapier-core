/** Estado global del teclado (Singleton). Las teclas se identifican por `KeyboardEvent.code`. */
export class Input {
  private static instance: Input | null = null;
  private readonly keys = new Map<string, boolean>();

  private constructor() {
    window.addEventListener("keydown", (e: KeyboardEvent) => this.keys.set(e.code, true));
    window.addEventListener("keyup", (e: KeyboardEvent) => this.keys.set(e.code, false));
    // Evita teclas "pegadas" al perder el foco de la ventana.
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
