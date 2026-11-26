// Replay (README §6.3, §7.3): checks a level and a journal, plays the journal, and returns the
// Outcome that the referee returns.

import { Game } from "./game";
import { BP, RULES_VERSION } from "./consts";
import { ErrorCode, reject } from "./error";
import { decode as decodeJournal, journalHash } from "./journal";
import { decode as decodeLevel, levelId } from "./level";
import { draw } from "./seed";
import { EndCode } from "./types";

/** The `Outcome` struct of README §7.3, field for field. */
export interface RawOutcome {
  journalHash: Uint8Array;
  levelId: Uint8Array;
  runNonce: Uint8Array;
  levelIndex: number;
  /** draw(runNonce)[levelIndex] (README §8.2). */
  drawSlot: number;
  mode: number;
  rulesVersion: number;
  endReason: EndCode;
  claimBp: number;
  ticksUsed: number;
  levelScore: number;
}

/** Replays `journalBytes` on `levelBytes` and scores it with `weightBp`, calling `observe` with
 *  the game after every processed tick, the ending tick included, so that a caller can record
 *  the trace of state hashes (README §6.6). Rejects with the first broken rule's code, in the
 *  order of README §6.3. */
export function replay(levelBytes: Uint8Array, journalBytes: Uint8Array, weightBp: number, observe: (game: Game) => void): RawOutcome {
  const { header, events } = decodeJournal(journalBytes);
  const level = decodeLevel(levelBytes);
  const game = new Game(level, header.runNonce, header.levelIndex);
  if (!sameBytes(levelId(levelBytes), header.levelId)) reject(ErrorCode.LevelId);
  if (events.some((event) => event.tick >= level.timeLimit)) reject(ErrorCode.EventPastTimeLimit);
  let nextEvent = 0;
  let mask = 0;
  let end: EndCode | undefined;
  while (end === undefined) {
    const event = events[nextEvent];
    if (event !== undefined && event.tick === game.ticksUsed) {
      mask = event.mask;
      nextEvent += 1;
    }
    end = game.step(mask);
    observe(game);
  }
  if (nextEvent < events.length) reject(ErrorCode.EventAfterEnd);
  const claimBp = game.claimBp();
  return {
    journalHash: journalHash(journalBytes),
    levelId: header.levelId,
    runNonce: header.runNonce,
    levelIndex: header.levelIndex,
    drawSlot: draw(header.runNonce)[header.levelIndex] ?? reject(ErrorCode.LevelIndex),
    mode: header.mode,
    rulesVersion: RULES_VERSION,
    endReason: end,
    claimBp,
    ticksUsed: game.ticksUsed,
    levelScore: levelScore(claimBp, weightBp, end),
  };
}

/** claimBp × weightBp / 10,000, rounded down, and 0 when the lives ran out (README §8.4). */
export function levelScore(claimBp: number, weightBp: number, endReason: EndCode): number {
  return endReason === EndCode.OutOfLives ? 0 : Math.floor((claimBp * weightBp) / BP);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
