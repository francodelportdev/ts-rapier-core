import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AudioManager } from "../src";
import { createGame, firePointer, freed } from "./helpers";

/** Just enough of Web Audio to see what the manager asks for. */
class FakeContext {
  public static last: FakeContext;
  public state = "suspended";
  public currentTime = 5;
  public destination = {};
  public sources: { buffer: unknown; loop: boolean; playbackRate: { value: number }; started: number; stoppedAt: number | null; offset: number; gain?: FakeGain }[] = [];
  public closed = false;
  constructor() {
    FakeContext.last = this;
  }
  createGain() {
    return new FakeGain();
  }
  createBufferSource() {
    const source = {
      buffer: null as unknown, loop: false, playbackRate: { value: 1 }, started: 0, stoppedAt: null as number | null, offset: 0, gain: undefined as FakeGain | undefined,
      connect(g: FakeGain) { source.gain = g; },
      start(_when = 0, offset = 0) { source.started++; source.offset = offset; },
      stop(at = 0) { source.stoppedAt = at; },
    };
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
  }
  async suspend() {
    this.state = "suspended";
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.closed = true;
  }
}
class FakeGain {
  public gain = {
    value: 1,
    ramps: [] as number[][],
    setValueAtTime(v: number, t: number) { this.ramps.push([v, t]); },
    linearRampToValueAtTime(v: number, t: number) { this.ramps.push([v, t]); },
  };
  connect() {}
}

const g = globalThis as { AudioContext?: unknown };
beforeEach(() => void (g.AudioContext = FakeContext));
afterEach(() => void delete g.AudioContext);

function unlocked() {
  const audio = new AudioManager();
  audio.synth("beep");
  audio.unlock();
  FakeContext.last.state = "running";
  return { audio, context: FakeContext.last };
}

describe("AudioManager: synth", () => {
  const samples = (options: Parameters<AudioManager["synth"]>[1]) => {
    const { audio, context } = unlocked();
    audio.synth("s", options);
    audio.play("s");
    return (context.sources.at(-1)!.buffer as { getChannelData(): Float32Array }).getChannelData();
  };

  test("makes a sound of the right length that isn't silent or clipping", () => {
    const data = samples({ duration: 0.1, volume: 0.5 });
    expect(data.length).toBe(4410);
    expect(Math.max(...data)).toBeGreaterThan(0.2);
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(0.5);
  });

  test("a list of notes plays in sequence", () => {
    expect(samples({ frequency: [440, 660, 880], duration: 0.1 }).length).toBe(4410 * 3);
  });

  test("every wave shape makes sound, and fades out without a click", () => {
    for (const wave of ["sine", "square", "triangle", "sawtooth", "noise"] as const) {
      const data = samples({ wave, duration: 0.1 });
      expect(Math.max(...data)).toBeGreaterThan(0.1);
      expect(Math.abs(data.at(-1)!)).toBeLessThan(0.05);
    }
  });

  test("pitch follows the frequency", () => {
    const crossings = (d: Float32Array) => d.reduce((n, v, i) => n + (i > 0 && d[i - 1]! < 0 && v >= 0 ? 1 : 0), 0);
    expect(crossings(samples({ wave: "sine", frequency: 200, duration: 0.5 }))).toBeCloseTo(100, -1);
    expect(crossings(samples({ wave: "sine", frequency: 400, duration: 0.5 }))).toBeCloseTo(200, -1);
  });

  test("a buffer is built once and reused", () => {
    const { audio, context } = unlocked();
    audio.play("beep");
    audio.play("beep");
    expect(context.sources[0]!.buffer).toBe(context.sources[1]!.buffer);
  });
});

describe("AudioManager: playing", () => {
  test("effects play when unlocked, with volume and rate", () => {
    const { audio, context } = unlocked();
    audio.play("beep", { volume: 0.3, rate: 2 });
    const source = context.sources[0]!;
    expect(source.started).toBe(1);
    expect(source.gain!.gain.value).toBe(0.3);
    expect(source.playbackRate.value).toBe(2);
  });

  test("effects are skipped while locked", () => {
    const audio = new AudioManager();
    audio.synth("beep");
    expect(() => audio.play("beep")).not.toThrow();
    expect(FakeContext.last.sources).toHaveLength(0);
  });

  test("unknown sounds throw", () => {
    const audio = new AudioManager();
    expect(() => audio.play("nope")).toThrow(/nope/);
    expect(() => audio.playMusic("nope")).toThrow(/nope/);
  });

  test("a handle stops the sound", () => {
    const { audio, context } = unlocked();
    audio.play("beep").stop();
    expect(context.sources[0]!.stoppedAt).not.toBeNull();
  });

  test("without Web Audio, everything does nothing", () => {
    delete g.AudioContext;
    const audio = new AudioManager();
    audio.synth("beep");
    expect(() => {
      audio.unlock();
      audio.play("beep").stop();
      audio.playMusic("beep");
      audio.stopMusic();
      audio.destroy();
    }).not.toThrow();
    expect(audio.state).toBe("unavailable");
  });
});

