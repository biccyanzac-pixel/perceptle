// Length: which line is the longest? Each candidate is one line bent into a shape: a squiggle, a zigzag, a spiral,
// a closed loop, a coil or a star outline. Different shapes pack length very differently, so it's hard to compare.
// 4 lines on Monday (all the same kind, 12-20% apart) up to 6 on Saturday (all different kinds, 3-6% apart).
// A correct pick scores 100 accuracy; a wrong one is scored on ln(longest / picked). Then the speed bonus.
// The reveal unrolls every line into a straight bar.
import { cos, log, sin, TAU } from '../dmath.js';
import { bbox, blob, lerp, transform } from '../geometry.js';
import { CURVES, curveScore, round2 } from '../scoring.js';

export const KINDS = ['squiggle', 'zigzag', 'spiral', 'loop', 'coil', 'star'];

/** A unit-size polyline (fits roughly in [-0.5, 0.5]²) of the given kind. */
function shape(rng, kind) {
  const pts = [];
  if (kind === 'squiggle') {
    const cyc = rng.range(1.5, 3.5), amp = rng.range(0.12, 0.3), ph = rng.range(0, TAU);
    for (let i = 0; i <= 120; i++) { const u = i / 120; pts.push([u - 0.5, amp * sin(TAU * cyc * u + ph)]); }
  } else if (kind === 'zigzag') {
    const k = rng.int(4, 9), amp = rng.range(0.15, 0.4);
    for (let i = 0; i <= k; i++) pts.push([i / k - 0.5, (i % 2 ? amp : -amp) * rng.range(0.6, 1)]);
  } else if (kind === 'spiral') {
    const turns = rng.range(1.1, 1.9), r0 = rng.range(0.08, 0.16), ph = rng.range(0, TAU);
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, t = TAU * turns * u + ph, r = r0 + (0.5 - r0) * u;
      pts.push([r * cos(t), r * sin(t)]);
    }
  } else if (kind === 'loop') {
    const b = blob(rng, { cx: 0, cy: 0, r: 0.42, n: 120, rough: rng.range(0.15, 0.35), harmonics: 3 });
    pts.push(...b, b[0]);
  } else if (kind === 'coil') {
    // a prolate cycloid: a line with loops in it
    const loops = rng.int(3, 5), r = rng.range(0.08, 0.13), step = 1 / loops;
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, t = TAU * loops * u;
      pts.push([u - 0.5 - r * 0.9 * sin(t) * step * 2.2, -r * cos(t)]);
    }
  } else { // star
    const k = rng.int(5, 8), inner = rng.range(0.4, 0.65), ph = rng.range(0, TAU);
    for (let i = 0; i <= 2 * k; i++) {
      const t = ph + (i * TAU) / (2 * k), r = i % 2 ? 0.48 * inner : 0.48;
      pts.push([r * cos(t), r * sin(t)]);
    }
  }
  return pts;
}

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    L += Math.sqrt(dx * dx + dy * dy);
  }
  return L;
}

// Loose, jittered placements (never a grid): 4, 5 or 6 spots
const SPOTS = {
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.22, 0.23], [0.72, 0.2], [0.5, 0.5], [0.24, 0.77], [0.76, 0.78]],
  6: [[0.2, 0.2], [0.5, 0.18], [0.8, 0.22], [0.2, 0.75], [0.5, 0.8], [0.8, 0.76]],
};

export default {
  type: 'length',
  name: 'Length',
  emoji: '📏',
  illusionCapable: false,

  prompt: () => 'Which line is the longest?',

  generate(rng, d) {
    const n = d < 0.35 ? 4 : d < 0.7 ? 5 : 6;
    let kinds;
    if (d < 0.35) { const k = rng.pick(['squiggle', 'loop', 'zigzag']); kinds = Array(n).fill(k); }
    else if (d < 0.7) { const pool = rng.shuffle([...KINDS]).slice(0, 3); kinds = Array.from({ length: n }, (_, i) => pool[i % 3]); }
    else kinds = rng.shuffle([...KINDS]).slice(0, n);
    rng.shuffle(kinds);

    // target lengths: each next one shorter by a gap
    const lo = lerp(0.12, 0.03, d), hi = lerp(0.2, 0.06, d);
    const rel = [1];
    for (let i = 1; i < n; i++) rel.push(rel[i - 1] * (1 - rng.range(lo, hi)));
    rng.shuffle(rel);

    const cell = n === 4 ? 0.4 : 0.31;
    const units = kinds.map((k) => {
      const u = shape(rng, k);
      const b = bbox(u);
      const s = 1 / Math.max(b.w, b.h);
      const norm = transform(u, s, 0, 0);
      return { pts: norm, L: polyLength(norm) };
    });
    // size each so its length matches its target, then shrink everything together until all fit their cells
    let base = Infinity;
    units.forEach((u, i) => { base = Math.min(base, (cell * u.L) / rel[i]); });
    const spots = SPOTS[n];
    const lines = units.map((u, i) => {
      const s = (base * rel[i]) / u.L;
      const rot = rng.range(0, TAU), cr = cos(rot), sr = sin(rot);
      const [sx, sy] = spots[i];
      const cx = sx + rng.range(-0.035, 0.035), cy = sy + rng.range(-0.035, 0.035);
      const pts = u.pts.map(([x, y]) => [cx + s * (x * cr - y * sr), cy + s * (x * sr + y * cr)]);
      return { kind: kinds[i], pts, L: polyLength(pts) };
    });
    // keep every line inside the stage
    for (const l of lines) {
      const b = bbox(l.pts);
      const dx = b.x0 < 0.03 ? 0.03 - b.x0 : b.x1 > 0.97 ? 0.97 - b.x1 : 0;
      const dy = b.y0 < 0.03 ? 0.03 - b.y0 : b.y1 > 0.97 ? 0.97 - b.y1 : 0;
      l.pts = transform(l.pts, 1, 0, 0, dx, dy);
    }
    let longest = 0;
    lines.forEach((l, i) => { if (l.L > lines[longest].L) longest = i; });
    return { lines, longest };
  },

  validate: (a) => Number.isInteger(a) && a >= 0 && a <= 5,

  score(p, a) {
    if (a === null || !this.validate(a) || a >= p.lines.length) return { acc: 0, err: null, parts: [] };
    const err = log(p.lines[p.longest].L / p.lines[a].L);
    return { acc: round2(curveScore(err, CURVES.length)), err, parts: [{ curve: 'length', err }] };
  },

  truthText: () => 'the longest',
  answerText(p, a) {
    if (a === null) return 'no answer';
    if (a === p.longest) return 'you got it';
    return `yours was ${Math.round((1 - p.lines[a].L / p.lines[p.longest].L) * 1000) / 10}% shorter`;
  },
};
