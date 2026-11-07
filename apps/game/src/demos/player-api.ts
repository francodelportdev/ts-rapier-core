/**
 * Checkpoints & knockback: move the player from code. Spikes push it away, a flag moves its
 * spawn point, and a pad teleports it. Explanation: the "player-api" page of the docs.
 */
import { Game, Platform, Player, Sensor, Trigger } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

const START = { x: -12, y: -3.5 };

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  // Two floors with a pit between them, at x = 5 to 9.
  game.addEntity(new Platform(world, { x: -5, y: -5, width: 20, height: 1 }));
  game.addEntity(new Platform(world, { x: 20, y: -5, width: 22, height: 1 }));

  const player = new Player(world, { ...START, maxJumps: 2, respawnBelow: -12 });

  // --- Spikes: knockback() pushes the player away and holds the arrow keys off ----------
  const spikes = new Sensor(world, { x: -3, y: -4.35, color: "#e53e3e", geometry: { type: "box", width: 2, height: 0.3 } });
  spikes.on("enter", ({ entity }) => {
    if (entity !== player) return;
    const away = player.getPosition().x < -3 ? -1 : 1;
    player.knockback(away * 9, 9, 0.25);
    game.camera.shake(0.2);
    ui.log("spikes: knockback");
  });
  game.addEntity(spikes);

  // --- Checkpoint: setSpawn() changes where respawn() and falls send the player -----------
  const flag = new Trigger(world, { x: 14, y: -3.5, width: 1, height: 2, target: player, color: "#4299e1" });
  flag.on("enter", () => {
    if (player.getSpawn().x === 14) return;
    player.setSpawn(14, -3.5);
    ui.log("checkpoint: spawn moved");
  });
  game.addEntity(flag);

  // --- Teleporter: setPosition() moves the player at once, keeping its speed ---------------
  const pad = new Trigger(world, { x: 28, y: -4.25, width: 1.5, height: 0.5, target: player, color: "#9f7aea" });
  pad.on("enter", () => {
    player.setPosition(START.x, START.y + 3);
    game.camera.snapToTarget(); // without it, the camera would smooth its way over
    ui.log("teleport to the start");
  });
  game.addEntity(pad);

  game.addEntity(player); // last, so it's drawn on top
  game.camera.follow(player, { deadZone: { width: 3, height: 2 }, offset: { x: 0, y: 1 } });
  game.camera.setBounds({ minX: -16, maxX: 32, minY: -9, maxY: 9 });

  player.on("respawn", ({ fell }) => {
    game.camera.snapToTarget();
    ui.log(fell ? `fell: back to x = ${player.getSpawn().x}` : "respawn");
  });
  // R: respawn() goes to the spawn point, which the checkpoint may have moved.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") player.respawn();
  });

  game.on("frame", () => ui.status(player.getState(), player.getState()));
  game.start();
  return { game, player };
}
