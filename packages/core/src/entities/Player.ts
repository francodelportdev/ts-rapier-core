import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import type { ControlAction } from "../systems/actions";
import { Input } from "../systems/Input";
import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { toInteractionGroups, type CollisionFilter } from "../systems/layers";
import { isOneWay, oneWayBlocks } from "../systems/oneWay";
import { entityOf } from "../systems/entityRegistry";

/** What the player is doing. Updated once per physics step. */
export type PlayerState = "idle" | "run" | "jump" | "fall" | "dash" | "wallSlide";

/** Events emitted by `Player`, with their payloads. Velocities are in m/s, positions in meters. */
export interface PlayerEvents {
  /** The state changed (for example, from "run" to "jump"). */
  stateChange: { from: PlayerState; to: PlayerState };
  /**
   * A jump started. `airJump` is true for extra jumps in the air (double jump),
   * `wallJump` for jumps off a wall.
   */
  jump: { airJump: boolean; wallJump: boolean; jumpNumber: number };
  /** The player touched the ground after being in the air. `fallSpeed` is the downward speed at impact. */
  land: { fallSpeed: number };
  /** A dash started. `direction` is 1 (right) or -1 (left). */
  dash: { direction: 1 | -1; inAir: boolean };
  /** The player started sliding down a wall. `side` is the wall's side: 1 = right, -1 = left. */
  wallSlideStart: { side: 1 | -1 };
  /** The player stopped sliding down a wall (it jumped, landed, let go or the wall ended). */
  wallSlideEnd: { side: 1 | -1 };
  /** The player dropped through a one-way platform (↓ + jump while standing on it). */
  dropThrough: Record<string, never>;
  /** The player went back to its start position. `fell` is true if it fell below `respawnBelow`. */
  respawn: { fell: boolean };
}

/** Which keys (`KeyboardEvent.code`) trigger each action. Any key in the list works. */
export type PlayerKeys = Record<ControlAction, readonly string[]>;

export interface DashOptions {
  /** Horizontal speed during the dash, in m/s. Default: 20. */
  speed?: number;
  /** How long the dash lasts, in seconds. Default: 0.15. */
  duration?: number;
  /** Minimum time between dashes, in seconds. Default: 0.4. */
  cooldown?: number;
}

export interface WallJumpOptions {
  /** Fastest fall while sliding down a wall, in m/s. Default: 3. */
  slideSpeed?: number;
  /** Horizontal speed away from the wall at the start of a wall jump, in m/s. Default: 10. */
  pushSpeed?: number;
  /** Height of a wall jump, in meters. Default: the player's `jumpHeight`. */
  jumpHeight?: number;
  /**
   * After a wall jump, the arrow keys are ignored for this long, in seconds, so the player
   * can't steer straight back into the same wall. Default: 0.15.
   */
  controlLock?: number;
  /** Time after leaving a wall during which a wall jump still works, in seconds. Default: 0.1. */
  coyoteTime?: number;
}

export interface PlayerOptions {
  /** Start position (center), in meters. Default: (0, -3.5), standing on `Ground`. */
  x?: number;
  y?: number;
  /** Half extents of the player's box, in meters. Default: 0.5 × 1. */
  halfWidth?: number;
  halfHeight?: number;
  color?: string;

  /** Top horizontal speed, in m/s. Default: 8. */
  speed?: number;
  /** How fast it reaches top speed on the ground, in m/s². Default: 80. */
  acceleration?: number;
  /** How fast it stops on the ground when no key is pressed, in m/s². Default: 60. */
  deceleration?: number;
  /** Multiplier for acceleration/deceleration in the air (0–1). Default: 0.6. */
  airControl?: number;

