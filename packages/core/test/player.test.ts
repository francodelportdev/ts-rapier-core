import { beforeEach, describe, expect, test } from "bun:test";
import { Box, Ground, Platform, Player, Shape, type PlayerEvents } from "../src";
import { createWorld, keys, simulate, simulateUntil } from "./helpers";

beforeEach(() => keys.reset());

/** A player standing on the default ground, after letting it settle. */
function setup(options: ConstructorParameters<typeof Player>[1] = {}) {
  const world = createWorld();
  const ground = new Ground(world);
  const player = new Player(world, options);
  const entities = [ground, player];
  simulate(world, entities, 10);
  return { world, player, entities };
}

/** Records every event the player emits. */
function recordEvents(player: Player) {
  const jumps: PlayerEvents["jump"][] = [];
  const dashes: PlayerEvents["dash"][] = [];
  player.on("jump", (e) => jumps.push(e));
  player.on("dash", (e) => dashes.push(e));
  return { jumps, dashes };
}

/** Highest Y the player reaches while `run` steps the simulation. */
function maxHeight(player: Player, run: (onStep: () => void) => void): number {
  let max = -Infinity;
  run(() => (max = Math.max(max, player.getPosition().y)));
  return max;
}

describe("Player: resting", () => {
  test("stands on the ground, idle", () => {
    const { player } = setup();
    expect(player.isGrounded()).toBe(true);
    expect(player.getState()).toBe("idle");
    expect(player.getPosition().y).toBeCloseTo(-3.5, 1); // ground top -4.5 + half height 1
  });
});

describe("Player: movement", () => {
  test("accelerates to top speed and stops after release", () => {
    const { world, player, entities } = setup();
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    expect(player.getVelocity().x).toBeCloseTo(8, 5);
    expect(player.getState()).toBe("run");
    expect(player.getFacing()).toBe(1);

    keys.up("ArrowRight");
    simulate(world, entities, 30);
    expect(player.getVelocity().x).toBe(0);
    expect(player.getState()).toBe("idle");
  });

  test("alternative keys (A/D) work too", () => {
    const { world, player, entities } = setup();
    keys.down("KeyA");
    simulate(world, entities, 10);
    expect(player.getVelocity().x).toBeLessThan(0);
    expect(player.getFacing()).toBe(-1);
  });

  test("custom keys replace only the given action", () => {
    const { world, player, entities } = setup({ keys: { jump: ["KeyZ"] } });
    const { jumps } = recordEvents(player);
    keys.down("Space");
    simulate(world, entities, 5);
    expect(jumps).toHaveLength(0);
    keys.down("KeyZ");
    keys.down("ArrowRight"); // default "right" still works
    simulate(world, entities, 5);
    expect(jumps).toHaveLength(1);
    expect(player.getVelocity().x).toBeGreaterThan(0);
  });

  test("a wall stops it, so turning away is immediate", () => {
    const world = createWorld();
    const player = new Player(world);
    const entities = [new Ground(world), new Platform(world, { x: 2, y: -2, width: 1, height: 4 }), player];
    keys.down("ArrowRight");
    simulate(world, entities, 30); // pressed against the wall (face at x = 1.5)
    expect(player.getVelocity().x).toBe(0);
    keys.up("ArrowRight");
    keys.down("ArrowLeft");
    simulate(world, entities, 3);
    expect(player.getPosition().x).toBeLessThan(0.99);
  });

  test("pushes dynamic boxes", () => {
    const world = createWorld();
    const box = new Box(world, 2, -4);
    const entities = [new Ground(world), new Player(world), box];
    simulate(world, entities, 20);
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(box.getPosition().x).toBeGreaterThan(5);
  });
});

