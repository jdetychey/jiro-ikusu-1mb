// The look of a capture, a lost life and a cleared level: particles, a floating gain, a shake and
// a flash. They are drawn over the field and never touch the game, so they cannot change a result.

import type { Random } from "./rng";

const FIELD_CELLS = 60;
const PARTICLE_MS = 600;
const TEXT_MS = 900;
const SHAKE_MS = 260;
const FLASH_MS = 400;
const MAX_PARTICLES = 80;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
}

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private shakeLeft = 0;
  private shakeStrength = 0;
  private flashLeft = 0;

  /** `reducedMotion` keeps only the floating gain, for players who ask for less movement. */
  constructor(
    private readonly random: Random,
    private readonly reducedMotion: boolean,
  ) {}

  /** A capture of `gainBp` that changed `cells` (indices into the grid): sparks from them. */
  capture(cells: ArrayLike<number>, gainBp: number): void {
    if (cells.length === 0) return;
    const pick = () => cells[Math.floor(this.random() * cells.length)] as number;
    const spots = Array.from({ length: 12 }, pick).map((index) => ({ x: index % FIELD_CELLS, y: Math.floor(index / FIELD_CELLS) }));
    const center = { x: spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length, y: spots.reduce((sum, spot) => sum + spot.y, 0) / spots.length };
    this.texts.push({ text: `+${(gainBp / 100).toFixed(2)} %`, x: center.x, y: center.y, age: 0 });
    if (this.reducedMotion) return;
    const sparks = Math.min(MAX_PARTICLES - this.particles.length, 8 + Math.floor(gainBp / 25));
    for (let i = 0; i < sparks; i += 1) {
      const index = pick();
      const angle = this.random() * 2 * Math.PI;
      const speed = 8 + this.random() * 14;
      this.particles.push({ x: index % FIELD_CELLS, y: Math.floor(index / FIELD_CELLS), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0 });
    }
    if (gainBp >= 500) this.shake(2, SHAKE_MS);
  }

  /** A lost life. */
  hit(): void {
    this.shake(5, SHAKE_MS * 1.5);
  }

  /** A cleared level. */
  cleared(): void {
    if (!this.reducedMotion) this.flashLeft = FLASH_MS;
  }

  private shake(strength: number, ms: number): void {
    if (this.reducedMotion) return;
    this.shakeStrength = Math.max(this.shakeStrength * (this.shakeLeft > 0 ? 1 : 0), strength);
    this.shakeLeft = Math.max(this.shakeLeft, ms);
  }

  /** Advances every effect by `ms` milliseconds. */
  update(ms: number): void {
    this.particles = this.particles.filter((particle) => (particle.age += ms) < PARTICLE_MS);
    this.texts = this.texts.filter((text) => (text.age += ms) < TEXT_MS);
    this.shakeLeft = Math.max(0, this.shakeLeft - ms);
    this.flashLeft = Math.max(0, this.flashLeft - ms);
  }

  /** The canvas offset of the shake, in CSS pixels. */
  shakeOffset(): { x: number; y: number } {
    if (this.shakeLeft === 0) return { x: 0, y: 0 };
    return { x: Math.round((this.random() - 0.5) * 2 * this.shakeStrength), y: Math.round((this.random() - 0.5) * 2 * this.shakeStrength) };
  }

  get active(): boolean {
    return this.particles.length + this.texts.length > 0 || this.shakeLeft > 0 || this.flashLeft > 0;
  }

  draw(context: CanvasRenderingContext2D, cellPx: number): void {
    for (const { x, y, vx, vy, age } of this.particles) {
      const seconds = age / 1000;
      context.globalAlpha = 1 - age / PARTICLE_MS;
      context.fillStyle = "#ffffff";
      context.fillRect(Math.round((x + vx * seconds) * cellPx), Math.round((y + vy * seconds) * cellPx), cellPx, cellPx);
    }
    context.globalAlpha = 1;
    context.font = `${Math.round(cellPx * 2.5)}px "Jiro Pixel 12", monospace`;
    context.textAlign = "center";
    for (const { text, x, y, age } of this.texts) {
      context.globalAlpha = 1 - age / TEXT_MS;
      context.fillStyle = "#ffffff";
      context.fillText(text, x * cellPx, (y - (age / 1000) * 6) * cellPx);
    }
    if (this.flashLeft > 0) {
      context.globalAlpha = 0.6 * (this.flashLeft / FLASH_MS);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, FIELD_CELLS * cellPx, FIELD_CELLS * cellPx);
    }
    context.globalAlpha = 1;
  }
}
