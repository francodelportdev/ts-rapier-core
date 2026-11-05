import { EventEmitter, type Listener } from "../systems/EventEmitter";

/** A named sequence of sprite sheet frames. */
export interface AnimationClip {
  /** Frame indexes in the sheet, in playing order. */
  frames: readonly number[];
  /** Frames per second. */
  fps: number;
  /** Start over at the end. Default: true. */
  loop?: boolean;
  /** Clip to play when a non-looping clip ends. Default: stay on its last frame. */
  next?: string;
}

export interface AnimatorEvents {
  /** A different clip started. */
  change: { from: string; to: string };
  /** A non-looping clip reached its end. */
  end: { clip: string };
  /** The frame changed. `index` is its position in the clip, useful for footstep sounds. */
  frame: { clip: string; index: number };
}

/** Plays clips over time. It knows nothing about images: `Sprite` draws its current frame. */
export class Animator {
  /** Playback speed multiplier: 2 is twice as fast. */
  public speed = 1;
  private readonly clips: Readonly<Record<string, AnimationClip>>;
  private readonly events = new EventEmitter<AnimatorEvents>();
  private clipName: string;
  private index = 0;
  private elapsed = 0;
  private paused = false;
  private finished = false;

  constructor(clips: Readonly<Record<string, AnimationClip>>, initial: string) {
    for (const [name, clip] of Object.entries(clips)) {
      if (clip.frames.length === 0) throw new Error(`Animation "${name}" has no frames`);
      if (!(clip.fps > 0)) throw new Error(`Animation "${name}" needs an fps above 0`);
      if (clip.next !== undefined && !(clip.next in clips)) throw new Error(`Animation "${name}" has an unknown next clip "${clip.next}"`);
    }
    if (!(initial in clips)) throw new Error(`Unknown animation "${initial}"`);
    this.clips = clips;
    this.clipName = initial;
  }

  /** Switches clip. Asking for the clip already playing does nothing, unless `restart` is true. */
  public play(name: string, { restart = false }: { restart?: boolean } = {}): void {
    if (!(name in this.clips)) throw new Error(`Unknown animation "${name}"`);
    if (name === this.clipName && !restart) return;
    const from = this.clipName;
    this.clipName = name;
    this.index = 0;
    this.elapsed = 0;
    this.finished = false;
    if (from !== name) this.events.emit("change", { from, to: name });
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public get clip(): string {
    return this.clipName;
  }

  /** The sheet frame to draw now. */
  public get frame(): number {
    return this.current.frames[this.index]!;
  }

  /** The position in the current clip. */
  public get frameIndex(): number {
    return this.index;
  }

  /** True once a non-looping clip has reached its end. */
  public get isFinished(): boolean {
    return this.finished;
  }

  public on<K extends keyof AnimatorEvents>(event: K, listener: Listener<AnimatorEvents[K]>): () => void {
    return this.events.on(event, listener);
  }

  /** Advances by `dt` seconds. `Game` calls it every physics step for entities with a sprite. */
  public update(dt: number): void {
    if (this.paused || this.finished) return;
    this.elapsed += dt * this.speed;
    // Each pass reads the clip again, because `next` may have changed it.
    while (!this.finished && this.elapsed >= 1 / this.current.fps) {
      this.elapsed -= 1 / this.current.fps;
      this.advance();
    }
  }

  private get current(): AnimationClip {
    return this.clips[this.clipName]!;
  }

  private advance(): void {
    const { frames, loop = true, next } = this.current;
    if (this.index < frames.length - 1) {
      this.index++;
    } else if (loop) {
      if (frames.length === 1) return;
      this.index = 0;
    } else {
      const clip = this.clipName;
      this.finished = true;
      this.events.emit("end", { clip });
      if (next !== undefined && this.clipName === clip) this.play(next);
      return;
    }
    this.events.emit("frame", { clip: this.clipName, index: this.index });
  }
}
