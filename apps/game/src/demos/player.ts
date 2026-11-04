/**
 * Player: move and jump. Platforms at different heights to try the jump.
 * Explanation and options: the "player" section of the docs page (index.html#player).
 */
import { Game, Ground, Platform, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#player-demo");
if (canvas === null) throw new Error("Missing <canvas id=\"player-demo\">");

const game = await Game.create(canvas);
const world = game.getWorld();

game.addEntity(new Ground(world)); // top at y = -4.5
game.addEntity(new Platform(world, { x: -6, y: -2.5, width: 4 })); // 2 m above the ground
game.addEntity(new Platform(world, { x: 0, y: -0.5, width: 3 }));  // reachable from the first one
game.addEntity(new Platform(world, { x: 6, y: -2, width: 4 }));

// Every option is optional; these are the defaults, written out to show what can be tuned.
game.addEntity(
  new Player(world, {
    speed: 8,          // top speed, m/s
    acceleration: 80,  // m/s² on the ground
    deceleration: 60,  // m/s² on the ground with no key pressed
    airControl: 0.6,   // fraction of acceleration available in the air
    jumpHeight: 3,     // meters, for a full jump
    gravity: 40,       // m/s², stronger than the world's 9.81 so jumps feel snappy
    jumpCut: 0.5,      // releasing the key early keeps 50% of the upward speed
    coyoteTime: 0.1,   // seconds after leaving a ledge that a jump still works
    jumpBuffer: 0.1,   // seconds a jump press is remembered before landing
  }),
);

game.start();
