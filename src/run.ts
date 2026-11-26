// The daily Run (plan §4): the same seeded levels for everyone on a UTC day, one level after
// another until a level is not cleared. A Run's score is the sum of its level scores, which the
// core computes by replaying each journal; its code carries the seed and the journals, so anyone
// can verify it offline.

import { type EndReason, hex } from "./core";
import type { Engine } from "./engine-api";
import { describeError } from "./errors";
import { generateLevel } from "./generator";

export const MAX_WEIGHT_BP = 0xffff;
const CODE_VERSION = 1;
const SEED_LEN = 10;
export const MAX_RUN_LEVELS = 255;

/** Whether `seed` is the ISO date of a real day, as `dailySeed` writes it. */
export function isSeed(seed: string): boolean {
  const date = new Date(`${seed}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(seed) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, SEED_LEN) === seed;
}

function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** The seed of the UTC day of `date`: its ISO date. */
export function dailySeed(date: Date): string {
  return date.toISOString().slice(0, SEED_LEN);
}

/** Deeper levels weigh more, so a deeper Run always scores higher. */
export function weightBp(depth: number): number {
  return Math.min(MAX_WEIGHT_BP, 10_000 + 1_000 * depth);
}

/** The run nonce of level `depth`: fixed by the seed, so everyone faces the same boss. */
export function nonceFor(core: Engine, seed: string, depth: number): Uint8Array {
  return core.journalHash(new TextEncoder().encode(`${seed}/${depth}`));
}

/** A level is cleared when the target was reached and not by running out of lives or time. */
export function isCleared(end: EndReason, claimBp: number, targetBp: number): boolean {
  return (end === "Cleared" || end === "Committed") && claimBp >= targetBp;
}

export function encodeCode(seed: string, journals: readonly Uint8Array[]): string {
  if (!isSeed(seed)) throw new Error(`${seed} is not a day`);
  if (journals.length > MAX_RUN_LEVELS) throw new Error(`a Run code holds at most ${MAX_RUN_LEVELS} levels`);
  const parts: Uint8Array[] = [Uint8Array.of(CODE_VERSION), new TextEncoder().encode(seed), Uint8Array.of(journals.length)];
  for (const journal of journals) parts.push(Uint8Array.of(journal.length >> 8, journal.length & 0xff), journal);
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => (bytes.set(part, at), at + part.length), 0);
  return base64Url(bytes);
}

function bytesOfBase64Url(code: string): Uint8Array {
  try {
    return Uint8Array.from(atob(code.trim().replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
  } catch (cause) {
    throw new Error("this is not a Run code", { cause });
  }
}

export function decodeCode(code: string): { seed: string; journals: Uint8Array[] } {
  const bytes = bytesOfBase64Url(code);
  if (bytes[0] !== CODE_VERSION) throw new Error("this is not a Run code of this version");
  const seed = new TextDecoder().decode(bytes.subarray(1, 1 + SEED_LEN));
  if (!isSeed(seed)) throw new Error("this is not a Run code: its day is not a date");
  const count = bytes[1 + SEED_LEN] ?? 0;
  const journals: Uint8Array[] = [];
  let at = 2 + SEED_LEN;
  for (let i = 0; i < count; i += 1) {
    const length = ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
    const journal = bytes.subarray(at + 2, at + 2 + length);
    if (journal.length !== length) throw new Error("this code is cut short");
    journals.push(journal);
    at += 2 + length;
  }
  if (at !== bytes.length) throw new Error("this code has bytes past its last journal");
  return { seed, journals };
}

export interface Verified {
  seed: string;
  levelsCleared: number;
  score: number;
}

/** Replays every journal of `code` on the levels of its seed. Throws on the first journal the
 *  core rejects, that is not of this seed's nonce, or that follows a level that was not cleared. */
export function verifyCode(core: Engine, code: string, today: string): Verified {
  const { seed, journals } = decodeCode(code);
  if (seed > today) throw new Error(`the day ${seed} has not come yet`);
  let score = 0;
  let levelsCleared = 0;
  journals.forEach((journal, depth) => {
    if (depth > levelsCleared) throw new Error(`level ${depth} follows a level that was not cleared`);
    const level = generateLevel(core, seed, depth);
    const replayed = core.replay(level, journal, weightBp(depth));
    if ("code" in replayed) throw new Error(`level ${depth + 1}: the core rejects the journal (${describeError(replayed.code)})`);
    const { outcome } = replayed;
    const expected = nonceFor(core, seed, depth);
    if (outcome.runNonce !== hex(expected)) {
      throw new Error(`level ${depth + 1} was not played on the seed ${seed}`);
    }
    const target = core.decodeLevel(level);
    if ("code" in target) throw new Error("the generated level does not decode");
    score += outcome.levelScore;
    if (isCleared(outcome.endReason, outcome.claimBp, target.targetBp)) levelsCleared += 1;
  });
  return { seed, levelsCleared, score };
}
