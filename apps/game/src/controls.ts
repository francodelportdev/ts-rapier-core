import { Controls, type ControlInput } from "@francodelportdev/rapier-engine";

const STORAGE_KEY = "rapier-engine-controls";

/** The site's controls, shared by every demo and saved in this browser. */
export const controls = new Controls();

// Generic USB pads may report the D-pad as axes 5 and 6.
controls.add("left", { type: "axis", axis: 5, direction: -1 });
controls.add("right", { type: "axis", axis: 5, direction: 1 });
controls.add("down", { type: "axis", axis: 6, direction: 1 });
export const defaultControls = controls.toJSON();

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) controls.load(JSON.parse(saved));
} catch {
  // Blocked storage or damaged data: keep the defaults.
}

controls.on("change", ({ bindings }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Without storage, changes last until the page closes.
  }
});

/** A readable name for a control. */
export function controlLabel(input: ControlInput): string {
  if (input.type === "button") return `Button ${input.button}`;
  if (input.type === "axis") return `Axis ${input.axis} ${input.direction > 0 ? "+" : "−"}`;
  return input.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow(.*)/, "$1 arrow");
}

/** Waits for the next key, pad button or pad axis. Esc or `cancel()` ends it with null. */
export function captureInput(): { result: Promise<ControlInput | null>; cancel: () => void } {
  let finish: (input: ControlInput | null) => void = () => {};
  const result = new Promise<ControlInput | null>((resolve) => (finish = resolve));

  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    done(e.code === "Escape" ? null : { type: "key", code: e.code });
  };
  window.addEventListener("keydown", onKey, true);

  // Compare with how the pad was at the start, so axes that rest away from 0 don't count.
  const read = () => navigator.getGamepads?.().find((pad) => pad?.connected) ?? null;
  const rest = read()?.axes.slice() ?? null;
  const held = new Set(read()?.buttons.flatMap((b, i) => (b.pressed ? [i] : [])) ?? []);
  let frame = requestAnimationFrame(function poll() {
    const pad = read();
    if (pad !== null) {
      const button = pad.buttons.findIndex((b, i) => b.pressed && !held.has(i));
      if (button !== -1) return done({ type: "button", button });
      const axis = pad.axes.findIndex((value, i) => Math.abs(value - (rest?.[i] ?? 0)) > 0.5);
      if (axis !== -1) return done({ type: "axis", axis, direction: pad.axes[axis]! > (rest?.[axis] ?? 0) ? 1 : -1 });
    }
    frame = requestAnimationFrame(poll);
  });

  function done(input: ControlInput | null): void {
    window.removeEventListener("keydown", onKey, true);
    cancelAnimationFrame(frame);
    finish(input);
  }
  return { result, cancel: () => done(null) };
}
