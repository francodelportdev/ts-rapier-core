/**
 * Controls: try your keys and pad here. The table below changes what triggers each action.
 * Explanation: the "controls" page of the docs.
 */
import { Box, Game, Ground, Platform, Player } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 5, y: -2.25, width: 5, height: 0.3, oneWay: true }));
  game.addEntity(new Box(world, -2, -4));
  const player = new Player(world, { x: -6, maxJumps: 2, dash: true });
  game.addEntity(player);

  game.on("frame", () => ui.status(player.getState(), player.getState()));

  game.start();
  return { game, player };
}
