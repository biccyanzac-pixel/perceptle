// Colour: pick the swatch that matches the sample, from a palette of near-matches.
// A correct pick scores 100; a wrong one is scored on the OKLab distance to the sample's colour.
// Harder days: closer near-matches, more of them, and the sample disappears before the palette appears.
// Sunday's special puts the sample on a strong surround (simultaneous contrast).
import { TAU } from '../dmath.js';
import { deltaE, hex, oklabToRgb, oklch, rgbToOklab } from '../colour.js';
import { lerp } from '../geometry.js';
import { CURVES, curveScore, round2 } from '../scoring.js';

export const MEMORY_MS = 1500;

export default {
  type: 'colour',
  name: 'Colour',
  emoji: '🎨',
  illusionCapable: true,
  illusionName: 'Simultaneous contrast',

  prompt: (p) => (p.memory ? 'Remember this colour' : 'Tap the matching colour'),

  generate(rng, d, { illusion = false } = {}) {
    let target = null, hue = 0;
    for (let i = 0; i < 500 && !target; i++) {
      hue = rng.range(0, TAU);
      target = oklabToRgb(oklch(rng.range(0.45, 0.85), rng.range(0.03, 0.15), hue));
    }
    const lab = rgbToOklab(target);
    const count = d < 0.5 ? 6 : 8;
    const s = lerp(0.035, 0.012, d);
    const rgbs = [target];
    for (let i = 0; i < 2000 && rgbs.length < count; i++) {
      let v = [rng.normal() * 0.6, rng.normal(), rng.normal()]; // a little less lightness change
      const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
      const mag = s * rng.range(1, 1.8);
      v = v.map((c) => (c / len) * mag);
      const cand = oklabToRgb([lab[0] + v[0], lab[1] + v[1], lab[2] + v[2]]);
      if (cand && rgbs.every((q) => deltaE(cand, q) >= 0.7 * s)) rgbs.push(cand);
    }
    const order = rng.shuffle(rgbs.map((_, i) => i));
    const palette = order.map((i) => rgbs[i]);
    let surround = null;
    if (illusion) {
      for (let C = 0.16; C > 0.02 && !surround; C -= 0.02) surround = oklabToRgb(oklch(0.62, C, hue + TAU / 2));
    }
    return {
      palette, colours: palette.map(hex), answer: order.indexOf(0), sample: hex(target),
      memory: d >= 0.6, memoryMs: MEMORY_MS, surround: surround ? hex(surround) : null,
      seed: rng.int(0, 0x7fffffff), illusion,
    };
  },

  validate(a) { return Number.isInteger(a) && a >= 0 && a < 8; },

  error: (p, a) => deltaE(p.palette[a], p.palette[p.answer]),

  score(p, a) {
    if (a === null || !this.validate(a) || a >= p.palette.length) return { acc: 0, err: null, parts: [] };
    const err = this.error(p, a);
    return { acc: round2(curveScore(err, CURVES.colour)), err, parts: [{ curve: 'colour', err }] };
  },

  truthText: () => 'the match',
  answerText: (p, a) => (a === null ? 'no answer' : a === p.answer ? 'exact match' : 'a near-match'),
};
