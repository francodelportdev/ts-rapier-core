# Demos

Interactive docs for [`@francodelportdev/rapier-engine`](../../packages/core/README.md). Each section of the page has a playable demo, an explanation and its source code. The sidebar links to each section:

| Section | File | What it shows |
|---|---|---|
| Overview | [`src/main.ts`](src/main.ts) | Push the boxes off the platform (←/→ to move, Space to jump, E to kick a box). |
| Player: move & jump | [`src/demos/player.ts`](src/demos/player.ts) | Acceleration, jump, variable height, coyote time, jump buffer. All options written out. |
| Player: double jump | [`src/demos/double-jump.ts`](src/demos/double-jump.ts) | `maxJumps: 2` |
| Player: dash | [`src/demos/dash.ts`](src/demos/dash.ts) | `dash: { speed, duration, cooldown }` |

Click a demo to give it keyboard focus. Only the focused demo receives keys.

```bash
# from the repository root
bun install
bun run dev
```

## How it's built

Each demo is one standalone file plus a `<canvas>` in [`index.html`](index.html). The rest of the page (the sidebar highlight, the source viewers and the copy buttons) comes from [`src/docs.ts`](src/docs.ts), which isn't needed to run any demo. The walkthrough below covers the Overview demo.

### 1. A canvas to draw on

```html
<canvas id="game" width="800" height="450"></canvas>
<script type="module" src="/src/main.ts"></script>
```

The engine draws with the world origin at the center of the canvas, at 30 px per meter. On an 800×450 canvas, you can see about ±13 m horizontally and ±7.5 m vertically.

### 2. Create the game

```ts
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error('Missing <canvas id="game">');

const game = await Game.create(canvas);
const world = game.getWorld();
```

`Game.create` is `async` because Rapier is WebAssembly, and it has to load (`RAPIER.init()`) before a physics world can exist. Top-level `await` works because Vite outputs modern ES modules.

### 3. Add the entities

```ts
game.addEntity(new Ground(world));          // static platform, 20 m wide, top at y = -4.5
game.addEntity(new Player(world));          // kinematic, standing on the ground

const box = new Box(world, 0, 5);           // dynamic, falls from y = 5
game.addEntity(box);
game.addEntity(new Box(world, 1, 8));       // a second box, higher and to the right
```

Each entity creates its own Rapier body and collider in its constructor, so creating the entity is enough to add it to the physics world. `addEntity` registers it in the game loop, so that it gets updated and drawn every frame.

Why the boxes fall but the player doesn't:

| Entity | Rapier body type | Effect |
|---|---|---|
| `Ground` | `fixed` | Never moves. |
| `Box` | `dynamic` | Affected by gravity, collisions and impulses. |
| `Player` | `kinematicPositionBased` | Moves only where the code tells it to. It pushes dynamic bodies, and nothing pushes it. |

### 4. Add your own controls

```ts
canvas.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") box.applyImpulse(0, 5);
});
```

`applyImpulse(x, y)` instantly changes the box's velocity. The impulse is in N·s and the box's mass is 1 kg, so this adds 5 m/s upwards.

The listener is on the canvas, not on `window`, so it only fires while this demo has focus. Moving and jumping are already built into `Player`. See the Player sections of the page.

### 5. Start the loop

```ts
game.start();
```

Physics runs at a fixed 60 steps per second. Each step calls `update()` on every entity and then `world.step()`. Each frame then calls `draw()`.

## Full source

[`src/main.ts`](src/main.ts) is the complete demo, with comments that explain each step. Copy it as it is.

## Using it outside this repo

```bash
bun create vite my-game --template vanilla-ts
cd my-game
bun add @francodelportdev/rapier-engine
```

Copy the `<canvas>` into `index.html` and [`src/main.ts`](src/main.ts) into your `src/main.ts`. You don't need any Vite configuration.

## Known limitations

- Boxes that fall off the platform are never removed. They keep falling, and the engine keeps simulating them.
