// The page: Training on the 16 curated levels, and the daily Run on generated ones. It starts a
// level behind a short card, plays it on the tick clock, pauses when the page is hidden, and ends
// it with a result, a code to share and the player's stats.

import { bootEngine, type EngineName } from "./boot";
import { createPausableClock, type PausableClock } from "./clock";
import type { EndReason, Snapshot } from "./core";
import { Effects } from "./effects";
import { curatedLevels } from "./engine";
import { generateLevel, knobsAt } from "./generator";
import { hintFor, NO_PROGRESS, type Progress, progressAt } from "./hints";
import { combined, CONTROLS, defaultBindings, HeldKeys, keyboardLayout, loadBindings } from "./input";
import { codesOf, rank } from "./leaderboard";
import { createLoop, type Loop } from "./loop";
import { element, fitField, messageOf, percent, showHud } from "./page";
import { Renderer } from "./render";
import { startReplay } from "./replay";
import { dailySeed, decodeCode, encodeCode, isCleared, nonceFor, verifyCode, weightBp } from "./run";
import { codeInFragment, shareLink, shareText } from "./share";
import { cueOfEnd, cuesBetween, Sound } from "./sound";
import { startSession } from "./session";
import { bestDepth, loadStats, saveStats, streak, withRun } from "./stats";
import { browserStorage, load, save } from "./storage";
import { loadTouchSetting, mountTouchControls, saveTouchSetting, showTouchSetting, TOUCH_SETTINGS } from "./touch";

const MUTE_KEY = "jiro-1mb.muted";
const TUTORIAL_KEY = "jiro-1mb.tutorial-done";
const INTRO_MS = 1200;
const BLINK_MS = 120;

type Play =
  | { kind: "training"; index: number; name: string; level: Uint8Array }
  | { kind: "run"; seed: string; depth: number; journals: Uint8Array[]; score: number };

type Mode = "menu" | "intro" | "playing" | "replaying" | "paused" | "ended";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

