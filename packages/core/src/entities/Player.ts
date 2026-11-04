import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import { Input } from "../systems/Input";
import { EventEmitter, type Listener } from "../systems/EventEmitter";

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
  /** The player went back to its start position. `fell` is true if it fell below `respawnBelow`. */
  respawn: { fell: boolean };
}

/** Which keys (`KeyboardEvent.code`) trigger each action. Any key in the list works. */
export interface PlayerKeys {
  left: readonly string[];
  right: readonly string[];
  jump: readonly string[];
  dash: readonly string[];
}

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

  /** Falling below this Y (meters) sends the player back to its start position. Default: -15. */
  respawnBelow?: number;

  /** Enables the dash. `true` uses the defaults. Default: false. */
  dash?: boolean | DashOptions;
  /**
   * Enables wall sliding and wall jumping. `true` uses the defaults. Default: false.
   * Walls are fixed or kinematic bodies; dynamic bodies (like boxes) don't count.
   */
  wallJump?: boolean | WallJumpOptions;

  keys?: Partial<PlayerKeys>;
}

const DEFAULT_KEYS: PlayerKeys = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "ArrowUp", "KeyW"],
  dash: ["ShiftLeft", "ShiftRight", "KeyX"],
};

type ResolvedOptions = Required<Omit<PlayerOptions, "dash" | "wallJump" | "keys">> & {
  dash: Required<DashOptions> | null;
  wallJump: Required<WallJumpOptions> | null;
  keys: PlayerKeys;
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
    keys: { ...DEFAULT_KEYS, ...o.keys },
  };
}

/** Mass used to push dynamic bodies, in kg. Boxes weigh 1 kg, so the player shoves them easily. */
const CHARACTER_MASS = 10;

/** Shortest time in the air, in seconds, that counts as falling (and as landing afterwards). */
const MIN_AIR_TIME = 0.05;

