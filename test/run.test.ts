import { beforeAll, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel } from "../src/generator";
import { decodeCode, encodeCode, isCleared, isSeed, MAX_RUN_LEVELS, nonceFor, verifyCode, weightBp } from "../src/run";
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

describe("Run code hardening", () => {
  it.each(["2026-12-01", "2028-02-29"])("accepts the day %s", (seed) => {
    expect(isSeed(seed)).toBe(true);
  });

  it.each(["2026-13-01", "2026-02-30", "2026-1-1", "hello", "2026-12-011", ""])("rejects the day %s", (seed) => {
    expect(isSeed(seed)).toBe(false);
  });

  it("rejects text that is not base64", () => {
    expect(() => decodeCode("***")).toThrow(/not a Run code/);
  });

  it("refuses more levels than its count byte holds", () => {
    expect(() => encodeCode("2026-12-01", Array.from({ length: MAX_RUN_LEVELS + 1 }, () => new Uint8Array()))).toThrow();
  });

  it("encodes the largest code without overflowing the stack", () => {
    const journals = Array.from({ length: MAX_RUN_LEVELS }, () => new Uint8Array(8_000));
    expect(decodeCode(encodeCode("2026-12-01", journals)).journals).toHaveLength(MAX_RUN_LEVELS);
  });

  it("rejects a day that has not come yet", () => {
    expect(() => verifyCode(core, encodeCode("2027-01-05", [idleJournal("2027-01-05", 0)]), "2027-01-04")).toThrow(/not come yet/);
  });
});

describe("verifyCode", () => {
  it("scores an idle Run as zero levels cleared", () => {
    const seed = "2026-12-01";
    expect(verifyCode(core, encodeCode(seed, [idleJournal(seed, 0)]), "2026-12-31")).toEqual({ seed, levelsCleared: 0, score: 0 });
  });

  it("rejects a journal played on another seed", () => {
    const journal = idleJournal("2026-12-02", 0);
    expect(() => verifyCode(core, encodeCode("2026-12-01", [journal]), "2026-12-31")).toThrow();
  });

  it("rejects a level that follows a level that was not cleared", () => {
    const seed = "2026-12-01";
    expect(() => verifyCode(core, encodeCode(seed, [idleJournal(seed, 0), idleJournal(seed, 1)]), "2026-12-31")).toThrow(/not cleared/);
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
