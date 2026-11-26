import { BP, CAPTURE_STACK, CELLS, W } from "./consts";
import { ErrorCode, reject } from "./error";
import { Cell } from "./types";

/** The 60 × 60 cells, row-major [R4.1-1]. */
export class Grid {
  readonly cells = new Uint8Array(CELLS);

  /** The border and the obstacles (one bit per cell, bit 7 − i % 8 of byte i / 8) are
   *  `CLAIMED`, every other cell is `EMPTY` [R4.1-7]. */
  static levelStart(obstacles: Uint8Array): Grid {
    const grid = new Grid();
    for (let index = 0; index < CELLS; index += 1) {
      const obstacle = (((obstacles[index >> 3] ?? 0) << (index & 7)) & 0x80) !== 0;
      const x = index % W;
      const y = (index - x) / W;
      const border = x === 0 || y === 0 || x === W - 1 || y === W - 1;
      if (obstacle || border) grid.cells[index] = Cell.Claimed;
    }
    return grid;
  }

  /** The cell at (x, y), or -1 outside the grid. */
  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= W || y >= W ? -1 : (this.cells[y * W + x] ?? -1);
  }

  /** A `CLAIMED` cell with an `EMPTY` or `TRAIL` cell among its 8 neighbors
   *  [R4.2-1, R4.2-2, R4.2-3]. */
  isRail(x: number, y: number): boolean {
    if (this.at(x, y) !== Cell.Claimed) return false;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbor = dx === 0 && dy === 0 ? -1 : this.at(x + dx, y + dy);
        if (neighbor === Cell.Empty || neighbor === Cell.Trail) return true;
      }
    }
    return false;
  }

  /** Marks `BOSS_ZONE` the seed cells and every `EMPTY` cell 4-connected to them, with `TRAIL`
   *  and `CLAIMED` as walls, by the stack fill of README §4.8 [R4.8-2, R4.8-3]. A cell is marked
   *  when it is pushed, so it is pushed at most once and `stack` cannot overflow. */
  markBossZone(seeds: readonly number[], stack: Uint16Array): void {
    const { cells } = this;
    let length = 0;
    const push = (cell: number) => {
      if (length >= CAPTURE_STACK) reject(ErrorCode.Invariant);
      cells[cell] = Cell.BossZone;
      stack[length] = cell;
      length += 1;
    };
    for (const seed of seeds) push(seed);
    while (length > 0) {
      length -= 1;
      const cell = stack[length] ?? 0;
      const x = cell % W;
      const y = (cell - x) / W;
      if (y > 0 && cells[cell - W] === Cell.Empty) push(cell - W);
      if (x < W - 1 && cells[cell + 1] === Cell.Empty) push(cell + 1);
      if (y < W - 1 && cells[cell + W] === Cell.Empty) push(cell + W);
      if (x > 0 && cells[cell - 1] === Cell.Empty) push(cell - 1);
    }
  }

  count(cell: number): number {
    let total = 0;
    for (const other of this.cells) if (other === cell) total += 1;
    return total;
  }

  replace(from: number, to: number): void {
    const { cells } = this;
    for (let index = 0; index < CELLS; index += 1) if (cells[index] === from) cells[index] = to;
  }
}

export function newCaptureStack(): Uint16Array {
  return new Uint16Array(CAPTURE_STACK);
}

/** captured × 10,000 / claimable, with a single floor division [R4.1-8]. */
export function claimBp(captured: number, claimable: number): number {
  return Math.floor((captured * BP) / claimable);
}
