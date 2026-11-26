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

export class Sound {
  private context: AudioContext | undefined;
  private broken = false;
  muted: boolean;

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
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + seconds);
      at += seconds;
    }
  }
}
