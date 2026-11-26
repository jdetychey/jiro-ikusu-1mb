// The editor's model of a level (src/level.ts) and the core's `Level`: the conversions that
// jiro-wasm's edit buffers perform.

import { EDIT_FIELDS, editedLevel, type Level as EditorLevel, MINION_SLOTS } from "../level";
import { CELLS, OBSTACLE_BYTES } from "./consts";
import type { Level } from "./level";

/** The editor's model of `level`: its obstacle bits as cells, and its fields. */
export function toEditorLevel(level: Level): EditorLevel {
  const cells = new Uint8Array(CELLS);
  for (let index = 0; index < CELLS; index += 1) cells[index] = ((level.obstacles[index >> 3] ?? 0) >> (7 - (index & 7))) & 1;
  const { spawn } = level;
  const fields = [
    level.bossSize,
    spawn.x0,
    spawn.y0,
    spawn.x1,
    spawn.y1,
    level.bossPeriod,
    level.minionCount,
    ...level.minionSpawns.flatMap(({ x, y }) => [x, y]),
    level.minionPeriod,
    level.respawnDelay,
    level.timeLimit,
    level.lives,
    level.targetBp,
  ];
  return editedLevel(cells, fields.slice(0, EDIT_FIELDS));
}

/** The core's level of the editor's model, or undefined if a cell is not 0 or 1 or a field does
 *  not fit the byte or word that holds it. */
export function fromEditorLevel(model: EditorLevel): Level | undefined {
  const { spawn } = model;
  const bytes = [
    model.bossSize,
    spawn.x0,
    spawn.y0,
    spawn.x1,
    spawn.y1,
    model.bossPeriod,
    model.minionCount,
    ...model.minionSpawns.flatMap(({ x, y }) => [x, y]),
    model.minionPeriod,
    model.lives,
  ];
  const words = [model.respawnDelay, model.timeLimit, model.targetBp];
  const fits = (limit: number) => (value: number) => Number.isInteger(value) && value >= 0 && value <= limit;
  if (model.cells.some((cell) => cell > 1) || !bytes.every(fits(0xff)) || !words.every(fits(0xffff))) return undefined;
  const obstacles = new Uint8Array(OBSTACLE_BYTES);
  model.cells.forEach((cell, index) => {
    obstacles[index >> 3] = (obstacles[index >> 3] ?? 0) | (cell << (7 - (index & 7)));
  });
  return {
    obstacles,
    bossSize: model.bossSize,
    spawn: { ...model.spawn },
    bossPeriod: model.bossPeriod,
    minionCount: model.minionCount,
    minionSpawns: Array.from({ length: MINION_SLOTS }, (_, slot) => ({ ...(model.minionSpawns[slot] ?? { x: 0, y: 0 }) })),
    minionPeriod: model.minionPeriod,
    respawnDelay: model.respawnDelay,
    timeLimit: model.timeLimit,
    lives: model.lives,
    targetBp: model.targetBp,
  };
}
