/**
 * Collision layers: red balls and blue boxes, with switches for who collides with whom.
 * Explanation: the "layers" page of the docs.
 */
import { Game, Platform, Player, Shape, defineLayers } from "rapier-engine";
import type { Demo } from "../ui";

const layers = defineLayers(["world", "player", "red", "blue"]);
type Layer = "world" | "player" | "red" | "blue";

export default async function demo(canvas: HTMLCanvasElement): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  // The level collides with everything, and everything collides with it.
  const worldFilter = layers.filter("world", ["player", "red", "blue"]);
  game.addEntity(new Platform(world, { x: 0, y: -5, width: 26, collision: worldFilter }));
  game.addEntity(new Platform(world, { x: -12.75, y: 0, width: 0.5, height: 15, collision: worldFilter }));
  game.addEntity(new Platform(world, { x: 12.75, y: 0, width: 0.5, height: 15, collision: worldFilter }));

  const player = new Player(world);
  game.addEntity(player);

  const reds: Shape[] = [];
  const blues: Shape[] = [];
  for (let i = 0; i < 8; i++) {
    const x = -7 + i * 2;
    const red = new Shape(world, { x, y: 3, body: "dynamic", color: "#e53e3e", geometry: { type: "circle", radius: 0.5 } });
    const blue = new Shape(world, { x: x + 1, y: 5, body: "dynamic", color: "#3182ce", geometry: { type: "box", width: 0.9, height: 0.9 } });
    reds.push(red);
    blues.push(blue);
    game.addEntity(red);
    game.addEntity(blue);
  }

  // The rules. A pair collides only if each side lists the other, so one switch sets both masks.
  const rules = { playerRed: true, playerBlue: false, redBlue: false };

  function applyRules(): void {
    const mask = (...extra: (Layer | false)[]) => ["world", ...extra.filter((l) => l !== false)] as Layer[];
    player.setCollision(layers.filter("player", mask(rules.playerRed && "red", rules.playerBlue && "blue")));
    const red = layers.filter("red", mask("red", rules.playerRed && "player", rules.redBlue && "blue"));
    const blue = layers.filter("blue", mask("blue", rules.playerBlue && "player", rules.redBlue && "red"));
    for (const shape of reds) shape.setCollision(red);
    for (const shape of blues) shape.setCollision(blue);
  }
  applyRules();

  const toggle = (label: string, key: keyof typeof rules) => ({
    label,
    value: rules[key],
    set(value: boolean) {
      rules[key] = value;
      applyRules();
    },
  });

  game.start();
  return {
    game,
    player,
    toggles: [toggle("player ↔ red", "playerRed"), toggle("player ↔ blue", "playerBlue"), toggle("red ↔ blue", "redBlue")],
  };
}
