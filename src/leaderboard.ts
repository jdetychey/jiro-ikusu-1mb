// A leaderboard with no server: players paste Run codes, and each is replayed by the core, so
// a score is only ever one that was computed here.

import type { Core } from "./core";
import { verifyCode } from "./run";
import { messageOf } from "./page";

export type Entry =
  | { valid: true; seed: string; levelsCleared: number; score: number }
  | { valid: false; code: string; error: string };

/** The codes of `text`, one per line, blank lines left out. */
export function codesOf(text: string): string[] {
  return text.split(/\s+/).filter((line) => line !== "");
}

/** Replays every code. Valid entries come first, best score first, and ties go to the deeper Run. */
export function rank(core: Core, codes: readonly string[], today: string): Entry[] {
  const entries = codes.map((code): Entry => {
    try {
      return { valid: true, ...verifyCode(core, code, today) };
    } catch (error) {
      return { valid: false, code: `${code.slice(0, 12)}…`, error: messageOf(error) };
    }
  });
  const score = (entry: Entry) => (entry.valid ? entry.score : -1);
  const depth = (entry: Entry) => (entry.valid ? entry.levelsCleared : -1);
  return entries.sort((a, b) => score(b) - score(a) || depth(b) - depth(a));
}
