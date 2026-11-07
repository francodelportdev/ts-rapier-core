import type { DashOptions, Player, PlayerTuning, WallJumpOptions } from "@francodelportdev/rapier-engine";
import type { Control, Demo, DemoUI } from "./ui";

type NumericKey = { [K in keyof PlayerTuning]-?: NonNullable<PlayerTuning[K]> extends number ? K : never }[keyof PlayerTuning];

/** A slider for a numeric player option. */
function tune(player: Player, key: NumericKey, label: string, min: number, max: number, step: number, unit?: string): Control {
  return { label, min, max, step, unit, value: player.getTuning()[key] ?? min, set: (v) => player.configure({ [key]: v }) };
}

function tuneDash(player: Player, key: keyof DashOptions, label: string, min: number, max: number, step: number, unit?: string): Control {
  return { label, min, max, step, unit, value: player.getTuning().dash?.[key] ?? min, set: (v) => player.configure({ dash: { [key]: v } }) };
}

function tuneWall(player: Player, key: keyof WallJumpOptions, label: string, min: number, max: number, step: number, unit?: string): Control {
  return { label, min, max, step, unit, value: player.getTuning().wallJump?.[key] ?? min, set: (v) => player.configure({ wallJump: { [key]: v } }) };
}

const movement = (p: Player): Control[] => [
  tune(p, "speed", "speed", 2, 20, 0.5, "m/s"),
  tune(p, "jumpHeight", "jumpHeight", 0.5, 8, 0.25, "m"),
  tune(p, "gravity", "gravity", 10, 100, 1, "m/s²"),
];

export interface Section {
  id: string;
  title: string;
  group?: string;
  file: string;
  /** The demo's function, loaded when its page opens. */
  load: () => Promise<{ default: (canvas: HTMLCanvasElement, ui: DemoUI) => Promise<Demo> }>;
  source: () => Promise<{ default: string }>;
  content: () => Promise<{ default: string }>;
  controls: (demo: Demo & { player: Player }) => Control[];
  /** Shows the controls table under the demo. */
  editor?: boolean;
}

