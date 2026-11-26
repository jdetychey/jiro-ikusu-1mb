// What the player's browser remembers of past Runs: the best Run of each day, from which the
// streak and the best depth follow. Storage may be missing, so every read has a fallback.

import { load, save, type Storage } from "./storage";

const STATS_KEY = "jiro-1mb.stats";
const DAY_MS = 86_400_000;

export interface DayBest {
  score: number;
  levelsCleared: number;
}

/** The best Run of each UTC day, by its seed. */
export type Stats = Record<string, DayBest>;

const isDayBest = (value: unknown): value is DayBest =>
  typeof value === "object" && value !== null && Number.isInteger((value as DayBest).score) && Number.isInteger((value as DayBest).levelsCleared);

function isStats(value: unknown): value is Stats {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(isDayBest);
}

export function loadStats(storage: Storage | undefined): Stats {
  return load(storage, STATS_KEY, isStats, () => ({}));
}

/** The stats with `run` counted for `seed`: kept only if it beats that day's best. */
export function withRun(stats: Stats, seed: string, run: DayBest): Stats {
  const best = stats[seed];
  return best !== undefined && best.score >= run.score ? stats : { ...stats, [seed]: run };
}

export function saveStats(storage: Storage | undefined, stats: Stats): boolean {
  return save(storage, STATS_KEY, stats);
}

const dayBefore = (seed: string): string => new Date(Date.parse(`${seed}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** The days in a row, ending today or yesterday, on which a Run was played. */
export function streak(stats: Stats, today: string): number {
  let day = stats[today] === undefined ? dayBefore(today) : today;
  let days = 0;
  while (stats[day] !== undefined) {
    days += 1;
    day = dayBefore(day);
  }
  return days;
}

export function bestDepth(stats: Stats): number {
  return Math.max(0, ...Object.values(stats).map((day) => day.levelsCleared));
}
