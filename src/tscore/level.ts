// Level bytes v1 (README §5): 472 big-endian bytes, the range rules checked while decoding, then
// the validity of the level itself.

import { LEVEL_LEN, MINION_SLOTS } from "../level";
import { keccak256 } from "./keccak";
import { readU16 } from "./int";
import { CELLS, LEVEL_VERSION, MAX_BOSS_SIZE, MAX_TICKS, MIN_BOSS_SIZE, MIN_OPEN_AREA, OBSTACLE_BYTES, PLAYER_START, BP, W } from "./consts";
import { ErrorCode, reject } from "./error";
import { Grid } from "./grid";
import { Cell } from "./types";

export interface Spawn {
  x: number;
  y: number;
}

/** The fields of level bytes v1, in byte order. */
export interface Level {
  obstacles: Uint8Array;
  bossSize: number;
  /** The cells the top-left cell of the boss's body may start on, inclusive. */
  spawn: { x0: number; y0: number; x1: number; y1: number };
  bossPeriod: number;
  minionCount: number;
  minionSpawns: Spawn[];
  minionPeriod: number;
  respawnDelay: number;
  timeLimit: number;
  lives: number;
  targetBp: number;
}

/** What validity establishes at level start. */
export interface LevelStart {
  grid: Grid;
  /** The cells `EMPTY` at level start, the denominator of `claimBp` [R4.1-8]. */
  claimable: number;
}

/** The spawns of the level's minions: its first `minionCount` slots. */
export function minionsOf(level: Level): Spawn[] {
  return level.minionSpawns.slice(0, level.minionCount);
}

/** Reads level bytes, checking the rules of README §5's table in order (20 to 34) and
 *  rejecting with the first broken rule's code. */
export function decode(bytes: Uint8Array): Level {
  if (bytes.length !== LEVEL_LEN) reject(ErrorCode.LevelLength);
  if (bytes[0] !== LEVEL_VERSION) reject(ErrorCode.LevelVersion);
  const at = (index: number) => bytes[index] ?? 0;
  const fields = 1 + OBSTACLE_BYTES;
  const level: Level = {
    obstacles: bytes.slice(1, fields),
    bossSize: at(fields),
    spawn: { x0: at(fields + 1), y0: at(fields + 2), x1: at(fields + 3), y1: at(fields + 4) },
    bossPeriod: at(fields + 5),
    minionCount: at(fields + 6),
    minionSpawns: Array.from({ length: MINION_SLOTS }, (_, slot) => ({ x: at(fields + 7 + 2 * slot), y: at(fields + 8 + 2 * slot) })),
    minionPeriod: at(fields + 13),
    respawnDelay: readU16(bytes, fields + 14),
    timeLimit: readU16(bytes, fields + 16),
    lives: at(fields + 18),
    targetBp: readU16(bytes, fields + 19),
  };
  checkRanges(level);
  return level;
}

/** The level bytes of `level`, without checking it. */
export function encode(level: Level): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(LEVEL_LEN);
  const fields = 1 + OBSTACLE_BYTES;
  const { spawn } = level;
  bytes[0] = LEVEL_VERSION;
  bytes.set(level.obstacles, 1);
  bytes.set([level.bossSize, spawn.x0, spawn.y0, spawn.x1, spawn.y1, level.bossPeriod, level.minionCount], fields);
  bytes.set(
    level.minionSpawns.flatMap(({ x, y }) => [x, y]),
    fields + 7,
  );
  bytes.set(
    [level.minionPeriod, level.respawnDelay >> 8, level.respawnDelay & 0xff, level.timeLimit >> 8, level.timeLimit & 0xff, level.lives, level.targetBp >> 8, level.targetBp & 0xff],
    fields + 13,
  );
  return bytes;
}

/** keccak256 of the level bytes (README §5). */
export function levelId(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return keccak256(bytes);
}

/** Checks the validity of a level that `decode` accepted, in README §5's order (35 to 39), and
 *  returns its level-start state. The region search runs on `stack`. */
export function validate(level: Level, stack: Uint16Array): LevelStart {
  const grid = Grid.levelStart(level.obstacles);
  const open = grid.count(Cell.Empty);
  const start = grid.cells.indexOf(Cell.Empty);
  if (start < 0) reject(ErrorCode.OpenAreaSplit);
  grid.markBossZone([start], stack);
  const reached = grid.count(Cell.BossZone);
  grid.replace(Cell.BossZone, Cell.Empty);
  if (reached !== open) reject(ErrorCode.OpenAreaSplit);
  if (open < MIN_OPEN_AREA) reject(ErrorCode.OpenAreaSmall);
  if (!bodyAreaOpen(level, grid)) reject(ErrorCode.BossSpawn);
  if (minionsOf(level).some(({ x, y }) => !grid.isRail(x, y))) reject(ErrorCode.MinionSpawnRail);
  if (!grid.isRail(PLAYER_START.x, PLAYER_START.y)) reject(ErrorCode.PlayerStartRail);
  return { grid, claimable: open };
}

function checkRanges(level: Level): void {
  for (let index = 0; index < CELLS; index += 1) {
    const obstacle = (((level.obstacles[index >> 3] ?? 0) << (index & 7)) & 0x80) !== 0;
    const x = index % W;
    const y = (index - x) / W;
    if (obstacle && (x === 0 || y === 0 || x === W - 1 || y === W - 1)) reject(ErrorCode.BorderObstacle);
  }
  if (level.bossSize < MIN_BOSS_SIZE || level.bossSize > MAX_BOSS_SIZE) reject(ErrorCode.BossSize);
  const { x0, y0, x1, y1 } = level.spawn;
  if (x0 > x1 || y0 > y1) reject(ErrorCode.SpawnOrder);
  const bodyInside = (start: number) => start + level.bossSize < W;
  if (x0 < 1 || y0 < 1 || !bodyInside(x1) || !bodyInside(y1)) reject(ErrorCode.SpawnBounds);
  if (level.bossPeriod === 0) reject(ErrorCode.BossPeriod);
  if (level.minionCount > MINION_SLOTS) reject(ErrorCode.MinionCount);
  level.minionSpawns.forEach(({ x, y }, slot) => {
    if (slot < level.minionCount) {
      if (x >= W || y >= W) reject(ErrorCode.MinionSpawn);
    } else if (x !== 0 || y !== 0) reject(ErrorCode.MinionSlot);
  });
  const hasMinions = level.minionCount > 0;
  if (level.minionPeriod > 0 !== hasMinions) reject(ErrorCode.MinionPeriod);
  if (level.respawnDelay > 0 !== hasMinions) reject(ErrorCode.RespawnDelay);
  if (level.timeLimit < 1 || level.timeLimit > MAX_TICKS) reject(ErrorCode.TimeLimit);
  if (level.lives === 0) reject(ErrorCode.Lives);
  if (level.targetBp < 1 || level.targetBp > BP) reject(ErrorCode.Target);
}

/** Whether every cell some start in the spawn rectangle puts the B × B body on is `EMPTY`:
 *  x0 ≤ x < x1 + B, and the same for y. */
function bodyAreaOpen(level: Level, grid: Grid): boolean {
  const { x0, y0, x1, y1 } = level.spawn;
  for (let y = y0; y < y1 + level.bossSize; y += 1) {
    for (let x = x0; x < x1 + level.bossSize; x += 1) {
      if (grid.at(x, y) !== Cell.Empty) return false;
    }
  }
  return true;
}
