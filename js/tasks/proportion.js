// Proportion: what percentage of the shape is shaded? Scored on percentage-point error.
// One straight cut on easy days; a wedge (two cuts) or two separate strips on hard days, and hard days avoid
// the easy-to-judge 25/50/75%.
import { cos, roundTo, sin, TAU } from '../dmath.js';
import { area, blob, clipHalfPlane, lerp, offMultiple } from '../geometry.js';
import { CURVES, curveScore } from '../scoring.js';

/** Offset c so that the part of `poly` with n·x <= c has `frac` of `total` area. Area grows with c. */
function solveCut(poly, nx, ny, frac, total) {
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of poly) { const v = nx * x + ny * y; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (area(clipHalfPlane(poly, nx, ny, mid)) / total < frac) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function shadedPieces(p) {
  const h = p.cuts;
  if (p.mode === 'strips') return [clipHalfPlane(p.shape, ...h[0]), clipHalfPlane(p.shape, ...h[1])];
  let piece = p.shape;
  for (const c of h) piece = clipHalfPlane(piece, ...c);
  return [piece];
}

export default {
  type: 'proportion',
  name: 'Proportion',
  emoji: '🥧',
  illusionCapable: false,

  prompt: () => 'What % is shaded?',

  generate(rng, d) {
    const shape = blob(rng, {
      cx: 0.5 + rng.range(-0.04, 0.04), cy: 0.5 + rng.range(-0.04, 0.04), r: 0.36,
      rough: lerp(0.05, 0.3, d), harmonics: 4, stretch: 1 + rng.range(0, lerp(0.05, 0.3, d)), rot: rng.range(0, TAU),
    });
    const total = area(shape);
    let frac = 0.5;
    const avoid = lerp(0, 6, d);
    for (let i = 0; i < 200; i++) {
      frac = rng.range(0.06, 0.94);
      if (d < 0.5 || offMultiple(frac * 100, 25) >= avoid) break;
    }
    let mode = d < 0.35 ? 'cut' : d < 0.7 ? rng.pick(['cut', 'wedge']) : rng.pick(['cut', 'wedge', 'strips']);
    const phi = rng.range(0, TAU);
    const n1 = [cos(phi), sin(phi)];
    let cuts;
    if (mode === 'wedge' && frac < 0.85) {
      const q1 = rng.range(frac + 0.08, Math.min(0.97, frac + 0.5));
      const c1 = solveCut(shape, n1[0], n1[1], q1, total);
      const first = clipHalfPlane(shape, n1[0], n1[1], c1);
      const phi2 = phi + rng.sign() * rng.range(0.9, 2.2);
      const n2 = [cos(phi2), sin(phi2)];
      // fraction of the whole shape, searched within the first piece
      const c2 = solveCut(first, n2[0], n2[1], frac * total / area(first), area(first));
      cuts = [[n1[0], n1[1], c1], [n2[0], n2[1], c2]];
    } else if (mode === 'strips') {
      const q = frac * rng.range(0.35, 0.65);
      cuts = [
        [n1[0], n1[1], solveCut(shape, n1[0], n1[1], q, total)],
        [-n1[0], -n1[1], solveCut(shape, -n1[0], -n1[1], frac - q, total)],
      ];
    } else {
      mode = 'cut';
      cuts = [[n1[0], n1[1], solveCut(shape, n1[0], n1[1], frac, total)]];
    }
    const p = { shape, mode, cuts };
    const shaded = shadedPieces(p).reduce((s, piece) => s + area(piece), 0);
    p.truth = roundTo((shaded / total) * 100, 2);
    return p;
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 100,

  error: (p, a) => Math.abs(a - p.truth),

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES.proportion), err };
  },

  truthText: (p) => `${roundTo(p.truth, 1)}% shaded`,
  answerText: (p, a) => (a === null ? 'no answer' : `you said ${a}%`),
};
