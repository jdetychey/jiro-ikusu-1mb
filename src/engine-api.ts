// The public surface every engine offers the game: the wasm build (`Core`) and its TypeScript
// port (`TsCore`), so that the page can use either.

import type { EndReason, Replayed, Snapshot } from "./core";
import type { Level } from "./level";

export interface Engine {
  readonly rulesVersion: number;
  /** Checks `level` (README §5); returns 0 for a valid level, otherwise its error code. */
  validateLevel(level: Uint8Array): number;
  /** keccak256 of `level`, its level id (README §5), whether or not it is valid. */
  levelId(level: Uint8Array): Uint8Array<ArrayBuffer>;
  /** The six draw slots of `runNonce` (README §8.2). */
  draw(runNonce: Uint8Array): number[];
  /** keccak256 of journal bytes, as the run commitment uses it (README §6.4). */
  journalHash(journal: Uint8Array): Uint8Array<ArrayBuffer>;
  /** The run commitment of six journals in levelIndex order (README §6.4). */
  runCommitment(journals: readonly Uint8Array[]): Uint8Array<ArrayBuffer>;
  /** The editor's model of level bytes, or the code of the first rule they break (20 to 34). */
  decodeLevel(bytes: Uint8Array): Level | { code: number };
  /** The level bytes of the editor's model, valid or not. */
  encodeLevel(level: Level): Uint8Array<ArrayBuffer>;
  /** Validates `level` (README §5) and keeps it for `start`; returns 0 or its error code. */
  loadLevel(level: Uint8Array): number;
  /** Starts the loaded level with `runNonce` at `levelIndex`, in `mode` (0 Training, 1 Challenge). */
  start(runNonce: Uint8Array, mode: number, levelIndex: number): void;
  /** Processes the next tick with the controls held now; returns how the level ended, if it did. */
  tick(mask: number): EndReason | undefined;
  endReason(): EndReason | undefined;
  /** The 3,600 cell values, row-major, as a view valid until the next call. */
  grid(): Uint8Array;
  /** The indices of the cells changed since the last call (every cell after `start`). */
  dirtyCells(): Uint16Array;
  snapshot(): Snapshot;
  /** The state hash v1 after the last tick (README §6.4). */
  stateHash(): Uint8Array<ArrayBuffer>;
  /** The journal bytes so far (README §6.3). */
  journal(): Uint8Array<ArrayBuffer>;
  /** Replays `journal` on `level`, scored with `weightBp`, as the referee does (README §7.3). */
  replay(level: Uint8Array, journal: Uint8Array, weightBp: number): Replayed;
}
