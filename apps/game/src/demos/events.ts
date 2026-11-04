/**
 * State & events: react to what the player does (sounds, animations, UI) without touching the engine.
 * Explanation: the "events" section of the docs page (index.html#events).
 */
import { Game, Ground, Platform, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#events-demo");
const stateLabel = document.querySelector<HTMLElement>("#events-state");
const log = document.querySelector<HTMLOListElement>("#events-log");
if (canvas === null || stateLabel === null || log === null) throw new Error("Missing events demo elements");

const game = await Game.create(canvas);
const world = game.getWorld();

game.addEntity(new Ground(world));
game.addEntity(new Platform(world, { x: 5, y: -1.5, width: 4 }));

const player = new Player(world, { x: -4, maxJumps: 2, dash: true });
game.addEntity(player);

// --- State: shown as a label, updated on every change -------------------------
stateLabel.textContent = player.getState();
player.on("stateChange", ({ to }) => {
  stateLabel.textContent = to;
  stateLabel.dataset.state = to; // the CSS colors the label per state
});

// --- Events: each one adds a line to the log ------------------------------------
const logList = log; // narrowed to non-null for use inside the function
function addLine(text: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  logList.prepend(li);
  while (logList.children.length > 8) logList.lastElementChild?.remove();
}

player.on("jump", ({ airJump, wallJump, jumpNumber }) =>
  addLine(`jump #${jumpNumber}${wallJump ? " (wall)" : airJump ? " (air)" : ""}`),
);
player.on("land", ({ fallSpeed }) => addLine(`land at ${fallSpeed.toFixed(1)} m/s${fallSpeed > 15 ? " (hard!)" : ""}`));
player.on("dash", ({ direction, inAir }) => addLine(`dash ${direction > 0 ? "→" : "←"}${inAir ? " (air)" : ""}`));
player.on("respawn", ({ fell }) => addLine(fell ? "respawn (fell off)" : "respawn"));

// R: respawn by hand. respawn() emits the "respawn" event with fell = false.
canvas.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") player.respawn();
});

game.start();
