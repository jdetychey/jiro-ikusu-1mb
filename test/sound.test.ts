import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/core";
import { cueOfEnd, cuesBetween, musicStep } from "../src/sound";

const snapshot = (over: Partial<Snapshot>): Snapshot => ({
  player: { x: 0, y: 0, cutting: false },
  lives: 3,
  shield: 1,
  invulnerable: 0,
  boss: { x: 0, y: 0, size: 5 },
  minions: [],
  claimBp: 0,
  targetBp: 7500,
  ticksUsed: 0,
  ticksLeft: 2700,
  ...over,
});

describe("cuesBetween", () => {
  it.each([
    ["a small capture", { claimBp: 100 }, ["capture"]],
    ["a big capture", { claimBp: 900 }, ["bigCapture"]],
    ["a lost life", { lives: 2 }, ["hit"]],
    ["a spent shield", { shield: 0 }, ["shield"]],
    ["nothing", {}, []],
  ] as const)("cues %s", (_, change, cues) => {
    expect(cuesBetween(snapshot({}), snapshot(change))).toEqual(cues);
  });
});

describe("cueOfEnd", () => {
  it.each([
    ["Cleared", 8000, "cleared"],
    ["Committed", 6000, "over"],
    ["Out of lives", 0, "over"],
  ] as const)("ends %s at %i with %s", (end, claim, cue) => {
    expect(cueOfEnd(end, claim, 7500)).toBe(cue);
  });
});

describe("musicStep", () => {
  it("repeats every 16 steps", () => {
    expect(musicStep(3)).toEqual(musicStep(19));
  });

  it("always has an arpeggio note", () => {
    expect(Array.from({ length: 16 }, (_, step) => musicStep(step).some(([, wave]) => wave === "triangle"))).toEqual(Array(16).fill(true));
  });

  it("rests the bass on the off beats", () => {
    expect(musicStep(1).map(([, wave]) => wave)).toEqual(["triangle"]);
  });

  it("accepts a negative step", () => {
    expect(musicStep(-1)).toEqual(musicStep(15));
  });
});
