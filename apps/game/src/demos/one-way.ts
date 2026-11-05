/**
 * One-way platforms: jump up through them from below, stand on them from above,
 * and drop through with ↓ + jump.
 * Explanation and options: the "one-way" page of the docs.
 */
import { Game, Ground, Platform, Player, Shape } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas, { grid: true });
  const world = game.getWorld();

  game.addEntity(new Ground(world));

  // A tower of one-way platforms, 2.5 m apart: each jump goes up through the next one.
  for (let i = 0; i < 6; i++) {
    const x = i % 2 === 0 ? -3 : 3;
    game.addEntity(new Platform(world, { x, y: -2.25 + i * 2.5, width: 6, height: 0.3, oneWay: true }));
  }
  // Any fixed Shape can be one-way too, even tilted.
  game.addEntity(new Shape(world, { x: -8, y: 1, angle: 0.25, oneWay: true, geometry: { type: "box", width: 5, height: 0.3 } }));
  // A normal platform, for comparison: it blocks from below.
  game.addEntity(new Platform(world, { x: 8, y: 0.5, width: 4, height: 0.5 }));

  const player = new Player(world, { x: -6 });
  game.addEntity(player);
  game.camera.follow(player, { deadZone: { width: 4, height: 2 }, offset: { x: 0, y: 1.5 } });
  game.camera.setBounds({ minX: -13.3, maxX: 13.3, minY: -7.5, maxY: 16 });

  // The label shows what the player stands on, and flashes when it drops through.
  let flash = 0;
  player.on("dropThrough", () => (flash = 40));
  game.on("frame", () => {
    if (flash > 0) {
      flash--;
      ui.status("dropped through! ↓");
    } else if (player.isOnOneWayPlatform()) {
      ui.status("on a one-way platform · ↓ + Space to drop");
    } else {
      ui.status(player.isGrounded() ? "on solid ground" : "in the air");
    }
  });

  game.touch.addButton({ key: "ArrowDown", label: "↓", x: -116, y: -42 }); // ↓ + jump on a touch screen

  game.start();
  return { game, player };
}
