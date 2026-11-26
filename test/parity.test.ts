// The TypeScript port against the wasm build: the same level, nonce and inputs must give the same
// state hash after every tick, the same journal, outcome and trace, and the same error codes.
// Sizes: PARITY_GENERATED (generated levels), PARITY_FUZZ_LEVELS and PARITY_FUZZ_JOURNALS
// (mutated inputs), PARITY_SEED (the seed of every random choice).

import { describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { curatedLevels } from "../src/engine";
import { generateLevel } from "../src/generator";
import { TsCore } from "../src/tscore";
import { loadCoreFromTarget } from "./engine";
import { envCount, failureOf, PATTERNS, type Play, playBoth, randomBytes, seededRandom, type Start, UP } from "./parity-support";

const GENERATED_LEVELS = envCount("PARITY_GENERATED", 200);
const FUZZ_LEVELS = envCount("PARITY_FUZZ_LEVELS", 1500);
const FUZZ_JOURNALS = envCount("PARITY_FUZZ_JOURNALS", 150);
const WEIGHTS = [0, 1, 10_000, 17_345, 65_535];

const wasm = await loadCoreFromTarget();
const ts = await TsCore.load();

const curated = curatedLevels();
const patternNames = Object.keys(PATTERNS);
const ALWAYS = ["wandering", "looping", "committing"];
const STEADY = ["idle", "shield held", "cut held"];

function startOf(levelBytes: Uint8Array, label: string, index: number): Start {
  return { levelBytes, runNonce: wasm.journalHash(new TextEncoder().encode(label)), mode: index % 2, levelIndex: index % 6 };
}

function play(levelBytes: Uint8Array, label: string, index: number, pattern: string): Play {
  const maskAt = (PATTERNS[pattern] ?? PATTERNS.idle!)(seededRandom(label, pattern));
  return playBoth(wasm, ts, startOf(levelBytes, label, index), maskAt);
}

function expectSameReplay(levelBytes: Uint8Array, journal: Uint8Array, weightBp: number): void {
  expect(ts.replay(levelBytes, journal, weightBp)).toEqual(wasm.replay(levelBytes, journal, weightBp));
}

const plays = new Map<string, Play>();
function playOnce(levelBytes: Uint8Array, label: string, index: number, pattern: string): Play {
  const key = `${label}/${pattern}`;
  const known = plays.get(key);
  if (known !== undefined) return known;
  const played = play(levelBytes, label, index, pattern);
  plays.set(key, played);
  return played;
}

describe("a curated level", () => {
  const cases = curated.flatMap(([name, bytes], index) => [...ALWAYS, STEADY[index % STEADY.length] ?? "idle"].map((pattern) => ({ name, bytes, index, pattern })));

  it.each(cases)("$name played as $pattern agrees after every tick", ({ name, bytes, index, pattern }) => {
    playOnce(bytes, name, index, pattern);
  });

  it.each(cases)("$name played as $pattern replays to the same outcome and trace", ({ name, bytes, index, pattern }) => {
    const { journal } = playOnce(bytes, name, index, pattern);
    expectSameReplay(bytes, journal, WEIGHTS[index % WEIGHTS.length] ?? 0);
  });
});

describe("a generated level", () => {
  const cases = Array.from({ length: GENERATED_LEVELS }, (_, index) => ({ index, seed: `parity-${Math.floor(index / 60)}`, depth: index % 60, pattern: patternNames[index % patternNames.length] ?? "idle" }));

  it.each(cases)("$seed depth $depth played as $pattern agrees after every tick and replays the same", ({ index, seed, depth, pattern }) => {
    const levelBytes = generateLevel(wasm, seed, depth);
    const { journal } = playOnce(levelBytes, `${seed}/${depth}`, index, pattern);
    expectSameReplay(levelBytes, journal, WEIGHTS[index % WEIGHTS.length] ?? 0);
  });
});

describe("the interface before and around a play", () => {
  const level = curated[0]?.[1] ?? new Uint8Array(0);
  const nonce = new Uint8Array(32);

  async function freshEngines(started: boolean): Promise<[Core, TsCore]> {
    const engines: [Core, TsCore] = [await loadCoreFromTarget(), new TsCore()];
    for (const engine of engines) {
      if (started) {
        engine.loadLevel(level);
        engine.start(nonce, 0, 0);
      }
    }
    return engines;
  }

  it("fails alike on a tick before any start", async () => {
    const [expected, actual] = await freshEngines(false);
    expect(failureOf(() => actual.tick(0))).toBe(failureOf(() => expected.tick(0)));
  });

  it("fails alike on a start before any level", async () => {
    const [expected, actual] = await freshEngines(false);
    expect(failureOf(() => actual.start(nonce, 0, 0))).toBe(failureOf(() => expected.start(nonce, 0, 0)));
  });

  it("reads alike before any level", async () => {
    const [expected, actual] = await freshEngines(false);
    const read = (core: Core | TsCore) => [core.snapshot(), core.journal(), core.endReason(), core.stateHash(), core.dirtyCells(), core.grid()];
    expect(read(actual)).toEqual(read(expected));
  });

  it.each([
    ["a mode of 2", 2, 0],
    ["a negative mode", -1, 0],
    ["a level index of 6", 0, 6],
    ["a level index of 256", 0, 256],
    ["a negative level index", 0, -1],
  ])("fails alike on %s", async (_, mode, levelIndex) => {
    const [expected, actual] = await freshEngines(false);
    expected.loadLevel(level);
    actual.loadLevel(level);
    expect(failureOf(() => actual.start(nonce, mode, levelIndex))).toBe(failureOf(() => expected.start(nonce, mode, levelIndex)));
  });

  it.each([128, 255, 256, -1, 65_664])("fails alike on the tick mask %i", async (mask) => {
    const [expected, actual] = await freshEngines(true);
    expect(failureOf(() => actual.tick(mask))).toBe(failureOf(() => expected.tick(mask)));
  });

  it("reads alike after a level is loaded over a play", async () => {
    const [expected, actual] = await freshEngines(true);
    for (let tick = 0; tick < 30; tick += 1) {
      expected.tick(UP);
      actual.tick(UP);
    }
    expected.loadLevel(level);
    actual.loadLevel(level);
    const read = (core: Core | TsCore) => [core.snapshot(), core.journal(), core.endReason(), core.stateHash(), core.dirtyCells(), core.grid()];
    expect(read(actual)).toEqual(read(expected));
  });

  it("keeps the play when a bad level is loaded", async () => {
    const [expected, actual] = await freshEngines(true);
    const bad = new Uint8Array(level.length);
    expect(actual.loadLevel(bad)).toBe(expected.loadLevel(bad));
    expect(actual.tick(UP)).toBe(expected.tick(UP));
    expect(actual.stateHash()).toEqual(expected.stateHash());
  });
});

describe("the hashes", () => {
  const lengths = [0, 1, 31, 32, 33, 135, 136, 137, 271, 272, 273, 472, 948, 1000, 8171, 16_384];

  it.each(lengths)("journalHash and levelId of %i bytes agree", (length) => {
    const bytes = randomBytes(seededRandom("hash", length), length);
    expect([ts.journalHash(bytes), ts.levelId(bytes)]).toEqual([wasm.journalHash(bytes), wasm.levelId(bytes)]);
  });

  it("fails alike on more bytes than the input buffer holds", () => {
    const bytes = new Uint8Array(16_385);
    expect(failureOf(() => ts.journalHash(bytes))).toBe(failureOf(() => wasm.journalHash(bytes)));
  });

  it.each(Array.from({ length: 40 }, (_, i) => i))("draw of nonce %i agrees", (i) => {
    const nonce = randomBytes(seededRandom("draw", i), 32);
    expect(ts.draw(nonce)).toEqual(wasm.draw(nonce));
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))("runCommitment of journals %i agrees", (i) => {
    const random = seededRandom("commitment", i);
    const journals = Array.from({ length: 6 }, (_, j) => randomBytes(random, 71 + 3 * Math.floor(random() * (j * 40))));
    expect(ts.runCommitment(journals)).toEqual(wasm.runCommitment(journals));
  });
});

describe("level bytes", () => {
  const bases = [...curated.map(([, bytes]) => bytes), generateLevel(wasm, "parity-fuzz", 0), generateLevel(wasm, "parity-fuzz", 30), generateLevel(wasm, "parity-fuzz", 59)];

  function mutated(random: () => number, base: Uint8Array): Uint8Array {
    const kind = Math.floor(random() * 6);
    const bytes = Uint8Array.from(base);
    if (kind === 0) return bytes.subarray(0, Math.floor(random() * (bytes.length + 1)));
    if (kind === 1) return Uint8Array.from([...bytes, ...randomBytes(random, 1 + Math.floor(random() * 40))]);
    const edits = 1 + Math.floor(random() * 3);
    for (let edit = 0; edit < edits; edit += 1) {
      const at = kind <= 3 ? 451 + Math.floor(random() * 21) : Math.floor(random() * bytes.length);
      bytes[at] = kind === 4 ? (bytes[at] ?? 0) ^ (1 << Math.floor(random() * 8)) : [0, 1, 2, 59, 60, 255, Math.floor(random() * 256)][Math.floor(random() * 7)] ?? 0;
    }
    return bytes;
  }

  const codes = new Set<number>();

  it.each(Array.from({ length: FUZZ_LEVELS }, (_, i) => i))("mutation %i is judged the same", (i) => {
    const random = seededRandom("level-fuzz", i);
    const bytes = mutated(random, bases[Math.floor(random() * bases.length)] ?? bases[0]!);
    const code = wasm.validateLevel(bytes);
    codes.add(code);
    expect(ts.validateLevel(bytes)).toBe(code);
    expect(ts.loadLevel(bytes)).toBe(wasm.loadLevel(bytes));
    expect(ts.levelId(bytes)).toEqual(wasm.levelId(bytes));
    const decoded = wasm.decodeLevel(bytes);
    expect(ts.decodeLevel(bytes)).toEqual(decoded);
    if (!("code" in decoded)) expect(ts.encodeLevel(decoded)).toEqual(wasm.encodeLevel(decoded));
  });

  it("covers many of the rejection codes", () => {
    expect(codes.size).toBeGreaterThanOrEqual(Math.min(12, FUZZ_LEVELS / 50));
  });

  it.each([0, 1, 60, 255])("judges the same with every byte of a level set to %i", (value) => {
    const base = bases[0] ?? new Uint8Array(0);
    const codes = (core: Core | TsCore) => Array.from(base, (_, at) => core.validateLevel(Uint8Array.from(base, (byte, i) => (i === at ? value : byte))));
    expect(codes(ts)).toEqual(codes(wasm));
  });

  it("encodes the same for a model that is out of range", () => {
    const decoded = wasm.decodeLevel(bases[0] ?? new Uint8Array(0));
    if ("code" in decoded) throw new Error("the first curated level does not decode");
    const outOfRange = [{ ...decoded, bossSize: 256 }, { ...decoded, timeLimit: 65_536 }, { ...decoded, lives: -1 }, { ...decoded, cells: Uint8Array.from(decoded.cells, (cell, i) => (i === 7 ? 2 : cell)) }];
    expect(outOfRange.map((level) => failureOf(() => ts.encodeLevel(level)))).toEqual(outOfRange.map((level) => failureOf(() => wasm.encodeLevel(level))));
  });
});

describe("journal bytes", () => {
  const sources = [curated[0], curated[3], curated[7], curated[11]].flatMap((entry, i) => (entry === undefined ? [] : [{ name: entry[0], bytes: entry[1], index: i }]));
  let journalsPlayed: { bytes: Uint8Array; journal: Uint8Array }[] | undefined;
  const playedJournals = () => (journalsPlayed ??= sources.flatMap(({ name, bytes, index }) => ["wandering", "looping"].map((pattern) => ({ bytes, journal: playOnce(bytes, name, index, pattern).journal }))));
  const codes = new Set<number>();

  function mutated(random: () => number, base: Uint8Array): Uint8Array {
    const kind = Math.floor(random() * 5);
    if (kind === 0) return base.slice(0, Math.floor(random() * (base.length + 1)));
    if (kind === 1) return Uint8Array.from([...base, ...randomBytes(random, 1 + Math.floor(random() * 7))]);
    const bytes = base.slice();
    const edits = 1 + Math.floor(random() * 2);
    for (let edit = 0; edit < edits; edit += 1) {
      const at = kind === 2 ? Math.floor(random() * 71) : Math.floor(random() * bytes.length);
      bytes[at] = kind === 4 ? (bytes[at] ?? 0) ^ (1 << Math.floor(random() * 8)) : Math.floor(random() * 256);
    }
    return bytes;
  }

  it.each(Array.from({ length: FUZZ_JOURNALS }, (_, i) => i))("mutation %i replays the same", (i) => {
    const random = seededRandom("journal-fuzz", i);
    const { bytes, journal } = playedJournals()[Math.floor(random() * playedJournals().length)] ?? playedJournals()[0]!;
    const mutatedJournal = mutated(random, journal);
    const expected = wasm.replay(bytes, mutatedJournal, 10_000);
    if ("code" in expected) codes.add(expected.code);
    expect(ts.replay(bytes, mutatedJournal, 10_000)).toEqual(expected);
  });

  it("covers many of the rejection codes", () => {
    expect(codes.size).toBeGreaterThanOrEqual(Math.min(6, FUZZ_JOURNALS / 20));
  });

  it.each([0, 1, 2, 6, 255])("replays the same with every header byte but the nonce set to %i", (value) => {
    const { bytes, journal } = playedJournals()[0]!;
    const outcomes = (core: Core | TsCore) =>
      Array.from({ length: 71 }, (_, at) => (at >= 4 && at < 36 ? undefined : core.replay(bytes, Uint8Array.from(journal, (byte, i) => (i === at ? value : byte)), 10_000)));
    expect(outcomes(ts)).toEqual(outcomes(wasm));
  });

  it("replays the same against a mutated level", () => {
    const { bytes, journal } = playedJournals()[0]!;
    const other = bytes.slice();
    other[455] = (other[455] ?? 0) ^ 1;
    expect(ts.replay(other, journal, 10_000)).toEqual(wasm.replay(other, journal, 10_000));
  });

  it.each([-1, 0.5, 65_536])("fails alike on the weight %f", (weight) => {
    const { bytes, journal } = playedJournals()[0]!;
    expect(failureOf(() => ts.replay(bytes, journal, weight))).toBe(failureOf(() => wasm.replay(bytes, journal, weight)));
  });
});