  /** Gravity applied to the player, in m/s² (positive = down). Default: 40. */
  gravity?: number;
  /** Maximum falling speed, in m/s. Default: 25. */
  maxFallSpeed?: number;
  /** Height of a full jump, in meters. Default: 3. */
  jumpHeight?: number;
  /** Upward speed kept when the jump key is released early (0–1). Default: 0.5. */
  jumpCut?: number;
  /** Time after leaving a ledge during which a jump still counts as grounded, in seconds. Default: 0.1. */
  coyoteTime?: number;
  /** Time a jump press is remembered before landing, in seconds. Default: 0.1. */
  jumpBuffer?: number;
  /** Jumps available before touching the ground again. 2 = double jump. Default: 1. */
  maxJumps?: number;

  /**
   * Steepest slope the player can walk up and stand on without sliding, in degrees. Steeper
   * surfaces count as walls (they stop it, and it can wall slide on them). Default: 50.
   */
  maxSlope?: number;
  /**
   * After ↓ + jump on a one-way platform, one-way platforms are ignored for this long,
   * in seconds, so the player falls through instead of landing on the same one. Default: 0.25.
   */
  dropThroughTime?: number;
  /** Falling below this Y (meters) sends the player back to its start position. Default: -15. */
  respawnBelow?: number;

  /** Enables the dash. `true` uses the defaults. Default: false. */
  dash?: boolean | DashOptions;
  /**
   * Enables wall sliding and wall jumping. `true` uses the defaults. Default: false.
   * Walls are fixed or kinematic bodies; dynamic bodies (like boxes) don't count.
   */
  wallJump?: boolean | WallJumpOptions;

  /** Its own keyboard keys, instead of those of the action. On-screen buttons and pads still work. */
  keys?: Partial<PlayerKeys>;
  /** What it is and what it collides with. Default: everything. */
  collision?: CollisionFilter;
}

/** The options `player.configure()` can change while the game runs. */
export type PlayerTuning = Partial<
  Pick<
    PlayerOptions,
    | "speed"
    | "acceleration"
    | "deceleration"
    | "airControl"
    | "gravity"
    | "maxFallSpeed"
    | "jumpHeight"
    | "jumpCut"
    | "coyoteTime"
    | "jumpBuffer"
    | "maxJumps"
    | "maxSlope"
    | "dropThroughTime"
  >
> & {
  /** Ignored if the player was created without a dash. */
  dash?: DashOptions;
  /** Ignored if the player was created without wall jumps. */
  wallJump?: WallJumpOptions;
};

type ResolvedOptions = Required<Omit<PlayerOptions, "dash" | "wallJump" | "keys" | "collision">> & {
  collision?: CollisionFilter;
  dash: Required<DashOptions> | null;
  wallJump: Required<WallJumpOptions> | null;
  keys: Partial<PlayerKeys>;
};

function resolveOptions(o: PlayerOptions): ResolvedOptions {
  const dash = o.dash === true ? {} : o.dash || null;
  const wallJump = o.wallJump === true ? {} : o.wallJump || null;
  return {
    x: o.x ?? 0,
    y: o.y ?? -3.5,
    halfWidth: o.halfWidth ?? 0.5,
    halfHeight: o.halfHeight ?? 1,
    color: o.color ?? "#48bb78",
    speed: o.speed ?? 8,
    acceleration: o.acceleration ?? 80,
    deceleration: o.deceleration ?? 60,
    airControl: o.airControl ?? 0.6,
    gravity: o.gravity ?? 40,
    maxFallSpeed: o.maxFallSpeed ?? 25,
    jumpHeight: o.jumpHeight ?? 3,
    jumpCut: o.jumpCut ?? 0.5,
    coyoteTime: o.coyoteTime ?? 0.1,
    jumpBuffer: o.jumpBuffer ?? 0.1,
    maxJumps: o.maxJumps ?? 1,
    respawnBelow: o.respawnBelow ?? -15,
    maxSlope: o.maxSlope ?? 50,
    dropThroughTime: o.dropThroughTime ?? 0.25,
    dash: dash && {
      speed: dash.speed ?? 20,
      duration: dash.duration ?? 0.15,
      cooldown: dash.cooldown ?? 0.4,
    },
    wallJump: wallJump && {
      slideSpeed: wallJump.slideSpeed ?? 3,
      pushSpeed: wallJump.pushSpeed ?? 10,
      jumpHeight: wallJump.jumpHeight ?? o.jumpHeight ?? 3,
      controlLock: wallJump.controlLock ?? 0.15,
      coyoteTime: wallJump.coyoteTime ?? 0.1,
    },
    keys: { ...o.keys },
    collision: o.collision,
  };
}

