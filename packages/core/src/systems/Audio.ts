export interface SynthOptions {
  /** Wave shape. Default: "square". */
  wave?: "sine" | "square" | "triangle" | "sawtooth" | "noise";
  /** Pitch in Hz, or a list of notes played one after another. Default: 440. */
  frequency?: number | readonly number[];
  /** Slides each note to this pitch. Default: no slide. */
  endFrequency?: number;
  /** Length of each note, in seconds. Default: 0.15. */
  duration?: number;
  /** Loudness, 0 to 1. Default: 0.5. */
  volume?: number;
}

export interface PlayOptions {
  /** Loudness of this sound, 0 to 1. Default: 1. */
  volume?: number;
  /** Playback speed, which also changes the pitch: 2 is an octave up. Default: 1. */
  rate?: number;
}

export interface MusicOptions {
  volume?: number;
  /** Seconds to fade in, or out when stopping. Default: 0. */
  fade?: number;
}

/** A sound in progress. */
export interface SoundHandle {
  stop(): void;
}

const SILENT: SoundHandle = { stop() {} };
const SAMPLE_RATE = 44100;

/** One sample of a wave, with `phase` measured in cycles. */
function waveAt(wave: NonNullable<SynthOptions["wave"]>, phase: number): number {
  const t = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(phase * Math.PI * 2);
    case "square":
      return t < 0.5 ? 1 : -1;
    case "triangle":
      return 1 - 4 * Math.abs(t - 0.5);
    case "sawtooth":
      return 2 * t - 1;
    case "noise":
      return Math.random() * 2 - 1;
  }
}