describe("Player: jump", () => {
  test("a full jump reaches about jumpHeight (3 m)", () => {
    const { world, player, entities } = setup();
    const start = player.getPosition().y;
    const top = maxHeight(player, (track) => {
      keys.down("Space");
      simulate(world, entities, 60, track);
    });
    expect(top - start).toBeGreaterThan(2.7);
    expect(top - start).toBeLessThan(3.05);
  });

  test("jumpHeight changes the height", () => {
    const { world, player, entities } = setup({ jumpHeight: 1 });
    const start = player.getPosition().y;
    const top = maxHeight(player, (track) => {
      keys.down("Space");
      simulate(world, entities, 60, track);
    });
    expect(top - start).toBeGreaterThan(0.85);
    expect(top - start).toBeLessThan(1.05);
  });

  test("a short tap jumps lower than holding (variable height)", () => {
    const { world, player, entities } = setup();
    const start = player.getPosition().y;
    const top = maxHeight(player, (track) => {
      keys.down("Space");
      simulate(world, entities, 3, track);
      keys.up("Space");
      simulate(world, entities, 60, track);
    });
    expect(top - start).toBeLessThan(2);
  });

  test("holding the key doesn't jump again on landing", () => {
    const { world, player, entities } = setup();
    const { jumps } = recordEvents(player);
    keys.down("Space");
    simulate(world, entities, 120);
    expect(jumps).toHaveLength(1);
  });

  test("with maxJumps 1, a second press in the air does nothing", () => {
    const { world, player, entities } = setup();
    const { jumps } = recordEvents(player);
    keys.down("Space");
    simulate(world, entities, 10);
    keys.up("Space");
    simulate(world, entities, 2);
    keys.down("Space");
    simulate(world, entities, 5);
    expect(jumps).toHaveLength(1);
  });

  test("with maxJumps 2, the second press double jumps higher", () => {
    const single = setup();
    const double = setup({ maxJumps: 2 });
    const { jumps } = recordEvents(double.player);

    const press = (s: ReturnType<typeof setup>) =>
      maxHeight(s.player, (track) => {
        keys.down("Space");
        simulate(s.world, s.entities, 15, track);
        keys.up("Space");
        simulate(s.world, s.entities, 2, track);
        keys.down("Space");
        simulate(s.world, s.entities, 60, track);
        keys.reset();
      });

    const singleTop = press(single);
    const doubleTop = press(double);
    expect(doubleTop).toBeGreaterThan(singleTop + 1.5);
    expect(jumps).toEqual([
      { airJump: false, wallJump: false, jumpNumber: 1 },
      { airJump: true, wallJump: false, jumpNumber: 2 },
    ]);
  });

  test("landing restores the double jump", () => {
    const { world, player, entities } = setup({ maxJumps: 2 });
    const { jumps } = recordEvents(player);
    const doubleJump = () => {
      keys.down("Space");
      simulate(world, entities, 10);
      keys.up("Space");
      simulate(world, entities, 2);
      keys.down("Space");
      simulate(world, entities, 2);
      keys.up("Space");
      simulateUntil(world, entities, () => player.isGrounded() && player.getVelocity().y === 0);
    };
    doubleJump();
    doubleJump();
    expect(jumps.map((j) => j.airJump)).toEqual([false, true, false, true]);
  });

  test("hitting a ceiling stops the rise", () => {
    const world = createWorld();
    const player = new Player(world);
    // Ceiling 1 m above the player's head.
    const entities = [new Ground(world), player, new Platform(world, { x: 0, y: -1.25, width: 4 })];
    simulate(world, entities, 10);
    const top = maxHeight(player, (track) => {
      keys.down("Space");
      simulate(world, entities, 60, track);
    });
    expect(top).toBeLessThan(-2.4); // head (top + 1) stays below the ceiling at -1.5
  });

  test("hitting a ceiling starts the fall right away (no sticking)", () => {
    const world = createWorld();
    const player = new Player(world);
    const entities = [new Ground(world), player, new Platform(world, { x: 0, y: -1.25, width: 4 })];
    simulate(world, entities, 10);
    keys.down("Space");
    simulate(world, entities, 8); // the head reaches the ceiling within ~4 steps
    // Without the stop, the upward speed (~15 m/s) would take ~0.4 s of gravity to run out.
    expect(player.getVelocity().y).toBeLessThanOrEqual(0);
  });
});