/** Mass used to push dynamic bodies, in kg. Boxes weigh 1 kg, so the player shoves them easily. */
const CHARACTER_MASS = 10;

/** Shortest time in the air, in seconds, that counts as falling (and as landing afterwards). */
const MIN_AIR_TIME = 0.05;

/** How far beside the player to look for a wall, in meters. */
const WALL_PROBE = 0.05;

/** Leaves out undefined values, and rejects anything that would turn the physics into NaN. */
function numbersOnly<T extends object>(values: T): Partial<T> {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  for (const [key, value] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid value for "${key}": ${String(value)}`);
  }
  return Object.fromEntries(entries) as Partial<T>;
}

/** Moves `current` towards `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  return current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target);
}

/**
 * A platformer character. It uses Rapier's kinematic character controller,
 * which resolves collisions, detects the ground and pushes dynamic bodies.
 */
export class Player extends Entity<ResolvedOptions> {
  private readonly input = Input.getInstance();
  private readonly controller: RAPIER.KinematicCharacterController;

  private vx = 0;
  private vy = 0;
  private facing: 1 | -1 = 1;
  private grounded = false;
  private jumpsUsed = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpHeld = false;
  /** True from a jump until the rise is cut or ends. */
  private rising = false;
  private dashHeld = false;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private airDashUsed = false;
  private dashFromGround = false;
  /** Side of the wall being slid on (1 = right, -1 = left), or 0. */
  private wallSlideSide: 0 | 1 | -1 = 0;
  /** Side of the last wall slid on, for wall coyote time. */
  private lastWallSide: 1 | -1 = 1;
  private wallCoyoteTimer = 0;
  private controlLockTimer = 0;
  /** Reused shapes for wall and ground probes. */
  private wallProbe: RAPIER.Cuboid | null = null;
  private groundProbe: RAPIER.Cuboid | null = null;
  /** True while standing on a one-way platform. */
  private onOneWay = false;
  /** The kinematic body under the player, and where it was last step, to ride it. */
  private ridden: { handle: number; x: number; y: number } | null = null;
  /** While above 0, one-way platforms are ignored (dropping through). */
  private dropTimer = 0;
  /** The player's bottom edge before this step's move, for the one-way filter. */
  private filterBounds = { left: 0, right: 0, bottom: 0 };
  /**
   * Which colliders block the player: everything, except one-way platforms it's below or
   * beside (or all of them while dropping through).
   *
   * Filters run inside Rapier's WebAssembly code, where calling Rapier again fails silently,
   * so this only reads plain JavaScript data (see systems/oneWay.ts and `filterBounds`).
   */
  private readonly solidFilter = (collider: RAPIER.Collider): boolean => {
    if (!isOneWay(this.world, collider)) return true;
    if (this.dropTimer > 0) return false;
    const { left, right, bottom } = this.filterBounds;
    return oneWayBlocks(this.world, collider, left, right, bottom);
  };
  /** One-way platforms are never walls. */
  private readonly wallFilter = (collider: RAPIER.Collider): boolean => !isOneWay(this.world, collider);
  /** Surfaces whose normal points up less than this (cos of maxSlope) are walls, not slopes. */
  private minWallNormalY = 0;
  private state: PlayerState = "idle";
  /** Seconds since the player last touched the ground. */
  private airTime = 0;
  private readonly events = new EventEmitter<PlayerEvents>();
  /** What the controller ran into during the last step. */
  private hits: Entity[] = [];
  /** True while wall jumps use the player's `jumpHeight`, because none of their own was given. */
  private wallJumpHeightInherited: boolean;

