/**
 * Dash: a short horizontal burst (Shift or X), on the ground or once in the air.
 * Explanation and options: the "dash" section of the docs page (index.html#dash).
 */
import { Game, Platform, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#dash-demo");
if (canvas === null) throw new Error("Missing <canvas id=\"dash-demo\">");

const game = await Game.create(canvas);
const world = game.getWorld();

// Two ledges with an 8 m gap: a running jump covers about 6.5 m, a jump + dash about 9.5 m.
// Falling into the gap respawns the player at the start (see `respawnBelow`).
game.addEntity(new Platform(world, { x: -8, y: -4.75, width: 8 }));
game.addEntity(new Platform(world, { x: 8, y: -4.75, width: 8 }));

game.addEntity(
  new Player(world, {
    x: -10,
    dash: {
      speed: 20,      // m/s during the dash
      duration: 0.15, // seconds (20 × 0.15 = 3 m covered)
      cooldown: 0.4,  // seconds before the next dash
    },
  }),
);

game.start();
