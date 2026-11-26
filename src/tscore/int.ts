/** floor(dividend / divisor) for non-negative integers below 2^31, where the double quotient is
 *  exact enough that it never rounds up to the next integer. */
export function floorDiv(dividend: number, divisor: number): number {
  return Math.floor(dividend / divisor);
}

export function readU16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

export function readU32(bytes: Uint8Array, at: number): number {
  return (((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)) >>> 0;
}

export function writeU16(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value >> 8;
  bytes[at + 1] = value & 0xff;
}
