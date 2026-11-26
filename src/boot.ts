// Starting the engine: the wasm build, or its TypeScript port when WebAssembly is missing or
// refused by the host's content policy. `?engine=ts` asks for the port, for testing it.

import type { Engine } from "./engine-api";
import { loadEngine } from "./engine";
import { TsCore } from "./tscore";

export type EngineName = "wasm" | "ts";

export interface Booted {
  core: Engine;
  name: EngineName;
  /** Another engine of the same kind, for a second game at once (the ghost). */
  spawn: () => Promise<Engine>;
}

export async function bootEngine(search: string): Promise<Booted> {
  const wantsPort = new URLSearchParams(search).get("engine") === "ts";
  if (!wantsPort && typeof WebAssembly === "object") {
    try {
      return { core: await loadEngine(), name: "wasm", spawn: loadEngine };
    } catch (error) {
      console.warn("WebAssembly could not start, so the game runs on its TypeScript engine", error);
    }
  }
  return { core: await TsCore.load(), name: "ts", spawn: () => TsCore.load() };
}