describe("Player: coyote time and jump buffer", () => {
  /** Player running right off the end of a platform; returns steps since it left the ground. */
  function runOffLedge(options: ConstructorParameters<typeof Player>[1] = {}) {
    const world = createWorld();
    const player = new Player(world, { x: -3, y: -3.5, ...options });
    const entities = [new Platform(world, { x: -5, y: -4.75, width: 6 }), player]; // ends at x = -2
    simulate(world, entities, 10);
    keys.down("ArrowRight");
    simulateUntil(world, entities, () => !player.isGrounded());
    return { world, player, entities };
  }

  test("jumping shortly after leaving a ledge still works (coyote time)", () => {
    const { world, player, entities } = runOffLedge();
    const { jumps } = recordEvents(player);
    simulate(world, entities, 3); // 0.05 s < coyoteTime 0.1 s
    keys.down("Space");
    simulate(world, entities, 2);
    expect(jumps).toEqual([{ airJump: false, wallJump: false, jumpNumber: 1 }]);
    expect(player.getVelocity().y).toBeGreaterThan(10);
  });

  test("jumping after coyote time does nothing", () => {
    const { world, player, entities } = runOffLedge();
    const { jumps } = recordEvents(player);
    simulate(world, entities, 12); // 0.2 s > coyoteTime
    keys.down("Space");
    simulate(world, entities, 2);
    expect(jumps).toHaveLength(0);
  });

  test("with coyoteTime 0, there's no grace period", () => {
    const { world, player, entities } = runOffLedge({ coyoteTime: 0 });
    const { jumps } = recordEvents(player);
    simulate(world, entities, 2);
    keys.down("Space");
    simulate(world, entities, 2);
    expect(jumps).toHaveLength(0);
  });

  /** Drops the player from 5 m; `pressBefore` = steps before landing to press jump. */
  function dropAndPress(pressBefore: number, options: ConstructorParameters<typeof Player>[1] = {}) {
    const make = () => {
      const world = createWorld();
      const player = new Player(world, { y: 1.5, ...options });
      return { world, player, entities: [new Ground(world), player] };
    };
    // Dry run to find the landing step (the simulation is deterministic).
    const dry = make();
    const landStep = simulateUntil(dry.world, dry.entities, () => dry.player.isGrounded());

    const run = make();
    const { jumps } = recordEvents(run.player);
    simulate(run.world, run.entities, landStep + 10, (i) => {
      if (i === landStep - pressBefore) keys.down("Space");
      if (i === landStep - pressBefore + 1) keys.up("Space");
    });
    keys.reset();
    return jumps;
  }

  test("pressing jump just before landing jumps on landing (jump buffer)", () => {
    expect(dropAndPress(3)).toEqual([{ airJump: false, wallJump: false, jumpNumber: 1 }]); // 0.05 s early
  });

  test("pressing jump too early before landing does nothing", () => {
    expect(dropAndPress(12)).toHaveLength(0); // 0.2 s > jumpBuffer 0.1 s
  });

  test("with jumpBuffer 0, an early press does nothing", () => {
    expect(dropAndPress(3, { jumpBuffer: 0 })).toHaveLength(0);
  });
});

