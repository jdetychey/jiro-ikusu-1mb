// Minions (README §4.7): the right-hand rule on the rail, the orientation step, and the lifecycle
// of PIN-17. Headings are directions: N is up, E right, S down, W left.

import { MINION_SLOTS } from "../level";
import type { Grid } from "./grid";
import { type Level, minionsOf } from "./level";
import { CLOCKWISE, COUNTERCLOCKWISE, Cell, DIRECTION_DX, DIRECTION_DY, Dir } from "./types";

/** The headings in the order the orientation step tests them: N, E, S, W [R4.7-3]. */
const ORIENTATION_ORDER = [Dir.Up, Dir.Right, Dir.Down, Dir.Left];

export class Minion {
  /** Live, or destroyed by a capture and respawning when the countdown reaches zero (PIN-17). */
  live = true;
  x: number;
  y: number;
  heading: number;
  countdown = 0;

  constructor(
    readonly spawnX: number,
    readonly spawnY: number,
    heading: number,
  ) {
    this.x = spawnX;
    this.y = spawnY;
    this.heading = heading;
  }
}

/** A minion's cell at the start and at the end of step 5, for the hit predicate (PIN-15). */
export class MinionMove {
  present = false;
  fromX = 0;
  fromY = 0;
  toX = 0;
  toY = 0;
}

export class Minions {
  readonly slots: (Minion | undefined)[] = Array.from({ length: MINION_SLOTS }, () => undefined);
  readonly moves = Array.from({ length: MINION_SLOTS }, () => new MinionMove());

  /** The level's minions at their spawn cells, each facing N, then oriented (PIN-16). */
  constructor(
    level: Level,
    grid: Grid,
    readonly period = level.minionPeriod,
    readonly respawnDelay = level.respawnDelay,
  ) {
    minionsOf(level).forEach(({ x, y }, slot) => {
      this.slots[slot] = new Minion(x, y, orient(grid, x, y, Dir.Up));
    });
  }

  /** Step 3, after a capture: a live minion whose cell is no longer a rail cell is destroyed,
   *  with its countdown set to R; every other live minion runs the orientation step
   *  [R4.7-7, R4.7-8]. */
  afterCapture(grid: Grid): void {
    for (const minion of this.slots) {
      if (minion === undefined || !minion.live) continue;
      if (grid.isRail(minion.x, minion.y)) minion.heading = orient(grid, minion.x, minion.y, minion.heading);
      else {
        minion.live = false;
        minion.countdown = this.respawnDelay;
      }
    }
  }

  /** Step 5, in index order: a destroyed minion counts down and respawns, oriented and without
   *  moving, at zero; a live one takes one right-hand step on the ticks that are multiples of
   *  the period [R4.7-9, R4.7-10]. Fills `moves` with each present minion's cells for the hit
   *  predicate. */
  step(grid: Grid, tick: number): void {
    const movesNow = this.period !== 0 && tick % this.period === 0;
    this.slots.forEach((minion, slot) => {
      const move = this.moves[slot];
      if (minion === undefined || move === undefined) return;
      move.present = false;
      if (!minion.live) {
        if (minion.countdown > 1) minion.countdown -= 1;
        else this.respawn(grid, minion);
      } else if (movesNow) {
        move.fromX = minion.x;
        move.fromY = minion.y;
        rightHandStep(grid, minion);
        move.toX = minion.x;
        move.toY = minion.y;
        move.present = true;
        return;
      }
      if (minion.live) {
        move.fromX = move.toX = minion.x;
        move.fromY = move.toY = minion.y;
        move.present = true;
      }
    });
  }

  /** The spawn cell if it is a rail cell, else the first rail cell in row-major order
   *  [R4.7-7]; with none, the minion stays destroyed with a countdown of 0. */
  private respawn(grid: Grid, minion: Minion): void {
    let cell = grid.isRail(minion.spawnX, minion.spawnY) ? { x: minion.spawnX, y: minion.spawnY } : undefined;
    for (let y = 0; cell === undefined && y < 60; y += 1) {
      for (let x = 0; cell === undefined && x < 60; x += 1) if (grid.isRail(x, y)) cell = { x, y };
    }
    if (cell === undefined) {
      minion.countdown = 0;
      return;
    }
    minion.live = true;
    minion.x = cell.x;
    minion.y = cell.y;
    minion.heading = orient(grid, cell.x, cell.y, Dir.Up);
  }
}

function isOpen(grid: Grid, x: number, y: number): boolean {
  const cell = grid.at(x, y);
  return cell === Cell.Empty || cell === Cell.Trail;
}

/** The first heading, in the order N, E, S, W, with open field on its right; failing that, the
 *  first with open field behind its right; `current` if none qualifies, which no rail cell does
 *  [R4.7-3, PIN-06]. */
export function orient(grid: Grid, x: number, y: number, current: number): number {
  for (const heading of ORIENTATION_ORDER) {
    const right = CLOCKWISE[heading] ?? 0;
    if (isOpen(grid, x + (DIRECTION_DX[right] ?? 0), y + (DIRECTION_DY[right] ?? 0))) return heading;
  }
  for (const heading of ORIENTATION_ORDER) {
    const right = CLOCKWISE[heading] ?? 0;
    const behind = CLOCKWISE[right] ?? 0;
    const rightX = x + (DIRECTION_DX[right] ?? 0);
    const rightY = y + (DIRECTION_DY[right] ?? 0);
    if (grid.at(rightX, rightY) !== -1 && isOpen(grid, rightX + (DIRECTION_DX[behind] ?? 0), rightY + (DIRECTION_DY[behind] ?? 0))) return heading;
  }
  return current;
}

/** Right, then straight, then left, then back: the first direction whose target is a rail cell.
 *  With none, the minion stays and keeps its heading [R4.7-2, PIN-18]. */
function rightHandStep(grid: Grid, minion: Minion): void {
  const right = CLOCKWISE[minion.heading] ?? 0;
  const candidates = [right, minion.heading, COUNTERCLOCKWISE[minion.heading] ?? 0, CLOCKWISE[right] ?? 0];
  for (const direction of candidates) {
    const x = minion.x + (DIRECTION_DX[direction] ?? 0);
    const y = minion.y + (DIRECTION_DY[direction] ?? 0);
    if (grid.isRail(x, y)) {
      minion.x = x;
      minion.y = y;
      minion.heading = direction;
      return;
    }
  }
}
