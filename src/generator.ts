// The levels of the endless Run (plan §4): level `depth` of a seed is level bytes v1 built from
// the seed alone, with the knobs of levels/README.md ramped by depth, and checked by the core's
// own validity rules, so a bad draw is replaced by the next one.

import type { Engine } from "./engine-api";
import { FIELD_CELLS, type Level, LEVEL_LEN, numberSpawns, setObstacle } from "./level";
import { between, hashText, mulberry32, type Random } from "./rng";

const MAX_ATTEMPTS = 200;
const PLAYER_X = 30;
const MIN_MINION_DISTANCE = 12;
const WALL_PLACEMENT_TRIES = 20;
const REST_EVERY = 5;
const BOSS_EVERY = 10;
const FIRST_LAYOUT_DEPTH = 2;

export interface Knobs {
  bossSize: [low: number, high: number];
  bossPeriod: number;
  minionCount: number;
  minionPeriod: number;
  respawnDelay: number;
  timeLimit: number;
  lives: number;
  targetBp: number;
  walls: number;
}

export const isBossLevel = (depth: number): boolean => depth % BOSS_EVERY === BOSS_EVERY - 1;
export const isRestLevel = (depth: number): boolean => depth % REST_EVERY === REST_EVERY - 1 && !isBossLevel(depth);

/** The knobs that rise with depth, each stepping on its own schedule so that the difficulty rises
 *  smoothly and never stops rising (measured by `scripts/balance.sh`, PLAN.md). */
export function rampAt(depth: number): Knobs {
  const minionCount = depth < 3 ? 0 : depth < 7 ? 1 : depth < 15 ? 2 : 3;
  return {
    bossSize: [Math.min(6, 3 + Math.floor(depth / 8)), Math.min(8, 4 + Math.floor(depth / 5))],
    bossPeriod: depth < 5 ? 3 : depth < 12 ? 2 : 1,
    minionCount,
    minionPeriod: minionCount === 0 ? 0 : depth < 9 ? 3 : depth < 18 ? 2 : 1,
    respawnDelay: minionCount === 0 ? 0 : Math.max(30, 90 - 3 * depth),
    timeLimit: Math.max(1200, 2700 - 15 * depth),
    lives: depth < 10 ? 5 : depth < 22 ? 4 : 3,
    targetBp: Math.min(9000, 7000 + 50 * depth),
    walls: Math.min(12, Math.floor(depth / 2)),
  };
}

/** The knobs of level `depth`: the ramp, eased on every fifth level (no minions, a lower target)
 *  and sharpened on every tenth (the biggest boss, at the ramp's target and lives). */
export function knobsAt(depth: number): Knobs {
  const ramp = rampAt(depth);
  if (isRestLevel(depth)) return { ...ramp, minionCount: 0, minionPeriod: 0, respawnDelay: 0, targetBp: ramp.targetBp - 400 };
  if (isBossLevel(depth)) return { ...ramp, bossSize: [8, 8] };
  return ramp;
}

interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const LAYOUTS = ["scatter", "pillars", "lanes", "crosses", "ring"] as const;
type Layout = (typeof LAYOUTS)[number];

/** Fills the cells of a width × height block at (x, y), unless it reaches the boss's spawn
 *  `avoid` zone, the player's start or the rail; returns whether it was placed. */
function fill(level: Level, avoid: Zone, x: number, y: number, width: number, height: number): boolean {
  const touchesAvoid = x <= avoid.x1 && x + width > avoid.x0 && y <= avoid.y1 && y + height > avoid.y0;
  const blocksStart = x <= PLAYER_X + 2 && x + width > PLAYER_X - 2 && y + height > FIELD_CELLS - 6;
  const onRail = x < 3 || y < 3 || x + width > FIELD_CELLS - 3 || y + height > FIELD_CELLS - 3;
  if (touchesAvoid || blocksStart || onRail) return false;
  for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) setObstacle(level, { x: x + dx, y: y + dy }, true);
  return true;
}

function scatter(level: Level, random: Random, avoid: Zone, walls: number): void {
  for (let wall = 0; wall < walls; wall += 1) {
    for (let attempt = 0; attempt < WALL_PLACEMENT_TRIES; attempt += 1) {
      const horizontal = random() < 0.5;
      const length = between(random, 6, 24);
      const thickness = between(random, 1, 2);
      const [width, height] = horizontal ? [length, thickness] : [thickness, length];
      const placed = fill(level, avoid, between(random, 3, FIELD_CELLS - 3 - width), between(random, 3, FIELD_CELLS - 3 - height), width, height);
      if (placed) break;
    }
  }
}

