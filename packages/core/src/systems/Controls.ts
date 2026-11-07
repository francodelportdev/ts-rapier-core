import type { Game } from "../core/Game";
import { EventEmitter, type Listener } from "./EventEmitter";
import { CONTROL_ACTIONS, DEFAULT_ACTION_KEYS, type ControlAction } from "./actions";
import { Input } from "./Input";

/** One control that can trigger an action. */
export type ControlInput =
  | { type: "key"; code: string }
  | { type: "button"; button: number }
  | { type: "axis"; axis: number; direction: 1 | -1 };

export type ControlBindings = Record<ControlAction, ControlInput[]>;

export interface ControlsEvents {
  change: { bindings: ControlBindings };
}

const key = (code: string): ControlInput => ({ type: "key", code });
const axis = (number: number, direction: 1 | -1): ControlInput => ({ type: "axis", axis: number, direction });
const button = (number: number): ControlInput => ({ type: "button", button: number });

function defaults(): ControlBindings {
  return {
    left: [...DEFAULT_ACTION_KEYS.left.map(key), button(14), axis(0, -1)],
    right: [...DEFAULT_ACTION_KEYS.right.map(key), button(15), axis(0, 1)],
    jump: [...DEFAULT_ACTION_KEYS.jump.map(key), button(0)],
    dash: [...DEFAULT_ACTION_KEYS.dash.map(key), button(2)],
    down: [...DEFAULT_ACTION_KEYS.down.map(key), button(13), axis(1, 1)],
  };
}

function same(a: ControlInput, b: ControlInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isControlInput(value: unknown): value is ControlInput {
  const v = value as Partial<{ type: string; code: unknown; button: unknown; axis: unknown; direction: unknown }> | null;
  if (typeof v !== "object" || v === null) return false;
  if (v.type === "key") return typeof v.code === "string";
  if (v.type === "button") return Number.isInteger(v.button);
  return v.type === "axis" && Number.isInteger(v.axis) && (v.direction === 1 || v.direction === -1);
}

/**
 * Which keys, buttons and axes trigger each action, editable while the game runs. It works
 * below `Player`, so every player and scene follows it. Save it with `toJSON()`.
 *
 * ```ts
 * const controls = new Controls();
 * controls.add("jump", { type: "key", code: "KeyJ" });
 * controls.applyTo(game);
 * ```
 */
export class Controls {
  private bindings = defaults();
  private readonly events = new EventEmitter<ControlsEvents>();

  /** The inputs of an action. */
  public get(action: ControlAction): readonly ControlInput[] {
    return this.bindings[action];
  }

  /** Adds an input to an action. If another action was using it, it moves here. */
  public add(action: ControlAction, input: ControlInput): void {
    for (const name of CONTROL_ACTIONS) this.bindings[name] = this.bindings[name].filter((b) => !same(b, input));
    this.bindings[action].push(input);
    this.changed();
  }

  public remove(action: ControlAction, input: ControlInput): void {
    this.bindings[action] = this.bindings[action].filter((b) => !same(b, input));
    this.changed();
  }

  /** Back to the default controls. */
  public reset(): void {
    this.bindings = defaults();
    this.changed();
  }

  public on<K extends keyof ControlsEvents>(event: K, listener: Listener<ControlsEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** The bindings as plain data, to save. */
  public toJSON(): ControlBindings {
    return structuredClone(this.bindings);
  }

  /** Restores saved bindings. Anything invalid is skipped, and missing actions keep their defaults. */
  public load(data: unknown): void {
    const next = defaults();
    const used: ControlInput[] = [];
    const missing: ControlAction[] = [];
    for (const action of CONTROL_ACTIONS) {
      const saved = typeof data === "object" && data !== null ? (data as Partial<Record<ControlAction, unknown>>)[action] : undefined;
      if (!Array.isArray(saved)) {
        missing.push(action);
        continue;
      }
      // An input belongs to one action: the first one that lists it.
      next[action] = saved.filter(isControlInput).filter((input) => {
        if (used.some((other) => same(other, input))) return false;
        used.push(input);
        return true;
      });
    }
    for (const action of missing) next[action] = next[action].filter((input) => !used.some((other) => same(other, input)));
    this.bindings = next;
    this.changed();
  }

  /** Makes a game use these controls. Call it again after creating another game. */
  public applyTo(game: Game): void {
    const keys = {} as Record<ControlAction, string[]>;
    const buttons: Record<string, number[]> = {};
    const axes: Record<string, { axis: number; direction: 1 | -1 }[]> = {};
    for (const action of CONTROL_ACTIONS) {
      const inputs = this.bindings[action];
      keys[action] = inputs.flatMap((i) => (i.type === "key" ? [i.code] : []));
      buttons[action] = inputs.flatMap((i) => (i.type === "button" ? [i.button] : []));
      axes[action] = inputs.flatMap((i) => (i.type === "axis" ? [{ axis: i.axis, direction: i.direction }] : []));
    }
    Input.getInstance().setActionKeys(keys);
    game.gamepad.setMapping({ buttons, axes, moveAxes: [] });
  }

  private changed(): void {
    this.events.emit("change", { bindings: this.toJSON() });
  }
}
