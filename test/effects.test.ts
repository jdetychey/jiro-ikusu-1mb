import { describe, expect, it } from "vitest";
import { Effects } from "../src/effects";
import { cellSizeFor, entityRects, MAX_CELL_PX, MIN_CELL_PX } from "../src/render";
import type { Snapshot } from "../src/core";

const fixedRandom = () => 0.5;
const cells = Array.from({ length: 30 }, (_, i) => 100 + i);

describe("Effects", () => {
  it("is idle until something happens", () => {
    expect(new Effects(fixedRandom, false).active).toBe(false);
  });

  it("is active after a capture and idle again once its effects expire", () => {
    const effects = new Effects(fixedRandom, false);
    effects.capture(cells, 300);
    const during = effects.active;
    effects.update(2_000);
    expect([during, effects.active]).toEqual([true, false]);
  });

  it("shakes on a lost life", () => {
    const effects = new Effects(() => 1, false);
    effects.hit();
    expect(effects.shakeOffset()).not.toEqual({ x: 0, y: 0 });
  });

  it("holds still on a lost life for a player who asks for less motion", () => {
    const effects = new Effects(() => 1, true);
    effects.hit();
    expect(effects.shakeOffset()).toEqual({ x: 0, y: 0 });
  });

  it("keeps only the floating gain for a player who asks for less motion", () => {
    const effects = new Effects(fixedRandom, true);
    effects.capture(cells, 900);
    effects.cleared();
    effects.update(1_000);
    expect(effects.active).toBe(false);
  });

  it("ignores a capture of no cells", () => {
    const effects = new Effects(fixedRandom, false);
    effects.capture([], 300);
    expect(effects.active).toBe(false);
  });
});

describe("cellSizeFor", () => {
  it.each([[240, 4], [358, 5], [600, 10], [5000, MAX_CELL_PX], [10, MIN_CELL_PX]])("fits %i pixels with cells of %i", (pixels, cell) => {
    expect(cellSizeFor(pixels, pixels)).toBe(cell);
  });
});

describe("entityRects", () => {
  const snapshot = (invulnerable: number): Snapshot => ({
    player: { x: 5, y: 5, cutting: false },
    lives: 3,
    shield: 1,
    invulnerable,
    boss: { x: 20, y: 20, size: 5 },
    minions: [{ state: "live", x: 0, y: 7, heading: 1 }],
    claimBp: 0,
    targetBp: 7500,
    ticksUsed: 0,
    ticksLeft: 2700,
  });

  it("gives the boss and each minion a dark core, apart from the player", () => {
    expect(entityRects(snapshot(0), 5).map(({ color }) => color)).toEqual(["#ff3cf0", "#5a0d55", "#3cff78", "#0b3d1d", "#ffffff"]);
  });

  it("hides the player on the off beat of a blink", () => {
    expect(entityRects(snapshot(10), 5, false).some(({ color }) => color === "#9a9a9a")).toBe(false);
  });

  it("shows the player on the on beat of a blink", () => {
    expect(entityRects(snapshot(10), 5, true).some(({ color }) => color === "#9a9a9a")).toBe(true);
  });
});
