// The attract mode: behind the title, the first level plays itself from a short script, so a
// visitor sees the game before pressing anything. The script is input only; the core plays it.

import { CONTROL_BITS, type InputSource } from "./input";

const { up, down, left, right, a } = CONTROL_BITS;

/** [controls held, ticks held]: two big cuts out of the bottom edge, one each side of the start. */
export const DEMO_STEPS: readonly [mask: number, ticks: number][] = [
  [0, 6],
  [up | a, 15],
  [left | a, 14],
  [down | a, 15],
  [right, 30],
  [up | a, 15],
  [right | a, 12],
  [down | a, 15],
  [0, 40],
];

/** A nonce found by searching, for which the script claims a good part of the field and survives. */
export const DEMO_NONCE = Uint8Array.from({ length: 32 }, (_, i) => (i < 2 ? 0 : (i * 37 + 11) & 0xff));
export const DEMO_LEVEL_INDEX = 0;

/** A source that holds the script's controls tick by tick, then nothing. */
export function demoSource(): InputSource {
  const masks = DEMO_STEPS.flatMap(([mask, ticks]) => Array.from({ length: ticks }, () => mask));
  let tick = 0;
  return {
    sample: () => masks[tick++] ?? 0,
    clear: () => undefined,
  };
}
