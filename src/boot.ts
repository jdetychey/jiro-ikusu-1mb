// Starting the engine. WebAssembly may be missing or refused by the host's content policy, in
// which case the page says so, instead of showing nothing.

import type { Core } from "./core";
import { loadEngine } from "./engine";

export type EngineName = "wasm";

export interface Booted {
  core: Core;
  name: EngineName;
}

export async function bootEngine(): Promise<Booted> {
  if (typeof WebAssembly !== "object") throw new Error("This browser has no WebAssembly, which the game engine needs.");
  try {
    return { core: await loadEngine(), name: "wasm" };
  } catch (cause) {
    throw new Error(`The game engine could not start: ${cause instanceof Error ? cause.message : String(cause)}. A browser or host setting may be blocking WebAssembly.`, { cause });
  }
}
