/**
 * Display: sharp and smooth drawing. Lower the physics rate to see interpolation at work: without
 * it, everything moves in visible jumps. Explanation: the "display" page of the docs.
 */
import { Game, Ground, Patrol, Player, Shape } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  const player = new Player(world, { x: -7 });
  game.addEntity(player);

  // Things always in motion, to compare.
  const movers = [
    { from: { x: -8, y: 3 }, to: { x: 8, y: 3 }, color: "#4299e1" },
    { from: { x: 8, y: 0.5 }, to: { x: -8, y: 0.5 }, color: "#ed8936" },
  ];
  for (const { from, to, color } of movers) {
    const shape = new Shape(world, { ...from, body: "kinematic", color, geometry: { type: "circle", radius: 0.6 } });
    shape.add(new Patrol([from, to], 6));
    game.addEntity(shape);
  }

  let rate = 60;
  game.on("frame", () => {
    const smooth = game.interpolation ? "smooth" : "jumpy";
    ui.status(`${rate} physics steps/s · ${smooth} · drawn at ${canvas.width}×${canvas.height}`);
  });

  game.start();
  return {
    game,
    player,
    sliders: [
      {
        label: "physics steps per second",
        min: 5,
        max: 60,
        step: 5,
        value: 60,
        set: (value) => {
          rate = value;
          world.timestep = 1 / value;
        },
      },
    ],
    toggles: [
      { label: "interpolation", value: true, set: (on) => (game.interpolation = on) },
      { label: "sharp on high-density screens", value: true, set: (on) => (game.maxPixelRatio = on ? 2 : 1) },
    ],
  };
}
