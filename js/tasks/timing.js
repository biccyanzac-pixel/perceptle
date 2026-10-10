// Timing: tap Start, then tap again when exactly N seconds have passed. No visible timer.
// Scored on |tapped - target| / target. Harder days use longer, half-second targets and an off-beat pulse
// that breaks counting; Sunday's special flickers, which makes time feel longer (filled-duration illusion).
import { lerp } from '../geometry.js';
import { roundTo } from '../dmath.js';
import { CURVES, curveScore } from '../scoring.js';

export default {
  type: 'timing',
  name: 'Timing',
  emoji: '⏱️',
  illusionCapable: true,
  illusionName: 'Flicker',

  prompt: (p) => `Tap Stop after exactly ${p.seconds} seconds`,

  generate(rng, d, { illusion = false } = {}) {
    const lo = lerp(3, 4, d), hi = lerp(5, 9, d);
    const step = d >= 0.5 ? 0.5 : 1;
    const seconds = Math.round(rng.range(lo, hi) / step) * step;
    // distractor pulses at irregular moments (ms after Start), never at whole seconds
    const pulses = [];
    if (d >= 0.4 || illusion) {
      let t = rng.range(300, 900);
      while (t < seconds * 1000 * 1.6) {
        if (Math.abs(t / 1000 - Math.round(t / 1000)) > 0.15) pulses.push(Math.round(t));
        t += rng.range(lerp(900, 450, d), lerp(1400, 900, d));
      }
    }
    return { seconds, pulses, flicker: illusion, illusion };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 120000,

  error: (p, a) => Math.abs(a / 1000 - p.seconds) / p.seconds,

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES.timing), err };
  },

  truthText: (p) => `${p.seconds} s`,
  answerText: (p, a) => (a === null ? 'no answer' : `you stopped at ${roundTo(a / 1000, 2).toFixed(2)} s`),
};
