// Not a test: with DUMP_LEVELS_DIR set, writes the generated levels as NN-name.bin files that the
// main repository's `jiro-tools playtest` reads, 16 to a directory (depths 16 × batch ...), for
// the seeds in DUMP_SEEDS (comma separated) and the batches in DUMP_BATCHES (default 0).
import { mkdirSync, writeFileSync } from "node:fs";
import { beforeAll, it } from "vitest";
import type { Core } from "../src/core";
import { generateLevel } from "../src/generator";
import { loadCoreFromTarget } from "./engine";

const dir = process.env.DUMP_LEVELS_DIR;
let core: Core;
beforeAll(async () => {
  core = await loadCoreFromTarget();
});

it.skipIf(dir === undefined)("dumps generated levels", () => {
  const seeds = (process.env.DUMP_SEEDS ?? "2026-12-01").split(",");
  const batches = (process.env.DUMP_BATCHES ?? "0").split(",").map(Number);
  for (const seed of seeds) {
    for (const batch of batches) {
      const target = `${dir}/${seed}-b${batch}`;
      mkdirSync(target, { recursive: true });
      for (let i = 0; i < 16; i += 1) {
        const depth = 16 * batch + i;
        writeFileSync(`${target}/${String(i + 1).padStart(2, "0")}-d${depth}.bin`, generateLevel(core, seed, depth));
      }
    }
  }
});