function pillars(level: Level, random: Random, avoid: Zone): void {
  const size = between(random, 2, 3);
  const step = between(random, 9, 12);
  for (let y = 8; y < FIELD_CELLS - 8; y += step) for (let x = 8; x < FIELD_CELLS - 8; x += step) fill(level, avoid, x, y, size, size);
}

function lanes(level: Level, random: Random, avoid: Zone): void {
  const gap = between(random, 8, 12);
  const rows = [12, 24, 36, 48].slice(0, between(random, 2, 4));
  rows.forEach((y, row) => {
    const left = row % 2 === 0;
    fill(level, avoid, left ? 3 + gap : 3, y, FIELD_CELLS - 6 - gap, between(random, 1, 2));
  });
}

function crosses(level: Level, random: Random, avoid: Zone): void {
  const arm = between(random, 4, 7);
  for (const [cx, cy] of [[14, 14], [45, 14], [14, 45], [45, 45]] as const) {
    fill(level, avoid, cx - arm, cy, 2 * arm + 1, 1);
    fill(level, avoid, cx, cy - arm, 1, 2 * arm + 1);
  }
}

function ring(level: Level, random: Random, avoid: Zone): void {
  const inset = between(random, 6, 10);
  const far = FIELD_CELLS - inset - 1;
  const gap = between(random, 5, 8);
  const mid = Math.floor(FIELD_CELLS / 2);
  for (const start of [inset, far]) {
    fill(level, avoid, inset, start, mid - gap - inset, 1);
    fill(level, avoid, mid + gap, start, far - mid - gap + 1, 1);
    fill(level, avoid, start, inset, 1, mid - gap - inset);
    fill(level, avoid, start, mid + gap, 1, far - mid - gap + 1);
  }
}

/** The layout of level `depth`: the first levels are open, then each is a draw from the layouts. */
function layoutAt(depth: number, random: Random): Layout | "open" {
  return depth < FIRST_LAYOUT_DEPTH ? "open" : (LAYOUTS[between(random, 0, LAYOUTS.length - 1)] as Layout);
}

function borderCell(random: Random): { x: number; y: number } {
  const along = between(random, 0, FIELD_CELLS - 1);
  const edge = between(random, 0, 3);
  return [{ x: along, y: 0 }, { x: along, y: FIELD_CELLS - 1 }, { x: 0, y: along }, { x: FIELD_CELLS - 1, y: along }][edge] as { x: number; y: number };
}

/** One draw of level `depth`; it may not be valid. */
export function drawLevel(depth: number, random: Random): Level {
  const knobs = knobsAt(depth);
  const bossSize = between(random, ...knobs.bossSize);
  const last = Math.min(34, FIELD_CELLS - 1 - bossSize - 1);
  const spawn = { x0: 20, y0: 20, x1: last, y1: last };
  const level: Level = {
    cells: new Uint8Array(FIELD_CELLS * FIELD_CELLS),
    bossSize,
    spawn,
    bossPeriod: knobs.bossPeriod,
    minionCount: knobs.minionCount,
    minionSpawns: [],
    minionPeriod: knobs.minionPeriod,
    respawnDelay: knobs.respawnDelay,
    timeLimit: knobs.timeLimit,
    lives: knobs.lives,
    targetBp: knobs.targetBp,
  };
  const avoid = { x0: spawn.x0, y0: spawn.y0, x1: spawn.x1 + bossSize, y1: spawn.y1 + bossSize };
  const layout = layoutAt(depth, random);
  if (layout === "scatter") scatter(level, random, avoid, Math.max(2, knobs.walls));
  else if (layout === "pillars") pillars(level, random, avoid);
  else if (layout === "lanes") lanes(level, random, avoid);
  else if (layout === "crosses") crosses(level, random, avoid);
  else if (layout === "ring") ring(level, random, avoid);
  level.minionSpawns = Array.from({ length: 3 }, (_, slot) => {
    if (slot >= knobs.minionCount) return { x: 0, y: 0 };
    let cell = borderCell(random);
    while (Math.abs(cell.x - PLAYER_X) + Math.abs(cell.y - (FIELD_CELLS - 1)) < MIN_MINION_DISTANCE) cell = borderCell(random);
    return cell;
  });
  return level;
}

/** The level bytes of level `depth` of `seed`. Throws if no draw within MAX_ATTEMPTS is valid. */
export function generateLevel(core: Engine, seed: string, depth: number): Uint8Array {
  const random = mulberry32(hashText(`${seed}/${depth}`));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const level = drawLevel(depth, random);
    if (numberSpawns(level) !== undefined) continue;
    const bytes = core.encodeLevel(level);
    if (bytes.length === LEVEL_LEN && core.validateLevel(bytes) === 0) return bytes;
  }
  throw new Error(`no valid level for ${seed} at depth ${depth} in ${MAX_ATTEMPTS} draws`);
}
