import type { Bounds } from "../core/Camera";
import { Box } from "../entities/Box";
import type { Entity } from "../entities/Entity";
import { Platform, type PlatformOptions } from "../entities/Platform";
import { Player, type PlayerOptions } from "../entities/Player";
import { Shape, type ShapeOptions } from "../entities/Shape";
import { Trigger } from "../entities/Trigger";
import { Scene } from "./Scene";

/** A rectangle of a level: a goal or a hazard. */
export interface LevelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A level as plain data, so it can live in a JSON file. Everything is in meters. */
export interface LevelData {
  name: string;
  /** The camera stays inside this area. Falling 5 m below it respawns the player. */
  bounds: Bounds;
  /** Where the player starts and respawns. */
  spawn: { x: number; y: number };
  /** Reaching it completes the level. */
  goal: LevelArea;
  platforms?: PlatformOptions[];
  shapes?: ShapeOptions[];
  boxes?: { x: number; y: number }[];
  /** Touching one sends the player back to the spawn. */
  hazards?: LevelArea[];
  coins?: { x: number; y: number }[];
  /** Options for this level's player, such as `{ "maxJumps": 2 }`. */
  player?: Omit<PlayerOptions, "x" | "y" | "keys">;
  /**
   * World gravity, in m/s² (positive = down), for boxes and dynamic shapes. The player has its
   * own: use `player: { gravity }`. Default: the game's gravity.
   */
  gravity?: number;
}

export interface LevelStats {
  coins: number;
  totalCoins: number;
  deaths: number;
  /** Seconds since the level started. */
  time: number;
}

export interface LevelSceneOptions {
  /** Scene to go to when the level is complete. It receives the stats as data. */
  next: string;
  /** Length of the fade to the next scene, in seconds. Default: 0.4. */
  fade?: number;
}

const COIN_SIZE = 0.6;

/** Throws a readable error if `data` isn't a usable level, for example a mistyped JSON file. */
export function validateLevel(data: LevelData): void {
  const fail = (problem: string): never => {
    throw new Error(`Invalid level "${data.name ?? "(no name)"}": ${problem}`);
  };
  const numeric = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
  if (typeof data.name !== "string" || data.name === "") fail("missing name");
  if (!data.bounds || ![data.bounds.minX, data.bounds.maxX, data.bounds.minY, data.bounds.maxY].every(numeric)) fail("bounds needs minX, maxX, minY and maxY");
  if (data.bounds.minX >= data.bounds.maxX || data.bounds.minY >= data.bounds.maxY) fail("bounds are empty");
  if (!data.spawn || !numeric(data.spawn.x) || !numeric(data.spawn.y)) fail("spawn needs x and y");
  if (!data.goal || ![data.goal.x, data.goal.y, data.goal.width, data.goal.height].every(numeric)) fail("goal needs x, y, width and height");
}

/**
 * Plays a level: builds it from its data, follows the player with the camera, and handles the
 * goal, hazards and coins. When the goal is reached, it goes to `options.next` with the stats.
 */
export class LevelScene extends Scene {
  private readonly data: LevelData;
  private readonly options: LevelSceneOptions;
  private player!: Player;
  private coins = 0;
  private deaths = 0;
  private steps = 0;
  private finished = false;

  constructor(data: LevelData, options: LevelSceneOptions) {
    super();
    validateLevel(data);
    this.data = data;
    this.options = options;
  }

  public get level(): LevelData {
    return this.data;
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getStats(): LevelStats {
    return {
      coins: this.coins,
      totalCoins: this.data.coins?.length ?? 0,
      deaths: this.deaths,
      time: this.steps * this.world.timestep,
    };
  }

  public override onEnter(): void {
    const { game, world, data } = this;
    const add = <T extends Entity>(entity: T): T => {
      game.addEntity(entity);
      return entity;
    };

    if (data.gravity !== undefined) world.gravity.y = -data.gravity;
    // Below the respawn line, so the kill plane removes lost objects but never the player.
    const respawnBelow = data.bounds.minY - 5;
    game.setKillPlane(respawnBelow - 15);

    for (const options of data.platforms ?? []) add(new Platform(world, options));
    for (const options of data.shapes ?? []) add(new Shape(world, options));
    for (const { x, y } of data.boxes ?? []) add(new Box(world, x, y));

    const player = new Player(world, { ...data.player, ...data.spawn, respawnBelow });
    this.player = player;
    player.on("respawn", ({ fell }) => {
      if (fell) this.deaths++;
      game.camera.snapToTarget();
    });

    const area = (a: LevelArea, color: string, round = false) =>
      new Trigger(world, { ...a, target: player, color, round });

    for (const hazard of data.hazards ?? []) {
      add(area(hazard, "#e53e3e")).on("enter", () => {
        this.deaths++;
        player.respawn();
      });
    }
    for (const { x, y } of data.coins ?? []) {
      const coin = add(area({ x, y, width: COIN_SIZE, height: COIN_SIZE }, "#ecc94b", true));
      coin.on("enter", () => {
        this.coins++;
        game.removeEntity(coin);
      });
    }
    add(area(data.goal, "#48bb78")).on("enter", () => this.finish());
    add(player); // last, so it's drawn on top

    game.camera.follow(player, { deadZone: { width: 3, height: 2 }, offset: { x: 0, y: 1 } });
    game.camera.setBounds(data.bounds);
  }

  public override update(): void {
    if (!this.finished) this.steps++;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.game.scenes.go(this.options.next, { data: this.getStats(), fade: this.options.fade ?? 0.4 });
  }
}
