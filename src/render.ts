// The field (README §4.1): 60 × 60 cells, each drawn `cellPx` canvas pixels wide, where cellPx is
// the largest whole number of pixels that fits the screen, so the field is crisp at any size.
// Cells are redrawn only when they change, on a grid layer; the entities and the effects are
// drawn on top of a copy of it every frame.

import type { Snapshot } from "./core";
import type { Effects } from "./effects";
import { FIELD_CELLS } from "./level";

export const MIN_CELL_PX = 4;
export const MAX_CELL_PX = 12;

/** The colors of the cell values 0 to 3; BOSS_ZONE exists only during a capture. */
export const CELL_COLORS = ["#000000", "#2850ff", "#ff2a2a", "#000000"] as const;
export const ENTITY_COLORS = {
  player: "#ffffff",
  invulnerablePlayer: "#9a9a9a",
  boss: "#ff3cf0",
  bossCore: "#5a0d55",
  minion: "#3cff78",
  minionCore: "#0b3d1d",
} as const;

/** A rectangle to draw over the grid, in pixels. */
export interface Rect {
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rectangle of `width` × `height` cells whose top-left cell is (x, y). */
export function cellRect(cellPx: number, x: number, y: number, width: number, height: number, color: string): Rect {
  return { color, x: x * cellPx, y: y * cellPx, width: width * cellPx, height: height * cellPx };
}

/** The entities to draw over the grid, back to front: boss, minions, player. The boss has a dark
 *  core and each minion a dark center, so that they differ from the player by shape, not by color
 *  alone. A player that cannot be hurt blinks. */
export function entityRects(snapshot: Snapshot, cellPx: number, blinkOn = true): Rect[] {
  const { boss, player } = snapshot;
  const rects = [cellRect(cellPx, boss.x, boss.y, boss.size, boss.size, ENTITY_COLORS.boss)];
  if (boss.size >= 3) rects.push(cellRect(cellPx, boss.x + 1, boss.y + 1, boss.size - 2, boss.size - 2, ENTITY_COLORS.bossCore));
  for (const minion of snapshot.minions.filter(({ state }) => state === "live")) {
    rects.push(cellRect(cellPx, minion.x, minion.y, 1, 1, ENTITY_COLORS.minion));
    const inset = Math.max(1, Math.floor(cellPx / 3));
    rects.push({ color: ENTITY_COLORS.minionCore, x: minion.x * cellPx + inset, y: minion.y * cellPx + inset, width: cellPx - 2 * inset, height: cellPx - 2 * inset });
  }
  if (snapshot.invulnerable === 0 || blinkOn) {
    const color = snapshot.invulnerable > 0 ? ENTITY_COLORS.invulnerablePlayer : ENTITY_COLORS.player;
    rects.push(cellRect(cellPx, player.x, player.y, 1, 1, color));
  }
  return rects;
}

/** The largest cell size, in pixels, at which the field fits `width` × `height`. */
export function cellSizeFor(width: number, height: number): number {
  const fitting = Math.floor(Math.min(width, height) / FIELD_CELLS);
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, fitting));
}

export class Renderer {
  private context: CanvasRenderingContext2D;
  private gridLayer = document.createElement("canvas");
  private gridContext: CanvasRenderingContext2D;
  private cellPx = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.style.imageRendering = "pixelated";
    this.context = context2d(canvas);
    this.gridContext = context2d(this.gridLayer);
    this.resize(MIN_CELL_PX);
  }

  get cell(): number {
    return this.cellPx;
  }

  /** The 2D context of the visible canvas, for effects. */
  get overlay(): CanvasRenderingContext2D {
    return this.context;
  }

  /** Sizes the field to the largest whole cell size that fits `width` × `height` CSS pixels.
   *  Returns whether the size changed, in which case the grid layer is empty until `redraw`. */
  fit(width: number, height: number): boolean {
    const next = cellSizeFor(width, height);
    if (next === this.cellPx) return false;
    this.resize(next);
    return true;
  }

  private resize(cellPx: number): void {
    this.cellPx = cellPx;
    const size = FIELD_CELLS * cellPx;
    for (const layer of [this.canvas, this.gridLayer]) {
      layer.width = size;
      layer.height = size;
    }
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.context = context2d(this.canvas);
    this.gridContext = context2d(this.gridLayer);
  }

  /** Redraws every cell of `grid` on the grid layer. */
  redraw(grid: Uint8Array): void {
    this.drawCells(grid, grid.keys());
  }

  /** Redraws the cells at `indices` of `grid` on the grid layer. */
  drawCells(grid: Uint8Array, indices: Iterable<number>): void {
    for (const index of indices) {
      this.gridContext.fillStyle = CELL_COLORS[grid[index] ?? 0] ?? CELL_COLORS[0];
      this.gridContext.fillRect((index % FIELD_CELLS) * this.cellPx, Math.floor(index / FIELD_CELLS) * this.cellPx, this.cellPx, this.cellPx);
    }
  }

  /** Shows the grid layer with the entities of `snapshot` on top, then the effects. */
  frame(snapshot: Snapshot, effects?: Effects, blinkOn = true): void {
    this.show(entityRects(snapshot, this.cellPx, blinkOn));
    effects?.draw(this.context, this.cellPx);
  }

  /** Shows the grid layer with `rects` on top, back to front. */
  show(rects: Rect[]): void {
    this.context.drawImage(this.gridLayer, 0, 0);
    for (const rect of rects) {
      this.context.fillStyle = rect.color;
      this.context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("this browser has no 2D canvas");
  context.imageSmoothingEnabled = false;
  return context;
}
