import { readFileSync } from "node:fs";
import { Core } from "../src/core";

export function loadCoreFromTarget(): Promise<Core> {
  return Core.load(readFileSync("target/wasm32-unknown-unknown/release/jiro_wasm.wasm"));
}
