// The player (README §4.5): direction, rail movement, cuts, the fast cut and the slow shield, at
// step 3 of the tick (R4.4-8).

import type { Boss } from "./boss";
import { capture } from "./capture";
import { PLAYER_START, W } from "./consts";
import type { Grid } from "./grid";
import { Cell, DIRECTION_DX, DIRECTION_DY, Mask, NO_DIRECTION } from "./types";

/** What step 3 did, for the steps after it. */
export class Moves {
  /** P0, the player's cell at the start of step 3 (PIN-15). */
  fromX = 0;
  fromY = 0;
  /** P1 … Pn, the cells actually entered, n = 0, 1 or 2 (PIN-15). */
  enteredCount = 0;
  readonly enteredX = [0, 0];
  readonly enteredY = [0, 0];
  /** The player tried to step onto the boss's body (R4.9-3). */
  hit = false;
  /** The capture size, if a cut closed this tick (R4.5-5). */
  captured: number | undefined = undefined;

  begin(x: number, y: number): void {
    this.fromX = x;
    this.fromY = y;
    this.enteredCount = 0;
    this.hit = false;
    this.captured = undefined;
  }

  enter(x: number, y: number): void {
    this.enteredX[this.enteredCount] = x;
    this.enteredY[this.enteredCount] = y;
    this.enteredCount += 1;
  }
}

export class Player {
  x: number = PLAYER_START.x;
  y: number = PLAYER_START.y;
  cutting = false;
  /** The cell the last cut left from; it keeps its value between cuts (R4.3-5). */
  cutStartX: number = PLAYER_START.x;
  cutStartY: number = PLAYER_START.y;
  shield = 1;
  /** Protected ticks left (R4.3-5); the hits of step 6 set and count it down. */
  invulnerable = 0;
  /** The direction resolved at the last step 3 (R4.5-1, PIN-05). */
  direction: number = NO_DIRECTION;
  /** The tick on which B last went from released to held, 0 before any press (R4.3-5). */
  pressTick = 0;

  constructor(public lives: number) {}

  /** Step 1's part for the player: B going from released to held sets `pressTick`
   *  (R4.3-5, PIN-03). */
  input(previous: number, current: number, tick: number): void {
    if (current & Mask.B && !(previous & Mask.B)) this.pressTick = tick;
  }

  /** Step 3: resolves the direction, then moves 0, 1 or 2 sub-steps into `moves`. A cut that
   *  closes captures at once through `stack`. */
  step(grid: Grid, boss: Boss, mask: number, tick: number, stack: Uint16Array, moves: Moves): void {
    this.direction = this.resolveDirection(mask);
    moves.begin(this.x, this.y);
    if (this.direction === NO_DIRECTION) return;
    const subSteps = this.subSteps(mask, tick);
    for (let done = 0; done < subSteps; done += 1) {
      if (!this.subStep(grid, boss, stack, moves)) break;
    }
  }

  /** Erases the trail, and a player still cutting returns to the cut start and stops cutting: a
   *  commit (R4.4-7) and a lost life (R4.9-17) both discard the unfinished cut this way. */
  abandonCut(grid: Grid): void {
    grid.replace(Cell.Trail, Cell.Empty);
    if (this.cutting) {
      this.x = this.cutStartX;
      this.y = this.cutStartY;
      this.cutting = false;
    }
  }

  /** Keeps the previous direction while it is held, otherwise takes the first held one in the
   *  order up, down, left, right [R4.5-1]; the direction numbers are the mask bits' positions. */
  private resolveDirection(mask: number): number {
    if (this.direction !== NO_DIRECTION && mask & (1 << this.direction)) return this.direction;
    for (let direction = 0; direction < 4; direction += 1) {
      if (mask & (1 << direction)) return direction;
    }
    return NO_DIRECTION;
  }

  /** B held: one sub-step on the ticks where (tick − pressTick) % 2 == 0, else none, and B wins
   *  over A [R4.5-7]. Otherwise two when cutting at the start of the tick with A held [R4.5-6],
   *  else one. */
  private subSteps(mask: number, tick: number): number {
    if (mask & Mask.B) return (tick - this.pressTick) % 2 === 0 ? 1 : 0;
    return this.cutting && mask & Mask.A ? 2 : 1;
  }

  /** One sub-step; true only if the player entered an `EMPTY` cell while cutting, so a fast cut
   *  may take one more. Every other outcome ends the tick's movement. */
  private subStep(grid: Grid, boss: Boss, stack: Uint16Array, moves: Moves): boolean {
    const x = this.x + (DIRECTION_DX[this.direction] ?? 0);
    const y = this.y + (DIRECTION_DY[this.direction] ?? 0);
    if (x < 0 || y < 0 || x >= W || y >= W) return false;
    if (boss.covers(x, y)) {
      moves.hit = true;
      return false;
    }
    const index = y * W + x;
    const cell = grid.cells[index];
    if (cell === Cell.Trail || cell === Cell.BossZone) return false;
    if (this.cutting) {
      this.x = x;
      this.y = y;
      moves.enter(x, y);
      if (cell === Cell.Empty) {
        grid.cells[index] = Cell.Trail;
        return true;
      }
      this.cutting = false;
      moves.captured = capture(grid, boss.bodyCells(), stack);
      return false;
    }
    if (cell === Cell.Empty) {
      grid.cells[index] = Cell.Trail;
      this.cutStartX = this.x;
      this.cutStartY = this.y;
      this.x = x;
      this.y = y;
      this.cutting = true;
      this.invulnerable = 0;
      moves.enter(x, y);
    } else if (!grid.isRail(this.x, this.y) || grid.isRail(x, y)) {
      this.x = x;
      this.y = y;
      moves.enter(x, y);
    }
    return false;
  }
}
