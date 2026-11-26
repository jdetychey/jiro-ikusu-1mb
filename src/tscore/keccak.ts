// keccak256 as Solidity computes it (original Keccak padding, not FIPS-202 SHA-3), on 64-bit
// lanes held as two u32 halves: low at 2i, high at 2i + 1.

const RATE = 136;
const ROUNDS = 24;

/** The 24 round constants as high and low halves. */
const ROUND_CONSTANTS = Int32Array.from([
  0x00000000, 0x00000001, 0x00000000, 0x00008082, 0x80000000, 0x0000808a, 0x80000000, 0x80008000,
  0x00000000, 0x0000808b, 0x00000000, 0x80000001, 0x80000000, 0x80008081, 0x80000000, 0x00008009,
  0x00000000, 0x0000008a, 0x00000000, 0x00000088, 0x00000000, 0x80008009, 0x00000000, 0x8000000a,
  0x00000000, 0x8000808b, 0x80000000, 0x0000008b, 0x80000000, 0x00008089, 0x80000000, 0x00008003,
  0x80000000, 0x00008002, 0x80000000, 0x00000080, 0x00000000, 0x0000800a, 0x80000000, 0x8000000a,
  0x80000000, 0x80008081, 0x80000000, 0x00008080, 0x00000000, 0x80000001, 0x80000000, 0x80008008,
]);
const ROTATIONS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
const LANE_ORDER = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

function xor(lanes: Int32Array, index: number, value: number): void {
  lanes[index] = (lanes[index] ?? 0) ^ value;
}

const columnLow = new Int32Array(5);
const columnHigh = new Int32Array(5);

function permute(state: Int32Array): void {
  for (let round = 0; round < ROUNDS; round += 1) {
    for (let x = 0; x < 5; x += 1) {
      columnLow[x] = (state[2 * x] ?? 0) ^ (state[2 * (x + 5)] ?? 0) ^ (state[2 * (x + 10)] ?? 0) ^ (state[2 * (x + 15)] ?? 0) ^ (state[2 * (x + 20)] ?? 0);
      columnHigh[x] = (state[2 * x + 1] ?? 0) ^ (state[2 * (x + 5) + 1] ?? 0) ^ (state[2 * (x + 10) + 1] ?? 0) ^ (state[2 * (x + 15) + 1] ?? 0) ^ (state[2 * (x + 20) + 1] ?? 0);
    }
    for (let x = 0; x < 5; x += 1) {
      const before = (x + 4) % 5;
      const after = (x + 1) % 5;
      const afterLow = columnLow[after] ?? 0;
      const afterHigh = columnHigh[after] ?? 0;
      const mixLow = (columnLow[before] ?? 0) ^ ((afterLow << 1) | (afterHigh >>> 31));
      const mixHigh = (columnHigh[before] ?? 0) ^ ((afterHigh << 1) | (afterLow >>> 31));
      for (let row = 0; row < 25; row += 5) {
        xor(state, 2 * (row + x), mixLow);
        xor(state, 2 * (row + x) + 1, mixHigh);
      }
    }
    let carryLow = state[2] ?? 0;
    let carryHigh = state[3] ?? 0;
    for (let i = 0; i < 24; i += 1) {
      const lane = LANE_ORDER[i] ?? 0;
      const turn = ROTATIONS[i] ?? 0;
      const low = state[2 * lane] ?? 0;
      const high = state[2 * lane + 1] ?? 0;
      if (turn < 32) {
        state[2 * lane] = (carryLow << turn) | (carryHigh >>> (32 - turn));
        state[2 * lane + 1] = (carryHigh << turn) | (carryLow >>> (32 - turn));
      } else {
        const rest = turn - 32;
        state[2 * lane] = (carryHigh << rest) | (carryLow >>> (32 - rest));
        state[2 * lane + 1] = (carryLow << rest) | (carryHigh >>> (32 - rest));
      }
      carryLow = low;
      carryHigh = high;
    }
    for (let row = 0; row < 25; row += 5) {
      for (let x = 0; x < 5; x += 1) {
        columnLow[x] = state[2 * (row + x)] ?? 0;
        columnHigh[x] = state[2 * (row + x) + 1] ?? 0;
      }
      for (let x = 0; x < 5; x += 1) {
        const next = (x + 1) % 5;
        const afterNext = (x + 2) % 5;
        xor(state, 2 * (row + x), ~(columnLow[next] ?? 0) & (columnLow[afterNext] ?? 0));
        xor(state, 2 * (row + x) + 1, ~(columnHigh[next] ?? 0) & (columnHigh[afterNext] ?? 0));
      }
    }
    xor(state, 0, ROUND_CONSTANTS[2 * round + 1] ?? 0);
    xor(state, 1, ROUND_CONSTANTS[2 * round] ?? 0);
  }
}

/** keccak256 of the concatenated parts, as `keccak256(abi.encodePacked(...))` computes it for
 *  byte inputs (README §6.4). */
export function keccak256(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const padded = new Uint8Array((Math.floor(length / RATE) + 1) * RATE);
  let at = 0;
  for (const part of parts) {
    padded.set(part, at);
    at += part.length;
  }
  padded[length] = 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) ^ 0x80;

  const state = new Int32Array(50);
  for (let block = 0; block < padded.length; block += RATE) {
    for (let lane = 0; lane < RATE / 8; lane += 1) {
      const offset = block + 8 * lane;
      xor(state, 2 * lane, (padded[offset] ?? 0) | ((padded[offset + 1] ?? 0) << 8) | ((padded[offset + 2] ?? 0) << 16) | ((padded[offset + 3] ?? 0) << 24));
      xor(state, 2 * lane + 1, (padded[offset + 4] ?? 0) | ((padded[offset + 5] ?? 0) << 8) | ((padded[offset + 6] ?? 0) << 16) | ((padded[offset + 7] ?? 0) << 24));
    }
    permute(state);
  }
  return new Uint8Array(state.buffer.slice(0, 32));
}
