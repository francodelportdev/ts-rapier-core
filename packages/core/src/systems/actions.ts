/** What a player can do, whatever key, button or finger asks for it. */
export type ControlAction = "left" | "right" | "jump" | "dash" | "down";

export const CONTROL_ACTIONS: readonly ControlAction[] = ["left", "right", "jump", "dash", "down"];

/** The keyboard keys (`KeyboardEvent.code`) of each action, until something changes them. */
export const DEFAULT_ACTION_KEYS: Readonly<Record<ControlAction, readonly string[]>> = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "ArrowUp", "KeyW"],
  dash: ["ShiftLeft", "ShiftRight", "KeyX"],
  down: ["ArrowDown", "KeyS"],
};