/**
 * Sound effects and music, at `game.audio`. Browsers block audio until the player interacts
 * with the page, so it unlocks on the first click, touch or key on the canvas. Until then,
 * effects are skipped and music waits. Where there's no Web Audio, everything does nothing.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  /** Definitions waiting for the context, which can only be created when audio is available. */
  private readonly synths = new Map<string, SynthOptions>();
  private music: { name: string; volume: number; source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number } | null = null;
  /** Music on hold: where to continue from. */
  private pausedMusic: { name: string; volume: number; offset: number } | null = null;
  /** True if the context was suspended because the page was hidden. */
  private hiddenSuspend = false;
  private volumes = { master: 1, effects: 1, music: 1 };
  private muted = false;
  private destroyed = false;

  /** "running" once sound can play. */
  public get state(): string {
    return this.context?.state ?? "unavailable";
  }

  public get masterVolume(): number {
    return this.volumes.master;
  }

  public set masterVolume(value: number) {
    this.volumes.master = value;
    this.applyVolumes();
  }

  public get effectsVolume(): number {
    return this.volumes.effects;
  }

  public set effectsVolume(value: number) {
    this.volumes.effects = value;
    this.applyVolumes();
  }

  public get musicVolume(): number {
    return this.volumes.music;
  }

  public set musicVolume(value: number) {
    this.volumes.music = value;
    this.applyVolumes();
  }

  public get isMuted(): boolean {
    return this.muted;
  }

  public set isMuted(value: boolean) {
    this.muted = value;
    this.applyVolumes();
  }

  /** True if a sound with that name exists. */
  public has(name: string): boolean {
    return this.buffers.has(name) || this.synths.has(name);
  }

  /** Loads a sound file. It rejects if the file can't be loaded or decoded. */
  public async load(name: string, url: string): Promise<void> {
    const context = this.ensureContext();
    if (context === null) {
      this.synths.set(name, {}); // known, so play() stays silent instead of throwing
      return;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the sound "${url}" (${response.status})`);
    this.buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
  }

  /** Creates a sound from code, with no file. */
  public synth(name: string, options: SynthOptions = {}): void {
    this.buffers.delete(name);
    this.synths.set(name, options);
  }

  /** Plays an effect. It throws if the name is unknown, and is skipped while audio is locked. */
  public play(name: string, options: PlayOptions = {}): SoundHandle {
    if (!this.has(name)) throw new Error(`Unknown sound "${name}"`);
    const context = this.ensureContext();
    if (context === null || context.state !== "running" || this.effects === null) return SILENT;
    return this.start(context, name, this.effects, options.volume ?? 1, options.rate ?? 1, false).handle;
  }

  /** Loops a sound as music, replacing the current one. It starts when audio unlocks. */
  public playMusic(name: string, options: MusicOptions = {}): void {
    if (!this.has(name)) throw new Error(`Unknown sound "${name}"`);
    const context = this.ensureContext();
    if (context === null || this.musicBus === null) return;
    this.stopMusic();
    const volume = options.volume ?? 1;
    const { gain } = this.startMusic(context, this.musicBus, name, volume, 0);
    if (options.fade) {
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(volume, context.currentTime + options.fade);
    }
  }

  /** Holds the music where it is. `resumeMusic()` continues from there. */
  public pauseMusic(): void {
    const music = this.music;
    const context = this.context;
    if (music === null || context === null) return;
    const length = music.source.buffer?.duration ?? 0;
    const played = music.offset + context.currentTime - music.startedAt;
    this.pausedMusic = { name: music.name, volume: music.volume, offset: length > 0 ? played % length : 0 };
    this.music = null;
    music.source.stop();
  }

  public resumeMusic(): void {
    const paused = this.pausedMusic;
    const context = this.ensureContext();
    if (paused === null || context === null || this.musicBus === null) return;
    this.pausedMusic = null;
    this.startMusic(context, this.musicBus, paused.name, paused.volume, paused.offset);
  }

  public get isMusicPaused(): boolean {
    return this.pausedMusic !== null;
  }

  public get isMusicPlaying(): boolean {
    return this.music !== null;
  }

  public stopMusic(options: Pick<MusicOptions, "fade"> = {}): void {
    this.pausedMusic = null;
    const music = this.music;
    const context = this.context;
    if (music === null || context === null) return;
    this.music = null;
    const fade = options.fade ?? 0;
    if (fade > 0) {
      music.gain.gain.setValueAtTime(music.gain.gain.value, context.currentTime);
      music.gain.gain.linearRampToValueAtTime(0, context.currentTime + fade);
    }
    music.source.stop(context.currentTime + fade);
  }

  /** @internal Called by `Game` on the first interaction. */
  public unlock(): void {
    const context = this.ensureContext();
    if (context !== null && context.state === "suspended") void context.resume();
  }

  /** @internal Called by `Game`: all sound stops while the page is hidden. */
  public setPageHidden(hidden: boolean): void {
    const context = this.context;
    if (context === null) return;
    if (hidden && context.state === "running") {
      this.hiddenSuspend = true;
      void context.suspend();
    } else if (!hidden && this.hiddenSuspend) {
      this.hiddenSuspend = false; // audio that was still locked stays locked
      void context.resume();
    }
  }

  /** @internal Called by `Game`. */
  public destroy(): void {
    this.destroyed = true;
    this.stopMusic();
    void this.context?.close();
    this.context = null;
  }

  private startMusic(context: AudioContext, bus: GainNode, name: string, volume: number, offset: number) {
    const started = this.start(context, name, bus, volume, 1, true, offset);
    this.music = { name, volume, source: started.source, gain: started.gain, startedAt: context.currentTime, offset };
    return started;
  }

  private start(context: AudioContext, name: string, bus: GainNode, volume: number, rate: number, loop: boolean, offset = 0) {
    const source = context.createBufferSource();
    source.buffer = this.bufferOf(context, name);
    source.playbackRate.value = rate;
    source.loop = loop;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(bus);
    source.start(0, offset);
    return { source, gain, handle: { stop: () => source.stop() } };
  }

  private bufferOf(context: AudioContext, name: string): AudioBuffer {
    let buffer = this.buffers.get(name);
    if (buffer === undefined) {
      buffer = this.render(context, this.synths.get(name)!);
      this.buffers.set(name, buffer);
    }
    return buffer;
  }

  private render(context: AudioContext, options: SynthOptions): AudioBuffer {
    const { wave = "square", frequency = 440, endFrequency, duration = 0.15, volume = 0.5 } = options;
    const notes = typeof frequency === "number" ? [frequency] : frequency;
    const noteLength = Math.max(1, Math.floor(duration * SAMPLE_RATE));
    const buffer = context.createBuffer(1, noteLength * notes.length, SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    let phase = 0;
    notes.forEach((note, n) => {
      for (let i = 0; i < noteLength; i++) {
        const progress = i / noteLength;
        const pitch = endFrequency === undefined ? note : note + (endFrequency - note) * progress;
        phase += pitch / SAMPLE_RATE;
        // A quick fade in and a slower fade out avoid clicks at the edges of each note.
        const envelope = Math.min(1, i / 64) * (1 - progress) ** 0.5;
        data[n * noteLength + i] = waveAt(wave, phase) * envelope * volume;
      }
    });
    return buffer;
  }

  private ensureContext(): AudioContext | null {
    if (this.context !== null) return this.context;
    if (this.destroyed || typeof AudioContext === "undefined") return null;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.effects = context.createGain();
    this.musicBus = context.createGain();
    this.effects.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(context.destination);
    this.applyVolumes();
    return context;
  }

  private applyVolumes(): void {
    if (this.master === null || this.effects === null || this.musicBus === null) return;
    this.master.gain.value = this.muted ? 0 : this.volumes.master;
    this.effects.gain.value = this.volumes.effects;
    this.musicBus.gain.value = this.volumes.music;
  }
}
