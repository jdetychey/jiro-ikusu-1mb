/** A cell state [R4.1-2]. */
export const Cell = { Empty: 0, Claimed: 1, Trail: 2, BossZone: 3 } as const;

/** A direction, in the order of the input mask bits and of direction priority [R4.5-1]. */
export const Dir = { Up: 0, Down: 1, Left: 2, Right: 3 } as const;
export const NO_DIRECTION = -1;
export const DIRECTION_DX = [0, 0, -1, 1];
export const DIRECTION_DY = [-1, 1, 0, 0];
/** A quarter turn clockwise: E for N, S for E, W for S, N for W (PIN-06). */
export const CLOCKWISE = [Dir.Right, Dir.Left, Dir.Up, Dir.Down];
export const COUNTERCLOCKWISE = [Dir.Left, Dir.Right, Dir.Down, Dir.Up];

/** The input mask bits of README §6.1; bit 7 is reserved. */
export const Mask = { A: 1 << 4, B: 1 << 5, X: 1 << 6, Reserved: 1 << 7 } as const;

/** How a level ended (README §4.10), with the `endReason` codes of the Outcome (§7.3). */
export const EndCode = { Committed: 1, Cleared: 2, OutOfLives: 3, TimeLimit: 4 } as const;
export type EndCode = (typeof EndCode)[keyof typeof EndCode];