/** How far beside the player to look for a wall, in meters. */
const WALL_PROBE = 0.05;

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
  /** Reused shape for wall probes (half extents set per probe). */
  private wallProbe: RAPIER.Cuboid | null = null;
  private state: PlayerState = "idle";
  /** Seconds since the player last touched the ground. */
  private airTime = 0;
  private readonly events = new EventEmitter<PlayerEvents>();

  constructor(world: RAPIER.World, options: PlayerOptions = {}) {
    super(world, resolveOptions(options));
    this.controller = world.createCharacterController(0.01);
    this.controller.enableSnapToGround(0.2);
    this.controller.enableAutostep(0.3, 0.2, false);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(CHARACTER_MASS);
  }

  /** True while standing on something. */
  public isGrounded(): boolean {
    return this.grounded;
  }

  /** True while a dash is in progress. */
  public isDashing(): boolean {
    return this.dashTimer > 0;
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
    this.setWallSlide(0);
  }

  public override update(): void {
    const dt = this.world.timestep;
    const o = this.options;
    const keys = o.keys;

    if (this.body.translation().y < o.respawnBelow) {
      this.reset();
      this.events.emit("respawn", { fell: true });
    }

    // --- Read input ---------------------------------------------------------
    const inputDir = (this.input.isAnyPressed(keys.right) ? 1 : 0) - (this.input.isAnyPressed(keys.left) ? 1 : 0);
    // Right after a wall jump, the arrow keys are ignored so the player can't steer back into the wall.
    this.controlLockTimer = Math.max(0, this.controlLockTimer - dt);
    const locked = this.controlLockTimer > 0;
    const dir = locked ? 0 : inputDir;
    const jumpDown = this.input.isAnyPressed(keys.jump);
    const dashDown = this.input.isAnyPressed(keys.dash);
    const jumpPressed = jumpDown && !this.jumpHeld; // true only on the step the key goes down
    const dashPressed = dashDown && !this.dashHeld;
    this.jumpHeld = jumpDown;
    this.dashHeld = dashDown;
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;

    // --- Timers -------------------------------------------------------------
    this.coyoteTimer = this.grounded ? o.coyoteTime : Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = jumpPressed ? o.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.wallCoyoteTimer = Math.max(0, this.wallCoyoteTimer - dt);
    if (this.grounded) {
      this.jumpsUsed = 0;
      this.airDashUsed = false;
    }

    // --- Dash ---------------------------------------------------------------
    if (o.dash && dashPressed && this.dashCooldownTimer === 0 && (this.grounded || !this.airDashUsed)) {
      this.dashTimer = o.dash.duration;
      this.dashCooldownTimer = o.dash.cooldown;
      if (!this.grounded) this.airDashUsed = true;
      this.dashFromGround = this.grounded;
      this.events.emit("dash", { direction: this.facing, inAir: !this.grounded });
    }

    if (this.dashTimer > 0 && o.dash) {
      // Fixed horizontal burst; gravity is paused while dashing. A ground dash keeps a small
      // downward push so the controller still detects (and snaps to) the ground.
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.vx = this.facing * o.dash.speed;
      this.vy = this.dashFromGround ? -1 : 0;
      if (this.dashTimer === 0) this.vx = this.facing * o.speed; // exit at normal top speed
      this.setWallSlide(0); // dashing ends a wall slide
    } else {
      // --- Horizontal movement ----------------------------------------------
      if (!locked) {
        const control = this.grounded ? 1 : o.airControl;
        const rate = (dir !== 0 ? o.acceleration : o.deceleration) * control;
        this.vx = approach(this.vx, dir * o.speed, rate * dt);
      }

      // --- Wall slide -------------------------------------------------------
      // Sliding: in the air, falling, touching a wall and pushing towards it.
      const wall = o.wallJump && !this.grounded ? this.touchingWall() : 0;
      const sliding = o.wallJump !== null && wall !== 0 && dir === wall && this.vy <= 0;
      if (sliding) {
        this.lastWallSide = wall;
        this.wallCoyoteTimer = o.wallJump!.coyoteTime;
      }
      this.setWallSlide(sliding ? wall : 0);

      // --- Jump -------------------------------------------------------------
      const canGroundJump = this.coyoteTimer > 0 && this.jumpsUsed === 0;
      // A wall touched (or slid on moments ago) beats an air jump, so the double jump is kept for later.
      const wallSide = wall !== 0 ? wall : this.wallCoyoteTimer > 0 ? this.lastWallSide : 0;
      const canWallJump = o.wallJump !== null && !canGroundJump && wallSide !== 0;
      const canAirJump = !canGroundJump && this.jumpsUsed < o.maxJumps && (this.jumpsUsed > 0 || o.maxJumps > 1);

      if (this.jumpBufferTimer > 0 && canWallJump && o.wallJump) {
        // Up and away from the wall, with the arrow keys locked for a moment.
        this.vy = Math.sqrt(2 * o.gravity * o.wallJump.jumpHeight);
        this.vx = -wallSide * o.wallJump.pushSpeed;
        this.facing = wallSide === 1 ? -1 : 1;
        this.controlLockTimer = o.wallJump.controlLock;
        this.jumpsUsed = 1; // counts as the ground jump: a double jump is still available
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.wallCoyoteTimer = 0;
        this.rising = true;
        this.setWallSlide(0);
        this.events.emit("jump", { airJump: false, wallJump: true, jumpNumber: 1 });
      } else if (this.jumpBufferTimer > 0 && (canGroundJump || canAirJump)) {
        // v = √(2·g·h) reaches exactly `jumpHeight`.
        this.vy = Math.sqrt(2 * o.gravity * o.jumpHeight);
        // Walking off a ledge without jumping spends the ground jump.
        this.jumpsUsed = canGroundJump ? 1 : Math.max(this.jumpsUsed, 1) + 1;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.rising = true;
        this.events.emit("jump", { airJump: !canGroundJump, wallJump: false, jumpNumber: this.jumpsUsed });
      }

      // Variable jump height: releasing the key early cuts the rise (once per jump).
      if (this.rising && (this.vy <= 0 || !jumpDown)) {
        if (this.vy > 0) this.vy *= o.jumpCut;
        this.rising = false;
      }

      // --- Gravity ----------------------------------------------------------
      // Sliding down a wall caps the fall speed at `slideSpeed`.
      const maxFall = this.isWallSliding() && o.wallJump ? o.wallJump.slideSpeed : o.maxFallSpeed;
      this.vy = Math.max(this.vy - o.gravity * dt, -maxFall);
    }

    // --- Move with collisions -----------------------------------------------
    const collider = this.body.collider(0);
    const desired = { x: this.vx * dt, y: this.vy * dt };
    this.controller.computeColliderMovement(collider, desired);
    const moved = this.controller.computedMovement();
    const fallSpeed = Math.max(0, -this.vy);
    this.grounded = this.controller.computedGrounded();
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

    // --- State and events ---------------------------------------------------
    if (this.grounded && prevAirTime >= MIN_AIR_TIME) this.events.emit("land", { fallSpeed });
    this.setState(this.computeState());

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y });
  }

  protected override onDestroy(): void {
    this.world.removeCharacterController(this.controller);
  }

  /** True if the last movement ran into a fixed or kinematic body in the direction of `vx`. */
  private hitStaticWall(): boolean {
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      const body = hit?.collider?.parent();
      if (!hit || !body || body.isDynamic()) continue;
      // normal1 points out of the obstacle: a wall on the right has a normal pointing left.
      if (Math.abs(hit.normal1.x) > 0.7 && Math.sign(hit.normal1.x) === -Math.sign(this.vx)) return true;
    }
    return false;
  }

  /** Side of a wall right next to the player (1 = right, -1 = left), or 0. */
  private touchingWall(): 0 | 1 | -1 {
    const { halfWidth, halfHeight } = this.options;
    const t = this.body.translation();
    // A thin box beside each side, a bit shorter than the player so floors and ceilings don't count.
    this.wallProbe ??= new RAPIER.Cuboid(WALL_PROBE / 2, halfHeight * 0.8);
    const sides: readonly (1 | -1)[] = [this.facing, this.facing === 1 ? -1 : 1]; // facing side first
    for (const side of sides) {
      const position = { x: t.x + side * (halfWidth + WALL_PROBE / 2), y: t.y };
      let hit = false;
      this.world.intersectionsWithShape(
        position,
        0,
        this.wallProbe,
        () => {
          hit = true;
          return false; // one hit is enough
        },
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        this.body,
      );
      if (hit) return side;
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
