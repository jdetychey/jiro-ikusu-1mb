// The Recorder (README §6.2): the single input path of every target. A raw mask is journaled as
// an event when it changes, and the game then steps with the journaled mask.

import { MAX_JOURNAL_LEN } from "../journal";
import { Game } from "./game";
import { type Header, pushEvent, startJournal } from "./journal";
import type { Level } from "./level";
import type { EndCode } from "./types";

export class Recorder {
  readonly game: Game;
  private readonly bytes = new Uint8Array(MAX_JOURNAL_LEN);
  private length: number;

  /** A level ready to play, with the journal of `header` and no events yet. */
  constructor(level: Level, header: Header) {
    this.game = new Game(level, header.runNonce, header.levelIndex);
    this.length = startJournal(header, this.bytes);
  }

  /** Processes the next tick: journals `raw` if it differs from the mask in force, then steps
   *  the game with it. An ended level does not change. */
  step(raw: number): EndCode | undefined {
    if (this.game.end === undefined && raw !== this.game.mask) {
      this.length = pushEvent(this.bytes, this.length, { tick: this.game.ticksUsed, mask: raw });
    }
    return this.game.step(raw);
  }

  journal(): Uint8Array<ArrayBuffer> {
    return this.bytes.slice(0, this.length);
  }
}
