// Journal bytes v1 (README §6.3): a 71-byte big-endian header, then 3 bytes per event.

import { EVENT_LEN, HEADER_LEN, type JournalEvent, MAX_EVENTS } from "../journal";
import { RUN_LEVELS } from "../core";
import { JOURNAL_VERSION, MAX_TICKS, RULES_VERSION } from "./consts";
import { ErrorCode, reject } from "./error";
import { readU16, writeU16 } from "./int";
import { keccak256 } from "./keccak";
import { Mask } from "./types";

const NONCE_AT = 4;
const LEVEL_ID_AT = 36;
const LEVEL_INDEX_AT = 68;
const EVENT_COUNT_AT = 69;

/** The header fields a journal varies. `version` and `rulesVersion` are always
 *  `JOURNAL_VERSION` and `RULES_VERSION`, and `eventCount` is the number of events. */
export interface Header {
  /** 0 Training, 1 Challenge. */
  mode: number;
  runNonce: Uint8Array;
  levelId: Uint8Array;
  levelIndex: number;
}

export interface Journal {
  header: Header;
  events: JournalEvent[];
}

/** Validates `bytes` as a journal, checking the rules of README §6.3 in their order and
 *  rejecting with the first broken rule's code. */
export function decode(bytes: Uint8Array): Journal {
  if (bytes.length < HEADER_LEN) reject(ErrorCode.Truncated);
  if (bytes[0] !== JOURNAL_VERSION) reject(ErrorCode.Version);
  if (readU16(bytes, 1) !== RULES_VERSION) reject(ErrorCode.RulesVersion);
  const mode = bytes[3] ?? 0;
  if (mode > 1) reject(ErrorCode.Mode);
  const levelIndex = bytes[LEVEL_INDEX_AT] ?? 0;
  checkLevelIndex(levelIndex);
  const eventCount = readU16(bytes, EVENT_COUNT_AT);
  if (eventCount > MAX_EVENTS) reject(ErrorCode.EventCount);
  const eventBytes = bytes.length - HEADER_LEN;
  const available = Math.floor(eventBytes / EVENT_LEN);
  if (available < eventCount) reject(ErrorCode.Truncated);
  if (available > eventCount || eventBytes % EVENT_LEN !== 0) reject(ErrorCode.TrailingBytes);
  const events: JournalEvent[] = [];
  for (let index = 0; index < eventCount; index += 1) {
    const at = HEADER_LEN + EVENT_LEN * index;
    const event = { tick: readU16(bytes, at), mask: bytes[at + 2] ?? 0 };
    checkEvent(events[index - 1], event);
    events.push(event);
  }
  return {
    header: { mode, runNonce: bytes.slice(NONCE_AT, LEVEL_ID_AT), levelId: bytes.slice(LEVEL_ID_AT, LEVEL_INDEX_AT), levelIndex },
    events,
  };
}

/** Writes the journal of `header` with no events into `out`; returns its length. Rejects what
 *  `decode` would reject, with the same codes. */
export function startJournal(header: Header, out: Uint8Array): number {
  checkLevelIndex(header.levelIndex);
  out[0] = JOURNAL_VERSION;
  writeU16(out, 1, RULES_VERSION);
  out[3] = header.mode;
  out.set(header.runNonce, NONCE_AT);
  out.set(header.levelId, LEVEL_ID_AT);
  out[LEVEL_INDEX_AT] = header.levelIndex;
  writeU16(out, EVENT_COUNT_AT, 0);
  return HEADER_LEN;
}

/** Appends `event` to the journal of `length` bytes in `out` and returns the new length.
 *  Rejects what `decode` would reject, with the same codes, and leaves `out` unchanged then. */
export function pushEvent(out: Uint8Array, length: number, event: JournalEvent): number {
  const count = readU16(out, EVENT_COUNT_AT);
  if (count >= MAX_EVENTS) reject(ErrorCode.EventCount);
  const previousAt = length - EVENT_LEN;
  const previous = count === 0 ? undefined : { tick: readU16(out, previousAt), mask: out[previousAt + 2] ?? 0 };
  checkEvent(previous, event);
  out[length] = event.tick >> 8;
  out[length + 1] = event.tick & 0xff;
  out[length + 2] = event.mask;
  writeU16(out, EVENT_COUNT_AT, count + 1);
  return length + EVENT_LEN;
}

/** keccak256 of the journal bytes, as the run commitment and the Outcome use it (README §6.4). */
export function journalHash(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return keccak256(bytes);
}

/** keccak256(keccak256(journal₀) ‖ … ‖ keccak256(journal₅)) (README §6.4). */
export function runCommitment(journalHashes: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  return keccak256(...journalHashes);
}

function checkLevelIndex(levelIndex: number): void {
  if (levelIndex >= RUN_LEVELS) reject(ErrorCode.LevelIndex);
}

/** Checks one event against the previous one, in the order of README §6.3 rule 8. Before the
 *  first event, the mask is 0. */
function checkEvent(previous: JournalEvent | undefined, { tick, mask }: JournalEvent): void {
  if (tick >= MAX_TICKS) reject(ErrorCode.TickLimit);
  if (previous !== undefined && tick <= previous.tick) reject(ErrorCode.TickOrder);
  if (mask & Mask.Reserved) reject(ErrorCode.ReservedBit);
  if (mask === (previous?.mask ?? 0)) reject(ErrorCode.UnchangedMask);
}