  constructor(world: RAPIER.World, options: PlayerOptions = {}) {
    super(world, resolveOptions(options));
    this.wallJumpHeightInherited = typeof options.wallJump !== "object" || options.wallJump.jumpHeight === undefined;
    this.controller = world.createCharacterController(0.01);
    this.controller.enableSnapToGround(0.2);
    this.controller.enableAutostep(0.3, 0.2, false);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(CHARACTER_MASS);
    this.applyMaxSlope();
  }

  /**
   * Changes options while the game runs. Only the given values change, and they apply from
   * the next physics step.
   *
   * ```ts
   * player.configure({ speed: 12, dash: { cooldown: 0.1 } });
   * ```
   */
  public configure(tuning: PlayerTuning): void {
    const { dash, wallJump, ...rest } = tuning;
    Object.assign(this.options, numbersOnly(rest));
    if (dash && this.options.dash) Object.assign(this.options.dash, numbersOnly(dash));
    if (wallJump && this.options.wallJump) Object.assign(this.options.wallJump, numbersOnly(wallJump));
    if (wallJump?.jumpHeight !== undefined) this.wallJumpHeightInherited = false;
    if (this.options.wallJump && this.wallJumpHeightInherited) this.options.wallJump.jumpHeight = this.options.jumpHeight;
    if (rest.maxSlope !== undefined) this.applyMaxSlope();
  }

  /** The current value of the options that `configure()` can change. */
  public getTuning(): PlayerTuning {
    const { dash, wallJump, x, y, halfWidth, halfHeight, color, respawnBelow, keys, collision, ...rest } = this.options;
    return { ...rest, ...(dash && { dash: { ...dash } }), ...(wallJump && { wallJump: { ...wallJump } }) };
  }

  /** Climb slopes up to maxSlope, and don't slide down them while standing still. */
  private applyMaxSlope(): void {
    const maxSlope = (this.options.maxSlope * Math.PI) / 180;
    this.controller.setMaxSlopeClimbAngle(maxSlope);
    this.controller.setMinSlopeSlideAngle(maxSlope);
    this.minWallNormalY = Math.cos(maxSlope);
  }

  /** It goes back to its start position at `respawnBelow` instead. */
  public override get survivesKillPlane(): boolean {
    return true;
  }

  /** True while standing on something. */
  public isGrounded(): boolean {
    return this.grounded;
  }

  /** True while a dash is in progress. */
  public isDashing(): boolean {
    return this.dashTimer > 0;
  }

  /** True while standing on a one-way platform (so ↓ + jump would drop through it). */
  public isOnOneWayPlatform(): boolean {
    return this.grounded && this.onOneWay;
  }

  /** True while sliding down a wall. */
  public isWallSliding(): boolean {
    return this.wallSlideSide !== 0;
  }

  /** What the player is doing right now. */
  public getState(): PlayerState {
    return this.state;
  }

  /** Current velocity, in m/s. */
  public getVelocity(): { x: number; y: number } {
    return { x: this.vx, y: this.vy };
  }

  /** Which way the player faces: 1 = right, -1 = left. */
  public getFacing(): 1 | -1 {
    return this.facing;
  }

