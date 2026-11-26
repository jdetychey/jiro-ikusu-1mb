// Shared by the parity tests: sizes from the environment, seeded input patterns, and a play of
// one level on both engines that compares them tick by tick.

import { expect } from "vitest";
import { type Core, CoreError, type EndReason, hex } from "../src/core";
import type { Engine } from "../src/engine-api";
import { mulberry32, type Random } from "../src/rng";

export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;
export const A = 16;
export const B = 32;
export const X = 64;
const DIRECTIONS = [UP, DOWN, LEFT, RIGHT];

export function envCount(name: string, fallback: number): number {
  const text = process.env[name];
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer, got ${text}`);
  return value;
}

/** What `action` throws, as "call:code" for a CoreError, or "none". Other errors propagate. */
export function failureOf(action: () => unknown): string {
  try {
    action();
    return "none";
  } catch (error) {
    if (error instanceof CoreError) return `${error.call}:${error.code}`;
    throw error;
  }
}

export const SEED = envCount("PARITY_SEED", 1);

export function seededRandom(...labels: (string | number)[]): Random {
  const text = [SEED, ...labels].join("/");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return mulberry32(hash >>> 0);
}

export function randomBytes(random: Random, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(random() * 256));
}

/** The controls held at each tick. */
export type MaskAt = (tick: number) => number;

/** A held mask for a random spell of ticks, then another: directions that mostly persist, with
 *  the fast cut and the shield now and then. */
function wandering(random: Random): MaskAt {
  let until = 0;
  let mask = 0;
  return (tick) => {
    if (tick >= until) {
      until = tick + 1 + Math.floor(random() * 25);
      const direction = DIRECTIONS[Math.floor(random() * 4)] ?? UP;
      const second = random() < 0.15 ? (DIRECTIONS[Math.floor(random() * 4)] ?? UP) : 0;
      mask = direction | second | (random() < 0.4 ? A : 0) | (random() < 0.12 ? B : 0);
      if (random() < 0.1) mask = 0;
    }
    return mask;
  };
}

/** Rectangles cut from the bottom edge and closed on it, at a random size and speed, again and
 *  again: the way a game gets captures. */
function looping(random: Random): MaskAt {
  const legs: number[] = [];
  const speed = random() < 0.5 ? A : 0;
  const shield = random() < 0.2 ? B : 0;
  for (let round = 0; round < 60; round += 1) {
    const side = random() < 0.5 ? LEFT : RIGHT;
    const height = 3 + Math.floor(random() * 25);
    const width = 3 + Math.floor(random() * 25);
    for (const [direction, length] of [[UP, height], [side, width], [DOWN, height + 1], [side === LEFT ? RIGHT : LEFT, width + 2]] as const) {
      for (let step = 0; step < length; step += 1) legs.push(direction | speed | shield);
    }
  }
  return (tick) => legs[tick] ?? 0;
}

function holding(mask: number): MaskAt {
  return () => mask;
}

/** Plays `wandering` until `commitTick`, then holds X. */
function committing(random: Random): MaskAt {
  const commitTick = 20 + Math.floor(random() * 400);
  const before = wandering(random);
  return (tick) => (tick >= commitTick ? X : before(tick));
}

export const PATTERNS: Record<string, (random: Random) => MaskAt> = {
  idle: () => holding(0),
  wandering,
  looping,
  "shield held": () => holding(UP | B),
  "cut held": () => holding(RIGHT | A),
  committing,
};

export interface Play {
  levelBytes: Uint8Array;
  journal: Uint8Array;
  endReason: EndReason | undefined;
}

export interface Start {
  levelBytes: Uint8Array;
  runNonce: Uint8Array;
  mode: number;
  levelIndex: number;
}

function assertSameBytes(label: string, tick: number, actual: Uint8Array, expected: Uint8Array): void {
  const same = actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
  if (!same) expect(hex(actual), `${label} at tick ${tick}`).toBe(hex(expected));
}

/** Plays `maskAt` on the loaded level of both engines until the level ends, and then a few ticks
 *  more, asserting after every tick that the state hash, the end and the snapshot agree. */
export function playBoth(wasm: Core, ts: Engine, { levelBytes, runNonce, mode, levelIndex }: Start, maskAt: MaskAt): Play {
  expect(ts.loadLevel(levelBytes)).toBe(wasm.loadLevel(levelBytes));
  wasm.start(runNonce, mode, levelIndex);
  ts.start(runNonce, mode, levelIndex);
  assertSameBytes("the state hash before any tick", -1, ts.stateHash(), wasm.stateHash());
  expect(ts.dirtyCells()).toEqual(wasm.dirtyCells());
  const timeLimit = wasm.snapshot().ticksLeft;
  let ended: number | undefined;
  for (let tick = 0; tick < timeLimit + 3; tick += 1) {
    const mask = maskAt(tick);
    const expected = wasm.tick(mask);
    const actual = ts.tick(mask);
    if (actual !== expected) expect(actual, `the end at tick ${tick}`).toBe(expected);
    assertSameBytes("the state hash", tick, ts.stateHash(), wasm.stateHash());
    const snapshot = ts.snapshot();
    if (JSON.stringify(snapshot) !== JSON.stringify(wasm.snapshot())) expect(snapshot, `the snapshot at tick ${tick}`).toEqual(wasm.snapshot());
    if (tick % 16 === 0) {
      assertSameBytes("the grid", tick, ts.grid(), wasm.grid());
      expect(ts.dirtyCells(), `the dirty cells at tick ${tick}`).toEqual(wasm.dirtyCells());
    }
    if (expected !== undefined) ended ??= tick;
    if (ended !== undefined && tick >= ended + 3) break;
  }
  assertSameBytes("the grid", -1, ts.grid(), wasm.grid());
  expect(ts.dirtyCells()).toEqual(wasm.dirtyCells());
  expect(ts.endReason()).toBe(wasm.endReason());
  assertSameBytes("the journal", -1, ts.journal(), wasm.journal());
  return { levelBytes, journal: wasm.journal(), endReason: wasm.endReason() };
}
