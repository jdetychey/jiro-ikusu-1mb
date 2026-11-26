import { beforeAll, describe, expect, it } from "vitest";
import type { Engine } from "../src/engine-api";
import { curatedLevels } from "../src/engine";
import { DEMO_LEVEL_INDEX, DEMO_NONCE, demoSource } from "../src/demo";
import { TsCore } from "../src/tscore";
import { loadCoreFromTarget } from "./engine";

const ENGINES: [string, () => Promise<Engine>][] = [["wasm", loadCoreFromTarget], ["ts", () => TsCore.load()]];

describe.each(ENGINES)("the attract mode on the %s engine", (_, load) => {
  let core: Engine;
  beforeAll(async () => {
    core = await load();
  });

  function play(): { claimBp: number; lives: number } {
    const source = demoSource();
    core.loadLevel(curatedLevels()[DEMO_LEVEL_INDEX]![1]);
    core.start(DEMO_NONCE, 0, 0);
    for (let tick = 0; tick < 200; tick += 1) if (core.tick(source.sample()) !== undefined) break;
    const { claimBp, lives } = core.snapshot();
    return { claimBp, lives };
  }

  it("claims a good part of the field", () => {
    expect(play().claimBp).toBeGreaterThan(2000);
  });

  it("loses at most one life", () => {
    expect(play().lives).toBeGreaterThanOrEqual(4);
  });
});
