// A level in play (README §4.4): the whole state, and one tick of the seven steps.

import { Boss } from "./boss";
import { claimBp, type Grid, newCaptureStack } from "./grid";
import { minionHits, resolve } from "./hits";
import { type Level, validate } from "./level";
import { Minions } from "./minion";
import { Moves, Player } from "./player";
import { levelSeed } from "./seed";
import { EndCode, Mask } from "./types";

export class Game {
  readonly grid: Grid;
  readonly player: Player;
  readonly boss: Boss;
  readonly minions: Minions;
  /** The mask in force, from the last journal event (R4.4-6). */
  mask = 0;
  /** The ticks processed so far, which is also the next tick to process (PIN-08). */
  ticksUsed = 0;
  /** The journal events applied so far. Every event changes the mask (README §6.2), so this
   *  counts the changes of mask. */
  eventsApplied = 0;
  /** The cells captured so far in the level. */
  captured = 0;
  /** The cells `EMPTY` at level start [R4.1-8]. */
  readonly claimable: number;
  readonly targetBp: number;
  readonly timeLimit: number;
  end: EndCode | undefined = undefined;
  private readonly stack = newCaptureStack();
  private readonly moves = new Moves();

  /** The level before tick 0, with the boss start and deflection key of the level seed of
   *  `runNonce` and `levelIndex` (README §6.4). Rejects a level that fails validity (35 to 39). */
  constructor(level: Level, runNonce: Uint8Array, levelIndex: number) {
    const start = validate(level, this.stack);
    this.grid = start.grid;
    this.claimable = start.claimable;
    this.boss = new Boss(level, levelSeed(runNonce, levelIndex));
    this.minions = new Minions(level, this.grid);
    this.player = new Player(level.lives);
    this.targetBp = level.targetBp;
    this.timeLimit = level.timeLimit;
  }

  /** The claim in basis points: captured × 10,000 / claimable, rounded down [R4.1-8]. */
  claimBp(): number {
    return claimBp(this.captured, this.claimable);
  }

  /** Processes the next tick with `mask` in force, steps 1 to 7, and returns how the level
   *  ended, if it did on this tick or before. An ended level does not change. */
  step(mask: number): EndCode | undefined {
    if (this.end === undefined) {
      const tick = this.ticksUsed;
      this.ticksUsed += 1;
      this.end = this.tick(tick, mask);
    }
    return this.end;
  }

  /** The steps of R4.4-5, stopping at the first that ends the level [R4.4-4]. */
  private tick(tick: number, mask: number): EndCode | undefined {
    this.input(tick, mask);
    if (mask & Mask.X) {
      this.player.abandonCut(this.grid);
      return EndCode.Committed;
    }
    const { moves, player, grid } = this;
    player.step(grid, this.boss, mask, tick, this.stack, moves);
    if (moves.captured !== undefined) {
      this.captured += moves.captured;
      this.minions.afterCapture(grid);
      if (this.claimBp() >= this.targetBp) return EndCode.Cleared;
    }
    const bossHit = this.boss.step(grid, tick);
    this.minions.step(grid, tick);
    const hit = moves.hit || bossHit || minionHits(moves, this.minions);
    if (resolve(player, grid, hit, mask) && player.lives === 0) return EndCode.OutOfLives;
    return this.timeLimit - 1 === tick ? EndCode.TimeLimit : undefined;
  }

  /** Step 1: the mask of this tick's event, if any, replaces the mask in force [R4.4-6]. */
  private input(tick: number, mask: number): void {
    if (mask !== this.mask) this.eventsApplied += 1;
    this.player.input(this.mask, mask, tick);
    this.mask = mask;
  }
}
