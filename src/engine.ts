// The engine and the 16 curated levels, embedded in the page by scripts/embed.mjs.

import { Core } from "./core";
import { ENGINE_BASE64, LEVELS_BASE64 } from "./generated";

export function bytesOfBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function loadEngine(): Promise<Core> {
  return Core.load(bytesOfBase64(ENGINE_BASE64));
}

/** The 16 curated levels by name, in index order. */
export function curatedLevels(): [string, Uint8Array][] {
  return LEVELS_BASE64.map(([name, base64]) => [name, bytesOfBase64(base64)]);
}
