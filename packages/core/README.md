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

- **Physics** works in **meters**, with the Y axis pointing **up** and the origin at the center of the canvas. Gravity is `(0, -9.81)`.
- **Drawing** works in **pixels**, with the Y axis pointing **down**. The conversion happens only inside `draw()`:

  ```
  px = centerX + x * scale
  py = centerY - y * scale
  ```

- `SCALE = 30` pixels per meter. On an 800×450 canvas, the visible world is about 26.7 × 15 m.

## API

### `Game`

| Member | Description |
|---|---|
| `static async create(canvas: HTMLCanvasElement): Promise<Game>` | Runs `RAPIER.init()` and creates the physics world. Use it instead of `new`, because the world can't exist before the WASM loads. |
| `getWorld(): RAPIER.World` | The Rapier world. Pass it to entity constructors. |
| `addEntity(e: Entity): void` | Registers an entity for the game loop. |
| `start(): void` | Starts the `requestAnimationFrame` loop. Calling it again has no effect. |
| `stop(): void` | Stops the loop. |

Every frame, the loop:
1. calls `update()` on every entity
2. advances the physics with `world.step()` (a fixed step of 1/60 s)
3. clears the canvas and calls `draw()` on every entity

### `Entity` (abstract)

The base class for anything that has a physics body.

```ts
abstract class Entity {
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;

  constructor(world: RAPIER.World); // calls createBody() and then createCollider()

  protected abstract createBody(): RAPIER.RigidBody;
  protected abstract createCollider(): RAPIER.Collider;
  public abstract update(): void;
  public abstract draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void;

  // helpers
  protected toCanvas(x, y, scale, centerX, centerY): { px: number; py: number };
  protected drawCuboid(ctx, halfW, halfH, color, scale, centerX, centerY): void;
}
```

> **Warning:** `createBody()` and `createCollider()` run inside `super()`, before the subclass's own fields are initialized. Use module-level constants inside them, not `this.someField`. To configure the body from constructor arguments, change it after `super()`, as `Box` does.

### Built-in entities

| Class | Body | Collider (half extents) | Behavior |
|---|---|---|---|
| `Ground` | `fixed`, at `(0, -5)` | `cuboid(10, 0.5)` | A static platform. Its top surface is at y = -4.5. |
| `Box` | `dynamic` | `cuboid(0.5, 0.5)` | `new Box(world, x = 0, y = 5)`. Has `applyImpulse(x, y)`. |
| `Player` | `kinematicPositionBased` | `cuboid(0.5, 1)` | Moves at 6 m/s with ←/→. Pushes dynamic bodies but isn't affected by them. |

### `Input` (singleton)

```ts
const input = Input.getInstance();
input.isPressed("ArrowLeft"); // boolean, uses KeyboardEvent.code
```

When the window loses focus, it clears the key state so that no key stays "stuck" pressed.

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
bun run build   # dist/index.js (bun build) + dist/*.d.ts (tsc)
```

Inside the monorepo, `apps/game` resolves the `"source"` export condition, so it uses `src/` directly and you don't need to build first.

## License

MIT
