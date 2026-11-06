/**
 * Scenes & levels: a menu, three levels loaded from JSON, and a results screen after each one.
 * Explanation: the "scenes" page of the docs.
 */
import { Game, Input, LevelScene, Scene, type LevelData, type LevelStats } from "@francodelportdev/rapier-engine";
import firstSteps from "../levels/1-first-steps.json";
import spikes from "../levels/2-spikes.json";
import shaft from "../levels/3-shaft.json";
import type { Demo, DemoUI } from "../ui";

const LEVELS: LevelData[] = [firstSteps, spikes, shaft];

/** A screen of text that moves on when Enter is pressed. */
abstract class TextScene<TData = void> extends Scene<TData> {
  protected abstract readonly next: string;
  protected abstract lines(): string[];
  private armed = false; // Enter must be released first, or a held key would skip this screen

  public override update(): void {
    const enter = Input.getInstance().isPressed("Enter") || this.game.pointer.wasPressed() || Input.getInstance().isPressed("Space");
    if (enter && this.armed) this.game.scenes.go(this.next, { fade: 0.3 });
    if (!enter) this.armed = true;
  }

  public override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    this.lines().forEach((line, i) => {
      ctx.font = i === 0 ? "bold 32px system-ui" : "18px system-ui";
      ctx.fillText(line, width / 2, height / 2 - 40 + i * 36);
    });
  }
}

class MenuScene extends TextScene {
  protected readonly next = "level-0";
  public override onEnter(): void {}
  protected lines(): string[] {
    return ["Three levels", "Collect the coins, reach the green door", "Press Enter or tap to start"];
  }
}

class ResultsScene extends TextScene<LevelStats> {
  protected readonly next: string;
  private stats!: LevelStats;
  constructor(next: string) {
    super();
    this.next = next;
  }
  public override onEnter(stats: LevelStats): void {
    this.stats = stats;
  }
  protected lines(): string[] {
    const { coins, totalCoins, deaths, time } = this.stats;
    return ["Level complete!", `Coins ${coins}/${totalCoins} · Deaths ${deaths} · ${time.toFixed(1)} s`, "Press Enter or tap to continue"];
  }
}

export default async function demo(canvas: HTMLCanvasElement, ui: DemoUI): Promise<Demo> {
  const game = await Game.create(canvas, { grid: true });

  game.scenes.add("menu", () => new MenuScene());
  LEVELS.forEach((level, i) => {
    const isLast = i === LEVELS.length - 1;
    game.scenes.add(`level-${i}`, () => new LevelScene(level, { next: `results-${i}` }));
    game.scenes.add(`results-${i}`, () => new ResultsScene(isLast ? "menu" : `level-${i + 1}`));
  });

  // R: restart the current scene.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") game.scenes.restart({ fade: 0.2 });
  });

  game.on("frame", () => {
    const scene = game.scenes.current;
    if (scene instanceof LevelScene) {
      const { coins, totalCoins, deaths, time } = scene.getStats();
      ui.status(`${scene.level.name} · coins ${coins}/${totalCoins} · deaths ${deaths} · ${time.toFixed(1)} s`);
    } else {
      ui.status(game.scenes.currentSceneName ?? "");
    }
  });

  game.scenes.go("menu");
  game.start();
  return { game };
}
