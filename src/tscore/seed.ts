// Derivations from the run nonce (README §6.4, §8.2). keccak256 runs once per level and once per
// draw step, never per tick.

import { RUN_LEVELS } from "../core";
import { floorDiv, readU32 } from "./int";
import { keccak256 } from "./keccak";
import { SEASON_LEVELS } from "./consts";
import type { Level } from "./level";

const textEncoder = new TextEncoder();

/** The boss's top-left cell and diagonal direction at level start (R4.6-5). */
export interface BossStart {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** keccak256("jiro.level" ‖ runNonce ‖ levelIndex), packed as `abi.encodePacked` does. */
export function levelSeed(runNonce: Uint8Array, levelIndex: number): Uint8Array<ArrayBuffer> {
  return keccak256(textEncoder.encode("jiro.level"), runNonce, Uint8Array.of(levelIndex));
}

/** The candidate whose row-major index in the spawn rectangle is the big-endian u32 of seed
 *  bytes 0 to 3 modulo the number of candidates; vx = +1 if bit 0 of seed byte 4 is set, and
 *  vy = +1 if bit 1 is. */
export function bossStart({ spawn }: Level, seed: Uint8Array): BossStart {
  const width = spawn.x1 - spawn.x0 + 1;
  const height = spawn.y1 - spawn.y0 + 1;
  const index = readU32(seed, 0) % (width * height);
  const flags = seed[4] ?? 0;
  return {
    x: spawn.x0 + (index % width),
    y: spawn.y0 + floorDiv(index, width),
    vx: flags & 1 ? 1 : -1,
    vy: flags & 2 ? 1 : -1,
  };
}

/** The key of the boss's deflections: the big-endian u32 of seed bytes 5 to 8 (R4.6-7). */
export function deflectionKey(seed: Uint8Array): number {
  return readU32(seed, 5);
}

/** The run's draw slots: a forward partial Fisher–Yates shuffle of the 16 season levels, where
 *  step i swaps deck[i] with deck[i + h mod (16 − i)] and h is keccak256("jiro.draw" ‖ runNonce
 *  ‖ i) read as a big-endian integer (README §8.2). */
export function draw(runNonce: Uint8Array): number[] {
  const deck = Array.from({ length: SEASON_LEVELS }, (_, slot) => slot);
  for (let step = 0; step < RUN_LEVELS; step += 1) {
    const modulus = SEASON_LEVELS - step;
    const hash = keccak256(textEncoder.encode("jiro.draw"), runNonce, Uint8Array.of(step));
    const offset = hash.reduce((rest, byte) => ((rest << 8) | byte) % modulus, 0);
    const swapped = deck[step + offset] ?? 0;
    deck[step + offset] = deck[step] ?? 0;
    deck[step] = swapped;
  }
  return deck.slice(0, RUN_LEVELS);
}
