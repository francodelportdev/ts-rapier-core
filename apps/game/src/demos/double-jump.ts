/**
 * Double jump: `maxJumps: 2` allows one extra jump in the air.
 * Explanation: the "double-jump" page of the docs.
 */
import { Game, Ground, Platform, Player } from "rapier-engine";
import type { Demo } from "../ui";

export default async function demo(canvas: HTMLCanvasElement): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  // Top surface 4.5 m above the ground: too high for one 3 m jump, easy with two.
  game.addEntity(new Platform(world, { x: 4, y: -0.25, width: 5 }));

  const player = new Player(world, { x: -4, maxJumps: 2 });
  game.addEntity(player);

  game.start();
  return { game, player };
}
