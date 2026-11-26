/** The stable rejection codes of README §6.3 (journal and replay) and §5 (level). */
export const ErrorCode = {
  Truncated: 1,
  TrailingBytes: 2,
  Version: 3,
  RulesVersion: 4,
  Mode: 5,
  LevelIndex: 6,
  EventCount: 7,
  TickLimit: 8,
  TickOrder: 9,
  ReservedBit: 10,
  UnchangedMask: 11,
  LevelId: 12,
  EventPastTimeLimit: 13,
  EventAfterEnd: 14,
  Invariant: 15,
  LevelLength: 20,
  LevelVersion: 21,
  BorderObstacle: 22,
  BossSize: 23,
  SpawnOrder: 24,
  SpawnBounds: 25,
  BossPeriod: 26,
  MinionCount: 27,
  MinionSpawn: 28,
  MinionSlot: 29,
  MinionPeriod: 30,
  RespawnDelay: 31,
  TimeLimit: 32,
  Lives: 33,
  Target: 34,
  OpenAreaSplit: 35,
  OpenAreaSmall: 36,
  BossSpawn: 37,
  MinionSpawnRail: 38,
  PlayerStartRail: 39,
} as const;

/** A rejection by a rule, carrying its code; thrown where the Rust core returns `Err`. */
export class RuleError extends Error {
  constructor(readonly code: number) {
    super(`rule broken: code ${code}`);
  }
}

export function reject(code: number): never {
  throw new RuleError(code);
}
