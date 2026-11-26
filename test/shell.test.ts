import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/core";
import { hintFor, NO_PROGRESS, progressAt } from "../src/hints";
import { codeInFragment, codeOfText, codesOfText, shareLink, shareText } from "../src/share";
import { bestDepth, streak, withRun } from "../src/stats";

const snapshot = (over: Partial<Snapshot> & { x?: number; y?: number; cutting?: boolean }): Snapshot => ({
  player: { x: over.x ?? 30, y: over.y ?? 59, cutting: over.cutting ?? false },
  lives: 3,
  shield: 1,
  invulnerable: 0,
  boss: { x: 0, y: 0, size: 5 },
  minions: [],
  claimBp: over.claimBp ?? 0,
  targetBp: 7500,
  ticksUsed: 0,
  ticksLeft: 2700,
});

describe("streak", () => {
  const day = { score: 1, levelsCleared: 0 };

  it.each([
    ["no days", {}, "2026-12-05", 0],
    ["today only", { "2026-12-05": day }, "2026-12-05", 1],
    ["yesterday keeps the streak alive", { "2026-12-04": day }, "2026-12-05", 1],
    ["three days in a row", { "2026-12-03": day, "2026-12-04": day, "2026-12-05": day }, "2026-12-05", 3],
    ["a gap breaks it", { "2026-12-02": day, "2026-12-04": day, "2026-12-05": day }, "2026-12-05", 2],
    ["two days ago is over", { "2026-12-03": day }, "2026-12-05", 0],
    ["month end", { "2026-11-30": day, "2026-12-01": day }, "2026-12-01", 2],
  ])("counts %s", (_, stats, today, days) => {
    expect(streak(stats, today)).toBe(days);
  });
});

describe("stats", () => {
  it("keeps a day's best only", () => {
    const first = withRun({}, "2026-12-01", { score: 100, levelsCleared: 2 });
    expect(withRun(first, "2026-12-01", { score: 50, levelsCleared: 5 })).toBe(first);
  });

  it("replaces a day's best with a higher score", () => {
    const first = withRun({}, "2026-12-01", { score: 100, levelsCleared: 2 });
    expect(withRun(first, "2026-12-01", { score: 150, levelsCleared: 3 })["2026-12-01"]).toEqual({ score: 150, levelsCleared: 3 });
  });

  it("finds the best depth over all days", () => {
    expect(bestDepth({ a: { score: 1, levelsCleared: 4 }, b: { score: 9, levelsCleared: 7 } })).toBe(7);
  });
});

describe("share", () => {
  it("writes a result line", () => {
    expect(shareText({ seed: "2026-12-03", levelsCleared: 3, score: 38420 })).toBe("Jiro-ikusu 2026-12-03 | depth 3 | 38,420\n🟦🟦🟦🟥");
  });

  it("shortens a long bar", () => {
    expect(shareText({ seed: "2026-12-03", levelsCleared: 30, score: 1 })).toContain("+🟥");
  });

  it("round-trips a code through a link", () => {
    expect(codeInFragment(new URL(shareLink("https://x.test/play/#old", "AbC-_1")).hash)).toBe("AbC-_1");
  });

  it("finds no code in another fragment", () => {
    expect(codeInFragment("#top")).toBeUndefined();
  });
});

describe("hints", () => {
  it("teaches the steps in order", () => {
    const steps = [
      NO_PROGRESS,
      progressAt(NO_PROGRESS, snapshot({ x: 31 })),
      progressAt(NO_PROGRESS, snapshot({ x: 31, cutting: true })),
      progressAt(NO_PROGRESS, snapshot({ x: 31, cutting: true, claimBp: 200 })),
    ].map((progress) => hintFor(progress, 7500));
    expect(new Set(steps).size).toBe(4);
  });

  it("never forgets what was done", () => {
    const done = progressAt(NO_PROGRESS, snapshot({ x: 31, cutting: true }));
    expect(progressAt(done, snapshot({})).cut).toBe(true);
  });
});

describe("codeOfText", () => {
  const code = "AzIwMjYtMTItMDEBAAAA-_x1";

  it.each([
    ["a bare code", ` ${code}\n`],
    ["a share link", `https://x.test/play/#r=${code}`],
    ["a result line with its link", `Jiro-ikusu 2026-12-03 | depth 3 | 38,420\n🟦🟦🟦🟥\nhttps://x.test/#r=${code}`],
  ])("finds the code in %s", (_, text) => {
    expect(codeOfText(text)).toBe(code);
  });
});

describe("codesOfText", () => {
  const [one, two] = ["AzIwMjYtMTItMDEBAAAA-_x1", "AzIwMjYtMTItMDIBBBBB-_y2"];

  it("takes bare codes and links, one per token, and drops words", () => {
    expect(codesOfText(`Jiro-ikusu 2026-12-03 | depth 3 | 38,420\n${one}\nhttps://x.test/#r=${two}`)).toEqual([one, two]);
  });

  it("finds nothing in plain words", () => {
    expect(codesOfText("not a code at all")).toEqual([]);
  });
});
