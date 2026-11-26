// State hash v1 (README §6.4): keccak256 of a fixed-order, fixed-width serialization of the whole
// state, for traces and diagnosis. Stepping never computes it.

import { writeU16 } from "./int";
import { keccak256 } from "./keccak";
import type { Game } from "./game";
import { CELLS } from "./consts";

export const STATE_HASH_VERSION = 1;
export const PREIMAGE_LEN = 948;
const GRID_BYTES = CELLS / 4;
const MINION_BYTES = 7;
/** 0 N, 1 E, 2 S, 3 W, as the state hash and the targets encode a minion's heading, indexed by
 *  direction (up, down, left, right). */
export const HEADING_CODES = [0, 2, 3, 1];

/** The state-hash preimage after the tick just processed, field by field in the order of the
 *  README §6.4 table. */
export function preimage(game: Game): Uint8Array<ArrayBuffer> {
  const { player, boss, minions } = game;
  const out = new Uint8Array(PREIMAGE_LEN);
  out[0] = STATE_HASH_VERSION;
  writeU16(out, 1, Math.max(0, game.ticksUsed - 1));
  out[3] = game.mask;
  for (let i = 0; i < GRID_BYTES; i += 1) {
    const at = 4 * i;
    out[4 + i] = ((game.grid.cells[at] ?? 0) << 6) | ((game.grid.cells[at + 1] ?? 0) << 4) | ((game.grid.cells[at + 2] ?? 0) << 2) | (game.grid.cells[at + 3] ?? 0);
  }
  let at = 4 + GRID_BYTES;
  out.set(
    [
      player.x,
      player.y,
      player.cutting ? 1 : 0,
      player.cutStartX,
      player.cutStartY,
      player.lives,
      player.shield,
      player.invulnerable,
      player.direction + 1,
      player.pressTick >> 8,
      player.pressTick & 0xff,
      boss.x,
      boss.y,
      boss.size,
      boss.vx & 0xff,
      boss.vy & 0xff,
      boss.period,
    ],
    at,
  );
  at += 17;
  for (const minion of minions.slots) {
    if (minion?.live) out.set([1, minion.x, minion.y, HEADING_CODES[minion.heading] ?? 0, minions.period, 0, 0], at);
    else if (minion) out.set([2, 0, 0, 0, minions.period, minion.countdown >> 8, minion.countdown & 0xff], at);
    at += MINION_BYTES;
  }
  writeU16(out, at, game.captured);
  writeU16(out, at + 2, game.claimable);
  writeU16(out, at + 4, game.eventsApplied);
  return out;
}

export function stateHash(game: Game): Uint8Array<ArrayBuffer> {
  return keccak256(preimage(game));
}
