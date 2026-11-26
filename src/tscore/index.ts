// TsCore: the TypeScript port of the deterministic core (core/src), for a host whose sandbox
// blocks WebAssembly. It offers the public surface of `Core` (src/core.ts), bit-exact with the
// wasm build; test/parity.test.ts holds it to that, tick by tick.

import { CoreError, END_REASONS, type EndReason, GRID_CELLS, HASH_LEN, hex, MISUSE, type Outcome, RUN_LEVELS, type Replayed, type Snapshot } from "../core";
import type { Engine } from "../engine-api";
import { MAX_JOURNAL_LEN } from "../journal";
import { type Level as EditorLevel, LEVEL_LEN } from "../level";
import { RULES_VERSION } from "./consts";
import { fromEditorLevel, toEditorLevel } from "./editor";
import { ErrorCode, RuleError } from "./error";
import type { Game } from "./game";
import { HEADING_CODES, stateHash } from "./hash";
import { journalHash, runCommitment } from "./journal";
import { decode as decodeLevel, encode as encodeLevel, levelId, type Level, validate } from "./level";
import { Recorder } from "./recorder";
import { replay as replayJournal, type RawOutcome } from "./replay";
import { draw } from "./seed";
import { newCaptureStack } from "./grid";
import { type EndCode, Mask } from "./types";

const INPUT_CAPACITY = 16 * 1024;

export class TsCore implements Engine {
  private level: { fields: Level; bytes: Uint8Array } | undefined;
  private recorder: Recorder | undefined;
  private readonly gridOut = new Uint8Array(GRID_CELLS);
  private readonly shadow = new Uint8Array(GRID_CELLS);
  private readonly changed = new Uint16Array(GRID_CELLS);
  private lastHash = new Uint8Array(HASH_LEN);

  static async load(): Promise<TsCore> {
    return new TsCore();
  }

  get rulesVersion(): number {
    return RULES_VERSION;
  }

  validateLevel(level: Uint8Array): number {
    // The length is checked first, so bytes past one more than a level cannot change the code.
    return ruleCode(() => checkedLevel(level.subarray(0, LEVEL_LEN + 1)));
  }

  levelId(level: Uint8Array): Uint8Array<ArrayBuffer> {
    checkInputFits(level);
    return levelId(level);
  }

  draw(runNonce: Uint8Array): number[] {
    if (runNonce.length !== HASH_LEN) throw new Error(`a run nonce is ${HASH_LEN} bytes`);
    return draw(runNonce);
  }

  journalHash(journal: Uint8Array): Uint8Array<ArrayBuffer> {
    checkInputFits(journal);
    return journalHash(journal);
  }

  runCommitment(journals: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    if (journals.length !== RUN_LEVELS) throw new Error(`a run has ${RUN_LEVELS} journals`);
    return runCommitment(journals.map((journal) => this.journalHash(journal)));
  }

  decodeLevel(bytes: Uint8Array): EditorLevel | { code: number } {
    try {
      return toEditorLevel(decodeLevel(bytes.subarray(0, LEVEL_LEN + 1)));
    } catch (error) {
      if (error instanceof RuleError) return { code: error.code };
      throw error;
    }
  }

  encodeLevel(level: EditorLevel): Uint8Array<ArrayBuffer> {
    const fields = level.cells.length === GRID_CELLS ? fromEditorLevel(level) : undefined;
    if (fields === undefined) throw new CoreError("encode_level", MISUSE);
    return encodeLevel(fields);
  }

  loadLevel(level: Uint8Array): number {
    checkInputFits(level);
    const code = ruleCode(() => {
      this.level = { fields: checkedLevel(level), bytes: level.slice() };
    });
    if (code === 0) this.recorder = undefined;
    return code;
  }

  start(runNonce: Uint8Array, mode: number, levelIndex: number): void {
    if (runNonce.length !== HASH_LEN) throw new Error(`a run nonce is ${HASH_LEN} bytes`);
    const { level } = this;
    if (level === undefined) throw new CoreError("start", MISUSE);
    if (mode >>> 0 > 1) throw new CoreError("start", ErrorCode.Mode);
    if (levelIndex >>> 0 > 0xff) throw new CoreError("start", ErrorCode.LevelIndex);
    const header = { mode: mode >>> 0, runNonce: runNonce.slice(), levelId: levelId(level.bytes), levelIndex: levelIndex >>> 0 };
    this.recorder = coreCall("start", () => new Recorder(level.fields, header));
    this.shadow.fill(0);
  }

  tick(mask: number): EndReason | undefined {
    const { recorder } = this;
    if (recorder === undefined) throw new CoreError("tick", MISUSE);
    const raw = mask >>> 0;
    if (raw > 0xff || raw & Mask.Reserved) throw new CoreError("tick", ErrorCode.ReservedBit);
    coreCall("tick", () => recorder.step(raw));
    return this.endReason();
  }

  endReason(): EndReason | undefined {
    const end = this.recorder?.game.end;
    return end === undefined ? undefined : endReasonOf(end);
  }

