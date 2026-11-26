import { describe, expect, it } from "vitest";
import { createPausableClock } from "../src/clock";
import { createLoop, MAX_TICKS_PER_PUMP } from "../src/loop";

describe("createPausableClock", () => {
  it("follows its source while running", () => {
    let time = 100;
    expect(createPausableClock(() => time).now()).toBe(100);
    time = 250;
    expect(createPausableClock(() => time).now()).toBe(250);
  });

  it("stands still while paused", () => {
    let time = 0;
    const clock = createPausableClock(() => time);
    time = 100;
    clock.pause();
    time = 5_000;
    expect(clock.now()).toBe(100);
  });

  it("leaves out the time spent paused once resumed", () => {
    let time = 0;
    const clock = createPausableClock(() => time);
    time = 100;
    clock.pause();
    time = 5_000;
    clock.resume();
    time = 5_050;
    expect(clock.now()).toBe(150);
  });

  it("scales by its speed", () => {
    expect(createPausableClock(() => 100, 4).now()).toBe(400);
  });

  it("ignores a second pause", () => {
    let time = 0;
    const clock = createPausableClock(() => time);
    clock.pause();
    time = 50;
    clock.pause();
    time = 80;
    clock.resume();
    expect(clock.now()).toBe(0);
  });
});

describe("createLoop", () => {
  it("runs at most MAX_TICKS_PER_PUMP ticks per pump, and none are skipped", () => {
    let time = 0;
    const ticked: number[] = [];
    const loop = createLoop({ now: () => time, sample: () => 0, tick: () => void ticked.push(ticked.length) });
    time = 10_000;
    loop.pump();
    expect(ticked.length).toBe(MAX_TICKS_PER_PUMP);
    loop.pump();
    expect(ticked).toEqual(Array.from({ length: 2 * MAX_TICKS_PER_PUMP }, (_, i) => i));
  });
});
