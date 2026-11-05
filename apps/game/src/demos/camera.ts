/**
 * Camera: follow the player through a level wider than the screen.
 * Explanation and options: the "camera" page of the docs.
 */
import { Game, Platform, Player } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  // The grid is drawn in world space, so it moves with the camera and shows the scrolling.
  const game = await Game.create(canvas, { grid: true });
  const world = game.getWorld();

  // --- Level: 80 m wide, about three screens -----------------------------------------
  const LEVEL = { minX: -12, maxX: 68, minY: -8, maxY: 16 };

  game.addEntity(new Platform(world, { x: 0, y: -5, width: 24 }));               // start
  game.addEntity(new Platform(world, { x: 17, y: -3, width: 6 }));
  game.addEntity(new Platform(world, { x: 26, y: 0, width: 4 }));                // stairs up
  game.addEntity(new Platform(world, { x: 33, y: 3, width: 4 }));
  game.addEntity(new Platform(world, { x: 40, y: 6, width: 4 }));
  game.addEntity(new Platform(world, { x: 50, y: 2, width: 6, color: "#2c7a7b" })); // big drop
  game.addEntity(new Platform(world, { x: 62, y: -5, width: 12, color: "#2c7a7b" }));
  game.addEntity(new Platform(world, { x: -12.25, y: 4, width: 0.5, height: 18 })); // left wall
  game.addEntity(new Platform(world, { x: 68.25, y: 4, width: 0.5, height: 18 }));  // right wall

  const player = new Player(world, { x: -8, maxJumps: 2, dash: true });
  game.addEntity(player);

  // --- Camera --------------------------------------------------------------------------
  game.camera.follow(player, {
    smoothing: 0.15,                    // seconds to catch up (63% of the way)
    deadZone: { width: 3, height: 2 },  // the player moves freely inside this box
    offset: { x: 0, y: 1.5 },           // look a bit above the player
  });
  game.camera.setBounds(LEVEL); // never show what's outside the level

  // Shake on hard landings, and jump straight back after a respawn instead of panning.
  player.on("land", ({ fallSpeed }) => {
    if (fallSpeed > 16) game.camera.shake(Math.min(fallSpeed / 80, 0.4), 0.3);
  });
  player.on("respawn", () => game.camera.snapToTarget());

  // - / = : zoom out and in (0.5× to 2×).
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Minus") game.camera.zoom = Math.max(0.5, game.camera.zoom / 1.25);
    if (e.code === "Equal") game.camera.zoom = Math.min(2, game.camera.zoom * 1.25);
  });

  game.on("frame", () => {
    const { x, y, zoom } = game.camera;
    ui.status(`camera ${x.toFixed(1)}, ${y.toFixed(1)} · zoom ${zoom.toFixed(2)}×`);
  });

  game.start();
  return { game, player };
}
