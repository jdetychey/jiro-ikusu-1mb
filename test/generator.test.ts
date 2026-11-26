import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { drawLevel, generateLevel, isBossLevel, isRestLevel, knobsAt, rampAt } from "../src/generator";
import { hashText, mulberry32 } from "../src/rng";
import { loadCoreFromTarget } from "./engine";

let core: Core;
beforeAll(async () => {
  core = await loadCoreFromTarget();
});

describe("generateLevel", () => {
  it("is deterministic for a seed and a depth", () => {
    expect(generateLevel(core, "2026-12-01", 5)).toEqual(generateLevel(core, "2026-12-01", 5));
  });

  it("differs between seeds", () => {
    expect(generateLevel(core, "2026-12-01", 5)).not.toEqual(generateLevel(core, "2026-12-02", 5));
  });

  it.each(Array.from({ length: 60 }, (_, depth) => depth))("gives a valid level at depth %i", (depth) => {
    for (const seed of ["2026-12-01", "2026-12-02", "2027-01-15"]) {
      expect(core.validateLevel(generateLevel(core, seed, depth))).toBe(0);
    }
  });
});

describe("knobsAt", () => {
  const depths = Array.from({ length: 120 }, (_, depth) => depth);

  it("never makes a level easier as the depth grows", () => {
    for (const depth of depths.slice(1)) {
      const [before, after] = [rampAt(depth - 1), rampAt(depth)];
      expect(after.bossPeriod).toBeLessThanOrEqual(before.bossPeriod);
      expect(after.minionCount).toBeGreaterThanOrEqual(before.minionCount);
      expect(after.lives).toBeLessThanOrEqual(before.lives);
      expect(after.targetBp).toBeGreaterThanOrEqual(before.targetBp);
      expect(after.timeLimit).toBeLessThanOrEqual(before.timeLimit);
    }
  });

  it.each([4, 14, 24, 34])("eases the rest level %i with no minions", (depth) => {
    expect([isRestLevel(depth), knobsAt(depth).minionCount, knobsAt(depth).targetBp < rampAt(depth).targetBp]).toEqual([true, 0, true]);
  });

  it.each([9, 19, 29, 39])("makes the boss level %i the biggest boss", (depth) => {
    expect([isBossLevel(depth), knobsAt(depth).bossSize]).toEqual([true, [8, 8]]);
  });

  it("keeps every level playable", () => {
    for (const depth of depths) {
      const { timeLimit, targetBp, lives } = knobsAt(depth);
      expect(timeLimit).toBeGreaterThanOrEqual(1200);
      expect(targetBp).toBeLessThanOrEqual(9000);
      expect(lives).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("layouts", () => {
  const obstacleCells = (depth: number, seed: string) => drawLevel(depth, mulberry32(hashText(`${seed}/${depth}`))).cells.reduce((sum, cell) => sum + cell, 0);

  it("leaves the first levels open", () => {
    expect([obstacleCells(0, "2026-12-01"), obstacleCells(1, "2026-12-01")]).toEqual([0, 0]);
  });

  it("builds a variety of layouts from level 3 on", () => {
    const shapes = new Set(Array.from({ length: 200 }, (_, seed) => obstacleCells(8, `seed-${seed}`)));
    expect(shapes.size).toBeGreaterThan(10);
  });
});

describe("generation over many seeds", () => {
  it("always finds a valid level at depths 0 to 120", () => {
    const failures: string[] = [];
    for (let seed = 0; seed < 150; seed += 1) {
      for (let depth = 0; depth <= 120; depth += 3) {
        try {
          generateLevel(core, `2027-02-${seed}`, depth);
        } catch {
          failures.push(`${seed}/${depth}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
