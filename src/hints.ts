// The first-run tutorial: which hint to show while Training level 1 is played the first time,
// from what the player has done so far.

import type { Snapshot } from "./core";

export interface Progress {
  moved: boolean;
  cut: boolean;
  captured: boolean;
}

export const NO_PROGRESS: Progress = { moved: false, cut: false, captured: false };

const START = { x: 30, y: 59 };

/** What the player has done by `snapshot`, never less than `before`. */
export function progressAt(before: Progress, snapshot: Snapshot): Progress {
  const { player } = snapshot;
  return {
    moved: before.moved || player.x !== START.x || player.y !== START.y,
    cut: before.cut || player.cutting,
    captured: before.captured || snapshot.claimBp > 0,
  };
}

export function hintFor({ moved, cut, captured }: Progress, targetBp: number): string {
  if (!moved) return "Move along the edge with the arrow keys.";
  if (!cut) return "Hold A and step into the field to cut a line.";
  if (!captured) return "Close the line on the edge to claim the area. Keep it away from the boss.";
  return `Claim ${targetBp / 100} % to clear the level, then press X to bank it.`;
}
