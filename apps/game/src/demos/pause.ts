/**
 * Pause: freeze the game while it keeps drawing, so a pause menu can show.
 * Explanation: the "pause" page of the docs.
 */
import { Box, Game, Ground, Platform, Player, Scene } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

/** The pause button, in canvas pixels from the top right corner. */
const BUTTON = { right: 44, top: 44, radius: 26 };

class Playground extends Scene {
  public player!: Player;

  override onEnter(): void {
    const world = this.world;
    this.game.addEntity(new Ground(world));
    this.game.addEntity(new Platform(world, { x: 4, y: -1.5, width: 4 }));
    for (let i = 0; i < 4; i++) this.game.addEntity(new Box(world, -2 + i * 0.3, i * 2));
    this.player = new Player(world, { x: -6, maxJumps: 2 });
    this.game.addEntity(this.player);
  }

  // A scene still draws while the game is paused: this is the pause menu.
  override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const x = width - BUTTON.right;
    ctx.fillStyle = "rgb(255 255 255 / 0.15)";
    ctx.beginPath();
    ctx.arc(x, BUTTON.top, BUTTON.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(255 255 255 / 0.8)";
    ctx.font = "bold 20px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.game.isPaused() ? "▶" : "II", x, BUTTON.top);
    if (!this.game.isPaused()) return;
    ctx.fillStyle = "rgb(0 0 0 / 0.55)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px system-ui";
    ctx.fillText("Paused", width / 2, height / 2 - 16);
    ctx.font = "16px system-ui";
    ctx.fillText("P or Esc to resume", width / 2, height / 2 + 24);
  }
}

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  game.scenes.add("play", () => new Playground());
  game.scenes.go("play"); // with the game not started yet, this happens right away
  const { player } = game.scenes.current as Playground;

  const toggle = () => (game.isPaused() ? game.resume() : game.pause());
  // A keydown handler toggles once per press. Reading the key every frame would toggle
  // on every frame while it's held.
  canvas.addEventListener("keydown", (e) => {
    if (!e.repeat && (e.code === "KeyP" || e.code === "Escape")) toggle();
  });
  // The button, for mouse and touch.
  game.pointer.on("down", ({ x, y }) => {
    if (Math.hypot(x - (game.width - BUTTON.right), y - BUTTON.top) <= BUTTON.radius) toggle();
  });

  game.on("pause", () => ui.log("pause"));
  game.on("resume", () => ui.log("resume"));
  game.on("frame", () => ui.status(game.isPaused() ? "paused" : player.getState(), game.isPaused() ? undefined : player.getState()));

  game.start();
  return { game, player };
}
