import { FIELD_CELLS } from "../level";

/** Grid width and height in cells (README §4.1). */
export const W = FIELD_CELLS;
/** Cells in the grid: 60 × 60 (README §2). */
export const CELLS = W * W;
/** Capture stack capacity: the 58 × 58 interior (README §2, §4.8). */
export const CAPTURE_STACK = 3_364;
/** Highest time limit, so every tick of a level is below it (README §5, §6.3). */
export const MAX_TICKS = 2_700;
/** The rules version journals are played under (README §6.3, PIN-13). */
export const RULES_VERSION = 2;
export const SEASON_LEVELS = 16;
export const JOURNAL_VERSION = 1;
export const LEVEL_VERSION = 1;
export const OBSTACLE_BYTES = 450;
export const MIN_BOSS_SIZE = 2;
export const MAX_BOSS_SIZE = 8;
/** Smallest open area: half of the 3,364-cell interior (README §5). */
export const MIN_OPEN_AREA = 1_682;
/** Basis points in a whole (README §4.1). */
export const BP = 10_000;
/** The player's cell at level start (README §4.5, PIN-01). */
export const PLAYER_START = { x: 30, y: 59 } as const;
/** The protected ticks after a life is lost (R4.9-17, PIN-02). */
export const INVULNERABLE_TICKS = 30;
