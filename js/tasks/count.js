// Count: 20-400 dots for 2 s, then hidden. Two questions: how many in total, then what % were one kind
// (a colour, a size or a pattern; which kind changes daily). Scored on |ln(guess / true)| and on percentage
// points, weighted 65/35, then the speed bonus.
import { log, roundTo } from '../dmath.js';
import { area, bbox, blob, lerp, pointInPolygon } from '../geometry.js';
import { Rng } from '../rng.js';
import { CURVES, WEIGHTS, curveScore, oneDp, round2 } from '../scoring.js';

export const EXPOSURE_MS = 2000;

// Fixed colours (not theme colours), so every player sees the same contrast. Readable on both stage backgrounds
// and distinguishable with the common colour-vision deficiencies (they differ in lightness too).
export const DOT_COLOURS = [
  { name: 'orange', hex: '#f08c00' },
  { name: 'blue', hex: '#1c7ed6' },
  { name: 'pink', hex: '#e64980' },
];
const PATTERNS = [
  { kind: 'dot', name: 'solid dots' },
  { kind: 'ring', name: 'rings' },
  { kind: 'tri', name: 'triangles' },
];
const SIZES = ['big', 'medium', 'small'];
const SIZE_SCALE = [1, 0.72, 0.5];

/** What the second question asks about, e.g. "orange" or "rings". */
export function categoryName(p) {
  if (p.scheme === 'colour') return DOT_COLOURS[p.order[0]].name;
  if (p.scheme === 'pattern') return PATTERNS[p.order[0]].name;
  return `${SIZES[0]} ones`;
}

export default {
  type: 'count',
  name: 'Count',
  emoji: '🔢',
  illusionCapable: true,
  illusionName: 'Connected dots',

  prompt: () => 'How many in total?',
  prompt2: (p) => `What % were ${categoryName(p)}?`,

  generate(rng, d, { illusion = false } = {}) {
    const lo = lerp(20, 70, d), hi = lerp(70, 400, d);
    const n = Math.round(rng.logUniform(lo, hi + 1));
    const scheme = rng.pick(d < 0.3 ? ['colour'] : ['colour', 'size', 'pattern']);
    const cats = d < 0.5 ? 2 : 3;
    // the asked-about kind is category 0; it's 15-60% of the dots
    const counts = Array(cats).fill(0);
    counts[0] = Math.max(1, Math.min(n - cats + 1, Math.round(n * rng.range(0.15, 0.6))));
    let rest = n - counts[0];
    for (let c = 1; c < cats; c++) {
      const take = c === cats - 1 ? rest : Math.max(1, Math.round(rest * rng.range(0.35, 0.65)));
      counts[c] = take; rest -= take;
    }
    const order = rng.shuffle([0, 1, 2]); // which colour/pattern each category gets
    return {
      n, scheme, counts, order,
      pct: roundTo((counts[0] / n) * 100, 1),
      exposureMs: EXPOSURE_MS,
      sizeVar: scheme === 'size' ? 0 : lerp(0.05, 0.3, d),
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
    const labels = [];
    p.counts.forEach((c, i) => { for (let k = 0; k < c; k++) labels.push(i); });
    rng.shuffle(labels);
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
      const cat = labels[dots.length];
      const scale = p.scheme !== 'size' ? 1 : p.counts.length === 2 ? [1, 0.5][cat] : SIZE_SCALE[cat];
      dots.push({
        x, y, cat, rot: rng.next(),
        r: rBase * scale * (1 - p.sizeVar * rng.next()),
        kind: p.scheme === 'pattern' ? PATTERNS[p.order[cat]].kind : 'dot',
        colour: p.scheme === 'colour' ? DOT_COLOURS[p.order[cat]].hex : null,
      });
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

  validate: (a) => !!a && Number.isInteger(a.n) && a.n >= 0 && a.n <= 9999 && oneDp(a.pct, 0, 100),

  score(p, a) {
    if (a === null || !this.validate(a)) return { acc: 0, err: null, parts: [] };
    const e1 = a.n > 0 ? Math.abs(log(a.n / p.n)) : Infinity;
    const e2 = Math.abs(a.pct - p.pct);
    const [w1, w2] = WEIGHTS.count;
    const acc = round2(w1 * curveScore(e1, CURVES.count) + w2 * curveScore(e2, CURVES['count.pct']));
    const err = Number.isFinite(e1) ? e1 : null;
    return { acc, err, parts: [{ curve: 'count', err }, { curve: 'count.pct', err: e2 }] };
  },

  truthText: (p) => `${p.n} dots, ${roundTo(p.pct, 1)}% ${categoryName(p)}`,
  answerText: (p, a) => {
    if (a === null) return 'no answer';
    const off = Math.round(((a.n - p.n) / p.n) * 100);
    return `you said ${a.n} (${off > 0 ? '+' : ''}${off}%) and ${a.pct}%`;
  },
};
