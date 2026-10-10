// Midpoint: tap the middle of a line, or the centre (centroid) of an irregular shape.
// Scored on distance / the shape's size (line length, or sqrt of the shape's area), so it's the same on any screen.
import { cosDeg, roundTo, sinDeg } from '../dmath.js';
import { area, bbox, blob, centroid, lerp, offMultiple, transform } from '../geometry.js';
import { CURVES, curveScore } from '../scoring.js';

function line(rng, d, illusion) {
  let L = rng.range(lerp(0.6, 0.45, d), lerp(0.8, 0.7, d));
  let th = 0;
  const axisGap = lerp(0, 12, d);
  for (let i = 0; i < 200; i++) { th = rng.range(0, 180); if (offMultiple(th, 90) >= axisGap) break; }
  const ux = cosDeg(th), uy = -sinDeg(th);
  // keep the midpoint off the stage centre, so the stage itself is no ruler
  const [ox, oy] = rng.direction();
  const off = rng.range(0.05, 0.14);
  let mx = 0.5 + ox * off, my = 0.5 + oy * off;
  // fit inside [0.08, 0.92]
  for (let i = 0; i < 40; i++) {
    const ends = [mx - ux * L / 2, my - uy * L / 2, mx + ux * L / 2, my + uy * L / 2];
    if (ends.every((v) => v >= 0.08 && v <= 0.92)) break;
    L *= 0.95; mx = lerp(mx, 0.5, 0.2); my = lerp(my, 0.5, 0.2);
  }
  const a = [mx - ux * L / 2, my - uy * L / 2], b = [mx + ux * L / 2, my + uy * L / 2];
  // decorations that pull the eye: none on easy days, lopsided end caps on hard days, Müller-Lyer fins on Sunday
  const ends = illusion ? 'fins' : d >= 0.6 && rng.chance(0.6) ? 'caps' : 'plain';
  return { sub: 'line', a, b, truth: [mx, my], size: L, ends, flip: rng.chance(0.5), illusion };
}

function centre(rng, d) {
  const raw = blob(rng, {
    cx: 0, cy: 0, r: 1, minK: 1, harmonics: 4, rough: lerp(0.18, 0.42, d),
    stretch: 1 + rng.range(0.05, lerp(0.15, 0.6, d)), rot: rng.range(0, 6.283185307179586),
  });
  const b0 = bbox(raw);
  const s = rng.range(0.55, 0.7) / Math.max(b0.w, b0.h);
  const [ox, oy] = rng.direction();
  const off = rng.range(0.03, 0.1);
  let poly = transform(raw, s, 0, 0, 0.5 + ox * off, 0.5 + oy * off);
  // nudge back inside the stage if needed
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
  illusionName: 'Müller-Lyer bisection',

  prompt: (p) => (p.sub === 'line' ? 'Tap the middle of the line' : 'Tap the centre of the shape'),

  generate(rng, d, { illusion = false } = {}) {
    return illusion || rng.chance(lerp(0.65, 0.25, d)) ? line(rng, d, illusion) : centre(rng, d);
  },

  validate: (a) => !!a && [a.x, a.y].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -0.2 && v <= 1.2),

  error(p, a) {
    const dx = a.x - p.truth[0], dy = a.y - p.truth[1];
    return Math.sqrt(dx * dx + dy * dy) / p.size;
  },

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES[`midpoint.${p.sub}`]), err };
  },

  truthText: (p) => (p.sub === 'line' ? 'the middle' : 'the centre'),
  answerText(p, a) {
    if (a === null) return 'no answer';
    return `you were ${roundTo(this.error(p, a) * 100, 1)}% of the ${p.sub === 'line' ? 'length' : 'size'} away`;
  },
};
