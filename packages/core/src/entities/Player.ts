import RAPIER from "@dimforge/rapier2d-compat";
import { Entity } from "./Entity";
import { Input } from "../systems/Input";
import { EventEmitter, type Listener } from "../systems/EventEmitter";

/** What the player is doing. Updated once per physics step. */
export type PlayerState = "idle" | "run" | "jump" | "fall" | "dash";

/** Events emitted by `Player`, with their payloads. Velocities are in m/s, positions in meters. */
export interface PlayerEvents {
  /** The state changed (for example, from "run" to "jump"). */
  stateChange: { from: PlayerState; to: PlayerState };
  /** A jump started. `airJump` is true for jumps that started in the air (double jump). */
  jump: { airJump: boolean; jumpNumber: number };
  /** The player touched the ground after being in the air. `fallSpeed` is the downward speed at impact. */
  land: { fallSpeed: number };
  /** A dash started. `direction` is 1 (right) or -1 (left). */
  dash: { direction: 1 | -1; inAir: boolean };
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

  keys?: Partial<PlayerKeys>;
}

const DEFAULT_KEYS: PlayerKeys = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "ArrowUp", "KeyW"],
  dash: ["ShiftLeft", "ShiftRight", "KeyX"],
};

type ResolvedOptions = Required<Omit<PlayerOptions, "dash" | "keys">> & {
  dash: Required<DashOptions> | null;
  keys: PlayerKeys;
};

function resolveOptions(o: PlayerOptions): ResolvedOptions {
  const dash = o.dash === true ? {} : o.dash || null;
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
    keys: { ...DEFAULT_KEYS, ...o.keys },
  };
}

/** Mass used to push dynamic bodies, in kg. Boxes weigh 1 kg, so the player shoves them easily. */
const CHARACTER_MASS = 10;

/** Shortest time in the air, in seconds, that counts as falling (and as landing afterwards). */
const MIN_AIR_TIME = 0.05;

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
    const dir = (this.input.isAnyPressed(keys.right) ? 1 : 0) - (this.input.isAnyPressed(keys.left) ? 1 : 0);
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
    } else {
      // --- Horizontal movement ----------------------------------------------
      const control = this.grounded ? 1 : o.airControl;
      const rate = (dir !== 0 ? o.acceleration : o.deceleration) * control;
      this.vx = approach(this.vx, dir * o.speed, rate * dt);

      // --- Jump -------------------------------------------------------------
      const canGroundJump = this.coyoteTimer > 0 && this.jumpsUsed === 0;
      const canAirJump = !canGroundJump && this.jumpsUsed < o.maxJumps && (this.jumpsUsed > 0 || o.maxJumps > 1);
      if (this.jumpBufferTimer > 0 && (canGroundJump || canAirJump)) {
        // v = √(2·g·h) reaches exactly `jumpHeight`.
        this.vy = Math.sqrt(2 * o.gravity * o.jumpHeight);
        // Walking off a ledge without jumping spends the ground jump.
        this.jumpsUsed = canGroundJump ? 1 : Math.max(this.jumpsUsed, 1) + 1;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.rising = true;
        this.events.emit("jump", { airJump: !canGroundJump, jumpNumber: this.jumpsUsed });
      }

      // Variable jump height: releasing the key early cuts the rise (once per jump).
      if (this.rising && (this.vy <= 0 || !jumpDown)) {
        if (this.vy > 0) this.vy *= o.jumpCut;
        this.rising = false;
      }

      // --- Gravity ----------------------------------------------------------
      this.vy = Math.max(this.vy - o.gravity * dt, -o.maxFallSpeed);
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

    // Hitting a ceiling stops the rise. (Horizontal speed is kept, so the player
    // keeps pushing dynamic bodies instead of restarting from zero every step.)
    if (desired.y > 0 && moved.y < desired.y - 1e-4) this.vy = 0;
    if (this.grounded && this.vy < 0) this.vy = 0;
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

  private computeState(): PlayerState {
    if (this.isDashing()) return "dash";
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
