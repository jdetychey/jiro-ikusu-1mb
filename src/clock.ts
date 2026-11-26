// A clock that can be paused: the time spent paused is subtracted, so a level resumes exactly
// where it stopped and no tick is due for the time the page was hidden.

export interface PausableClock {
  now(): number;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

export function createPausableClock(source: () => number, speed = 1): PausableClock {
  let pausedAt: number | undefined;
  let pausedTotal = 0;
  const reading = () => (pausedAt ?? source()) - pausedTotal;
  return {
    now: () => reading() * speed,
    pause() {
      pausedAt ??= source();
    },
    resume() {
      if (pausedAt === undefined) return;
      pausedTotal += source() - pausedAt;
      pausedAt = undefined;
    },
    get paused() {
      return pausedAt !== undefined;
    },
  };
}
