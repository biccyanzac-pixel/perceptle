// Seeded randomness. Integer-only (FNV-1a + mulberry32), so every engine produces the same stream.
import { cos, exp, log, sin, TAU } from './dmath.js';

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  /** uniform in [a, b) */
  range(a, b) { return a + (b - a) * this.next(); }
  /** integer in [a, b] inclusive */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** log-uniform in [a, b): equal chance of 30-60 as of 200-400 */
  logUniform(a, b) {
    const la = log(a), lb = log(b);
    return a * exp(this.next() * (lb - la));
  }
  /** standard normal (Box-Muller, deterministic maths) */
  normal() {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * log(u)) * cos(TAU * v);
  }
  /** unit vector at a uniform random angle */
  direction() {
    const t = this.next() * TAU;
    return [cos(t), sin(t)];
  }
}


/** A stream for one named purpose, e.g. rngFor('perceptle', '2026-10-10', 2, 'angle'). */
export function rngFor(...parts) {
  return new Rng(hashString(parts.join(':')));
}

/** A random (unseeded) seed, for practice and calibration. */
export function freshSeed() {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return (Math.random() * 2 ** 32) >>> 0; }
}
