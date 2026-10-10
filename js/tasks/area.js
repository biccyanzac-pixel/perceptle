// Area: two irregular blobs. Pick the bigger one, then say by what percentage it's bigger.
// Scored on |ln(your ratio) - ln(true ratio)|, where picking the smaller one turns your ratio below 1,
// so a wrong pick costs exactly as much as it should and no separate penalty is needed.
import { log } from '../dmath.js';
import { area, bbox, blob, lerp, transform } from '../geometry.js';
import { CURVES, curveScore, oneDp, round2 } from '../scoring.js';

const ARRANGEMENTS = [
  [[0.27, 0.5], [0.73, 0.5]],
  [[0.5, 0.27], [0.5, 0.73]],
  [[0.3, 0.3], [0.7, 0.7]],
  [[0.3, 0.7], [0.7, 0.3]],
];

export default {
  type: 'area',
  name: 'Area',
  emoji: '🫧',
  illusionCapable: true,
  illusionName: 'Ebbinghaus circles',

  prompt: () => 'Tap the bigger shape. How much bigger?',

  generate(rng, d, { illusion = false } = {}) {
    const ratio = rng.range(lerp(1.35, 1.06, d), lerp(1.9, 1.3, d));
    const bigger = rng.int(0, 1);
    const centres = (illusion ? [[0.3, 0.5], [0.7, 0.5]] : rng.pick(ARRANGEMENTS))
      .map(([x, y]) => [x + rng.range(-0.03, 0.03), y + rng.range(-0.03, 0.03)]);
    const rough = lerp(0.1, 0.3, d);
    const targetBig = illusion ? 0.028 : 0.1; // the special leaves room for the ring of circles
    let polys = [0, 1].map((i) => {
      const raw = blob(rng, {
        cx: 0, cy: 0, r: 1, rough, harmonics: 4,
        stretch: 1 + rng.range(0, lerp(0.05, 0.55, d)), rot: rng.range(0, 6.283185307179586),
      });
      const want = i === bigger ? targetBig : targetBig / ratio;
      const s = Math.sqrt(want / area(raw));
      return transform(raw, s, 0, 0, centres[i][0], centres[i][1]);
    });
    // shrink both together until they're apart and inside the stage (keeps the ratio)
    const margin = illusion ? 0.1 : 0.03;
    for (let it = 0; it < 40; it++) {
      const [a, b] = polys.map(bbox);
      const apart = a.x1 + margin < b.x0 || b.x1 + margin < a.x0 || a.y1 + margin < b.y0 || b.y1 + margin < a.y0;
      const inside = [a, b].every((q) => q.x0 > margin && q.y0 > margin && q.x1 < 1 - margin && q.y1 < 1 - margin);
      if (apart && inside) break;
      polys = polys.map((p, i) => transform(p, 0.93, centres[i][0], centres[i][1]));
    }
    const areas = polys.map(area);
    return { polys, bigger, ratio: areas[bigger] / areas[1 - bigger], centres, illusion };
  },

  validate: (a) => !!a && (a.pick === 0 || a.pick === 1) && oneDp(a.pct, 0, 999),

  error(p, a) {
    const g = 1 + a.pct / 100;
    const implied = a.pick === p.bigger ? g : 1 / g;
    return Math.abs(log(implied / p.ratio));
  },

  score(p, a) {
    if (a === null || !this.validate(a)) return { acc: 0, err: null, parts: [] };
    const err = this.error(p, a);
    return { acc: round2(curveScore(err, CURVES.area)), err, parts: [{ curve: 'area', err }] };
  },

  truthPct: (p) => Math.round((p.ratio - 1) * 100),
  truthText(p) { return `${this.truthPct(p)}% bigger`; },
  answerText(p, a) {
    if (a === null) return 'no answer';
    return a.pick === p.bigger ? `you said ${a.pct}% bigger` : `you picked the smaller one (${a.pct}%)`;
  },
};
