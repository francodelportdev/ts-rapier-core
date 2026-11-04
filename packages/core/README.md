# @francodelportdev/rapier-engine

A small, object-oriented 2D game engine built on [`@dimforge/rapier2d-compat`](https://www.npmjs.com/package/@dimforge/rapier2d-compat).
You write entities as classes, and the engine runs the physics and draws them on a `<canvas>`.

```bash
bun add @francodelportdev/rapier-engine
```

The `-compat` build of Rapier embeds its WASM in JavaScript, so it works with Vite and other bundlers without extra configuration.

## Quick start

```ts
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;

const game = await Game.create(canvas); // initializes Rapier (WASM)
const world = game.getWorld();

game.addEntity(new Ground(world));
game.addEntity(new Player(world));
game.addEntity(new Box(world, 0, 5));

game.start();
```

## Coordinates and units

- **Physics** works in **meters**, with the Y axis pointing **up**. Gravity is `(0, -9.81)`. By default, the camera shows the origin at the center of the canvas (see [`Camera`](#camera)).
- **Drawing** works in **pixels**, with the Y axis pointing **down**. The conversion happens only inside `draw()`:

  ```
  px = centerX + x * scale
  py = centerY - y * scale
  ```

- `SCALE = 30` pixels per meter at zoom 1. On an 800×450 canvas, the visible world is about 26.7 × 15 m. `draw()` receives the camera's `scale`, `centerX` and `centerY`, so entities follow the camera without any extra code.

## API

### `Game`

| Member | Description |
|---|---|
| `static async create(canvas: HTMLCanvasElement, options?: GameOptions): Promise<Game>` | Runs `RAPIER.init()` and creates the physics world. Use it instead of `new`, because the world can't exist before the WASM loads. |
| `getWorld(): RAPIER.World` | The Rapier world. Pass it to entity constructors. |
| `addEntity(e: Entity): void` | Registers an entity for the game loop. Throws if the entity was already destroyed. |
| `removeEntity(e: Entity): void` | Takes the entity out of the loop and frees its physics body. It's safe to call anywhere, because the removal waits until the current step ends. Calling it twice has no effect. |
| `getEntities(): readonly Entity[]` | The entities currently in the game. |
| `getBodyCount(): number` | How many rigid bodies the physics world has. Useful to check for leaks. |
| `on("entityRemoved", ({ entity, reason }) => …)` | Runs after each removal. `reason` is `"manual"` or `"killPlane"`. Returns a function that unsubscribes. `off()` is also available. |
| `start(): void` | Starts the `requestAnimationFrame` loop. Calling it again has no effect. If nothing else on the page has focus, it focuses the canvas. |
| `stop(): void` | Stops the loop. |
| `isFocused(): boolean` | True while the canvas has keyboard focus. |

Physics runs at a **fixed step** of `world.timestep` (1/60 s), whatever the screen's refresh rate. A 144 Hz screen runs some frames with no step, and a slow frame runs several steps. Each step calls `update()` on every entity and then `world.step()`. Each frame then clears the canvas and calls `draw()` on every entity.

**Options:**
- `killPlaneY` (default `-30`): entities whose center falls below it are removed automatically, so objects that fall out of the level stop using CPU and memory. Pass `null` to turn it off.
- `grid` (default `false`): `true`, or `{ size, color }`, draws a grid in world space behind the entities. It makes camera movement visible.

**Keyboard focus:** the canvas is focusable, and clicking it gives it focus. The game only receives keyboard input while its canvas has focus. This lets several games share a page without every player moving at once. While the canvas has focus, the arrow keys and Space don't scroll the page.

### `Camera`

Every game has one, at `game.camera`. It decides which part of the world appears on the canvas.

```ts
game.camera.follow(player, { smoothing: 0.15, deadZone: { width: 3, height: 2 }, offset: { x: 0, y: 1.5 } });
game.camera.setBounds({ minX: -12, maxX: 68, minY: -8, maxY: 16 });
player.on("land", ({ fallSpeed }) => { if (fallSpeed > 16) game.camera.shake(0.3); });
player.on("respawn", () => game.camera.snapToTarget());
```

| Member | Description |
|---|---|
| `follow(target, options?)` | Follows an entity, or stops with `null`. `smoothing` is a time constant in seconds (default `0.15`, and `0` follows instantly). `deadZone` is a box in meters where the target moves without moving the camera (default `2 × 1.5`). `offset` shifts the followed point. |
| `setBounds(bounds \| null)` | Keeps the view inside `{ minX, maxX, minY, maxY }`. On an axis where the level is smaller than the view, the camera centers on it. |
| `x`, `y`, `zoom` | The world point at the center of the canvas, and the zoom (`1` = 30 px/m). You can read and write them. |
| `moveTo(x, y)` / `snapToTarget()` | Jump without smoothing. |
| `shake(intensity, duration = 0.3)` | Offsets the view randomly by up to `intensity` meters, fading out. A weaker shake doesn't interrupt a stronger one. |
| `screenToWorld(px, py)` / `worldToScreen(x, y)` | Convert between canvas pixels and world meters. |
| `getVisibleBounds()` | The part of the world on screen, in meters. |

The camera updates once per physics step, after `world.step()`. If its target is destroyed, it stops following and stays where it is.

### `Entity` (abstract)

The base class for anything that has a physics body.

```ts
abstract class Entity<TOptions extends object = object> {
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;
  protected readonly options: TOptions;

  constructor(world: RAPIER.World, options?: TOptions); // sets options, then calls createBody() and createCollider()

  protected abstract createBody(): RAPIER.RigidBody;
  protected abstract createCollider(): RAPIER.Collider;
  public abstract update(): void;
  public abstract draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void;

  get isDestroyed(): boolean;
  getPosition(): { x: number; y: number };
  destroy(): void;               // removes the body and its colliders (game.removeEntity() calls it)
  protected onDestroy(): void;   // override to free extra Rapier objects

  // helpers
  protected toCanvas(x, y, scale, centerX, centerY): { px: number; py: number };
  protected drawCuboid(ctx, halfW, halfH, color, scale, centerX, centerY): void;
}
```

> **Warning:** `createBody()` and `createCollider()` run inside `super()`, before the subclass's own fields are initialized. Don't read `this.someField` inside them. Pass the configuration as `options` instead: the base class stores it before calling them, so `this.options` is safe to read there. `Platform` works this way.

### Built-in entities

| Class | Body | Collider (half extents) | Behavior |
|---|---|---|---|
| `Ground` | `fixed`, at `(0, -5)` | `cuboid(10, 0.5)` | A static floor. Its top surface is at y = -4.5. |
| `Platform` | `fixed` | `width × height` | `new Platform(world, { x, y, width, height?, color? })`. `height` defaults to 0.5. Has a `top` getter for the Y of its top surface. |
| `Box` | `dynamic` | `cuboid(0.5, 0.5)` | `new Box(world, x = 0, y = 5)`. Has `applyImpulse(x, y)`. |
| `Player` | `kinematicPositionBased` | `cuboid(0.5, 1)` | A platformer character. See [Player](#player). |

### `Player`

```ts
new Player(world, options?: PlayerOptions)
```

It moves with Rapier's `KinematicCharacterController`, which resolves collisions, detects the ground, steps over bumps up to 0.3 m and pushes dynamic bodies. It has its own gravity, because kinematic bodies ignore the world's.

| Option | Default | Description |
|---|---|---|
| `x`, `y` | `0`, `-3.5` | Start position, in meters. The default stands on `Ground`. |
| `halfWidth`, `halfHeight` | `0.5`, `1` | Half extents of its box. |
| `color` | `"#48bb78"` | Fill color. |
| `speed` | `8` | Top horizontal speed, m/s. |
| `acceleration` / `deceleration` | `80` / `60` | m/s² on the ground, with and without a direction key pressed. |
| `airControl` | `0.6` | Multiplier for acceleration and deceleration in the air. |
| `gravity` | `40` | m/s², pulling down. |
| `maxFallSpeed` | `25` | m/s. |
| `jumpHeight` | `3` | Meters, for a full jump. The jump speed is `√(2 · gravity · jumpHeight)`. |
| `jumpCut` | `0.5` | Fraction of upward speed kept when the jump key is released early (variable jump height). |
| `coyoteTime` | `0.1` | Seconds after walking off a ledge during which a jump still counts as a ground jump. |
| `jumpBuffer` | `0.1` | Seconds a jump press is remembered before landing. |
| `maxJumps` | `1` | Jumps available before landing. `2` gives a double jump. |
| `dash` | `false` | `true`, or `{ speed = 20, duration = 0.15, cooldown = 0.4 }`. A horizontal burst with gravity paused. It's available on the ground and once per jump in the air. |
| `respawnBelow` | `-15` | Falling below this Y sends the player back to its start position. |
| `keys` | see below | Lists of `KeyboardEvent.code` values for `left`, `right`, `jump` and `dash`. You can override one action without the others. |

Default keys: `left: ["ArrowLeft", "KeyA"]`, `right: ["ArrowRight", "KeyD"]`, `jump: ["Space", "ArrowUp", "KeyW"]`, `dash: ["ShiftLeft", "ShiftRight", "KeyX"]`.

Methods: `isGrounded()`, `isDashing()`, `getVelocity()`, `getFacing()`, `getState()` and `respawn()`.

#### State

`getState()` returns `"idle" | "run" | "jump" | "fall" | "dash"` and is updated once per physics step. Losses of ground contact shorter than 0.05 s don't count as `"fall"`, which keeps the state from flickering on spawn or over bumps.

#### Events

```ts
const off = player.on("land", ({ fallSpeed }) => {
  if (fallSpeed > 15) shakeCamera();
});
off(); // unsubscribe. once() and off() are also available.
```

| Event | Payload | When |
|---|---|---|
| `stateChange` | `{ from: PlayerState; to: PlayerState }` | The state changed. |
| `jump` | `{ airJump: boolean; jumpNumber: number }` | A jump started. `airJump` is true for jumps in the air. |
| `land` | `{ fallSpeed: number }` | The player touched the ground after at least 0.05 s in the air. The speed is in m/s. |
| `dash` | `{ direction: 1 \| -1; inAir: boolean }` | A dash started. |
| `respawn` | `{ fell: boolean }` | The player went back to its start position. `fell` is true for falls below `respawnBelow`, and false for `respawn()` calls. |

Listeners run synchronously, inside the physics step.

### `EventEmitter`

The typed emitter that `Player` uses. It's exported so that your own entities can emit events too:

```ts
import { EventEmitter } from "@francodelportdev/rapier-engine";

const events = new EventEmitter<{ hit: { damage: number } }>();
events.on("hit", ({ damage }) => console.log(damage));
events.emit("hit", { damage: 10 });
```

### `Input` (singleton)

```ts
const input = Input.getInstance();
input.isPressed("ArrowLeft");             // boolean, uses KeyboardEvent.code
input.isAnyPressed(["ArrowLeft", "KeyA"]); // true if any of them is pressed
input.setEnabled(false);                  // every key reads as not pressed
```

When the window loses focus, it clears the key state so that no key stays "stuck" pressed. `Game` calls `setEnabled()` before each step, so input only reaches the game whose canvas has focus.

## Writing your own entity

```ts
import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "@francodelportdev/rapier-engine";

const RADIUS = 0.4;

export class Ball extends Entity {
  protected override createBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-3, 6));
  }

  protected override createCollider(): RAPIER.Collider {
    return this.world.createCollider(RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.8), this.body);
  }

  public override update(): void {}

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x, t.y, scale, centerX, centerY);
    ctx.beginPath();
    ctx.arc(px, py, RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#63b3ed";
    ctx.fill();
  }
}
```

Import `RAPIER` from `@dimforge/rapier2d-compat` (the default export). It gives you both values (`RigidBodyDesc`, `ColliderDesc`) and types (`RAPIER.World`). Your entity must use the same Rapier instance as the engine, so let your package manager deduplicate it.

## Development

```bash
bun run build      # dist/index.js (bun build) + dist/*.d.ts (tsc)
bun test           # runs the test suite
bun run typecheck  # tsc on src and test
```

### Tests

The tests run the real engine and real Rapier physics under `bun test`, with no browser. [`test/setup.ts`](test/setup.ts) provides a minimal `window` and `document`, and [`test/helpers.ts`](test/helpers.ts) lets you press keys, step the physics and create games on a fake canvas:

```ts
import { createWorld, keys, simulate } from "./helpers";

const world = createWorld();
const player = new Player(world);
keys.down("Space");
simulate(world, [new Ground(world), player], 30); // 30 physics steps = 0.5 s
```

| File | Covers |
|---|---|
| `player.test.ts` | Movement and keys, box pushing, jump height, variable jump, double jump, ceilings, coyote time, jump buffer, dash and cooldown, respawn |
| `events.test.ts` | `EventEmitter`, and the order and payloads of player events (no fake `land` on spawn or after a ground dash) |
| `game.test.ts` | `destroy()` and `removeEntity()` (including mid-step and from listeners), kill plane, input going only to the focused game |
| `camera.test.ts` | Follow, smoothing, dead zone, offset, bounds, centering small levels, zoom, conversions, shake, removed targets |

Rapier is deterministic, so a given sequence of key presses always produces the same result.

Inside the monorepo, `apps/game` resolves the `"source"` export condition, so it uses `src/` directly and you don't need to build first.

## License

MIT
