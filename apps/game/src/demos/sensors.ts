/**
 * Sensors: a pressure plate that opens a gate, and a radar that follows the player.
 * Explanation: the "sensors" page of the docs.
 */
import { Game, Ground, Platform, Player, Sensor, Shape, Trigger, type Entity } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  const player = new Player(world, { x: -8 });
  game.addEntity(player);
  // Heavy crates: the player pushes them slowly, and they stay where they're left.
  const crate = (x: number, y: number) =>
    new Shape(world, { x, y, body: "dynamic", density: 8, friction: 1, geometry: { type: "box", width: 1, height: 1 } });
  const crates: Entity[] = [crate(-3, -4), crate(-5, 2)];
  for (const c of crates) game.addEntity(c);

  // --- Pressure plate: open the gate while a box is on it -------------------------------
  // The filter leaves the player out, and the curb stops the box on the plate.
  const plate = new Sensor(world, {
    x: 4,
    y: -4.25,
    color: "#ecc94b",
    filter: (entity) => crates.includes(entity),
    geometry: { type: "box", width: 3, height: 0.5 },
  });
  game.addEntity(plate);
  game.addEntity(new Platform(world, { x: 5.75, y: -3.75, width: 0.5, height: 1.5 }));

  const makeGate = () => new Platform(world, { x: 7, y: -1, width: 0.6, height: 7, color: "#e53e3e" });
  let gate: Platform | null = makeGate();
  game.addEntity(gate);

  const updateGate = () => {
    if (plate.isOccupied() && gate !== null) {
      game.removeEntity(gate);
      gate = null;
    } else if (!plate.isOccupied() && gate === null) {
      gate = makeGate();
      game.addEntity(gate);
    }
  };
  plate.on("enter", updateGate);
  plate.on("exit", updateGate);

  // --- Radar: a circle that follows the player and only counts boxes -------------------
  const radar = new Sensor(world, {
    x: 0,
    y: 0,
    follow: player,
    color: "#63b3ed",
    filter: (entity) => crates.includes(entity),
    geometry: { type: "circle", radius: 3 },
  });
  game.addEntity(radar);

  // --- Trigger: the simple case, one target, once ----------------------------------------
  let won = false;
  const goal = new Trigger(world, { x: 9.3, y: -3.5, width: 1, height: 2, target: player, color: "#48bb78", once: true });
  goal.on("enter", () => (won = true));
  game.addEntity(goal);

  game.on("frame", () => {
    const gateText = gate === null ? "gate open" : "gate closed";
    ui.status(won ? "You got through! 🎉" : `radar: ${radar.getInside().length} boxes · ${gateText}`);
  });

  game.start();
  return {
    game,
    player,
    sliders: [{ label: "radar radius", min: 1, max: 10, step: 0.5, value: 3, unit: "m", set: (radius) => radar.setRadius(radius) }],
  };
}
