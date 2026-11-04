/**
 * Double jump: `maxJumps: 2` allows one extra jump in the air.
 * Explanation: the "double-jump" section of the docs page (index.html#double-jump).
 */
import { Game, Ground, Platform, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#double-jump-demo");
if (canvas === null) throw new Error("Missing <canvas id=\"double-jump-demo\">");

const game = await Game.create(canvas);
const world = game.getWorld();

game.addEntity(new Ground(world));
// Top surface 4.5 m above the ground: too high for one 3 m jump, easy with two.
game.addEntity(new Platform(world, { x: 4, y: -0.25, width: 5 }));

game.addEntity(new Player(world, { x: -4, maxJumps: 2 }));

game.start();
