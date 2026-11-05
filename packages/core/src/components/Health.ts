import { EventEmitter, type Listener } from "../systems/EventEmitter";
import { Component } from "./Component";

export interface HealthOptions {
  /** Seconds after a hit during which further damage is ignored. Default: 0. */
  invulnerableTime?: number;
}

export interface HealthEvents {
  /** The health changed. `delta` is negative for damage. */
  change: { health: number; max: number; delta: number };
  /** The health reached 0. */
  death: Record<string, never>;
}

/** Hit points. It doesn't remove the entity: listen to `death` and decide what happens. */
export class Health extends Component {
  public readonly max: number;
  private current: number;
  private readonly invulnerableTime: number;
  private invulnerableTimer = 0;
  private readonly events = new EventEmitter<HealthEvents>();

  constructor(max: number, options: HealthOptions = {}) {
    super();
    if (!(max > 0)) throw new Error("Health needs a maximum above 0");
    this.max = max;
    this.current = max;
    this.invulnerableTime = options.invulnerableTime ?? 0;
  }

  public get value(): number {
    return this.current;
  }

  public get isDead(): boolean {
    return this.current === 0;
  }

  public get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  public on<K extends keyof HealthEvents>(event: K, listener: Listener<HealthEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** Like `on()`, but the listener runs only once. */
  public once<K extends keyof HealthEvents>(event: K, listener: Listener<HealthEvents[K]>): () => void {
    return this.events.once(event, listener);
  }

  public off<K extends keyof HealthEvents>(event: K, listener: Listener<HealthEvents[K]>): void {
    this.events.off(event, listener);
  }

  /** Takes damage. Returns false if it was ignored (dead or invulnerable). */
  public damage(amount: number): boolean {
    if (amount <= 0 || this.isDead || this.isInvulnerable) return false;
    this.set(this.current - amount);
    this.invulnerableTimer = this.invulnerableTime;
    if (this.isDead) this.events.emit("death", {});
    return true;
  }

  /** Recovers health, up to the maximum. A dead entity stays dead: use `reset()`. */
  public heal(amount: number): void {
    if (amount > 0 && !this.isDead) this.set(this.current + amount);
  }

  /** Back to full health. */
  public reset(): void {
    this.invulnerableTimer = 0;
    this.set(this.max);
  }

  public override update(dt: number): void {
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
  }

  private set(value: number): void {
    const next = Math.min(this.max, Math.max(0, value));
    const delta = next - this.current;
    this.current = next;
    if (delta !== 0) this.events.emit("change", { health: next, max: this.max, delta });
  }
}
