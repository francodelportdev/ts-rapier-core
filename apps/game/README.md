# Demos

Interactive docs for [`@francodelportdev/rapier-engine`](../../packages/core/README.md). Each section of the page has a playable demo, an explanation and its source code. The sidebar links to each section:

| Section | File | What it shows |
|---|---|---|
| Overview | [`src/demos/overview.ts`](src/demos/overview.ts) | Push the boxes off the platform (←/→ to move, Space to jump, E to kick a box). |
| Player: move & jump | [`src/demos/player.ts`](src/demos/player.ts) | Acceleration, jump, variable height, coyote time, jump buffer. All options written out. |
| Player: double jump | [`src/demos/double-jump.ts`](src/demos/double-jump.ts) | `maxJumps: 2` |
| Player: dash | [`src/demos/dash.ts`](src/demos/dash.ts) | `dash: { speed, duration, cooldown }` |
| Player: wall jump | [`src/demos/wall-jump.ts`](src/demos/wall-jump.ts) | `wallJump: { slideSpeed, pushSpeed, jumpHeight, controlLock, coyoteTime }`, in a 40 m shaft followed by the camera. |
| Player: one-way platforms | [`src/demos/one-way.ts`](src/demos/one-way.ts) | `oneWay: true` on platforms and shapes, jump up through them and drop with ↓ + jump, in a 6-level tower. |
| Player: state & events | [`src/demos/events.ts`](src/demos/events.ts) | `getState()` and `player.on("jump" \| "land" \| "dash" \| "respawn" \| "stateChange")`, shown in a live HUD. |
| Engine: removing entities | [`src/demos/remove.ts`](src/demos/remove.ts) | Kill plane, `game.removeEntity()` and the `entityRemoved` event, with a live body count. |
| Engine: camera | [`src/demos/camera.ts`](src/demos/camera.ts) | `camera.follow()` with smoothing and a dead zone, level bounds, zoom, and shake on hard landings, in an 80 m level. |
| Engine: geometry | [`src/demos/shapes.ts`](src/demos/shapes.ts) | `Shape` with hills (polyline), a ramp, a tilted platform, a seesaw and a steep slab. Click to drop circles, boxes, triangles, hexagons or capsules. |
| Engine: collision layers | [`src/demos/layers.ts`](src/demos/layers.ts) | `defineLayers()` and `setCollision()`, with switches for who collides with whom. |
| Engine: scenes & levels | [`src/demos/scenes.ts`](src/demos/scenes.ts) | A menu, three JSON levels in `src/levels/` and a results screen, with `Scene`, `LevelScene` and fades. |

The demo takes keyboard focus when its page opens. If it loses focus, click it.

```bash
# from the repository root
bun install
bun run dev
```

## How it's built

The site is a React app. [`src/sections.ts`](src/sections.ts) lists every page: its demo, its text and its sliders.

| Path | What it is |
|---|---|
| `src/demos/*.ts` | One function per demo. It receives a canvas, and returns its `game` and `player`. No React in here. |
| `src/content/*.html` | The text of each page. `<!-- demo -->` marks where the demo goes. |
| `src/App.tsx` | Sidebar, hash routing (`#player`), the demo's lifecycle, the sliders and the source viewer. |

Only the open page runs a game: leaving a page calls `game.destroy()`. The "Tune it live" sliders call `player.configure()`, so changes apply immediately, and **Reset** restarts the demo with its defaults.

To add a page, write its demo and its content file, then add an entry to `SECTIONS`.

## Using it outside this repo

```bash
bun create vite my-game --template vanilla-ts
cd my-game
bun add @francodelportdev/rapier-engine
```

Add a `<canvas>` to `index.html` and paste the body of a demo function, such as [`src/demos/overview.ts`](src/demos/overview.ts), into your `src/main.ts`. You don't need any Vite configuration.

