// Midpoint: drag a marker along a wiggly noodle to its middle (half its length each side), or tap the centre of
// mass (balance point) of an irregular shape.
// The noodle marker stays on the noodle, so you can't miss-tap; it's scored on how far along the noodle you are
// from halfway, as a fraction of its length. Harder days make one end wigglier than the other (more length
// packed into less span), which pulls the eye away from the true middle.
// The shape is scored on distance from the true centroid / sqrt(area). Both are screen-size independent.
import { cosDeg, roundTo, sin, sinDeg, TAU } from '../dmath.js';
import { area, bbox, blob, centroid, lerp, transform } from '../geometry.js';
import { CURVES, curveScore, round2 } from '../scoring.js';

const N = 240;

function noodle(rng, d, illusion) {
  const span = rng.range(0.62, 0.8);
  const cycles = rng.range(lerp(1.5, 3, d), lerp(2.5, 5, d));
  // chirp: the wiggle gets denser towards one end (c < 2 keeps the frequency positive)
  const c = rng.sign() * rng.range(lerp(0, 0.6, d), lerp(0.2, 1.4, d));
  const amp = rng.range(lerp(0.035, 0.06, d), lerp(0.06, 0.095, d));
  const swell = rng.sign() * rng.range(0, lerp(0.1, 0.6, d)); // amplitude grows towards one end
  const ph1 = rng.range(0, TAU), ph2 = rng.range(0, TAU);
  const theta = rng.range(0, 180);
  const ux = cosDeg(theta), uy = -sinDeg(theta), nx = -uy, ny = ux;
  const raw = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const phase = TAU * cycles * (u + (c / 2) * (u * u - u));
    const env = 1 + swell * (u - 0.5);
    const y = amp * env * (sin(phase + ph1) + 0.35 * sin(2.3 * phase + ph2));
    const x = (u - 0.5) * span;
    raw.push([x * ux + y * nx, x * uy + y * ny]);
  }
  // fit inside [0.07, 0.93], off-centre so the stage's middle is no clue
  const b0 = bbox(raw);
  const s = Math.min(1, 0.8 / Math.max(b0.w, b0.h));
  const [ox, oy] = rng.direction();
  const off = rng.range(0.03, 0.08);
  let pts = transform(raw, s, 0, 0, 0.5 + ox * off, 0.5 + oy * off);
  const b = bbox(pts);
  const dx = b.x0 < 0.07 ? 0.07 - b.x0 : b.x1 > 0.93 ? 0.93 - b.x1 : 0;
  const dy = b.y0 < 0.07 ? 0.07 - b.y0 : b.y1 > 0.93 ? 0.93 - b.y1 : 0;
  pts = transform(pts, 1, 0, 0, dx, dy);
  // cumulative arc length, normalised to 0..1
  const cum = [0];
  for (let i = 1; i < N; i++) {
    const ex = pts[i][0] - pts[i - 1][0], ey = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.sqrt(ex * ex + ey * ey));
  }
  const total = cum[N - 1];
  return { sub: 'noodle', pts, cum: cum.map((v) => v / total), length: total, ends: illusion ? 'fins' : 'plain', illusion };
}

/** The point at fraction t (0..1) of the noodle's length. */
export function pointAt(p, t) {
  const { pts, cum } = p;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const f = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])];
}

function centre(rng, d) {
  const raw = blob(rng, {
    cx: 0, cy: 0, r: 1, minK: 1, harmonics: 4, rough: lerp(0.18, 0.42, d),
    stretch: 1 + rng.range(0.05, lerp(0.15, 0.6, d)), rot: rng.range(0, TAU),
  });
  const b0 = bbox(raw);
  const s = rng.range(0.55, 0.7) / Math.max(b0.w, b0.h);
  const [ox, oy] = rng.direction();
  const off = rng.range(0.03, 0.1);
  let poly = transform(raw, s, 0, 0, 0.5 + ox * off, 0.5 + oy * off);
  const b = bbox(poly);
  const dx = b.x0 < 0.05 ? 0.05 - b.x0 : b.x1 > 0.95 ? 0.95 - b.x1 : 0;
  const dy = b.y0 < 0.05 ? 0.05 - b.y0 : b.y1 > 0.95 ? 0.95 - b.y1 : 0;
  poly = transform(poly, 1, 0, 0, dx, dy);
  return { sub: 'centre', poly, truth: centroid(poly), size: Math.sqrt(area(poly)), illusion: false };
}

export default {
  type: 'midpoint',
  name: 'Midpoint',
  emoji: '🎯',
  illusionCapable: true,
  illusionName: 'Müller-Lyer ends',

  prompt: (p) => (p.sub === 'noodle' ? 'Drag the ✕ to the middle of the noodle (half its length each side)'
    : 'Tap the centre of mass: where the shape would balance'),

  generate(rng, d, { illusion = false } = {}) {
    return illusion || rng.chance(lerp(0.65, 0.35, d)) ? noodle(rng, d, illusion) : centre(rng, d);
  },

  /** noodle: { t } fraction along it; centre: { x, y } stage point */
  validate: (a) => !!a && (
    (typeof a.t === 'number' && a.t >= 0 && a.t <= 1 && a.x === undefined)
    || ([a.x, a.y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -0.2 && v <= 1.2) && a.t === undefined)),

  error(p, a) {
    if (p.sub === 'noodle') return a.t === undefined ? null : Math.abs(a.t - 0.5);
    if (a.x === undefined) return null;
    const dx = a.x - p.truth[0], dy = a.y - p.truth[1];
    return Math.sqrt(dx * dx + dy * dy) / p.size;
  },

  score(p, a) {
    if (a === null || !this.validate(a)) return { acc: 0, err: null, parts: [] };
    const err = this.error(p, a);
    if (err === null) return { acc: 0, err: null, parts: [] };
    const curve = `midpoint.${p.sub}`;
    return { acc: round2(curveScore(err, CURVES[curve])), err, parts: [{ curve, err }] };
  },

  truthText: (p) => (p.sub === 'noodle' ? 'the halfway point' : 'the balance point'),
  answerText(p, a) {
    if (a === null) return 'no answer';
    const e = this.error(p, a);
    return `you were ${(roundTo(e * 100, 1)).toFixed(1)}% of the ${p.sub === 'noodle' ? 'length' : 'size'} away`;
  },
};
