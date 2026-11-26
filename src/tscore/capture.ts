// Capture (README §4.8): a cut that reaches `CLAIMED` claims every region the boss is not in.

import type { Grid } from "./grid";
import { Cell } from "./types";

/** Marks the boss's body and the `EMPTY` cells 4-connected to it as `BOSS_ZONE`, then makes one
 *  pass: `BOSS_ZONE` becomes `EMPTY`, and `EMPTY` and `TRAIL` become `CLAIMED` [R4.8-1 to
 *  R4.8-4]. Returns the capture size, the number of cells that became `CLAIMED`. `bodyCells`
 *  holds the body cells of every boss. */
export function capture(grid: Grid, bodyCells: readonly number[], stack: Uint16Array): number {
  grid.markBossZone(bodyCells, stack);
  const { cells } = grid;
  let captured = 0;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell === Cell.BossZone) cells[index] = Cell.Empty;
    else if (cell === Cell.Empty || cell === Cell.Trail) {
      cells[index] = Cell.Claimed;
      captured += 1;
    }
  }
  return captured;
}
