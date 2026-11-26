// Watching a recorded level: the journal's events are the controls held from their tick on
// (README §6.2), fed to the core tick by tick, so the replay is the game that was played.

import { CoreError, type EndReason } from "./core";
import type { Engine } from "./engine-api";
import { journalEvents } from "./journal";
import { TRAINING } from "./session";

/** The controls held at each tick, from the journal's events. Ticks must be asked in order. */
export function maskTimeline(journal: Uint8Array): (tick: number) => number {
  const events = journalEvents(journal);
  let next = 0;
  let held = 0;
  return (tick) => {
    while (events[next] !== undefined && events[next]!.tick <= tick) {
      held = events[next]!.mask;
      next += 1;
    }
    return held;
  };
}

export interface LevelReplay {
  /** Plays the next tick; returns how the level ended, once it has. */
  step(): EndReason | undefined;
}

/** Starts `level` on `nonce` in the core and plays `journal` on it. */
export function startReplay(core: Engine, level: Uint8Array, nonce: Uint8Array, journal: Uint8Array): LevelReplay {
  const maskAt = maskTimeline(journal);
  let tick = 0;
  const code = core.loadLevel(level);
  if (code !== 0) throw new CoreError("load_level", code);
  core.start(nonce, TRAINING, 0);
  return {
    step() {
      const end = core.tick(maskAt(tick));
      tick += 1;
      return end;
    },
  };
}
