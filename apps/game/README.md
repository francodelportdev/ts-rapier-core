# Demos

Interactive docs for [`rapier-engine`](../../packages/core/README.md). Each section of the page has a playable demo, an explanation and its source code. The sidebar links to each section:

| Section | File | What it shows |
|---|---|---|
| Overview | [`src/demos/overview.ts`](src/demos/overview.ts) | Push the boxes off the platform (←/→ to move, Space to jump, E to kick a box). |
| Player: move & jump | [`src/demos/player.ts`](src/demos/player.ts) | Acceleration, jump, variable height, coyote time, jump buffer. All options written out. |
| Player: double jump | [`src/demos/double-jump.ts`](src/demos/double-jump.ts) | `maxJumps: 2` |
| Player: dash | [`src/demos/dash.ts`](src/demos/dash.ts) | `dash: { speed, duration, cooldown }` |
| Player: wall jump | [`src/demos/wall-jump.ts`](src/demos/wall-jump.ts) | `wallJump: { slideSpeed, pushSpeed, jumpHeight, controlLock, coyoteTime }`, in a 40 m shaft followed by the camera. |
| Player: one-way platforms | [`src/demos/one-way.ts`](src/demos/one-way.ts) | `oneWay: true` on platforms and shapes, jump up through them and drop with ↓ + jump, in a 6-level tower. |
| Player: state & events | [`src/demos/events.ts`](src/demos/events.ts) | `getState()` and `player.on("jump" \| "land" \| "dash" \| "respawn" \| "stateChange")`, shown in a live HUD. |
| Player: checkpoints & knockback | [`src/demos/player-api.ts`](src/demos/player-api.ts) | `knockback()` on spikes, `setSpawn()` on a checkpoint flag, and `setPosition()` on a teleport pad. |
| Physics: geometry | [`src/demos/shapes.ts`](src/demos/shapes.ts) | `Shape` with hills (polyline), a ramp, a tilted platform, a seesaw and a steep slab. Click to drop circles, boxes, triangles, hexagons or capsules. |
| Physics: collision layers | [`src/demos/layers.ts`](src/demos/layers.ts) | `defineLayers()` and `setCollision()`, with switches for who collides with whom. |
| Physics: sensors & triggers | [`src/demos/sensors.ts`](src/demos/sensors.ts) | A pressure plate that opens a gate, a radar that follows the player, and a one-shot goal. |
| Physics: collisions | [`src/demos/collisions.ts`](src/demos/collisions.ts) | `collisionStart` and `collisionEnd`, and boxes that change color through `onCollisionStart()`, with an enemy that sends the player back. |
| Physics: removing entities | [`src/demos/remove.ts`](src/demos/remove.ts) | Kill plane, `game.removeEntity()` and the `entityRemoved` event, with a live body count. |
| Game flow: camera | [`src/demos/camera.ts`](src/demos/camera.ts) | `camera.follow()` with smoothing and a dead zone, level bounds, zoom, and shake on hard landings, in an 80 m level. |
| Game flow: scenes & levels | [`src/demos/scenes.ts`](src/demos/scenes.ts) | A menu, three JSON levels in `src/levels/` and a results screen, with `Scene`, `LevelScene` and fades. |
| Game flow: pause | [`src/demos/pause.ts`](src/demos/pause.ts) | `pause()` and `resume()`, with a pause menu drawn by a scene, and a button for mouse and touch. |
| Game flow: components | [`src/demos/components.ts`](src/demos/components.ts) | `Health`, `Patrol` and `Lifetime`, plus two components written in the demo. |
| Input: mouse & touch | [`src/demos/pointer.ts`](src/demos/pointer.ts) | `game.pointer` and `game.touch`: drop balls, drag boxes, and on-screen buttons. |
| Input: gamepad | [`src/demos/gamepad.ts`](src/demos/gamepad.ts) | `game.gamepad`, with a live view of what the browser reports. |
| Input: controls | [`src/demos/controls.ts`](src/demos/controls.ts) | `Controls`, with a table to add and remove keys, pad buttons and axes. The choice is saved and applies to every demo. |
| Graphics & sound: animations | [`src/demos/animations.ts`](src/demos/animations.ts) | `SpriteSheet`, `Animator`, `Sprite` and `animatePlayer()`, with a sheet drawn by code. |
| Graphics & sound: debug renderer | [`src/demos/debug.ts`](src/demos/debug.ts) | `game.debug`, with every kind of body and two invisible sensors. All demos also have a "debug view" switch. |
| Graphics & sound: display | [`src/demos/display.ts`](src/demos/display.ts) | Sharp drawing and interpolation, with a physics-rate slider to see the difference. |
| Graphics & sound: audio | [`src/demos/audio.ts`](src/demos/audio.ts) | Effects tied to player events and music, made by code, plus a coin sound loaded from a file (`public/sounds/coin.wav`), with volume sliders. |

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
| `src/ui.ts` | The types a demo hands back: `Demo`, sliders and switches. |
| `src/prose.ts` | The styles of the page text, applied from its container. |
| `src/controls.ts`, `src/ControlsEditor.tsx` | The site's saved `Controls`, shared by every demo, and the table on the Controls page. |
| `src/levels/*.json` | The levels of the Scenes & levels page. |

Only the open page runs a game: leaving a page calls `game.destroy()`. The "Tune it live" sliders call `player.configure()`, so changes apply immediately, and **Reset** restarts the demo with its defaults.

To add a page, write its demo and its content file, then add an entry to `SECTIONS`.

## Using it outside this repo

```bash
bun create vite my-game --template vanilla-ts
cd my-game
bun add rapier-engine
```

Add a `<canvas>` to `index.html` and paste the body of a demo function, such as [`src/demos/overview.ts`](src/demos/overview.ts), into your `src/main.ts`. You don't need any Vite configuration.

