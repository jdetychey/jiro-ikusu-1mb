// The levels of the endless Run (plan §4): level `depth` of a seed is level bytes v1 built from
// the seed alone, with the knobs of levels/README.md ramped by depth, and checked by the core's
// own validity rules, so a bad draw is replaced by the next one.

import type { Core } from "./core";
import { FIELD_CELLS, type Level, LEVEL_LEN, numberSpawns, setObstacle } from "./level";
import { between, hashText, mulberry32, type Random } from "./rng";

const MAX_ATTEMPTS = 200;
const PLAYER_X = 30;
const MIN_MINION_DISTANCE = 12;

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

/** The knobs of level `depth` (0 is the first), each stepping on its own schedule so that the
 *  difficulty rises smoothly and never stops rising (measured by `npm run balance`, PLAN.md). */
export function knobsAt(depth: number): Knobs {
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

function addWall(level: Level, random: Random, avoid: { x0: number; y0: number; x1: number; y1: number }): void {
  const horizontal = random() < 0.5;
  const length = between(random, 6, 24);
  const thickness = between(random, 1, 2);
  const [width, height] = horizontal ? [length, thickness] : [thickness, length];
  const x = between(random, 3, FIELD_CELLS - 3 - width);
  const y = between(random, 3, FIELD_CELLS - 3 - height);
  const touchesAvoid = x <= avoid.x1 && x + width > avoid.x0 && y <= avoid.y1 && y + height > avoid.y0;
  const blocksStart = x <= PLAYER_X + 2 && x + width > PLAYER_X - 2 && y + height > FIELD_CELLS - 6;
  if (touchesAvoid || blocksStart) return;
  for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) setObstacle(level, { x: x + dx, y: y + dy }, true);
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
  for (let wall = 0; wall < knobs.walls; wall += 1) addWall(level, random, avoid);
  level.minionSpawns = Array.from({ length: 3 }, (_, slot) => {
    if (slot >= knobs.minionCount) return { x: 0, y: 0 };
    let cell = borderCell(random);
    while (Math.abs(cell.x - PLAYER_X) + Math.abs(cell.y - (FIELD_CELLS - 1)) < MIN_MINION_DISTANCE) cell = borderCell(random);
    return cell;
  });
  return level;
}

/** The level bytes of level `depth` of `seed`. Throws if no draw within MAX_ATTEMPTS is valid. */
export function generateLevel(core: Core, seed: string, depth: number): Uint8Array {
  const random = mulberry32(hashText(`${seed}/${depth}`));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const level = drawLevel(depth, random);
    if (numberSpawns(level) !== undefined) continue;
    const bytes = core.encodeLevel(level);
    if (bytes.length === LEVEL_LEN && core.validateLevel(bytes) === 0) return bytes;
  }
  throw new Error(`no valid level for ${seed} at depth ${depth} in ${MAX_ATTEMPTS} draws`);
}
