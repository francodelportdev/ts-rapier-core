/**
 * Animations: a player that plays a clip for each state, and a spinning coin.
 * The sprite sheet is drawn by code in makeSheet(), so the demo needs no image files.
 * With your own art, use loadSpriteSheet("/hero.png", 32, 32).
 * Explanation: the "animations" page of the docs.
 */
import { Animator, Game, Ground, Platform, Player, Shape, Sprite, animatePlayer, loadSpriteSheet } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

const FRAME = 32;
const COLUMNS = 4;

/** Draws one character frame: `lean` tilts the body, `step` swings the legs. */
function drawHero(c: CanvasRenderingContext2D, x: number, y: number, color: string, lean: number, step: number, bob: number): void {
  c.save();
  c.translate(x + FRAME / 2, y + bob);
  c.fillStyle = "#2d3748";
  c.fillRect(-5 + step, 24, 4, 8); // legs
  c.fillRect(1 - step, 24, 4, 8);
  c.rotate(lean);
  c.fillStyle = color;
  c.fillRect(-7, 12, 14, 13); // body
  c.fillStyle = "#fbd38d";
  c.fillRect(-6, 3, 12, 10); // head
  c.fillStyle = "#1a202c";
  c.fillRect(2, 6, 2, 3); // eye, looking right
  c.restore();
}

/** A sheet of 4 columns: one row per clip. Returns it as a data URL, like an image file. */
function makeSheet(): string {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME * COLUMNS;
  canvas.height = FRAME * 7;
  const c = canvas.getContext("2d")!;
  for (let i = 0; i < COLUMNS; i++) {
    const x = i * FRAME;
    const swing = [-4, 0, 4, 0][i]!;
    drawHero(c, x, 0, "#48bb78", 0, 0, i % 2); // idle: breathes
    drawHero(c, x, FRAME, "#4299e1", 0.15, swing, 0); // run: legs swing
    drawHero(c, x, FRAME * 2, "#38a169", -0.1, 3, 0); // jump
    drawHero(c, x, FRAME * 3, "#d69e2e", 0.1, -3, 0); // fall
    drawHero(c, x, FRAME * 4, "#d53f8c", 0.6, 5, 0); // dash: leans forward
    drawHero(c, x, FRAME * 5, "#805ad5", -0.2, 0, i % 2); // wall slide
    // Coin: gets narrower and wider, so it seems to spin.
    c.fillStyle = "#ecc94b";
    c.beginPath();
    c.ellipse(x + 16, FRAME * 6 + 16, [12, 7, 2, 7][i]!, 12, 0, 0, Math.PI * 2);
    c.fill();
  }
  return canvas.toDataURL();
}

const row = (r: number, count = COLUMNS) => Array.from({ length: count }, (_, i) => r * COLUMNS + i);

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const sheet = await loadSpriteSheet(makeSheet(), FRAME, FRAME);
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 6, y: -1.5, width: 5 }));
  game.addEntity(new Platform(world, { x: -10.25, y: 0, width: 0.5, height: 10 })); // a wall to slide on

  const player = new Player(world, { x: -4, maxJumps: 2, dash: true, wallJump: true });
  game.addEntity(player);

  // One clip per player state, named like the states.
  const animator = new Animator(
    {
      idle: { frames: row(0), fps: 4 },
      run: { frames: row(1), fps: 12 },
      jump: { frames: row(2, 1), fps: 1 },
      fall: { frames: row(3, 1), fps: 1 },
      dash: { frames: row(4, 1), fps: 1 },
      wallSlide: { frames: row(5), fps: 8 },
    },
    "idle",
  );
  const sprite = new Sprite({ sheet, animator, width: 2, height: 2 });
  animatePlayer(player, sprite);

  // Any entity can have a sprite: this one replaces the circle of a Shape.
  const coin = new Shape(world, { x: 6, y: 0, geometry: { type: "circle", radius: 0.5 } });
  coin.setSprite(new Sprite({ sheet, animator: new Animator({ spin: { frames: row(6), fps: 8 } }, "spin"), width: 1, height: 1 }));
  game.addEntity(coin);

  game.on("frame", () => ui.status(`${animator.clip} · frame ${animator.frameIndex}`, player.getState()));

  game.start();
  return {
    game,
    player,
    sliders: [{ label: "animator.speed", min: 0, max: 3, step: 0.1, value: 1, unit: "×", set: (v) => (animator.speed = v) }],
    toggles: [{ label: "show the sprite", value: true, set: (on) => player.setSprite(on ? sprite : null) }],
  };
}
