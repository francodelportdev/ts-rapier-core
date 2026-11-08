/**
 * Gamepad: play with a physical pad, and see what the browser reports for it. Pads with their
 * own layout need `setMapping()`: the label over the canvas shows the numbers to use.
 * Explanation: the "gamepad" page of the docs.
 */
import { Box, Game, Ground, Platform, Player } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 5, y: -1.5, width: 5 }));
  game.addEntity(new Box(world, -2, -4));
  const player = new Player(world, { x: -6, maxJumps: 2, dash: true });
  game.addEntity(player);

  game.gamepad.enabled = true;

  // Rumble on hard landings, on pads that can.
  player.on("land", ({ fallSpeed }) => {
    if (fallSpeed > 16) game.gamepad.vibrate(0.15, 0.6);
  });

  let known = "";
  game.on("frame", () => {
    const pad = game.gamepad.getState();
    if (pad === null) return ui.status("no gamepad · press any button on it");
    if (pad.id !== known) {
      known = pad.id;
      ui.log(`${pad.id} · layout: ${pad.mapping || "its own"}`);
    }
    const axes = pad.axes.map((value, i) => (Math.abs(value) > 0.1 ? `${i}:${value.toFixed(1)}` : "")).filter(Boolean);
    ui.status(`buttons [${pad.pressed.join(" ")}] · axes moved [${axes.join(" ")}] of ${pad.axes.length}`);
  });

  game.start();
  return {
    game,
    player,
    sliders: [{ label: "deadZone", min: 0.05, max: 0.9, step: 0.05, value: 0.3, set: (v) => (game.gamepad.deadZone = v) }],
  };
}
