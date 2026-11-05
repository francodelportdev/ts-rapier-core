/**
 * Debug renderer: shows what the physics sees. Sprites and shapes on screen may differ from
 * their colliders, and sensors are often invisible. Explanation: the "debug" page of the docs.
 */
import { Box, Game, Ground, Platform, Player, Sensor, Shape } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 6, y: -1.5, width: 5, oneWay: true }));
  game.addEntity(new Shape(world, { x: -7, y: -4.5, geometry: { type: "ramp", width: 5, height: 2 } }));
  const hills = [{ x: 0, y: 0 }, { x: 1, y: 0.8 }, { x: 2, y: 0.2 }, { x: 3, y: 1 }];
  game.addEntity(new Shape(world, { x: -4, y: 2, geometry: { type: "polyline", points: hills } }));

  const player = new Player(world, { x: 0, maxJumps: 2 });
  game.addEntity(player);

  for (let i = 0; i < 4; i++) {
    game.addEntity(new Box(world, 2 + i * 1.2, 2));
    game.addEntity(new Shape(world, { x: -2 + i, y: 5, body: "dynamic", restitution: 0.5, geometry: { type: "circle", radius: 0.4 } }));
  }

  // Invisible in the game: without the debug view, you wouldn't know they're there.
  game.addEntity(new Sensor(world, { x: 0, y: 0, follow: player, geometry: { type: "circle", radius: 2.5 } }));
  game.addEntity(new Sensor(world, { x: -9, y: 2, geometry: { type: "box", width: 3, height: 3 } }));

  game.debug.enabled = true;

  game.on("frame", () => {
    const { bodies, colliders, sensors, sleeping } = game.debug.getStats();
    ui.status(`${bodies} bodies · ${colliders} colliders · ${sensors} sensors · ${sleeping} sleeping`);
  });

  const toggle = (label: string, key: "colliders" | "centers" | "velocities") => ({
    label,
    value: game.debug[key],
    set: (on: boolean) => (game.debug[key] = on),
  });

  game.start();
  return { game, player, toggles: [toggle("colliders", "colliders"), toggle("centers", "centers"), toggle("velocities", "velocities")] };
}
