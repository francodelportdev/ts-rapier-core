/**
 * Audio: effects tied to player events, and background music. Every sound is made by code,
 * so the demo needs no files. With your own, use `await game.audio.load("jump", "/jump.ogg")`.
 * Explanation: the "audio" page of the docs.
 */
import { Game, Ground, Platform, Player, Trigger } from "@francodelportdev/rapier-engine";
import type { Demo, DemoUI } from "../ui";

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();
  const { audio } = game;

  audio.synth("jump", { wave: "square", frequency: 300, endFrequency: 700, duration: 0.15, volume: 0.25 });
  audio.synth("land", { wave: "noise", duration: 0.08, volume: 0.3 });
  audio.synth("dash", { wave: "sawtooth", frequency: 900, endFrequency: 200, duration: 0.18, volume: 0.2 });
  audio.synth("coin", { wave: "square", frequency: [988, 1319], duration: 0.08, volume: 0.25 });
  audio.synth("music", { wave: "triangle", frequency: [262, 330, 392, 330, 294, 349, 440, 349], duration: 0.25, volume: 0.25 });

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 5, y: -1.5, width: 5 }));
  const player = new Player(world, { x: -6, maxJumps: 2, dash: true });
  game.addEntity(player);

  // Sounds follow the player's events: the player itself knows nothing about audio.
  player.on("jump", ({ airJump }) => audio.play("jump", { rate: airJump ? 1.5 : 1 }));
  player.on("land", ({ fallSpeed }) => audio.play("land", { volume: Math.min(1, fallSpeed / 20) }));
  player.on("dash", () => audio.play("dash"));

  let coins = 0;
  const addCoin = (x: number, y: number) => {
    const coin = new Trigger(world, { x, y, width: 0.6, height: 0.6, target: player, color: "#ecc94b", round: true });
    coin.on("enter", () => {
      coins++;
      audio.play("coin");
      game.removeEntity(coin);
    });
    game.addEntity(coin);
  };
  addCoin(-2, -3.5);
  addCoin(0, -3.5);
  addCoin(5, 0);

  audio.playMusic("music", { fade: 1 }); // waits for the first click or key

  game.on("frame", () => {
    const locked = audio.state === "running" ? "" : " · click to enable sound";
    ui.status(`coins ${coins}${locked}`);
  });

  game.start();
  return {
    game,
    player,
    sliders: [
      { label: "masterVolume", min: 0, max: 1, step: 0.05, value: 1, set: (v) => (audio.masterVolume = v) },
      { label: "effectsVolume", min: 0, max: 1, step: 0.05, value: 1, set: (v) => (audio.effectsVolume = v) },
      { label: "musicVolume", min: 0, max: 1, step: 0.05, value: 1, set: (v) => (audio.musicVolume = v) },
    ],
    toggles: [
      { label: "mute", value: false, set: (on) => (audio.isMuted = on) },
      { label: "music", value: true, set: (on) => (on ? audio.playMusic("music", { fade: 0.5 }) : audio.stopMusic({ fade: 0.5 })) },
    ],
  };
}