export const SECTIONS: Section[] = [
  {
    id: "overview", title: "Overview", file: "src/demos/overview.ts",
    load: () => import("./demos/overview"), source: () => import("./demos/overview.ts?raw"), content: () => import("./content/overview.html?raw"),
    controls: ({ player }) => movement(player),
  },
  {
    id: "player", title: "Move & jump", group: "Player", file: "src/demos/player.ts",
    load: () => import("./demos/player"), source: () => import("./demos/player.ts?raw"), content: () => import("./content/player.html?raw"),
    controls: ({ player: p }) => [
      ...movement(p),
      tune(p, "acceleration", "acceleration", 10, 200, 5, "m/s²"),
      tune(p, "deceleration", "deceleration", 10, 200, 5, "m/s²"),
      tune(p, "airControl", "airControl", 0, 1, 0.05),
      tune(p, "jumpCut", "jumpCut", 0, 1, 0.05),
      tune(p, "coyoteTime", "coyoteTime", 0, 0.5, 0.01, "s"),
      tune(p, "jumpBuffer", "jumpBuffer", 0, 0.5, 0.01, "s"),
    ],
  },
  {
    id: "double-jump", title: "Double jump", group: "Player", file: "src/demos/double-jump.ts",
    load: () => import("./demos/double-jump"), source: () => import("./demos/double-jump.ts?raw"), content: () => import("./content/double-jump.html?raw"),
    controls: ({ player: p }) => [tune(p, "maxJumps", "maxJumps", 1, 5, 1), tune(p, "jumpHeight", "jumpHeight", 0.5, 8, 0.25, "m")],
  },
  {
    id: "dash", title: "Dash", group: "Player", file: "src/demos/dash.ts",
    load: () => import("./demos/dash"), source: () => import("./demos/dash.ts?raw"), content: () => import("./content/dash.html?raw"),
    controls: ({ player: p }) => [
      tuneDash(p, "speed", "dash.speed", 5, 50, 1, "m/s"),
      tuneDash(p, "duration", "dash.duration", 0.05, 0.5, 0.01, "s"),
      tuneDash(p, "cooldown", "dash.cooldown", 0, 2, 0.05, "s"),
    ],
  },
  {
    id: "wall-jump", title: "Wall jump", group: "Player", file: "src/demos/wall-jump.ts",
    load: () => import("./demos/wall-jump"), source: () => import("./demos/wall-jump.ts?raw"), content: () => import("./content/wall-jump.html?raw"),
    controls: ({ player: p }) => [
      tuneWall(p, "slideSpeed", "wallJump.slideSpeed", 0.5, 15, 0.5, "m/s"),
      tuneWall(p, "pushSpeed", "wallJump.pushSpeed", 2, 25, 0.5, "m/s"),
      tuneWall(p, "jumpHeight", "wallJump.jumpHeight", 0.5, 8, 0.25, "m"),
      tuneWall(p, "controlLock", "wallJump.controlLock", 0, 0.6, 0.01, "s"),
      tuneWall(p, "coyoteTime", "wallJump.coyoteTime", 0, 0.5, 0.01, "s"),
    ],
  },
  {
    id: "one-way", title: "One-way platforms", group: "Player", file: "src/demos/one-way.ts",
    load: () => import("./demos/one-way"), source: () => import("./demos/one-way.ts?raw"), content: () => import("./content/one-way.html?raw"),
    controls: ({ player: p }) => [tune(p, "dropThroughTime", "dropThroughTime", 0.05, 1, 0.05, "s"), tune(p, "jumpHeight", "jumpHeight", 0.5, 8, 0.25, "m")],
  },
  {
    id: "events", title: "State & events", group: "Player", file: "src/demos/events.ts",
    load: () => import("./demos/events"), source: () => import("./demos/events.ts?raw"), content: () => import("./content/events.html?raw"),
    controls: ({ player }) => movement(player),
  },
  {
    id: "remove", title: "Removing entities", group: "Engine", file: "src/demos/remove.ts",
    load: () => import("./demos/remove"), source: () => import("./demos/remove.ts?raw"), content: () => import("./content/remove.html?raw"),
    controls: ({ player: p }) => [tune(p, "speed", "speed", 2, 20, 0.5, "m/s")],
  },
  {
    id: "camera", title: "Camera", group: "Engine", file: "src/demos/camera.ts",
    load: () => import("./demos/camera"), source: () => import("./demos/camera.ts?raw"), content: () => import("./content/camera.html?raw"),
    controls: ({ game, player }) => [
      { label: "camera.zoom", min: 0.5, max: 2, step: 0.05, value: game.camera.zoom, unit: "×", set: (v) => (game.camera.zoom = v) },
      {
        label: "smoothing", min: 0, max: 1, step: 0.01, value: 0.15, unit: "s",
        set: (v) => game.camera.follow(player, { smoothing: v, deadZone: { width: 3, height: 2 }, offset: { x: 0, y: 1.5 } }),
      },
    ],
  },
  {
    id: "layers", title: "Collision layers", group: "Engine", file: "src/demos/layers.ts",
    load: () => import("./demos/layers"), source: () => import("./demos/layers.ts?raw"), content: () => import("./content/layers.html?raw"),
    controls: () => [],
  },
  {
    id: "sensors", title: "Sensors & triggers", group: "Engine", file: "src/demos/sensors.ts",
    load: () => import("./demos/sensors"), source: () => import("./demos/sensors.ts?raw"), content: () => import("./content/sensors.html?raw"),
    controls: ({ player }) => movement(player),
  },
  {
    id: "collisions", title: "Collisions", group: "Engine", file: "src/demos/collisions.ts",
    load: () => import("./demos/collisions"), source: () => import("./demos/collisions.ts?raw"), content: () => import("./content/collisions.html?raw"),
    controls: ({ player }) => movement(player),
  },
  {
    id: "animations", title: "Animations", group: "Engine", file: "src/demos/animations.ts",
    load: () => import("./demos/animations"), source: () => import("./demos/animations.ts?raw"), content: () => import("./content/animations.html?raw"),
    controls: () => [],
  },
  {
    id: "components", title: "Components", group: "Engine", file: "src/demos/components.ts",
    load: () => import("./demos/components"), source: () => import("./demos/components.ts?raw"), content: () => import("./content/components.html?raw"),
    controls: () => [],
  },
  {
    id: "debug", title: "Debug renderer", group: "Engine", file: "src/demos/debug.ts",
    load: () => import("./demos/debug"), source: () => import("./demos/debug.ts?raw"), content: () => import("./content/debug.html?raw"),
    controls: () => [],
  },
  {
    id: "pointer", title: "Mouse & touch", group: "Engine", file: "src/demos/pointer.ts",
    load: () => import("./demos/pointer"), source: () => import("./demos/pointer.ts?raw"), content: () => import("./content/pointer.html?raw"),
    controls: ({ player }) => movement(player),
  },
  {
    id: "display", title: "Display", group: "Engine", file: "src/demos/display.ts",
    load: () => import("./demos/display"), source: () => import("./demos/display.ts?raw"), content: () => import("./content/display.html?raw"),
    controls: () => [],
  },
  {
    id: "audio", title: "Audio", group: "Engine", file: "src/demos/audio.ts",
    load: () => import("./demos/audio"), source: () => import("./demos/audio.ts?raw"), content: () => import("./content/audio.html?raw"),
    controls: () => [],
  },
  {
    id: "gamepad", title: "Gamepad", group: "Engine", file: "src/demos/gamepad.ts",
    load: () => import("./demos/gamepad"), source: () => import("./demos/gamepad.ts?raw"), content: () => import("./content/gamepad.html?raw"),
    controls: () => [],
  },
  {
    id: "controls", title: "Controls", group: "Engine", file: "src/demos/controls.ts", editor: true,
    load: () => import("./demos/controls"), source: () => import("./demos/controls.ts?raw"), content: () => import("./content/controls.html?raw"),
    controls: () => [],
  },
  {
    id: "scenes", title: "Scenes & levels", group: "Engine", file: "src/demos/scenes.ts",
    load: () => import("./demos/scenes"), source: () => import("./demos/scenes.ts?raw"), content: () => import("./content/scenes.html?raw"),
    controls: () => [],
  },
  {
    id: "pause", title: "Pause", group: "Engine", file: "src/demos/pause.ts",
    load: () => import("./demos/pause"), source: () => import("./demos/pause.ts?raw"), content: () => import("./content/pause.html?raw"),
    controls: () => [],
  },
  {
    id: "shapes", title: "Geometry", group: "Engine", file: "src/demos/shapes.ts",
    load: () => import("./demos/shapes"), source: () => import("./demos/shapes.ts?raw"), content: () => import("./content/shapes.html?raw"),
    controls: ({ game, player: p }) => [
      { label: "world gravity", min: 0, max: 30, step: 0.5, value: 9.81, unit: "m/s²", set: (v) => (game.getWorld().gravity.y = -v) },
      tune(p, "maxSlope", "maxSlope", 10, 80, 1, "°"),
    ],
  },
];
