import { useEffect, useRef, useState } from "react";
import { CONTROL_ACTIONS, type ControlAction, type ControlInput } from "@francodelportdev/rapier-engine";
import { captureInput, controlLabel, controls, defaultControls } from "./controls";

const NAMES: Record<ControlAction, string> = { left: "Move left", right: "Move right", jump: "Jump", dash: "Dash", down: "Down" };

const SMALL_BUTTON = "cursor-pointer rounded-md border border-line px-2 py-0.5 text-[0.85rem] text-fg hover:border-accent";

/** A table to add and remove the controls of each action. */
export function ControlsEditor() {
  const [, redraw] = useState(0);
  const [listening, setListening] = useState<ControlAction | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => {
    const off = controls.on("change", () => redraw((n) => n + 1));
    return () => {
      off();
      cancel.current?.();
    };
  }, []);

  const listen = async (action: ControlAction) => {
    cancel.current?.();
    const capture = captureInput();
    cancel.current = capture.cancel;
    setListening(action);
    const input = await capture.result;
    if (cancel.current === capture.cancel) {
      cancel.current = null;
      setListening(null);
    }
    if (input !== null) controls.add(action, input);
  };

  return (
    <div className="mt-4 rounded-lg bg-surface px-4 pt-3 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">Controls</h2>
        <button type="button" className={`${SMALL_BUTTON} bg-page`} onClick={() => controls.load(defaultControls)}>Reset to defaults</button>
      </div>
      {CONTROL_ACTIONS.map((action) => (
        <div key={action} className="flex flex-wrap items-center gap-2 border-t border-line py-2 first-of-type:border-t-0">
          <span className="w-24 shrink-0 text-[0.9rem] font-semibold">{NAMES[action]}</span>
          {controls.get(action).map((input: ControlInput) => (
            <span key={JSON.stringify(input)} className="flex items-center gap-1 rounded-md bg-page py-0.5 pr-1 pl-2 font-mono text-[0.8rem]">
              {controlLabel(input)}
              <button
                type="button"
                aria-label={`Remove ${controlLabel(input)} from ${NAMES[action]}`}
                className="cursor-pointer px-1 text-muted hover:text-fg"
                onClick={() => controls.remove(action, input)}
              >
                ×
              </button>
            </span>
          ))}
          {listening === action ? (
            <button type="button" className={`${SMALL_BUTTON} border-accent text-accent`} onClick={() => cancel.current?.()}>
              Press a key or pad control… (Esc cancels)
            </button>
          ) : (
            <button type="button" className={SMALL_BUTTON} aria-label={`Add a control to ${NAMES[action]}`} onClick={() => void listen(action)}>+ Add</button>
          )}
        </div>
      ))}
    </div>
  );
}
