/**
 * Geometry: level pieces with any shape (ramps, hills, rotated platforms) and dynamic shapes
 * that fall, roll and bounce. Click the canvas to drop a shape where you click.
 * Explanation and options: the "shapes" page of the docs.
 */
import { Game, Player, Shape, type Geometry } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas, { grid: true });
  const world = game.getWorld();

  // --- Level ---------------------------------------------------------------------------------
  // Rolling hills: a polyline can be concave, unlike a polygon.
  const hills = Array.from({ length: 41 }, (_, i) => {
    const x = -20 + i;
    return { x, y: Math.sin(x / 3) * 0.6 - 0.3 };
  });
  game.addEntity(new Shape(world, { x: 0, y: -4.5, geometry: { type: "polyline", points: hills } }));
  // Walls at both ends, so dropped shapes stay in the level.
  game.addEntity(new Shape(world, { x: -20.25, y: 0, geometry: { type: "box", width: 0.5, height: 14 } }));
  game.addEntity(new Shape(world, { x: 20.25, y: 0, geometry: { type: "box", width: 0.5, height: 14 } }));

  // A 30° ramp up to a tilted platform.
  game.addEntity(new Shape(world, { x: -9, y: -4.8, geometry: { type: "ramp", width: 6, height: 6 * Math.tan(Math.PI / 6), rises: "right" } }));
  game.addEntity(new Shape(world, { x: -3.5, y: -2, angle: -0.15, geometry: { type: "box", width: 5, height: 0.4 } })); // left end just below the ramp top

  // A seesaw: a dynamic plank resting on a fixed triangle.
  game.addEntity(new Shape(world, { x: 9, y: -4.6, geometry: { type: "polygon", points: [{ x: -0.6, y: 0 }, { x: 0.6, y: 0 }, { x: 0, y: 1 }] } }));
  game.addEntity(new Shape(world, { x: 9, y: -3.4, body: "dynamic", density: 0.5, color: "#b7791f", geometry: { type: "box", width: 7, height: 0.25 } }));

  // A steep 70° slab: too steep to stand on (maxSlope is 50°).
  game.addEntity(new Shape(world, { x: 16, y: -4.6, geometry: { type: "polygon", points: [{ x: 0, y: 0 }, { x: 3.6, y: 0 }, { x: 3.6, y: 10 }] } }));

  const player = new Player(world, { x: -15, y: -2.5, maxJumps: 2 });
  game.addEntity(player);
  game.camera.follow(player, { deadZone: { width: 4, height: 2 } });
  game.camera.setBounds({ minX: -21, maxX: 21, minY: -8, maxY: 10 });

  // --- Dropping shapes ---------------------------------------------------------------------------
  const hexagon = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 3) * 0.6, y: Math.sin((i * Math.PI) / 3) * 0.6 }));

  const SHAPES: { name: string; geometry: Geometry; restitution: number; color: string }[] = [
    { name: "circle", geometry: { type: "circle", radius: 0.5 }, restitution: 0.6, color: "#ed8936" },
    { name: "box", geometry: { type: "box", width: 0.9, height: 0.9 }, restitution: 0.1, color: "#e53e3e" },
    { name: "triangle", geometry: { type: "polygon", points: [{ x: -0.6, y: -0.4 }, { x: 0.6, y: -0.4 }, { x: 0, y: 0.6 }] }, restitution: 0.1, color: "#38a169" },
    { name: "hexagon", geometry: { type: "polygon", points: hexagon }, restitution: 0.3, color: "#805ad5" },
    { name: "capsule", geometry: { type: "capsule", radius: 0.3, height: 0.8 }, restitution: 0.2, color: "#3182ce" },
  ];
  let current = 0;
  const showCurrent = () => ui.status(`click to drop: ${SHAPES[current]!.name} · 1–5 to change`);
  showCurrent();

  const dropped: Shape[] = [];
  game.pointer.on("down", ({ worldX: x, worldY: y }) => {
    const { geometry, restitution, color } = SHAPES[current]!;
    const shape = new Shape(world, { x, y, angle: Math.random() * Math.PI, body: "dynamic", geometry, restitution, color });
    game.addEntity(shape);
    dropped.push(shape);
    if (dropped.length > 40) game.removeEntity(dropped.shift()!); // keep it light
  });

  canvas.addEventListener("keydown", (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= SHAPES.length) {
      current = n - 1;
      showCurrent();
    }
  });

  game.start();
  return { game, player };
}
