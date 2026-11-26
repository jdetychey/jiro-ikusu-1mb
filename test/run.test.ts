import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel } from "../src/generator";
import { decodeCode, encodeCode, isCleared, nonceFor, verifyCode, weightBp } from "../src/run";
import { loadCoreFromTarget } from "./engine";

let core: Core;
beforeAll(async () => {
  core = await loadCoreFromTarget();
});

/** A level played with no input until it ends. */
function idleJournal(seed: string, depth: number): Uint8Array {
  core.loadLevel(generateLevel(core, seed, depth));
  core.start(nonceFor(core, seed, depth), 0, 0);
  while (core.tick(0) === undefined);
  return core.journal();
}

describe("Run codes", () => {
  it("round-trips a seed and its journals", () => {
    const journals = [Uint8Array.of(1, 2, 3), Uint8Array.of(4)];
    expect(decodeCode(encodeCode("2026-12-01", journals))).toEqual({ seed: "2026-12-01", journals });
  });

  it("rejects a cut-short code", () => {
    expect(() => decodeCode(encodeCode("2026-12-01", [Uint8Array.of(1, 2, 3)]).slice(0, -3))).toThrow();
  });
});

describe("verifyCode", () => {
  it("scores an idle Run as zero levels cleared", () => {
    const seed = "2026-12-01";
    expect(verifyCode(core, encodeCode(seed, [idleJournal(seed, 0)]))).toEqual({ seed, levelsCleared: 0, score: 0 });
  });

  it("rejects a journal played on another seed", () => {
    const journal = idleJournal("2026-12-02", 0);
    expect(() => verifyCode(core, encodeCode("2026-12-01", [journal]))).toThrow();
  });

  it("rejects a level that follows a level that was not cleared", () => {
    const seed = "2026-12-01";
    expect(() => verifyCode(core, encodeCode(seed, [idleJournal(seed, 0), idleJournal(seed, 1)]))).toThrow(/not cleared/);
  });
});

describe("rules", () => {
  it("weighs deeper levels more", () => {
    expect(weightBp(3)).toBeGreaterThan(weightBp(2));
  });

  it("clears a level only when the target was reached without dying", () => {
    expect([isCleared("Cleared", 8000, 7500), isCleared("Committed", 7000, 7500), isCleared("Out of lives", 9000, 7500)]).toEqual([true, false, false]);
  });
});
