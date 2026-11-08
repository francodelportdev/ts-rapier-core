/**
 * Collisions: events when two entities start and stop touching.
 * Explanation: the "collisions" page of the docs.
 */
import { Box, Game, Ground, Patrol, Platform, Player, Shape, type Entity } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

/** A box that turns red while something other than the floor touches it, through its own hooks. */
class TouchyBox extends Box {
  private touching = 0;

  override onCollisionStart(other: Entity): void {
    if (!(other instanceof Platform)) this.touching++;
  }

  override onCollisionEnd(other: Entity): void {
    if (!(other instanceof Platform)) this.touching--;
  }

  override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    this.drawCuboid(ctx, 0.5, 0.5, this.touching > 0 ? "#e53e3e" : "#ed8936", scale, centerX, centerY);
  }
}

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  const player = new Player(world, { x: -2 });
  game.addEntity(player);
  // Boxes on the left, to push and stack. The way to the enemy, on the right, stays clear.
  for (const [x, y] of [[-6, -4], [-6, -3], [-8, -4]] as const) game.addEntity(new TouchyBox(world, x, y));

  // An enemy that walks back and forth: kinematic bodies report collisions too.
  const enemy = new Shape(world, { x: 7, y: -3.75, body: "kinematic", color: "#e53e3e", geometry: { type: "box", width: 1, height: 1.5 } });
  enemy.add(new Patrol([{ x: 7, y: -3.75 }, { x: 1, y: -3.75 }], 2));
  game.addEntity(enemy);

  // --- The game's events: every pair, once when it starts and once when it ends ------
  const name = (e: Entity) => (e === player ? "player" : e === enemy ? "enemy" : e instanceof Box ? "box" : "ground");
  let touching = 0;
  game.on("collisionStart", ({ a, b }) => {
    touching++;
    if (name(a) !== "ground" && name(b) !== "ground") ui.log(`start ${name(a)} + ${name(b)}`);
    // Touching the enemy sends the player back, with a shake.
    if ((a === player && b === enemy) || (a === enemy && b === player)) {
      player.respawn();
      game.camera.shake(0.3);
    }
  });
  game.on("collisionEnd", () => touching--);
  game.on("frame", () => ui.status(`${touching} pairs touching`));

  game.start();
  return { game, player };
}
