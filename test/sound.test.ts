import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/core";
import { cueOfEnd, cuesBetween } from "../src/sound";

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
