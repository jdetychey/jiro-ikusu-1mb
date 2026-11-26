// Hits (README §4.9): the minion hit predicate of PIN-15, and their resolution at step 6.

import { INVULNERABLE_TICKS } from "./consts";
import type { Grid } from "./grid";
import type { Minions } from "./minion";
import type { Moves, Player } from "./player";
import { Mask } from "./types";

/** Whether a minion meets the player at step 5: it ends on the player's last cell (share),
 *  swaps cells with it across one sub-step (swap), or ends on the cell a fast cut passed through
 *  (pass) [R4.9-6 to R4.9-12, PIN-11]. */
export function minionHits(moves: Moves, minions: Minions): boolean {
  const { enteredCount, enteredX, enteredY } = moves;
  const lastX = enteredCount > 0 ? (enteredX[enteredCount - 1] ?? 0) : moves.fromX;
  const lastY = enteredCount > 0 ? (enteredY[enteredCount - 1] ?? 0) : moves.fromY;
  return minions.moves.some((minion) => {
    if (!minion.present) return false;
    if (minion.toX === lastX && minion.toY === lastY) return true;
    if (enteredCount === 2 && minion.toX === enteredX[0] && minion.toY === enteredY[0]) return true;
    for (let step = 0; step < enteredCount; step += 1) {
      const beforeX = step === 0 ? moves.fromX : enteredX[step - 1];
      const beforeY = step === 0 ? moves.fromY : enteredY[step - 1];
      if (minion.fromX === enteredX[step] && minion.fromY === enteredY[step] && minion.toX === beforeX && minion.toY === beforeY) return true;
    }
    return false;
  });
}

/** Step 6: resolves the tick's single hit flag, then counts the invulnerability down. An
 *  invulnerable player ignores the hit; otherwise B held with a charge left spends the charge;
 *  otherwise a life is lost, the cut is abandoned, and the player is invulnerable for the next
 *  30 ticks. Returns whether a life was lost [R4.9-13 to R4.9-17, PIN-02, R4.3-5]. */
export function resolve(player: Player, grid: Grid, hit: boolean, mask: number): boolean {
  if (hit && player.invulnerable === 0) {
    if (mask & Mask.B && player.shield > 0) player.shield -= 1;
    else {
      player.lives = Math.max(0, player.lives - 1);
      player.abandonCut(grid);
      player.invulnerable = INVULNERABLE_TICKS;
      return true;
    }
  }
  player.invulnerable = Math.max(0, player.invulnerable - 1);
  return false;
}
