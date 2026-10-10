// Angle: two arms meeting at a vertex, an arc marks which angle. Enter degrees. Scored on absolute error.
// Easy days stay near familiar angles (45, 90, ...); hard days avoid them, avoid arms lined up with the screen
// edges, use unequal arms and allow reflex angles.
import { cosDeg, roundTo, sinDeg } from '../dmath.js';
import { lerp, offMultiple } from '../geometry.js';
import { CURVES, curveScore } from '../scoring.js';

const LANDMARKS = [30, 45, 60, 90, 120, 135, 150];

export default {
  type: 'angle',
  name: 'Angle',
  emoji: '📐',
  illusionCapable: true,
  illusionName: 'Zöllner hatching',

  prompt: () => 'How many degrees?',

  generate(rng, d, { illusion = false } = {}) {
    let a;
    if (rng.chance(lerp(0.85, 0, d))) {
      a = rng.pick(LANDMARKS) + rng.range(-1, 1) * lerp(2, 6, d);
    } else {
      const maxA = d < 0.5 ? 170 : lerp(170, 330, (d - 0.5) * 2);
      const gap = lerp(1, 6, d);
      for (let i = 0; i < 200; i++) {
        a = rng.range(12, maxA);
        if (offMultiple(a, 45) >= gap && (d < 0.5 || offMultiple(a, 30) >= gap)) break;
      }
    }
    a = roundTo(a, 1);

    const axisGap = lerp(0, 9, d);
    let rot = 0;
    for (let i = 0; i < 200; i++) {
      rot = rng.range(0, 360);
      if (offMultiple(rot, 90) >= axisGap && offMultiple(rot + a, 90) >= axisGap) break;
    }
    let l1 = rng.range(0.3, 0.42);
    let l2 = l1 * (1 - rng.range(0, lerp(0.05, 0.35, d)));
    if (rng.chance(0.5)) [l1, l2] = [l2, l1];

    // fit the vertex and both arm ends into the stage, with a random offset in the slack
    const e1 = [l1 * cosDeg(rot), -l1 * sinDeg(rot)];
    const e2 = [l2 * cosDeg(rot + a), -l2 * sinDeg(rot + a)];
    const xs = [0, e1[0], e2[0]], ys = [0, e1[1], e2[1]];
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min(1, 0.84 / Math.max(x1 - x0, y1 - y0));
    l1 *= s; l2 *= s; x0 *= s; x1 *= s; y0 *= s; y1 *= s;
    const slackX = 0.88 - (x1 - x0), slackY = 0.88 - (y1 - y0);
    const vx = 0.06 + rng.range(0, slackX) - x0, vy = 0.06 + rng.range(0, slackY) - y0;
    return { angle: a, rot: roundTo(rot, 3), l1, l2, vx, vy, illusion };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 360,

  error: (p, a) => Math.abs(a - p.angle),

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES.angle), err };
  },

  truthText: (p) => `${p.angle}°`,
  answerText: (p, a) => (a === null ? 'no answer' : `you said ${a}° (${roundTo(Math.abs(a - p.angle), 1)}° out)`),
};