async function main(): Promise<void> {
  const canvas = element<HTMLCanvasElement>("field");
  const storage = browserStorage();
  if (storage === undefined) element("storage-note").hidden = false;
  const { core, name: engineName } = await bootEngine();
  element("engine").textContent = engineName satisfies EngineName;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new Renderer(canvas);
  const effects = new Effects(Math.random, reducedMotion);
  const bindings = loadBindings(storage, defaultBindings(await keyboardLayout()));
  const keys = new HeldKeys(bindings);
  const controls = combined(keys, mountTouchControls());
  const sound = new Sound(load(storage, MUTE_KEY, isBoolean, () => false));
  const levels = curatedLevels();

  let mode: Mode = "menu";
  let loop: Loop<EndReason> | undefined;
  let clock: PausableClock = createPausableClock(() => performance.now());
  let play: Play | undefined;
  let onEnd: (end: EndReason) => void = () => undefined;
  let previous: Snapshot | undefined;
  let progress: Progress = NO_PROGRESS;
  let teaching = false;
  let frameId: number | undefined;
  let introTimer: ReturnType<typeof setTimeout> | undefined;
  let replayTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFrame = 0;
  let stats = loadStats(storage);
  let lastCode = "";

  const announce = (text: string) => void (element("announce").textContent = text);
  const show = (id: string, visible: boolean) => void (element(id).hidden = !visible);
  const today = () => dailySeed(new Date());

  function showError(error: unknown): void {
    stopEverything();
    element("error").textContent = messageOf(error);
    show("error", true);
    console.error(error);
  }

  function stopEverything(): void {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    frameId = undefined;
    clearTimeout(introTimer);
    clearTimeout(replayTimer);
    loop = undefined;
  }

  function setMode(next: Mode): void {
    mode = next;
    document.body.classList.toggle("playing", next === "playing" || next === "replaying" || next === "paused");
  }

  function schedule(): void {
    frameId ??= requestAnimationFrame(frame);
  }

  function showStats(): void {
    const day = today();
    const todays = stats[day];
    show("title", mode === "menu");
    element("today").textContent = todays === undefined ? `Daily seed ${day}` : `Daily seed ${day}: best ${todays.levelsCleared} levels, ${todays.score.toLocaleString("en-US")} points`;
    const days = streak(stats, day);
    element("stats").textContent = `Streak ${days} ${days === 1 ? "day" : "days"} · best depth ${bestDepth(stats)}`;
  }

  function showMenu(): void {
    stopEverything();
    setMode("menu");
    for (const id of ["card", "pause", "end", "hint"]) show(id, false);
    showStats();
  }

  function begin(next: Play): void {
    stopEverything();
    setMode("intro");
    play = next;
    sound.unlock();
    for (const id of ["title", "end", "pause"]) show(id, false);
    const knobs = next.kind === "run" ? knobsAt(next.depth) : undefined;
    element("card-title").textContent = next.kind === "run" ? `Level ${next.depth + 1}` : next.name;
    element("card-detail").textContent =
      knobs === undefined ? "Claim the target, then bank it." : `Claim ${knobs.targetBp / 100} % · ${knobs.lives} lives${knobs.minionCount > 0 ? ` · ${knobs.minionCount} minions` : ""}`;
    show("card", true);
    renderer.show([]);
    introTimer = setTimeout(startLevel, INTRO_MS);
  }

  function startLevel(): void {
    try {
      const next = play;
      if (next === undefined) return;
      const [level, nonce] =
        next.kind === "training"
          ? [next.level, crypto.getRandomValues(new Uint8Array(32))]
          : [generateLevel(core, next.seed, next.depth), nonceFor(core, next.seed, next.depth)];
      clock = createPausableClock(() => performance.now());
      loop = startSession(core, level, nonce, controls, clock.now);
      onEnd = finish;
      beginPlayback("playing", next.kind === "run" ? `Level ${next.depth + 1}` : next.name);
      teaching = next.kind === "training" && next.index === 0 && !load(storage, TUTORIAL_KEY, isBoolean, () => false);
      show("hint", teaching);
      progress = NO_PROGRESS;
    } catch (error) {
      showError(error);
    }
  }

  function beginPlayback(next: Mode, label: string): void {
    setMode(next);
    show("card", false);
    element("run-label").textContent = label;
    controls.clear();
    previous = undefined;
    renderer.redraw(core.grid());
    canvas.focus({ preventScroll: true });
    canvas.parentElement?.scrollIntoView({ block: "start", behavior: "instant" });
    lastFrame = performance.now();
    schedule();
  }

  function frame(now: number): void {
    frameId = undefined;
    try {
      effects.update(now - lastFrame);
      lastFrame = now;
      const ended = loop !== undefined && (mode === "playing" || mode === "replaying") ? advance(now) : undefined;
      if (loop === undefined) renderer.show([]);
      const offset = effects.shakeOffset();
      canvas.style.transform = offset.x === 0 && offset.y === 0 ? "" : `translate(${offset.x}px, ${offset.y}px)`;
      if (ended !== undefined) {
        sound.play(cueOfEnd(ended, core.snapshot().claimBp, core.snapshot().targetBp));
        onEnd(ended);
      }
      if ((mode === "playing" || mode === "replaying") && loop !== undefined) schedule();
      else if (effects.active) schedule();
    } catch (error) {
      showError(error);
    }
  }

  /** Runs the ticks that are due, draws the field and returns how the level ended, if it did. */
  function advance(now: number): EndReason | undefined {
    const active = loop;
    if (active === undefined) return undefined;
    const before = active.ticksRun;
    const end = active.pump();
    const changed = active.ticksRun !== before;
    const dirty = changed ? core.dirtyCells() : new Uint16Array();
    if (changed) renderer.drawCells(core.grid(), dirty);
    const snapshot = changed ? core.snapshot() : previous;
    if (snapshot === undefined) return end;
    if (changed) {
      if (previous !== undefined) react(previous, snapshot, dirty);
      previous = snapshot;
      showHud(snapshot, play?.kind === "run" ? play.score : undefined);
      if (teaching) teach(snapshot);
    }
    renderer.frame(snapshot, effects, Math.floor(now / BLINK_MS) % 2 === 0);
    return end;
  }

  function react(before: Snapshot, after: Snapshot, dirty: Uint16Array): void {
    for (const cue of cuesBetween(before, after)) sound.play(cue);
    if (after.claimBp > before.claimBp) {
      effects.capture(dirty, after.claimBp - before.claimBp);
      announce(`Captured ${percent(after.claimBp - before.claimBp)}. Claim ${percent(after.claimBp)}.`);
    }
    if (after.lives < before.lives) {
      effects.hit();
      announce(`Life lost. ${after.lives} left.`);
    }
  }

  function teach(snapshot: Snapshot): void {
    progress = progressAt(progress, snapshot);
    element("hint").textContent = hintFor(progress, snapshot.targetBp);
  }

  function finish(end: EndReason): void {
    loop = undefined;
    setMode("ended");
    show("hint", false);
    const { claimBp, targetBp } = core.snapshot();
    const journal = core.journal();
    const cleared = isCleared(end, claimBp, targetBp);
    if (cleared) effects.cleared();
    if (cleared && teaching) save(storage, TUTORIAL_KEY, true);
    for (const id of ["next", "watch-run", "copy-result", "copy-link", "copy-code"]) show(id, false);
    show("code", false);
    element("end-title").textContent = cleared ? "Cleared" : end;
    element("end-detail").textContent = `Claim ${percent(claimBp)} of ${percent(targetBp)}.`;
    if (play?.kind === "run") finishRunLevel(play, journal, cleared, end);
    announce(`${element("end-title").textContent}. ${element("end-detail").textContent}`);
    show("end", true);
    element(cleared ? "next" : "again").focus({ preventScroll: true });
    schedule();
  }

  function finishRunLevel(run: Extract<Play, { kind: "run" }>, journal: Uint8Array, cleared: boolean, end: EndReason): void {
    run.journals.push(journal);
    const replayed = core.replay(generateLevel(core, run.seed, run.depth), journal, weightBp(run.depth));
    if ("code" in replayed) throw new Error(`the core rejects this Run's journal (code ${replayed.code})`);
    run.score += replayed.outcome.levelScore;
    showHud(core.snapshot(), run.score);
    element("end-detail").textContent += ` Run score ${run.score.toLocaleString("en-US")}.`;
    if (cleared) {
      element("end-title").textContent = `Level ${run.depth + 1} cleared`;
      show("next", true);
      return;
    }
    const result = { seed: run.seed, levelsCleared: run.depth, score: run.score };
    stats = withRun(stats, run.seed, { score: run.score, levelsCleared: run.depth });
    saveStats(storage, stats);
    lastCode = encodeCode(run.seed, run.journals);
    const code = element<HTMLTextAreaElement>("code");
    code.value = lastCode;
    for (const id of ["code", "watch-run", "copy-result", "copy-link", "copy-code"]) show(id, true);
    element("copy-result").dataset.text = shareText(result);
    element("end-title").textContent = end === "Committed" ? `Banked: ${run.depth} levels` : `Run over: ${run.depth} levels`;
  }

  /** Plays the levels of a verified Run code, one after another, at `speed` times real time. */
  function watch(code: string, speed: number): void {
    const { seed: codeSeed, journals } = decodeCode(code);
    stopEverything();
    for (const id of ["title", "end", "card", "pause", "hint"]) show(id, false);
    const playLevel = (depth: number): void => {
      const journal = journals[depth];
      if (journal === undefined) {
        element("run-label").textContent = `Replay done: ${journals.length} levels`;
        setMode("menu");
        showStats();
        return;
      }
      const replay = startReplay(core, generateLevel(core, codeSeed, depth), nonceFor(core, codeSeed, depth), journal);
      clock = createPausableClock(() => performance.now(), speed);
      loop = createLoop({ now: clock.now, sample: () => 0, tick: () => replay.step() });
      onEnd = () => {
        loop = undefined;
        replayTimer = setTimeout(() => playLevel(depth + 1), 1000);
      };
      beginPlayback("replaying", `Replay: level ${depth + 1} of ${journals.length}`);
    };
    play = undefined;
    playLevel(0);
  }

  function pause(): void {
    if (mode !== "playing" && mode !== "replaying") return;
    clock.pause();
    keys.clear();
    controls.clear();
    setMode("paused");
    show("pause", true);
  }

  function resume(): void {
    if (mode !== "paused") return;
    clock.resume();
    show("pause", false);
    setMode(play === undefined ? "replaying" : "playing");
    lastFrame = performance.now();
    canvas.focus({ preventScroll: true });
    schedule();
  }

  function verifyAndShow(code: string): void {
    const result = element("verify-result");
    try {
      const { seed, levelsCleared, score } = verifyCode(core, code, today());
      result.textContent = `Valid: ${seed}, ${levelsCleared} levels cleared, ${score.toLocaleString("en-US")} points.`;
      show("watch", true);
    } catch (error) {
      show("watch", false);
      result.textContent = messageOf(error);
    }
  }

  async function copy(text: string, button: HTMLElement): Promise<void> {
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      element<HTMLTextAreaElement>("code").select();
      button.textContent = "Select and copy";
    }
    setTimeout(() => void (button.textContent = label), 1500);
  }

  const speed = () => Number(element<HTMLSelectElement>("speed").value);
  const verifyBox = () => element<HTMLTextAreaElement>("verify-code");

  levels.forEach(([name], i) => element<HTMLSelectElement>("level").append(new Option(`${String(i + 1).padStart(2, "0")} ${name}`, String(i))));
  showTouchSetting(loadTouchSetting(storage));
  for (const setting of TOUCH_SETTINGS) {
    element(`touch-${setting}`).addEventListener("change", () => {
      showTouchSetting(setting);
      saveTouchSetting(storage, setting);
    });
  }
  const muteBox = element<HTMLInputElement>("mute");
  muteBox.checked = sound.muted;
  muteBox.addEventListener("change", () => {
    sound.muted = muteBox.checked;
    save(storage, MUTE_KEY, sound.muted);
  });

  element("run").addEventListener("click", () => begin({ kind: "run", seed: today(), depth: 0, journals: [], score: 0 }));
  element("train").addEventListener("click", () => {
    const index = Number(element<HTMLSelectElement>("level").value);
    const [name, level] = levels[index] ?? levels[0] ?? ["", new Uint8Array()];
    begin({ kind: "training", index, name, level });
  });
  element("again").addEventListener("click", () => {
    if (play?.kind === "run") begin({ kind: "run", seed: today(), depth: 0, journals: [], score: 0 });
    else if (play !== undefined) begin(play);
  });
  element("next").addEventListener("click", () => {
    if (play?.kind === "run") begin({ ...play, depth: play.depth + 1 });
  });
  element("menu").addEventListener("click", showMenu);
  element("copy-code").addEventListener("click", (event) => void copy(lastCode, event.currentTarget as HTMLElement));
  element("copy-link").addEventListener("click", (event) => void copy(shareLink(location.href, lastCode), event.currentTarget as HTMLElement));
  element("copy-result").addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLElement;
    void copy(`${button.dataset.text ?? ""}\n${shareLink(location.href, lastCode)}`, button);
  });
  element("verify").addEventListener("click", () => verifyAndShow(verifyBox().value));
  element("watch").addEventListener("click", () => {
    try {
      watch(verifyBox().value, speed());
    } catch (error) {
      element("verify-result").textContent = messageOf(error);
    }
  });
  element("watch-run").addEventListener("click", () => {
    verifyBox().value = lastCode;
    watch(lastCode, speed());
  });
  element("rank").addEventListener("click", () => {
    const board = element("board");
    board.replaceChildren(
      ...rank(core, codesOf(element<HTMLTextAreaElement>("board-codes").value), today()).map((entry) => {
        const item = document.createElement("li");
        item.textContent = entry.valid ? `${entry.score.toLocaleString("en-US")} points, ${entry.levelsCleared} levels (${entry.seed})` : `${entry.code}: ${entry.error}`;
        item.classList.toggle("bad", !entry.valid);
        return item;
      }),
    );
  });

  const isGameKey = (code: string) => CONTROLS.some((control) => bindings[control] === code);
  window.addEventListener("keydown", (event) => {
    sound.unlock();
    if (mode === "paused") {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key !== "Tab") {
        event.preventDefault();
        resume();
      }
      return;
    }
    if ((mode === "playing" || mode === "replaying") && (event.code === "KeyP" || event.code === "Escape")) {
      event.preventDefault();
      pause();
      return;
    }
    if (mode === "playing" && isGameKey(event.code)) event.preventDefault();
    keys.down(event.code);
  });
  window.addEventListener("keyup", (event) => keys.up(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    pause();
  });
  window.addEventListener("pagehide", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  element("pause").addEventListener("pointerdown", resume);
  canvas.addEventListener("pointerdown", () => sound.unlock());

  const fit = () => {
    if (fitField(renderer)) renderer.redraw(core.grid());
    if (loop === undefined) renderer.show([]);
  };
  fit();
  window.addEventListener("resize", fit);
  showStats();

  const shared = codeInFragment(location.hash);
  if (shared !== undefined) {
    verifyBox().value = shared;
    element<HTMLDetailsElement>("verify-code").closest("details")?.setAttribute("open", "");
    verifyAndShow(shared);
  }
}

main().catch((error: unknown) => {
  element("error").textContent = messageOf(error);
  element("error").hidden = false;
  console.error(error);
});
