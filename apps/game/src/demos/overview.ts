/**
 * Demo: push the boxes off the platform.
 * Explanation: the Overview page of the docs.
 */
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";
import type { Demo } from "../ui";

export default async function demo(canvas: HTMLCanvasElement): Promise<Demo> {
  // Rapier is WebAssembly: `create` waits for it to load before building the physics world.
  const game = await Game.create(canvas);
  const world = game.getWorld();

  // Each constructor adds its body to the physics world; addEntity() adds it to the game loop.
  // Units are meters, Y up, origin at the canvas center.
  game.addEntity(new Ground(world)); // fixed: never moves. Top surface at y = -4.5
  const player = new Player(world);
  game.addEntity(player); // kinematic: moved by code (←/→, Space to jump); pushes boxes, nothing pushes it

  const box = new Box(world, 0, 5); // dynamic: gravity, collisions and impulses affect it
  game.addEntity(box);
  game.addEntity(new Box(world, 1, 8));
  // Boxes pushed off the platform are removed automatically once they fall below y = -30
  // (the game's kill plane), so they stop using CPU and memory.

  // E: kick the first box upwards.
  // The box weighs 1 kg, so an impulse of 5 N·s adds 5 m/s upwards.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyE") box.applyImpulse(0, 5);
  });

  // Each frame: update() on every entity → world.step() → draw() on every entity.
  game.start();
  return { game, player };
}
