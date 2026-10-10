// Length: which of three lines is the longest? Distractor shapes around them; Müller-Lyer fins on hard days
// and Sunday. A correct pick scores 100; a wrong one is scored on ln(longest / picked).
import { cosDeg, log, sinDeg } from '../dmath.js';
import { distToSegment, lerp, segmentsIntersect } from '../geometry.js';
import { CURVES, curveScore } from '../scoring.js';

const SLOTS = [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]];

function place(rng, lengths, angles, stacked) {
  const order = stacked ? [0, 1, 2] : rng.shuffle([0, 1, 2]);
  return lengths.map((L, i) => {
    const [sx, sy] = stacked ? SLOTS[order[i]] : [rng.range(0.25, 0.75), rng.range(0.2, 0.8)];
    const cx = sx + (stacked ? rng.range(-0.1, 0.1) : 0), cy = sy + (stacked ? rng.range(-0.04, 0.04) : 0);
    const ux = cosDeg(angles[i]) * L / 2, uy = -sinDeg(angles[i]) * L / 2;
    return { a: [cx - ux, cy - uy], b: [cx + ux, cy + uy], L };
  });
}

function fits(segs, gap) {
  for (const s of segs) if (![...s.a, ...s.b].every((v) => v >= 0.07 && v <= 0.93)) return false;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], t = segs[j];
      if (segmentsIntersect(s.a, s.b, t.a, t.b)) return false;
      const dd = Math.min(
        distToSegment(...s.a, ...t.a, ...t.b), distToSegment(...s.b, ...t.a, ...t.b),
        distToSegment(...t.a, ...s.a, ...s.b), distToSegment(...t.b, ...s.a, ...s.b));
      if (dd < gap) return false;
    }
  }
  return true;
}

export default {
  type: 'length',
  name: 'Length',
  emoji: '📏',
  illusionCapable: true,
  illusionName: 'Müller-Lyer fins',

  prompt: () => 'Tap the longest line',

  generate(rng, d, { illusion = false } = {}) {
    const Lmax = rng.range(0.32, 0.44);
    const lo = lerp(0.12, 0.025, d), hi = lerp(0.2, 0.06, d);
    const d1 = rng.range(lo, hi), d2 = d1 + rng.range(lo * 0.6, hi);
    const lengths = rng.shuffle([Lmax, Lmax * (1 - d1), Lmax * (1 - d2)]);
    const longest = lengths.indexOf(Lmax);
    const fins = illusion || (d >= 0.8 && rng.chance(0.5));

    const base = rng.range(0, 180);
    const spread = lerp(8, 90, d);
    let segs = null;
    for (let tries = 0; tries < 300 && !segs; tries++) {
      const angles = lengths.map(() => base + rng.range(-spread, spread));
      const cand = place(rng, lengths, angles, spread < 30 || tries > 200);
      if (fits(cand, fins ? 0.09 : 0.06)) segs = cand;
    }
    if (!segs) { // always solvable: three nearly horizontal stacked lines
      const angles = lengths.map(() => rng.range(-6, 6));
      segs = place(rng, lengths, angles, true);
    }
    // fins: arrowheads <-> make a line look shorter, tails >-< longer. The longest gets heads.
    const shortest = lengths.indexOf(Math.min(...lengths));
    segs.forEach((s, i) => { s.fins = !fins ? 'none' : i === longest ? 'heads' : i === shortest ? 'tails' : rng.pick(['heads', 'tails', 'none']); });

    const distractors = [];
    const want = Math.round(lerp(0, 9, d));
    for (let tries = 0; tries < 400 && distractors.length < want; tries++) {
      const x = rng.range(0.06, 0.94), y = rng.range(0.06, 0.94), r = rng.range(0.015, 0.04);
      const clear = segs.every((s) => distToSegment(x, y, ...s.a, ...s.b) > r + 0.05)
        && distractors.every((q) => Math.sqrt((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y)) > r + q.r + 0.02);
      if (clear) distractors.push({ x, y, r, kind: rng.pick(['circle', 'square', 'tri', 'bar']), rot: rng.next() });
    }
    return { segs, longest, distractors, illusion: fins };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 2,

  error: (p, a) => log(p.segs[p.longest].L / p.segs[a].L),

  score(p, a) {
    if (a === null || !this.validate(a)) return { points: 0, err: null };
    const err = this.error(p, a);
    return { points: curveScore(err, CURVES.length), err };
  },

  truthText: () => 'the longest',
  answerText(p, a) {
    if (a === null) return 'no answer';
    if (a === p.longest) return 'you got it';
    return `yours was ${Math.round((1 - p.segs[a].L / p.segs[p.longest].L) * 100)}% shorter`;
  },
};
