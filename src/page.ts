// What the page shares: elements by id, the field's size, the HUD and percent formatting.

import type { Snapshot } from "./core";
import type { Renderer } from "./render";

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} is missing from the page`);
  return found as T;
}

/** Sizes the field to the largest integer scale that fits the window, less the page's padding
 *  and header. */
export function fitField(renderer: Renderer): void {
  renderer.fit(Math.min(window.innerWidth - 32, 960), window.innerHeight - 160);
}

export function showHud({ claimBp, targetBp, lives, shield, ticksLeft }: Snapshot): void {
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
