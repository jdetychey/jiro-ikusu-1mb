// The boss (README §4.6): a B × B body that moves one axis at a time, testing its whole leading
// edge, with the seeded deflections of D14.

import type { Grid } from "./grid";
import type { Level } from "./level";
import { bossStart, deflectionKey } from "./seed";
import { W } from "./consts";
import { Cell } from "./types";

export class Boss {
  /** The top-left cell of the body [R4.6-1]. */
  x: number;
  y: number;
  readonly size: number;
  /** +1 or −1. */
  vx: number;
  vy: number;
  readonly period: number;
  /** A level constant from the level seed, not boss state (R4.6-11). */
  readonly deflectionKey: number;

  /** The boss at level start: its start and direction from the level seed (R4.6-5), and its
   *  deflection key (R4.6-7). */
  constructor(level: Level, seed: Uint8Array) {
    const start = bossStart(level, seed);
    this.x = start.x;
    this.y = start.y;
    this.vx = start.vx;
    this.vy = start.vy;
    this.size = level.bossSize;
    this.period = level.bossPeriod;
    this.deflectionKey = deflectionKey(seed);
  }

  covers(x: number, y: number): boolean {
    return x >= this.x && x < this.x + this.size && y >= this.y && y < this.y + this.size;
  }

  /** The indices of the body's cells inside the grid, row by row. */
  bodyCells(): number[] {
    const cells: number[] = [];
    for (let y = this.y; y < this.y + this.size; y += 1) {
      for (let x = this.x; x < this.x + this.size; x += 1) {
        if (x < W && y < W) cells.push(y * W + x);
      }
    }
    return cells;
  }

  /** Step 4 of the tick (R4.4-9): on a tick the boss moves, the deflection draw of R4.6-7, then
   *  the edge tests of R4.6-3, x first. Returns whether a leading edge held `TRAIL`, which hits
   *  the player. */
  step(grid: Grid, tick: number): boolean {
    if (this.period === 0 || tick % this.period !== 0) return false;
    const draw = deflectionDraw(this.deflectionKey, tick);
    if (draw === 0) this.vx = -this.vx;
    else if (draw === 1) this.vy = -this.vy;
    const hitX = this.moveAxis(grid, true);
    const hitY = this.moveAxis(grid, false);
    return hitX || hitY;
  }

  /** Tests the B cells the body would enter on one axis: if any is `CLAIMED` or `TRAIL`, the
   *  velocity component inverts, and otherwise the body moves one cell. A cell outside the grid
   *  blocks like the border, though the border keeps the body from ever reaching it. */
  private moveAxis(grid: Grid, horizontal: boolean): boolean {
    const velocity = horizontal ? this.vx : this.vy;
    const along = horizontal ? this.x : this.y;
    const across = horizontal ? this.y : this.x;
    const edge = velocity > 0 ? along + this.size : along - 1;
    let blocked = false;
    let trail = false;
    for (let offset = 0; offset < this.size; offset += 1) {
      const cell = horizontal ? grid.at(edge, across + offset) : grid.at(across + offset, edge);
      if (cell === Cell.Trail) {
        blocked = true;
        trail = true;
      } else if (cell === Cell.Claimed || cell === -1) blocked = true;
    }
    if (blocked && horizontal) this.vx = -this.vx;
    else if (blocked) this.vy = -this.vy;
    else if (horizontal) this.x += velocity;
    else this.y += velocity;
    return trail;
  }
}

/** r = fmix32(key XOR tick) >> 26, from 0 to 63: 0 inverts vx and 1 inverts vy (R4.6-7). */
export function deflectionDraw(key: number, tick: number): number {
  return fmix32((key ^ tick) >>> 0) >>> 26;
}

/** The 32-bit finalizer of MurmurHash3, with wrapping multiplications (R4.6-9). */
export function fmix32(value: number): number {
  let h = value;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
