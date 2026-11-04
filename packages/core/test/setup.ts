/**
 * Minimal browser globals so the engine runs under `bun test`: a `window` that records
 * listeners (so tests can send key events), a `document` with focus tracking, and a
 * manual `requestAnimationFrame`. Loaded before every test file (see bunfig.toml).
 */
import RAPIER from "@dimforge/rapier2d-compat";

type Handler = (event: { code: string; target?: unknown }) => void;

const windowListeners = new Map<string, Handler[]>();

const fakeWindow = {
  addEventListener(type: string, handler: Handler): void {
    const list = windowListeners.get(type) ?? [];
    list.push(handler);
    windowListeners.set(type, list);
  },
};

const fakeDocument: { activeElement: unknown; body: object } = { activeElement: null, body: {} };

Object.assign(globalThis, {
  window: fakeWindow,
  document: fakeDocument,
  // Game tests drive the loop by hand, so animation frames never fire on their own.
  requestAnimationFrame: (): number => 1,
  cancelAnimationFrame: (): void => {},
});

/** Sends a window event (keydown, keyup, blur) to every registered listener. */
export function dispatchWindowEvent(type: string, code = ""): void {
  for (const handler of windowListeners.get(type) ?? []) handler({ code });
}

export { fakeDocument };

await RAPIER.init();
