import { Box, Game, Ground, Player } from "@francodelportdev/rapier-engine";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error("Missing <canvas id=\"game\">");

const game = await Game.create(canvas);
const world = game.getWorld();

game.addEntity(new Ground(world));
game.addEntity(new Player(world));

const box = new Box(world, 0, 5);
game.addEntity(box);
game.addEntity(new Box(world, 1, 8));

// Space: kick the first box upwards.
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") box.applyImpulse(0, 5);
});

game.start();
