/**
 * Wall jump: climb a shaft by sliding down a wall and jumping off it to the other side.
 * Explanation and options: the "wall-jump" page of the docs.
 */
import { Game, Platform, Player } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas, { grid: true });
  const world = game.getWorld();

  // --- Level: a shaft 6 m wide, with the exit at the top right ---------------------------
  const TOP = 34; // top of the right wall, and of the goal next to it
  game.addEntity(new Platform(world, { x: 0, y: -5, width: 12 }));                                 // floor
  game.addEntity(new Platform(world, { x: -3.5, y: 17, width: 1, height: 44 }));                   // left wall, face at x = -3
  game.addEntity(new Platform(world, { x: 3.5, y: (TOP - 5) / 2, width: 1, height: TOP + 5 }));    // right wall, face at x = 3
  game.addEntity(new Platform(world, { x: -2.25, y: 12, width: 1.5, color: "#2c7a7b" }));           // ledges to rest on
  game.addEntity(new Platform(world, { x: 2.25, y: 24, width: 1.5, color: "#2c7a7b" }));
  game.addEntity(new Platform(world, { x: 7, y: TOP - 0.25, width: 6, color: "#d69e2e" }));         // goal

  const player = new Player(world, {
    maxJumps: 2, // a wall jump keeps the double jump: use it to clear the top of the right wall
    wallJump: {
      slideSpeed: 3,     // m/s, the fastest fall while sliding
      pushSpeed: 10,     // m/s away from the wall
      jumpHeight: 3,     // meters
      controlLock: 0.15, // seconds without arrow keys after a wall jump
      coyoteTime: 0.1,   // seconds after leaving the wall that a wall jump still works
    },
  });
  game.addEntity(player);

  // --- Camera: follow the climb, inside the shaft ---------------------------------------
  game.camera.follow(player, { deadZone: { width: 2, height: 2 }, offset: { x: 0, y: 2 } });
  game.camera.setBounds({ minX: -8, maxX: 12, minY: -6, maxY: TOP + 8 });
  player.on("respawn", () => game.camera.snapToTarget());

  // --- HUD: current height and best ------------------------------------------------------
  let best = 0;
  game.on("frame", () => {
    const height = Math.max(0, player.getPosition().y + 3.5); // 0 = standing on the floor
    best = Math.max(best, height);
    const atGoal = player.isGrounded() && player.getPosition().y > TOP && player.getPosition().x > 4;
    ui.status(atGoal ? "You made it! 🎉" : `${height.toFixed(1)} m · best ${best.toFixed(1)} m`);
  });

  game.start();
  return { game, player };
}
