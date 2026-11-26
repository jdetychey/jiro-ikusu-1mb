// The page: Training on the 16 curated levels, and the daily Run on generated ones.

import { type Core, type EndReason } from "./core";
import { curatedLevels, loadEngine } from "./engine";
import { generateLevel } from "./generator";
import { combined, defaultBindings, HeldKeys, keyboardLayout, loadBindings } from "./input";
import type { Loop } from "./loop";
import { element, fitField, messageOf, percent, showHud } from "./page";
import { Renderer } from "./render";
import { dailySeed, encodeCode, isCleared, nonceFor, verifyCode, weightBp } from "./run";
import { startSession } from "./session";
import { browserStorage, load, save } from "./storage";
import { loadTouchSetting, mountTouchControls, saveTouchSetting, showTouchSetting, TOUCH_SETTINGS } from "./touch";

const BEST_KEY = "jiro-1mb.daily-best";

interface Best {
  seed: string;
  score: number;
  levelsCleared: number;
}

const isBest = (value: unknown): value is Best =>
  typeof value === "object" && value !== null && "seed" in value && "score" in value && "levelsCleared" in value;

type Play =
  | { kind: "training"; name: string; level: Uint8Array }
  | { kind: "run"; seed: string; depth: number; journals: Uint8Array[]; score: number };

async function main(): Promise<void> {
  const canvas = element<HTMLCanvasElement>("field");
  const storage = browserStorage();
  const core: Core = await loadEngine();
  const renderer = new Renderer(canvas);
  const layout = await keyboardLayout();
  const keys = new HeldKeys(loadBindings(storage, defaultBindings(layout)));
  const controls = combined(keys, mountTouchControls());
  const levels = curatedLevels();
  let loop: Loop<EndReason> | undefined;
  let play: Play | undefined;

  showTouchSetting(loadTouchSetting(storage));
  for (const setting of TOUCH_SETTINGS) {
    element(`touch-${setting}`).addEventListener("change", () => {
      showTouchSetting(setting);
      saveTouchSetting(storage, setting);
    });
  }
  const levelSelect = element<HTMLSelectElement>("level");
  levels.forEach(([name], i) => levelSelect.append(new Option(`${String(i + 1).padStart(2, "0")} ${name}`, String(i))));
  const seed = dailySeed(new Date());
  element("seed").textContent = seed;

  const showBest = () => {
    const best = load(storage, BEST_KEY, isBest, () => ({ seed: "", score: 0, levelsCleared: 0 }));
    element("best").textContent = best.seed === seed ? `Today's best: ${best.levelsCleared} levels, ${best.score} points` : "No Run yet today";
  };
  showBest();

  function begin(next: Play): void {
    play = next;
    const [level, nonce] =
      next.kind === "training"
        ? [next.level, crypto.getRandomValues(new Uint8Array(32))]
        : [generateLevel(core, next.seed, next.depth), nonceFor(core, next.seed, next.depth)];
    loop = startSession(core, level, nonce, controls, () => performance.now());
    element("end").hidden = true;
    element("run-label").textContent = next.kind === "run" ? `Level ${next.depth + 1}` : next.name;
    controls.clear();
    canvas.focus();
    requestAnimationFrame(frame);
  }

  function frame(): void {
    if (loop === undefined) return;
    const before = loop.ticksRun;
    const end = loop.pump();
    if (loop.ticksRun !== before) {
      renderer.drawCells(core.grid(), core.dirtyCells());
      const snapshot = core.snapshot();
      renderer.frame(snapshot);
      showHud(snapshot);
    }
    if (end === undefined) requestAnimationFrame(frame);
    else finish(end);
  }

  function finish(end: EndReason): void {
    loop = undefined;
    const { claimBp, targetBp } = core.snapshot();
    const journal = core.journal();
    const code = element<HTMLTextAreaElement>("code");
    code.hidden = true;
    element("end-title").textContent = end;
    element("end-detail").textContent = `Claim ${percent(claimBp)} of ${percent(targetBp)}.`;
    if (play?.kind === "run") {
      const run = play;
      run.journals.push(journal);
      const replayed = core.replay(generateLevel(core, run.seed, run.depth), journal, weightBp(run.depth));
      if ("code" in replayed) throw new Error(`the core rejects this Run's journal (code ${replayed.code})`);
      run.score += replayed.outcome.levelScore;
      const cleared = isCleared(end, claimBp, targetBp);
      element("end-detail").textContent += ` Run score ${run.score}.`;
      element<HTMLButtonElement>("next").hidden = !cleared;
      if (!cleared) {
        const levelsCleared = run.depth;
        const best = load(storage, BEST_KEY, isBest, () => ({ seed: "", score: 0, levelsCleared: 0 }));
        if (best.seed !== seed || run.score > best.score) save(storage, BEST_KEY, { seed, score: run.score, levelsCleared });
        showBest();
        code.value = encodeCode(run.seed, run.journals);
        code.hidden = false;
        element("end-title").textContent = `Run over: ${levelsCleared} levels`;
      }
    } else {
      element<HTMLButtonElement>("next").hidden = true;
    }
    element("end").hidden = false;
  }

  element("run").addEventListener("click", () => begin({ kind: "run", seed, depth: 0, journals: [], score: 0 }));
  element("train").addEventListener("click", () => {
    const [name, level] = levels[Number(levelSelect.value)] ?? levels[0] ?? ["", new Uint8Array()];
    begin({ kind: "training", name, level });
  });
  element("again").addEventListener("click", () => (play?.kind === "run" ? element("run").click() : element("train").click()));
  element("next").addEventListener("click", () => {
    if (play?.kind === "run") begin({ ...play, depth: play.depth + 1 });
  });
  element("verify").addEventListener("click", () => {
    const result = element("verify-result");
    try {
      const { seed: codeSeed, levelsCleared, score } = verifyCode(core, element<HTMLTextAreaElement>("verify-code").value);
      result.textContent = `Valid: ${codeSeed}, ${levelsCleared} levels cleared, ${score} points.`;
    } catch (error) {
      result.textContent = messageOf(error);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (loop !== undefined) event.preventDefault();
    keys.down(event.code);
  });
  window.addEventListener("keyup", (event) => keys.up(event.code));
  window.addEventListener("blur", () => keys.clear());
  fitField(renderer);
  window.addEventListener("resize", () => fitField(renderer));
}

main().catch((error: unknown) => {
  element("setup-error").textContent = messageOf(error);
});
