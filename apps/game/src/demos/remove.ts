/**
 * Removing entities: boxes that fall out of the level are removed automatically (kill plane),
 * and you can remove any entity yourself with `game.removeEntity()`.
 * Explanation: the "remove" section of the docs page (index.html#remove).
 */
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#remove-demo");
const bodiesLabel = document.querySelector<HTMLElement>("#remove-bodies");
const removedLabel = document.querySelector<HTMLElement>("#remove-count");
if (canvas === null || bodiesLabel === null || removedLabel === null) throw new Error("Missing remove demo elements");

// Anything whose center falls below y = -30 is removed and its body freed. This is the default.
const game = await Game.create(canvas, { killPlaneY: -30 });
const world = game.getWorld();

game.addEntity(new Ground(world));
game.addEntity(new Player(world));

// --- Spawning: a new box every second, at most 15 at a time -----------------------
const boxes: Box[] = [];

function spawnBox(): void {
  if (boxes.length >= 15) return;
  const box = new Box(world, (Math.random() - 0.5) * 16, 8);
  boxes.push(box);
  game.addEntity(box);
}
setInterval(spawnBox, 1000);

// C: clear every box by hand.
canvas.addEventListener("keydown", (e) => {
  if (e.code === "KeyC") for (const box of boxes) game.removeEntity(box);
});

// --- Removal: the game tells you what was removed and why ---------------------------
let removed = 0;
game.on("entityRemoved", ({ entity, reason }) => {
  if (!(entity instanceof Box)) return;
  boxes.splice(boxes.indexOf(entity), 1);
  removed++;
  removedLabel.textContent = `${removed} removed (last: ${reason})`;
});

// The body count proves the memory is freed: it goes down as boxes are removed.
setInterval(() => (bodiesLabel.textContent = `${game.getBodyCount()} bodies`), 100);

game.start();
