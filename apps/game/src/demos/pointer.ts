/**
 * Mouse & touch: click or tap to drop a ball, and drag a box around. The on-screen buttons
 * move the player. Explanation: the "pointer" page of the docs.
 */
import { Box, Game, Ground, Player, Shape } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  const player = new Player(world, { x: -6 });
  game.addEntity(player);
  const boxes = [new Box(world, 2, -4), new Box(world, 4, -4)];
  for (const box of boxes) game.addEntity(box);

  // The buttons appear on the first touch. Here they're always shown, so a mouse can try them.
  game.touch.enabled = true;
  game.touch.alwaysVisible = true;

  // Press on a box to drag it, or anywhere else to drop a ball.
  const drags = new Map<number, Box>(); // one per finger
  game.pointer.on("down", ({ id, worldX, worldY, y }) => {
    if (y > game.height * 0.7) return; // the row of buttons
    const box = boxes.find((b) => Math.hypot(b.getPosition().x - worldX, b.getPosition().y - worldY) < 0.8);
    if (box) {
      drags.set(id, box);
    } else {
      game.addEntity(new Shape(world, { x: worldX, y: worldY, body: "dynamic", restitution: 0.6, geometry: { type: "circle", radius: 0.4 } }));
    }
  });
  game.pointer.on("up", ({ id }) => drags.delete(id));

  game.on("frame", () => {
    const active = game.pointer.getActive();
    // Pull each dragged box towards its finger.
    for (const [id, box] of drags) {
      const p = active.find((a) => a.id === id);
      if (p === undefined) continue;
      const { x, y } = box.getPosition();
      box.getBody().setLinvel({ x: (p.worldX - x) * 12, y: (p.worldY - y) * 12 }, true);
    }
    const { x, y } = game.pointer.world;
    ui.status(`pointer ${x.toFixed(1)}, ${y.toFixed(1)} m · ${active.length} down`);
  });

  game.start();
  return { game, player };
}