  /**
   * Subscribes to a player event. Returns a function that unsubscribes.
   *
   * ```ts
   * const off = player.on("jump", ({ airJump }) => playSound(airJump ? "jump2" : "jump"));
   * ```
   */
  public on<K extends keyof PlayerEvents>(event: K, listener: Listener<PlayerEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** Like `on()`, but the listener runs only once. */
  public once<K extends keyof PlayerEvents>(event: K, listener: Listener<PlayerEvents[K]>): () => void {
    return this.events.once(event, listener);
  }

  public off<K extends keyof PlayerEvents>(event: K, listener: Listener<PlayerEvents[K]>): void {
    this.events.off(event, listener);
  }

  protected override createBody(): RAPIER.RigidBody {
    const { x, y } = this.options;
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y));
  }

  protected override createCollider(): RAPIER.Collider {
    const { halfWidth, halfHeight } = this.options;
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight), this.body);
  }

  /** Moves the player back to its start position and stops it. */
  public respawn(): void {
    this.reset();
    this.events.emit("respawn", { fell: false });
  }

  private reset(): void {
    this.body.setTranslation({ x: this.options.x, y: this.options.y }, true);
    this.vx = 0;
    this.vy = 0;
    this.dashTimer = 0;
    this.rising = false;
    this.grounded = false;
    this.airTime = 0;
    this.controlLockTimer = 0;
    this.wallCoyoteTimer = 0;
    this.dropTimer = 0;
    this.ridden = null;
    this.setWallSlide(0);
  }

  public override update(): void {
    if (this.body.translation().y < this.options.respawnBelow) {
      this.reset();
      this.events.emit("respawn", { fell: true });
    }

    const input = this.readInput();
    this.tickTimers(input.jumpPressed);
    this.tryStartDash(input.dashPressed);

    if (this.dashTimer > 0 && this.options.dash) {
      this.updateDash(this.options.dash);
    } else {
      this.updateHorizontal(input.dir, input.locked);
      const wall = this.updateWallSlide(input.dir);
      this.tryJump(wall);
      this.applyJumpCut(input.jumpDown);
      this.applyGravity();
    }

    this.moveWithCollisions();
  }

  private readInput() {
    const inputDir = (this.isActionDown("right") ? 1 : 0) - (this.isActionDown("left") ? 1 : 0);
    // Right after a wall jump, the arrow keys are ignored so the player can't steer back into the wall.
    this.controlLockTimer = Math.max(0, this.controlLockTimer - this.world.timestep);
    const locked = this.controlLockTimer > 0;
    const dir = locked ? 0 : inputDir;
    const jumpDown = this.isActionDown("jump");
    const dashDown = this.isActionDown("dash");
    const jumpPressed = jumpDown && !this.jumpHeld; // true only on the step the key goes down
    const dashPressed = dashDown && !this.dashHeld;
    this.jumpHeld = jumpDown;
    this.dashHeld = dashDown;
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;
    return { dir, locked, jumpDown, jumpPressed, dashPressed };
  }

  private isActionDown(action: ControlAction): boolean {
    return this.input.isAction(action, this.options.keys[action]);
  }

  private tickTimers(jumpPressed: boolean): void {
    const dt = this.world.timestep;
    const o = this.options;
    this.coyoteTimer = this.grounded ? o.coyoteTime : Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = jumpPressed ? o.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.wallCoyoteTimer = Math.max(0, this.wallCoyoteTimer - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    if (this.grounded) {
      this.jumpsUsed = 0;
      this.airDashUsed = false;
    }
  }

  private tryStartDash(dashPressed: boolean): void {
    const { dash } = this.options;
    if (!dash || !dashPressed || this.dashCooldownTimer !== 0 || (!this.grounded && this.airDashUsed)) return;
    this.dashTimer = dash.duration;
    this.dashCooldownTimer = dash.cooldown;
    if (!this.grounded) this.airDashUsed = true;
    this.dashFromGround = this.grounded;
    this.events.emit("dash", { direction: this.facing, inAir: !this.grounded });
  }

  /** A fixed horizontal burst, with gravity paused. */
  private updateDash(dash: Required<DashOptions>): void {
    this.dashTimer = Math.max(0, this.dashTimer - this.world.timestep);
    this.vx = this.facing * dash.speed;
    // A ground dash keeps a small downward push so the controller still detects the ground.
    this.vy = this.dashFromGround ? -1 : 0;
    if (this.dashTimer === 0) this.vx = this.facing * this.options.speed; // exit at normal top speed
    this.setWallSlide(0); // dashing ends a wall slide
  }

  private updateHorizontal(dir: number, locked: boolean): void {
    if (locked) return;
    const o = this.options;
    const control = this.grounded ? 1 : o.airControl;
    const rate = (dir !== 0 ? o.acceleration : o.deceleration) * control;
    this.vx = approach(this.vx, dir * o.speed, rate * this.world.timestep);
  }

  /** Sliding: in the air, falling, touching a wall and pushing towards it. Returns the wall's side. */
  private updateWallSlide(dir: number): 0 | 1 | -1 {
    const { wallJump } = this.options;
    const wall = wallJump && !this.grounded ? this.touchingWall() : 0;
    const sliding = wallJump !== null && wall !== 0 && dir === wall && this.vy <= 0;
    if (sliding) {
      this.lastWallSide = wall;
      this.wallCoyoteTimer = wallJump.coyoteTime;
    }
    this.setWallSlide(sliding ? wall : 0);
    return wall;
  }

  /** Applies a buffered jump press: dropping through, a wall jump, or a normal jump. */
  private tryJump(wall: 0 | 1 | -1): void {
    if (this.jumpBufferTimer <= 0) return;
    const o = this.options;
    const canGroundJump = this.coyoteTimer > 0 && this.jumpsUsed === 0;
    // A wall touched (or slid on moments ago) beats an air jump, so the double jump is kept for later.
    const wallSide = wall !== 0 ? wall : this.wallCoyoteTimer > 0 ? this.lastWallSide : 0;
    const canAirJump = !canGroundJump && this.jumpsUsed < o.maxJumps && (this.jumpsUsed > 0 || o.maxJumps > 1);

    if (this.grounded && this.onOneWay && this.isActionDown("down")) {
      this.dropThrough();
    } else if (o.wallJump && !canGroundJump && wallSide !== 0) {
      this.wallJumpFrom(wallSide, o.wallJump);
    } else if (canGroundJump || canAirJump) {
      // v = √(2·g·h) reaches exactly `jumpHeight`.
      this.vy = Math.sqrt(2 * o.gravity * o.jumpHeight);
      // Walking off a ledge without jumping spends the ground jump.
      this.jumpsUsed = canGroundJump ? 1 : Math.max(this.jumpsUsed, 1) + 1;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.rising = true;
      this.events.emit("jump", { airJump: !canGroundJump, wallJump: false, jumpNumber: this.jumpsUsed });
    }
  }

  /** ↓ + jump on a one-way platform: fall through it instead of jumping. */
  private dropThrough(): void {
    this.dropTimer = this.options.dropThroughTime;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.jumpsUsed = 1; // like walking off a ledge: the ground jump is spent
    this.events.emit("dropThrough", {});
  }

  /** Up and away from the wall, with the arrow keys locked for a moment. */
  private wallJumpFrom(side: 1 | -1, wallJump: Required<WallJumpOptions>): void {
    this.vy = Math.sqrt(2 * this.options.gravity * wallJump.jumpHeight);
    this.vx = -side * wallJump.pushSpeed;
    this.facing = side === 1 ? -1 : 1;
    this.controlLockTimer = wallJump.controlLock;
    this.jumpsUsed = 1; // counts as the ground jump: a double jump is still available
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.wallCoyoteTimer = 0;
    this.rising = true;
    this.setWallSlide(0);
    this.events.emit("jump", { airJump: false, wallJump: true, jumpNumber: 1 });
  }

  /** Variable jump height: releasing the key early cuts the rise (once per jump). */
  private applyJumpCut(jumpDown: boolean): void {
    if (!this.rising || (this.vy > 0 && jumpDown)) return;
    if (this.vy > 0) this.vy *= this.options.jumpCut;
    this.rising = false;
  }

  private applyGravity(): void {
    const o = this.options;
    // Sliding down a wall caps the fall speed at `slideSpeed`.
    const maxFall = this.isWallSliding() && o.wallJump ? o.wallJump.slideSpeed : o.maxFallSpeed;
    this.vy = Math.max(this.vy - o.gravity * this.world.timestep, -maxFall);
  }

  private moveWithCollisions(): void {
    const dt = this.world.timestep;
    const o = this.options;
    const collider = this.body.collider(0);
    const desired = { x: this.vx * dt, y: this.vy * dt };
    // Standing on the ground, gravity would only press the player into the controller's offset,
    // where the floor stops it sideways. Snap-to-ground keeps it down, also on slopes.
    if (this.grounded && this.vy <= 0) desired.y = 0;
    const ride = this.rideDelta();
    desired.x += ride.x;
    desired.y += ride.y;
    const start = this.body.translation();
    this.filterBounds = {
      left: start.x - o.halfWidth,
      right: start.x + o.halfWidth,
      bottom: start.y - o.halfHeight,
    };
    this.controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups(), this.solidFilter);
    const moved = this.controller.computedMovement();
    this.hits = [];
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const collider = this.controller.computedCollision(i)?.collider;
      const entity = collider ? entityOf(this.world, collider) : undefined;
      if (entity !== undefined && !this.hits.includes(entity)) this.hits.push(entity);
    }
    const fallSpeed = Math.max(0, -this.vy);
    // The controller also reports "grounded" when a corner of the box rests on a steep surface,
    // which would let the player stand on (and jump up) walls. Only walkable ground counts.
    this.grounded = this.controller.computedGrounded() && this.onWalkableGround(moved);
    if (!this.grounded) this.ridden = null; // its last position would be stale when falling
    const prevAirTime = this.airTime;
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    // Hitting a ceiling stops the rise, and hitting a wall stops the horizontal speed, so
    // turning away from a wall is immediate. Dynamic bodies don't stop it: pushing a box keeps
    // full speed instead of restarting from zero every step.
    if (desired.y > 0 && moved.y < desired.y - 1e-4) this.vy = 0;
    if (this.hitStaticWall()) this.vx = 0;
    if (this.grounded && this.vy < 0) this.vy = 0;
    if (this.grounded) this.setWallSlide(0);
    if (this.vy === 0) this.rising = false;

    if (this.grounded && prevAirTime >= MIN_AIR_TIME) this.events.emit("land", { fallSpeed });
    this.setState(this.computeState());

    this.body.setNextKinematicTranslation({ x: start.x + moved.x, y: start.y + moved.y });
  }

  /** @internal The controller pushes bodies without Rapier reporting a contact. */
  public override collectContacts(): readonly Entity[] {
    return this.hits;
  }

  protected override onDestroy(): void {
    this.world.removeCharacterController(this.controller);
  }

  /** The controller and the probes are queries, so they need the player's filter passed in. */
  private queryGroups(): number {
    return toInteractionGroups(this.getCollision());
  }

  /** True if the last movement ran into a fixed or kinematic body in the direction of `vx`. */
  private hitStaticWall(): boolean {
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      const body = hit?.collider?.parent();
      if (!hit || !body || body.isDynamic()) continue;
      // normal1 points out of the obstacle: a wall on the right has a normal pointing left.
      // Slopes up to maxSlope point up enough to be walkable, so they don't count.
      if (hit.normal1.y < this.minWallNormalY - 1e-3 && Math.sign(hit.normal1.x) === -Math.sign(this.vx)) return true;
    }
    return false;
  }

  /**
   * How far the kinematic body under the player moved since the last step, so it rides along.
   * Going up needs nothing: the body lifts the player by itself.
   */
  private rideDelta(): { x: number; y: number } {
    const body = this.ridden && this.vy <= 0 ? this.world.getRigidBody(this.ridden.handle) : null;
    if (!body || !this.ridden) return { x: 0, y: 0 };
    const p = body.translation();
    return { x: p.x - this.ridden.x, y: Math.min(0, p.y - this.ridden.y) };
  }

  /** True if the surface right below the player (after `moved`) is no steeper than maxSlope. */
  private onWalkableGround(moved: RAPIER.Vector): boolean {
    const { halfWidth, halfHeight } = this.options;
    const t = this.body.translation();
    this.groundProbe ??= new RAPIER.Cuboid(halfWidth, halfHeight);
    const hit = this.world.castShape(
      { x: t.x + moved.x, y: t.y + moved.y },
      0,
      { x: 0, y: -1 },
      this.groundProbe,
      0,
      0.1, // the snap-to-ground distance is 0.2, but grounded contacts are within the 0.01 m offset
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      this.queryGroups(),
      undefined,
      this.body,
      this.solidFilter,
    );
    this.onOneWay = hit !== null && isOneWay(this.world, hit.collider);
    const under = hit?.collider.parent();
    this.ridden = under?.isKinematic() ? { handle: under.handle, ...under.translation() } : null;
    // For shape casts, normal1 is the outward normal of the surface that was hit.
    return hit !== null && hit.normal1.y >= this.minWallNormalY - 1e-3;
  }

  /** Side of a wall right next to the player (1 = right, -1 = left), or 0. Walkable slopes don't count. */
  private touchingWall(): 0 | 1 | -1 {
    const { halfWidth, halfHeight } = this.options;
    const t = this.body.translation();
    // The player's box, a bit shorter so floors and ceilings don't count, moved WALL_PROBE sideways.
    this.wallProbe ??= new RAPIER.Cuboid(halfWidth, halfHeight * 0.9);
    const sides: readonly (1 | -1)[] = [this.facing, this.facing === 1 ? -1 : 1]; // facing side first
    for (const side of sides) {
      const hit = this.world.castShape(
        t,
        0,
        { x: side, y: 0 },
        this.wallProbe,
        0,
        WALL_PROBE + 0.01, // the controller keeps a 0.01 m gap
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        this.queryGroups(),
        undefined,
        this.body,
        this.wallFilter,
      );
      // For shape casts, normal1 is the outward normal of the surface that was hit.
      if (hit !== null && hit.normal1.y < this.minWallNormalY - 1e-3) return side;
    }
    return 0;
  }

  private setWallSlide(side: 0 | 1 | -1): void {
    if (side === this.wallSlideSide) return;
    const previous = this.wallSlideSide;
    this.wallSlideSide = side;
    if (previous !== 0) this.events.emit("wallSlideEnd", { side: previous });
    if (side !== 0) this.events.emit("wallSlideStart", { side });
  }

  private computeState(): PlayerState {
    if (this.isDashing()) return "dash";
    if (this.isWallSliding()) return "wallSlide";
    if (this.vy > 0) return "jump";
    // Brief losses of ground contact (spawning, the end of a dash, small bumps) don't count as falling.
    if (this.grounded || this.airTime < MIN_AIR_TIME) return Math.abs(this.vx) > 0.1 ? "run" : "idle";
    return "fall";
  }

  private setState(to: PlayerState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    this.events.emit("stateChange", { from, to });
  }

  public override draw(ctx: CanvasRenderingContext2D, scale: number, centerX: number, centerY: number): void {
    const { halfWidth, halfHeight, color } = this.options;
    this.drawCuboid(ctx, halfWidth, halfHeight, this.isDashing() ? "#9ae6b4" : color, scale, centerX, centerY);

    // Eye, to show which way the player faces.
    const t = this.body.translation();
    const { px, py } = this.toCanvas(t.x + this.facing * halfWidth * 0.5, t.y + halfHeight * 0.5, scale, centerX, centerY);
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(px - 0.08 * scale, py - 0.08 * scale, 0.16 * scale, 0.16 * scale);
  }
}
