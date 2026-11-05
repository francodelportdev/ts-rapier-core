import type { Game, Player } from "@francodelportdev/rapier-engine";

/** What a demo can show around its canvas. */
export interface DemoUI {
  /** Sets the label over the canvas. `state` picks its color (a player state). */
  status(text: string, state?: string): void;
  /** Adds a line to the log over the canvas. */
  log(text: string): void;
}

/** What a demo hands back: the page destroys the game on leaving, and the sliders use both. */
export interface Demo {
  game: Game;
  player?: Player;
}

/** One slider of the "Tune it live" panel. */
export interface Control {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  set(value: number): void;
}
