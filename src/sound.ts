// Sound, synthesized with WebAudio so it costs no audio files. The cues come from what changed
// between two snapshots of the core, so the same rules drive the replay and the game.

import type { EndReason, Snapshot } from "./core";

export type Cue = "capture" | "bigCapture" | "hit" | "shield" | "cleared" | "over";

/** The cues of the step from `before` to `after`. */
export function cuesBetween(before: Snapshot, after: Snapshot): Cue[] {
  const cues: Cue[] = [];
  const gained = after.claimBp - before.claimBp;
  if (gained > 0) cues.push(gained >= 500 ? "bigCapture" : "capture");
  if (after.lives < before.lives) cues.push("hit");
  if (after.shield < before.shield) cues.push("shield");
  return cues;
}

export function cueOfEnd(end: EndReason, claimBp: number, targetBp: number): Cue {
  return (end === "Cleared" || end === "Committed") && claimBp >= targetBp ? "cleared" : "over";
}

/** [frequency in Hz, seconds] notes of each cue, played in order on a square wave. */
const NOTES: Record<Cue, [number, number][]> = {
  capture: [[660, 0.06]],
  bigCapture: [[660, 0.06], [880, 0.06], [1320, 0.1]],
  hit: [[180, 0.12], [120, 0.18]],
  shield: [[330, 0.05]],
  cleared: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]],
  over: [[392, 0.15], [330, 0.15], [262, 0.35]],
};

/** The music: a bass and an arpeggio of 16 eighth notes, in A minor, repeated. [Hz, 0 for a rest]. */
const BASS = [110, 0, 110, 0, 131, 0, 147, 0, 110, 0, 110, 0, 98, 0, 131, 0];
const ARPEGGIO = [440, 523, 659, 523, 440, 523, 659, 784, 440, 523, 659, 523, 392, 494, 587, 494];
const BEATS_PER_MINUTE = 130;
const LOOKAHEAD_MS = 100;
const SCHEDULE_AHEAD_S = 0.3;
const MUSIC_GAIN = 0.02;

/** The notes of music step `step` (any whole number: the pattern repeats), as [Hz, wave]. */
export function musicStep(step: number): [number, OscillatorType][] {
  const at = ((step % BASS.length) + BASS.length) % BASS.length;
  const notes: [number, OscillatorType][] = [];
  if ((BASS[at] ?? 0) > 0) notes.push([BASS[at] as number, "square"]);
  notes.push([ARPEGGIO[at] as number, "triangle"]);
  return notes;
}

export class Sound {
  private context: AudioContext | undefined;
  private broken = false;
  muted: boolean;
  musicOn = true;
  private musicTimer: ReturnType<typeof setInterval> | undefined;
  private nextStep = 0;
  private nextStepAt = 0;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Starts the audio on a player's gesture, as browsers (iOS above all) only allow then. */
  unlock(): void {
    if (this.broken) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch (error) {
      this.fail(error);
    }
  }

  /** Starts the music if it is wanted and the audio is running; stops it otherwise. */
  music(playing: boolean): void {
    const context = this.context;
    if (!playing || this.muted || !this.musicOn || this.broken || context === undefined) {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
      return;
    }
    if (this.musicTimer !== undefined) return;
    this.nextStep = 0;
    this.nextStepAt = context.currentTime + 0.05;
    this.musicTimer = setInterval(() => this.scheduleMusic(context), LOOKAHEAD_MS);
  }

  private scheduleMusic(context: AudioContext): void {
    const stepSeconds = 60 / BEATS_PER_MINUTE / 2;
    try {
      while (this.nextStepAt < context.currentTime + SCHEDULE_AHEAD_S) {
        for (const [frequency, wave] of musicStep(this.nextStep)) this.note(context, frequency, wave, this.nextStepAt, stepSeconds * 0.9, MUSIC_GAIN);
        this.nextStep += 1;
        this.nextStepAt += stepSeconds;
      }
    } catch (error) {
      this.fail(error);
      this.music(false);
    }
  }

  private note(context: AudioContext, frequency: number, wave: OscillatorType, at: number, seconds: number, volume: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  }

  private fail(error: unknown): void {
    this.broken = true;
    console.warn("sound is off: the audio could not start", error);
  }

  play(cue: Cue): void {
    if (this.muted || this.broken || this.context === undefined) return;
    try {
      this.schedule(cue, this.context);
    } catch (error) {
      this.fail(error);
    }
  }

  private schedule(cue: Cue, context: AudioContext): void {
    let at = context.currentTime;
    for (const [frequency, seconds] of NOTES[cue]) {
      this.note(context, frequency, "square", at, seconds, 0.04);
      at += seconds;
    }
  }
}
