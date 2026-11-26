// What the page shares: elements by id, the field's size, the HUD and percent formatting.

import type { Snapshot } from "./core";
import type { Renderer } from "./render";

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} is missing from the page`);
  return found as T;
}

/** Sizes the field to the screen less the page's padding and, above the field, whatever the
 *  layout puts there: the cell size is the largest whole number of pixels that fits. Returns
 *  whether the size changed. */
export function fitField(renderer: Renderer): boolean {
  const compact = window.innerWidth < 512;
  const chrome = compact ? 220 : 120;
  return renderer.fit(Math.min(window.innerWidth - (compact ? 16 : 32), 960), window.innerHeight - chrome);
}

export function showHud({ claimBp, targetBp, lives, shield, ticksLeft }: Snapshot, score: number | undefined): void {
  element("hud-score").textContent = score === undefined ? "–" : String(score);
  element("hud-claim").textContent = `${percent(claimBp)} of ${percent(targetBp)}`;
  element("hud-lives").textContent = String(lives);
  element("hud-shield").textContent = String(shield);
  element("hud-time").textContent = `${Math.ceil(ticksLeft / 15)} s`;
}

export function percent(bp: number): string {
  return `${(bp / 100).toFixed(2)} %`;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
