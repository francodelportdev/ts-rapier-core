/**
 * Removing entities: boxes that fall out of the level are removed automatically (kill plane),
 * and you can remove any entity yourself with `game.removeEntity()`.
 * Explanation: the "remove" page of the docs.
 */
import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  // Anything whose center falls below y = -30 is removed and its body freed. This is the default.
  const game = await Game.create(canvas, { killPlaneY: -30 });
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  const player = new Player(world);
  game.addEntity(player);

  // --- Spawning: a new box every second, at most 15 at a time -----------------------
  const boxes: Box[] = [];

  function spawnBox(): void {
    if (boxes.length >= 15) return;
    const box = new Box(world, (Math.random() - 0.5) * 16, 8);
    boxes.push(box);
    game.addEntity(box);
  }

  // C: clear every box by hand.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyC") for (const box of boxes) game.removeEntity(box);
  });

  // --- Removal: the game tells you what was removed and why ---------------------------
  let removed = 0;
  let lastReason = "none";
  game.on("entityRemoved", ({ entity, reason }) => {
    if (!(entity instanceof Box)) return;
    boxes.splice(boxes.indexOf(entity), 1);
    removed++;
    lastReason = reason;
  });

  // The body count proves the memory is freed: it goes down as boxes are removed.
  let frames = 0;
  game.on("frame", () => {
    if (++frames % 60 === 0) spawnBox();
    ui.status(`${game.debug.getStats().bodies} bodies · ${removed} removed (last: ${lastReason})`);
  });

  game.start();
  return { game, player };
}
