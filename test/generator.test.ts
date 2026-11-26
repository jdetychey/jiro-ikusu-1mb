import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel } from "../src/generator";
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
