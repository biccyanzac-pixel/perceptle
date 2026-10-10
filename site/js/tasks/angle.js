// Angle on a tilted disc: an angle is drawn on a flat disc that's tilted away from you, so the disc looks like an
// ellipse and the angle looks squashed. Enter the real angle on the disc, in degrees. Scored on absolute error.
// Monday's disc is almost face-on (a plain 2D angle); by Saturday it's tilted up to ~65° and the angle avoids
// familiar values. The reveal tips the disc flat so you can see the real angle.
import { roundTo } from '../dmath.js';
import { lerp, offMultiple } from '../geometry.js';
import { CURVES, curveScore, round2 } from '../scoring.js';

const LANDMARKS = [30, 45, 60, 90, 120, 135, 150];

/**
 * Where a point on the disc ends up on screen (orthographic): (u, v) on the disc, tilt τ about the disc's
 * horizontal axis, then the whole picture spun by ψ. Pure arithmetic given cos/sin, so the renderer passes Math's.
 */
export function project(p, u, v, tilt, cos, sin) {
  const t = tilt * (Math.PI / 180), s = p.spin * (Math.PI / 180);
  const x = u, y = v * cos(t);
  return [p.cx + p.R * (x * cos(s) - y * sin(s)), p.cy + p.R * (x * sin(s) + y * cos(s))];
}

export default {
  type: 'angle',
  name: 'Angle',
  emoji: '📐',
  illusionCapable: true,
  illusionName: 'Zöllner hatching',

  prompt: () => 'The angle is on a tilted disc. What is it really?',

  generate(rng, d, { illusion = false } = {}) {
    let a;
    if (rng.chance(lerp(0.7, 0, d))) {
      a = rng.pick(LANDMARKS) + rng.range(-1, 1) * lerp(3, 8, d);
    } else {
      const gap = lerp(1, 6, d);
      for (let i = 0; i < 200; i++) {
        a = rng.range(18, 162);
        if (offMultiple(a, 45) >= gap && (d < 0.5 || offMultiple(a, 30) >= gap)) break;
      }
    }
    a = roundTo(a, 1);
    const tilt = roundTo(d < 0.15 ? rng.range(0, 12) : rng.range(lerp(15, 45, d), lerp(30, 65, d)), 2);
    return {
      angle: a,
      tilt,
      spin: roundTo(rng.range(0, 180), 2),
      start: roundTo(rng.range(0, 360), 2), // first arm's direction on the disc
      l1: rng.range(0.72, 0.95), l2: rng.range(0.72, 0.95),
      cx: 0.5 + rng.range(-0.04, 0.04), cy: 0.5 + rng.range(-0.04, 0.04), R: 0.4,
      illusion,
    };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 360,

  score(p, a) {
    if (a === null || !this.validate(a)) return { acc: 0, err: null, parts: [] };
    const err = Math.abs(a - p.angle);
    return { acc: round2(curveScore(err, CURVES.angle)), err, parts: [{ curve: 'angle', err }] };
  },

  truthText: (p) => `${p.angle}° (disc tilted ${Math.round(p.tilt)}°)`,
  answerText: (p, a) => (a === null ? 'no answer' : `you said ${a}° (${roundTo(Math.abs(a - p.angle), 1)}° out)`),
};