describe("AudioManager: music", () => {
  test("loops, starts even while locked, and replaces the current one", () => {
    const audio = new AudioManager();
    audio.synth("a");
    audio.synth("b");
    audio.playMusic("a");
    const context = FakeContext.last;
    expect(context.sources[0]!.loop).toBe(true);
    expect(context.sources[0]!.started).toBe(1);
    audio.playMusic("b");
    expect(context.sources[0]!.stoppedAt).not.toBeNull();
    expect(audio.isMusicPlaying).toBe(true);
  });

  test("fades in and out", () => {
    const { audio, context } = unlocked();
    audio.playMusic("beep", { fade: 2, volume: 0.5 });
    const ramps = context.sources[0]!.gain!.gain.ramps;
    expect(ramps).toEqual([[0, 5], [0.5, 7]]);
    audio.stopMusic({ fade: 1 });
    expect(context.sources[0]!.stoppedAt).toBe(6);
    expect(ramps.at(-1)).toEqual([0, 6]);
    expect(audio.isMusicPlaying).toBe(false);
  });
});

describe("AudioManager: pause", () => {
  function looping() {
    const { audio, context } = unlocked();
    audio.synth("loop", { frequency: [440, 550, 660, 770], duration: 0.5 }); // 2 s long
    audio.playMusic("loop", { volume: 0.4 });
    return { audio, context };
  }

  test("pausing stops the sound, and resuming continues from there", () => {
    const { audio, context } = looping();
    context.currentTime += 0.5;
    audio.pauseMusic();
    expect(context.sources[0]!.stoppedAt).not.toBeNull();
    expect(audio.isMusicPaused).toBe(true);
    expect(audio.isMusicPlaying).toBe(false);
    context.currentTime += 10;
    audio.resumeMusic();
    const resumed = context.sources[1]!;
    expect(resumed.offset).toBeCloseTo(0.5, 3);
    expect(resumed.loop).toBe(true);
    expect(resumed.gain!.gain.value).toBe(0.4);
    expect(audio.isMusicPaused).toBe(false);
  });

  test("a second pause counts from where it resumed, wrapping around the loop", () => {
    const { audio, context } = looping();
    context.currentTime += 1.5;
    audio.pauseMusic();
    audio.resumeMusic();
    context.currentTime += 1;
    audio.pauseMusic();
    audio.resumeMusic();
    expect(context.sources[2]!.offset).toBeCloseTo(0.5, 3);
  });

  test("stopMusic() forgets a pause, and pausing nothing does nothing", () => {
    const { audio } = looping();
    audio.pauseMusic();
    audio.stopMusic();
    expect(audio.isMusicPaused).toBe(false);
    expect(() => {
      audio.pauseMusic();
      audio.resumeMusic();
    }).not.toThrow();
  });
});

describe("AudioManager: hidden page", () => {
  test("suspends while hidden and resumes after", async () => {
    const { audio, context } = unlocked();
    audio.setPageHidden(true);
    expect(context.state).toBe("suspended");
    audio.setPageHidden(false);
    await Promise.resolve();
    expect(context.state).toBe("running");
  });

  test("audio that was still locked stays locked", async () => {
    const audio = new AudioManager();
    audio.synth("beep");
    audio.playMusic("beep"); // creates the context, still suspended
    audio.setPageHidden(true);
    audio.setPageHidden(false);
    await Promise.resolve();
    expect(FakeContext.last.state).toBe("suspended");
  });
});

describe("AudioManager: volumes", () => {
  test("master, effects and music are separate, and mute silences everything", () => {
    const { audio } = unlocked();
    audio.masterVolume = 0.5;
    audio.effectsVolume = 0.25;
    audio.musicVolume = 0.75;
    const a = audio as unknown as { master: FakeGain; effects: FakeGain; musicBus: FakeGain };
    expect([a.master.gain.value, a.effects.gain.value, a.musicBus.gain.value]).toEqual([0.5, 0.25, 0.75]);
    audio.isMuted = true;
    expect(a.master.gain.value).toBe(0);
    audio.isMuted = false;
    expect(a.master.gain.value).toBe(0.5);
  });

  test("volumes set before the context exists still apply", () => {
    const audio = new AudioManager();
    audio.masterVolume = 0.2;
    audio.synth("beep");
    audio.unlock();
    expect((audio as unknown as { master: FakeGain }).master.gain.value).toBe(0.2);
  });
});

describe("Game", () => {
  test("the first click unlocks audio", async () => {
    const game = await createGame();
    game.audio.synth("beep");
    firePointer(game["canvas"], "pointerdown", 0, 0);
    await Promise.resolve();
    expect(game.audio.state).toBe("running");
  });

  test("destroying the game stops the music and closes audio", async () => {
    const game = await createGame();
    game.audio.synth("beep");
    game.audio.playMusic("beep");
    const context = FakeContext.last;
    freed.add(game.getWorld());
    game.destroy();
    expect(context.closed).toBe(true);
    expect(context.sources[0]!.stoppedAt).not.toBeNull();
  });

  test("music survives clear()", async () => {
    const game = await createGame();
    game.audio.synth("beep");
    game.audio.playMusic("beep");
    game.clear();
    expect(game.audio.isMusicPlaying).toBe(true);
  });
});
