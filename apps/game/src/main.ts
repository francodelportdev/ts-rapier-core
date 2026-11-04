/**
 * Demo: push the boxes off the platform.
 * Walkthrough, controls and known limitations: ../README.md
 */
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error("Missing <canvas id=\"game\">");

// Rapier is WebAssembly: `create` waits for it to load before building the physics world.
const game = await Game.create(canvas);
const world = game.getWorld();

// Each constructor adds its body to the physics world; addEntity() adds it to the game loop.
// Units are meters, Y up, origin at the canvas center.
game.addEntity(new Ground(world)); // fixed: never moves. Top surface at y = -4.5
game.addEntity(new Player(world)); // kinematic: moved by code (←/→); pushes boxes, nothing pushes it

const box = new Box(world, 0, 5); // dynamic: gravity, collisions and impulses affect it
game.addEntity(box);
game.addEntity(new Box(world, 1, 8));

// Space: kick the first box upwards.
// The box weighs 1 kg, so an impulse of 5 N·s adds 5 m/s upwards.
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") box.applyImpulse(0, 5);
});

// Each frame: update() on every entity → world.step() → draw() on every entity.
game.start();