describe("Player: dash", () => {
  test("is disabled by default", () => {
    const { world, player, entities } = setup();
    const { dashes } = recordEvents(player);
    keys.down("ShiftLeft");
    simulate(world, entities, 15);
    expect(dashes).toHaveLength(0);
    expect(player.getPosition().x).toBeCloseTo(0, 3);
  });

  test("covers about speed × duration (3 m) in the facing direction", () => {
    const { world, player, entities } = setup({ dash: true });
    const { dashes } = recordEvents(player);
    keys.down("KeyX");
    simulate(world, entities, 9); // the 0.15 s dash plus a step
    expect(dashes).toEqual([{ direction: 1, inAir: false }]);
    expect(player.getPosition().x).toBeGreaterThan(2.7); // kinematic moves apply one step later
    expect(player.getPosition().x).toBeLessThan(3.6);
  });

  test("custom dash options change the distance", () => {
    const { world, player, entities } = setup({ dash: { speed: 10, duration: 0.3 } });
    keys.down("KeyX");
    simulate(world, entities, 9);
    expect(player.isDashing()).toBe(true);
    expect(player.getState()).toBe("dash");
  });

  test("respects the cooldown", () => {
    const { world, player, entities } = setup({ dash: true });
    const { dashes } = recordEvents(player);
    keys.down("KeyX");
    simulate(world, entities, 10);
    keys.up("KeyX");
    simulate(world, entities, 1);
    keys.down("KeyX"); // 0.18 s after the first: inside the 0.4 s cooldown
    simulate(world, entities, 2);
    expect(dashes).toHaveLength(1);

    keys.up("KeyX");
    simulate(world, entities, 20);
    keys.down("KeyX"); // after the cooldown
    simulate(world, entities, 2);
    expect(dashes).toHaveLength(2);
  });

  test("allows one dash per jump in the air", () => {
    const { world, player, entities } = setup({ dash: { cooldown: 0 } });
    const { dashes } = recordEvents(player);
    keys.down("Space");
    simulate(world, entities, 5);
    for (let i = 0; i < 2; i++) {
      keys.down("KeyX");
      simulate(world, entities, 12);
      keys.up("KeyX");
      simulate(world, entities, 1);
    }
    expect(dashes).toEqual([{ direction: 1, inAir: true }]);
  });
});

describe("Player: respawn", () => {
  test("falling below respawnBelow returns to the start", () => {
    const world = createWorld();
    const player = new Player(world, { x: 3, y: 0, respawnBelow: -10 });
    const fell: boolean[] = [];
    player.on("respawn", ({ fell: f }) => fell.push(f));
    simulateUntil(world, [player], () => fell.length > 0); // no ground: it falls
    simulate(world, [player], 1);
    expect(player.getPosition().x).toBeCloseTo(3, 3);
    expect(player.getPosition().y).toBeGreaterThan(-1);
    expect(fell).toEqual([true]);
  });

  test("respawn() resets position and velocity", () => {
    const { world, player, entities } = setup();
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    player.respawn();
    expect(player.getPosition().x).toBe(0);
    expect(player.getVelocity()).toEqual({ x: 0, y: 0 });
  });
});

describe("Player: configure", () => {
  test("changes speed and jump height while running", () => {
    const { world, player, entities } = setup();
    player.configure({ speed: 3, jumpHeight: 1 });
    keys.down("ArrowRight");
    simulate(world, entities, 30);
    expect(player.getVelocity().x).toBeCloseTo(3, 5);
    const start = player.getPosition().y;
    const top = maxHeight(player, (track) => {
      keys.down("Space");
      simulate(world, entities, 40, track);
    });
    expect(top - start).toBeLessThan(1.05);
  });

  test("merges dash options and ignores them if the dash is off", () => {
    const on = setup({ dash: true });
    on.player.configure({ dash: { speed: 5 } });
    expect(on.player.getTuning().dash).toEqual({ speed: 5, duration: 0.15, cooldown: 0.4 });
    const off = setup();
    off.player.configure({ dash: { speed: 5 } });
    expect(off.player.getTuning().dash).toBeUndefined();
  });

  test("maxSlope updates the controller", () => {
    const world = createWorld();
    const ramp = new Shape(world, { x: 5, y: -4.5, geometry: { type: "ramp", width: 6, height: 3.46 } }); // 30°
    const player = new Player(world);
    const entities = [new Ground(world), ramp, player];
    simulate(world, entities, 10);
    player.configure({ maxSlope: 20 });
    keys.down("ArrowRight");
    simulate(world, entities, 60);
    expect(player.getPosition().y).toBeLessThan(-3.2);
  });
});
