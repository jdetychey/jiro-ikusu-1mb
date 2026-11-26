import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel } from "../src/generator";
import { rank } from "../src/leaderboard";
import { encodeCode, nonceFor } from "../src/run";
import { loadCoreFromTarget } from "./engine";

let core: Core;
beforeAll(async () => {
  core = await loadCoreFromTarget();
});

/** A journal of level 0 of `seed` played for `ticks` ticks holding `mask`, then committed. */
function playedJournal(seed: string, ticks: number, mask: number): Uint8Array {
  core.loadLevel(generateLevel(core, seed, 0));
  core.start(nonceFor(core, seed, 0), 0, 0);
  for (let tick = 0; tick < ticks; tick += 1) core.tick(mask);
  core.tick(0b1000000);
  return core.journal();
}

describe("rank", () => {
  it("lists valid codes first and explains the rest", () => {
    const code = encodeCode("2026-12-01", [playedJournal("2026-12-01", 30, 1)]);
    const entries = rank(core, ["not a code", code], "2026-12-31");
    expect(entries.map((entry) => entry.valid)).toEqual([true, false]);
  });

  it("says why a code from a day to come is refused", () => {
    const code = encodeCode("2027-05-05", [playedJournal("2027-05-05", 1, 1)]);
    const [entry] = rank(core, [code], "2026-12-31");
    expect(entry).toMatchObject({ valid: false, error: expect.stringMatching(/not come yet/) });
  });
});
