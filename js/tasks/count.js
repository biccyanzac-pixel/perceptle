// Count: 20-400 dots (or small icons) for 2 s, then hidden. Scored on |ln(guess / true)|.
import { log } from '../dmath.js';
import { area, bbox, blob, lerp, pointInPolygon } from '../geometry.js';
import { Rng } from '../rng.js';
import { CURVES, curveScore } from '../scoring.js';

export const EXPOSURE_MS = 2000;

export default {
  type: 'count',
  name: 'Count',
  emoji: '🔢',
  illusionCapable: true,
  illusionName: 'Connected dots',

  prompt: () => 'How many?',

  generate(rng, d, { illusion = false } = {}) {
    const lo = lerp(20, 70, d), hi = lerp(70, 400, d);
    const n = Math.round(rng.logUniform(lo, hi + 1));
    const kinds = d < 0.35 ? ['dot'] : d < 0.7 ? ['dot', 'ring'] : ['dot', 'ring', 'square', 'tri'];
    return {
      n,
      exposureMs: EXPOSURE_MS,
      kinds,
      sizeVar: lerp(0.05, 0.45, d),
      rough: lerp(0.08, 0.22, d),
      illusion,
      seed: rng.int(0, 0x7fffffff),
    };
  },

  /** Dot positions: a random non-overlapping layout inside an irregular region (no grid, no clusters). */
  layout(p) {
    const rng = new Rng(p.seed);
    const t = Math.sqrt(Math.max(0, (p.n - 20) / 380));
    const region = blob(rng, { cx: 0.5, cy: 0.5, r: lerp(0.3, 0.43, t), rough: p.rough, harmonics: 3 });
    const A = area(region);
    const b = bbox(region);
    let dmin = 0.72 * Math.sqrt(A / p.n);
    const rBase = Math.min(0.018, 0.34 * dmin);
    const dots = [];
    let tries = 0;
    while (dots.length < p.n) {
      if (++tries > 60 * p.n) { dmin *= 0.93; tries = 0; } // too crowded: relax the spacing, keep going
      const x = b.x0 + rng.next() * b.w, y = b.y0 + rng.next() * b.h;
      if (!pointInPolygon(x, y, region)) continue;
      let ok = true;
      for (const q of dots) {
        const dx = q.x - x, dy = q.y - y;
        if (dx * dx + dy * dy < dmin * dmin) { ok = false; break; }
      }
      if (!ok) continue;
      dots.push({ x, y, r: rBase * (1 - p.sizeVar * rng.next()), kind: rng.pick(p.kinds), rot: rng.next() });
    }
    // Sunday special: join some neighbours with lines; connected dots look like fewer things
    const links = [];
    if (p.illusion) {
      const used = new Set();
      for (let i = 0; i < dots.length; i++) {
        if (used.has(i) || !rng.chance(0.8)) continue;
        let best = -1, bd = Infinity;
        for (let j = 0; j < dots.length; j++) {
          if (j === i || used.has(j)) continue;
          const dx = dots[j].x - dots[i].x, dy = dots[j].y - dots[i].y, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = j; }
        }
        if (best >= 0 && bd < 9 * dmin * dmin) { used.add(i); used.add(best); links.push([i, best]); }
      }
    }
    return { dots, links };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 9999,

  error: (p, a) => (a > 0 ? Math.abs(log(a / p.n)) : Infinity),

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES.count), err: Number.isFinite(err) ? err : null };
  },

  truthText: (p) => `${p.n} dots`,
  answerText: (p, a) => {
    if (a === null) return 'no answer';
    const pct = Math.round(((a - p.n) / p.n) * 100);
    return `you said ${a} (${pct > 0 ? '+' : ''}${pct}%)`;
  },
};