  grid(): Uint8Array {
    if (this.recorder) this.gridOut.set(this.recorder.game.grid.cells);
    return this.gridOut;
  }

  dirtyCells(): Uint16Array {
    if (this.recorder === undefined) return this.changed.subarray(0, 0);
    const { cells } = this.recorder.game.grid;
    let count = 0;
    for (let index = 0; index < GRID_CELLS; index += 1) {
      const reported = (cells[index] ?? 0) + 1;
      if (this.shadow[index] !== reported) {
        this.shadow[index] = reported;
        this.changed[count] = index;
        count += 1;
      }
    }
    return this.changed.subarray(0, count);
  }

  snapshot(): Snapshot {
    const game = this.recorder?.game;
    if (game === undefined) return emptySnapshot();
    const { player, boss } = game;
    return {
      player: { x: player.x, y: player.y, cutting: player.cutting },
      lives: player.lives,
      shield: player.shield,
      invulnerable: player.invulnerable,
      boss: { x: boss.x, y: boss.y, size: boss.size },
      minions: game.minions.slots.flatMap((minion) =>
        minion === undefined ? [] : [minion.live ? { state: "live" as const, x: minion.x, y: minion.y, heading: HEADING_CODES[minion.heading] ?? 0 } : { state: "destroyed" as const, x: 0, y: 0, heading: 0 }],
      ),
      claimBp: game.claimBp(),
      targetBp: game.targetBp,
      ticksUsed: game.ticksUsed,
      ticksLeft: Math.max(0, game.timeLimit - game.ticksUsed),
    };
  }

  stateHash(): Uint8Array<ArrayBuffer> {
    if (this.recorder) this.lastHash = stateHash(this.recorder.game);
    return this.lastHash.slice();
  }

  journal(): Uint8Array<ArrayBuffer> {
    return this.recorder?.journal() ?? new Uint8Array(0);
  }

  replay(level: Uint8Array, journal: Uint8Array, weightBp: number): Replayed {
    if (!Number.isInteger(weightBp) || weightBp < 0 || weightBp > 0xffff) throw new CoreError("replay", MISUSE);
    // Bytes past one more than the longest valid level or journal cannot change replay's result.
    const [levelPart, journalPart] = [level.subarray(0, LEVEL_LEN + 1), journal.subarray(0, MAX_JOURNAL_LEN + 1)];
    checkInputFits(levelPart, journalPart);
    const hashes: Uint8Array[] = [];
    const trace = () => concatenated(hashes);
    try {
      const outcome = replayJournal(levelPart, journalPart, weightBp, (game: Game) => hashes.push(stateHash(game)));
      return { outcome: outcomeOf(outcome), trace: trace() };
    } catch (error) {
      if (error instanceof RuleError) return { code: error.code, trace: trace() };
      throw error;
    }
  }
}

const EMPTY_SNAPSHOT: Snapshot = {
  player: { x: 0, y: 0, cutting: false },
  lives: 0,
  shield: 0,
  invulnerable: 0,
  boss: { x: 0, y: 0, size: 0 },
  minions: [],
  claimBp: 0,
  targetBp: 0,
  ticksUsed: 0,
  ticksLeft: 0,
};

function emptySnapshot(): Snapshot {
  return structuredClone(EMPTY_SNAPSHOT);
}

function checkedLevel(bytes: Uint8Array): Level {
  const level = decodeLevel(bytes);
  validate(level, newCaptureStack());
  return level;
}

/** 0 if `action` passes, otherwise the code of the rule it broke. */
function ruleCode(action: () => void): number {
  try {
    action();
    return 0;
  } catch (error) {
    if (error instanceof RuleError) return error.code;
    throw error;
  }
}

/** Runs `action`, turning a broken rule into the CoreError that the wasm wrapper throws. */
function coreCall<T>(call: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof RuleError) throw new CoreError(call, error.code);
    throw error;
  }
}

/** Like the wasm input buffer, the engine takes at most 16 KiB of input per call. */
function checkInputFits(...parts: Uint8Array[]): void {
  if (parts.reduce((sum, part) => sum + part.length, 0) > INPUT_CAPACITY) throw new CoreError("input", MISUSE);
}

function concatenated(hashes: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hashes.length * HASH_LEN);
  hashes.forEach((hash, tick) => out.set(hash, tick * HASH_LEN));
  return out;
}

function endReasonOf(code: EndCode): EndReason {
  const reason = END_REASONS[code - 1];
  if (reason === undefined) throw new Error(`the core returned end reason ${code}`);
  return reason;
}

function outcomeOf(raw: RawOutcome): Outcome {
  return {
    journalHash: hex(raw.journalHash),
    levelId: hex(raw.levelId),
    runNonce: hex(raw.runNonce),
    levelIndex: raw.levelIndex,
    drawSlot: raw.drawSlot,
    mode: raw.mode,
    rulesVersion: raw.rulesVersion,
    endReason: endReasonOf(raw.endReason),
    claimBp: raw.claimBp,
    ticksUsed: raw.ticksUsed,
    levelScore: raw.levelScore,
  };
}
