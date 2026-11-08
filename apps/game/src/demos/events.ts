/**
 * State & events: react to what the player does (sounds, animations, UI) without touching the engine.
 * Explanation: the "events" page of the docs.
 */
import { Game, Ground, Platform, Player } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 5, y: -1.5, width: 4 }));

  const player = new Player(world, { x: -4, maxJumps: 2, dash: true });
  game.addEntity(player);

  // --- State: shown as a label, updated on every change -------------------------
  ui.status(player.getState(), player.getState());
  player.on("stateChange", ({ to }) => ui.status(to, to)); // the second argument colors the label

  // --- Events: each one adds a line to the log ------------------------------------
  player.on("jump", ({ airJump, wallJump, jumpNumber }) =>
    ui.log(`jump #${jumpNumber}${wallJump ? " (wall)" : airJump ? " (air)" : ""}`),
  );
  player.on("land", ({ fallSpeed }) => ui.log(`land at ${fallSpeed.toFixed(1)} m/s${fallSpeed > 15 ? " (hard!)" : ""}`));
  player.on("dash", ({ direction, inAir }) => ui.log(`dash ${direction > 0 ? "→" : "←"}${inAir ? " (air)" : ""}`));
  player.on("respawn", ({ fell }) => ui.log(fell ? "respawn (fell off)" : "respawn"));
  player.on("dropThrough", () => ui.log("drop through"));

  // R: respawn by hand. respawn() emits the "respawn" event with fell = false.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") player.respawn();
  });

  game.start();
  return { game, player };
}
