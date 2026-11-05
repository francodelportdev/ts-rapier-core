import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Component, Health, Lifetime, Patrol, Shape } from "../src";
import { createGame, createWorld, freed, keys, stepGame } from "./helpers";

beforeEach(() => keys.reset());

class Counter extends Component {
  public log: string[] = [];
  public steps = 0;
  public override onAttach() { this.log.push("attach"); }
  public override onDetach() { this.log.push("detach"); }
  public override update() { this.steps++; }
}
class Other extends Component {}

describe("Components on entities", () => {
  test("add, get, has and remove", () => {
    const box = new Box(createWorld());
    const counter = box.add(new Counter());
    expect(counter.entity as unknown).toBe(box);
    expect(box.get(Counter)).toBe(counter);
    expect(box.has(Other)).toBe(false);
    expect(box.get(Other)).toBeUndefined();
    box.remove(Counter);
    expect(box.has(Counter)).toBe(false);
    expect(counter.log).toEqual(["attach", "detach"]);
    expect(() => box.remove(Counter)).not.toThrow();
  });

  test("two of the same class throw", () => {
    const box = new Box(createWorld());
    box.add(new Counter());
    expect(() => box.add(new Counter())).toThrow(/Counter/);
  });

  test("Game updates them, with dt in seconds", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    let total = 0;
    class Clock extends Component {
      public override update(dt: number) { total += dt; }
    }
    box.add(new Clock());
    game.addEntity(box);
    game.start();
    stepGame(game, 60);
    expect(total).toBeCloseTo(1, 3);
  });

  test("a component can remove itself while updating", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    class Once extends Component {
      public override update() { this.entity.remove(Once); }
    }
    box.add(new Once());
    game.addEntity(box);
    game.start();
    stepGame(game, 2);
    expect(box.has(Once)).toBe(false);
  });

  test("destroying the entity detaches them, also through game.destroy()", async () => {
    const box = new Box(createWorld());
    const counter = box.add(new Counter());
    box.destroy();
    expect(counter.log).toEqual(["attach", "detach"]);

    const game = await createGame();
    const inGame = new Box(game.getWorld());
    const second = inGame.add(new Counter());
    game.addEntity(inGame);
    freed.add(game.getWorld());
    game.destroy();
    expect(second.log).toEqual(["attach", "detach"]);
  });

  test("draw runs after the entity's", () => {
    const box = new Box(createWorld());
    const order: string[] = [];
    box.draw = () => void order.push("entity");
    class Overlay extends Component {
      public override draw() { order.push("component"); }
    }
    box.add(new Overlay());
    box.render({} as CanvasRenderingContext2D, 30, 0, 0);
    expect(order).toEqual(["entity", "component"]);
  });

  test("getGame() follows addEntity", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    expect(box.getGame()).toBeNull();
    game.addEntity(box);
    expect(box.getGame()).toBe(game);
  });
});

describe("Health", () => {
  const setup = (max = 3, options = {}) => new Box(createWorld()).add(new Health(max, options));

  test("damage, heal and clamping", () => {
    const h = setup();
    const changes: number[] = [];
    h.on("change", ({ delta }) => changes.push(delta));
    expect(h.damage(1)).toBe(true);
    h.heal(5);
    expect(h.value).toBe(3);
    expect(changes).toEqual([-1, 1]);
  });

  test("death fires once, and a dead entity ignores damage and heal until reset", () => {
    const h = setup();
    let deaths = 0;
    h.on("death", () => deaths++);
    h.damage(10);
    expect(h.value).toBe(0);
    expect(h.damage(1)).toBe(false);
    h.heal(1);
    expect(h.isDead).toBe(true);
    expect(deaths).toBe(1);
    h.reset();
    expect(h.value).toBe(3);
  });

  test("invulnerableTime ignores hits until it passes", () => {
    const h = setup(3, { invulnerableTime: 0.5 });
    h.damage(1);
    expect(h.damage(1)).toBe(false);
    h.update(0.6);
    expect(h.damage(1)).toBe(true);
  });

  test("rejects a maximum of 0", () => {
    expect(() => new Health(0)).toThrow();
  });
});

describe("Lifetime", () => {
  test("removes the entity from the game after its time", async () => {
    const game = await createGame();
    const box = new Box(game.getWorld());
    box.add(new Lifetime(0.5));
    game.addEntity(box);
    game.start();
    stepGame(game, 20);
    expect(game.getEntities()).toContain(box);
    stepGame(game, 15);
    expect(game.getEntities()).toHaveLength(0);
    expect(box.isDestroyed).toBe(true);
  });

  test("without a game, it destroys the entity", () => {
    const box = new Box(createWorld());
    box.add(new Lifetime(0.1)).update(0.2);
    expect(box.isDestroyed).toBe(true);
  });
});

describe("Patrol", () => {
  const geometry = { type: "box", width: 1, height: 1 } as const;

  test("goes to the last point and comes back", async () => {
    const game = await createGame();
    const world = game.getWorld();
    const e = new Shape(world, { x: 0, y: 0, body: "kinematic", geometry });
    e.add(new Patrol([{ x: 0, y: 0 }, { x: 2, y: 0 }], 2));
    game.addEntity(e);
    game.start();
    stepGame(game, 62);
    expect(e.getPosition().x).toBeCloseTo(2, 1);
    stepGame(game, 60);
    expect(e.getPosition().x).toBeLessThan(0.2);
  });

  test("visits every point in order", async () => {
    const game = await createGame();
    const e = new Shape(game.getWorld(), { x: 0, y: 0, body: "kinematic", geometry });
    e.add(new Patrol([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 2));
    game.addEntity(e);
    game.start();
    stepGame(game, 62); // 2 m at 2 m/s
    expect(e.getPosition().x).toBeCloseTo(1, 1);
    expect(e.getPosition().y).toBeGreaterThan(0.8);
  });

  test("only works on kinematic entities, with 2 or more points", () => {
    const world = createWorld();
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(() => new Box(world).add(new Patrol(points))).toThrow(/kinematic/);
    expect(() => new Patrol([{ x: 0, y: 0 }])).toThrow(/2 points/);
  });
});
