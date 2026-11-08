/**
 * Components: reusable behaviors added to entities. Patrol and Health come with the engine,
 * and HealthBar and SparkWhenHurt are written here, as examples of your own.
 * Explanation: the "components" page of the docs.
 */
import { Component, Game, Ground, Health, Lifetime, Patrol, Platform, Player, Sensor, Shape } from "rapier-engine";
import type { Demo, DemoUI } from "../ui";

/** Your own component: draws a bar over any entity that has Health. */
class HealthBar extends Component {
  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const health = this.entity.get(Health);
    if (health === undefined) return;
    const { x, y } = this.entity.getPosition();
    const width = 1.2 * scale;
    const left = centerX + x * scale - width / 2;
    const top = centerY - (y + 1.4) * scale;
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(left, top, width, 6);
    ctx.fillStyle = health.isInvulnerable ? "#ecc94b" : "#48bb78";
    ctx.fillRect(left, top, (width * health.value) / health.max, 6);
  }
}

/** Your own component: throws a short-lived spark upwards each time the entity is hurt. */
class SparkWhenHurt extends Component {
  private off = (): void => {};

  public override onAttach(): void {
    const health = this.entity.get(Health);
    if (health === undefined) throw new Error("SparkWhenHurt needs Health");
    this.off = health.on("change", ({ delta }) => {
      const game = this.entity.getGame();
      if (delta >= 0 || game === null) return;
      const { x, y } = this.entity.getPosition();
      const spark = new Shape(game.getWorld(), { x, y: y + 1.6, body: "dynamic", color: "#ed8936", collision: { layers: 0, mask: 0 }, geometry: { type: "circle", radius: 0.2 } });
      spark.applyImpulse((Math.random() - 0.5) * 0.5, 0.8);
      spark.add(new Lifetime(0.6)); // Lifetime comes with the engine
      game.addEntity(spark);
    });
  }

  public override onDetach(): void {
    this.off(); // clean up what onAttach() set up
  }
}

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas);
  const world = game.getWorld();

  game.addEntity(new Ground(world));
  game.addEntity(new Platform(world, { x: 0, y: -0.5, width: 5 }));

  // The player: the same class as always, with new abilities added on top.
  const player = new Player(world, { x: -8, maxJumps: 2 });
  const health = player.add(new Health(5, { invulnerableTime: 1 }));
  player.add(new HealthBar());
  player.add(new SparkWhenHurt());
  game.addEntity(player);

  let deaths = 0;
  health.on("death", () => {
    deaths++;
    health.reset();
    player.respawn();
  });

  // Enemies: a Shape with Patrol, plus a sensor that follows it and hurts the player.
  const patrols: Patrol[] = [];
  const hurtboxes: Sensor[] = [];
  function addEnemy(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const enemy = new Shape(world, { ...from, body: "kinematic", color: "#e53e3e", geometry: { type: "box", width: 1, height: 1 } });
    patrols.push(enemy.add(new Patrol([from, to], 3)));
    game.addEntity(enemy);

    const hurtbox = new Sensor(world, { ...from, follow: enemy, filter: (e) => e === player, geometry: { type: "box", width: 1.1, height: 1.1 } });
    hurtboxes.push(hurtbox);
    game.addEntity(hurtbox);
  }
  addEnemy({ x: -4, y: -4 }, { x: 8, y: -4 });
  addEnemy({ x: -2, y: 0.5 }, { x: 2, y: 0.5 });

  game.on("frame", () => {
    // Touching an enemy keeps hurting, but invulnerableTime allows one hit per second.
    if (hurtboxes.some((hurtbox) => hurtbox.isOccupied())) health.damage(1);
    ui.status(`health ${health.value}/${health.max} · deaths ${deaths}`);
  });

  game.start();
  return {
    game,
    player,
    sliders: [{ label: "Patrol speed", min: 0.5, max: 10, step: 0.5, value: 3, unit: "m/s", set: (v) => patrols.forEach((p) => (p.speed = v)) }],
    toggles: [
      {
        label: "health bar",
        value: true,
        set: (on) => (on ? player.add(new HealthBar()) : player.remove(HealthBar)),
      },
    ],
  };
}
