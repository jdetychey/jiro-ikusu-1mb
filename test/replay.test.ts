import { beforeAll, describe, expect, it } from "vitest";
import { type Core, hex } from "../src/core";
import { generateLevel } from "../src/generator";
import { maskTimeline, startReplay } from "../src/replay";
import { nonceFor, weightBp } from "../src/run";
import { loadCoreFromTarget } from "./engine";

let core: Core;
beforeAll(async () => {
  core = await loadCoreFromTarget();
});

/** Plays level 0 of `seed` holding up, then right, then A, and returns its journal. */
function playedJournal(seed: string): Uint8Array {
  core.loadLevel(generateLevel(core, seed, 0));
  core.start(nonceFor(core, seed, 0), 0, 0);
  const UP = 1;
  const RIGHT = 8;
  const A = 16;
  for (let tick = 0; tick < 2700; tick += 1) {
    if (core.tick(tick < 40 ? UP : tick < 80 ? RIGHT | A : tick < 120 ? UP | A : 0) !== undefined) break;
  }
  return core.journal();
}

/** Journal bytes holding only `events`: the core is the decoder of real ones. */
function journalOf(events: [tick: number, mask: number][]): Uint8Array {
  const bytes = new Uint8Array(71 + 3 * events.length);
  bytes[70] = events.length;
  events.forEach(([tick, mask], i) => bytes.set([tick >> 8, tick & 0xff, mask], 71 + 3 * i));
  return bytes;
}

describe("maskTimeline", () => {
  const journal = journalOf([[0, 1], [40, 24], [80, 0]]);

  it.each([[0, 1], [39, 1], [40, 24], [79, 24], [80, 0], [500, 0]])("holds the mask at tick %i as %i", (tick, mask) => {
    expect(maskTimeline(journal)(tick)).toBe(mask);
  });

  it("holds nothing before the first event", () => {
    expect(maskTimeline(journalOf([[5, 1]]))(0)).toBe(0);
  });
});

describe("startReplay", () => {
  it("ends as the core's own replay of the journal does", () => {
    const seed = "2026-12-01";
    const journal = playedJournal(seed);
    const level = generateLevel(core, seed, 0);
    const replayed = core.replay(level, journal, weightBp(0));
    if ("code" in replayed) throw new Error("the core rejects the journal");
    const replay = startReplay(core, level, nonceFor(core, seed, 0), journal);
    let end;
    while (end === undefined) end = replay.step();
    expect([end, core.snapshot().claimBp, core.snapshot().ticksUsed]).toEqual([replayed.outcome.endReason, replayed.outcome.claimBp, replayed.outcome.ticksUsed]);
    expect(hex(core.stateHash())).toBe(hex(replayed.trace.slice(-32)));
  });
});
