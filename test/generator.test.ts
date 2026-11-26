import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel, knobsAt } from "../src/generator";
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
      const [before, after] = [knobsAt(depth - 1), knobsAt(depth)];
      expect(after.bossPeriod).toBeLessThanOrEqual(before.bossPeriod);
      expect(after.minionCount).toBeGreaterThanOrEqual(before.minionCount);
      expect(after.lives).toBeLessThanOrEqual(before.lives);
      expect(after.targetBp).toBeGreaterThanOrEqual(before.targetBp);
      expect(after.timeLimit).toBeLessThanOrEqual(before.timeLimit);
    }
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
