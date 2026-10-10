// Drawing and input for each task type. run() shows the task and resolves with the answer; reveal() redraws it
// with the truth marked (often animated, so you can see why). Everything is drawn in stage units, so it looks the
// same on every screen. Display-only code: Math.* is fine here (it never decides a task or a score).
import { area as polyArea, centroid, distToSegment, pointInPolygon } from '../geometry.js';
import { el } from './controls.js';
import { Rng } from '../rng.js';
import { project } from '../tasks/angle.js';
import { DOT_COLOURS, categoryName } from '../tasks/count.js';
import { TASKS } from '../tasks/index.js';
import { pointAt } from '../tasks/midpoint.js';
import { shadedPieces } from '../tasks/proportion.js';

const DEG = Math.PI / 180;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const round4 = (v) => Math.round(v * 1e4) / 1e4;
const mix = (a, b, t) => a + (b - a) * t;

/** Resample a polyline (closed: back to the start) to m points evenly spaced along its length. */
function resample(pts, m, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out = [];
  let j = 1;
  for (let k = 0; k < m; k++) {
    const s = (closed ? k / m : k / (m - 1)) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([mix(P[j - 1][0], P[j][0], f), mix(P[j - 1][1], P[j][1], f)]);
  }
  return out;
}

const lerpPts = (A, B, t) => A.map((p, i) => [mix(p[0], B[i][0], t), mix(p[1], B[i][1], t)]);

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// --- count -----------------------------------------------------------------------------------------

function drawDot(s, d, colour, scale = 1) {
  const r = d.r * scale;
  if (d.kind === 'dot') s.circle(d.x, d.y, r, { fill: colour });
  else if (d.kind === 'ring') s.circle(d.x, d.y, r * 0.78, { stroke: colour, width: r * 0.45 });
  else {
    const rr = r * 1.25;
    s.poly([0, 1, 2].map((i) => {
      const t = d.rot * Math.PI * 2 + (i * Math.PI * 2) / 3;
      return [d.x + rr * Math.cos(t), d.y + rr * Math.sin(t)];
    }), { fill: colour });
  }
}

function drawDots(s, L, { upTo = Infinity, dim = false } = {}) {
  for (const [i, j] of L.links) if (i < upTo && j < upTo) s.line([L.dots[i].x, L.dots[i].y], [L.dots[j].x, L.dots[j].y], { stroke: s.c.ink, width: 0.0035 });
  L.dots.forEach((d, i) => { if (i < upTo) drawDot(s, d, dim ? s.c.faint : d.colour || s.c.ink); });
}

/** The asked-about kind, drawn big in the middle of the stage for the second question. */
function drawLegend(s, p, L) {
  const sample = L.dots.find((d) => d.cat === 0);
  const big = { ...sample, x: 0.5, y: 0.42, rot: 0.75, r: p.scheme === 'size' ? sample.r * 3.2 : 0.06 };
  if (p.scheme === 'size') {
    const other = L.dots.find((d) => d.cat !== 0);
    drawDot(s, { ...big, x: 0.42 }, s.c.ink);
    drawDot(s, { ...other, x: 0.6, y: 0.42, r: other.r * 3.2 }, s.c.muted);
  } else drawDot(s, big, sample.colour || s.c.ink);
  s.text(0.5, 0.6, `What % were ${categoryName(p)}?`, { size: 0.05 });
}

const count = {
  async run({ stage, controls, task, prompt }) {
    const p = task.params;
    const L = TASKS.count.layout(p);
    stage.draw((s) => drawDots(s, L));
    let hidden = false;
    const hide = () => { if (!hidden) { hidden = true; stage.draw((s) => s.text(0.5, 0.5, '?', { size: 0.22, fill: s.c.faint, halo: false })); } };
    frame().then(() => wait(p.exposureMs)).then(hide);
    const n = await controls.keypad({ unit: 'in total', maxDigits: 3 }).done;
    hide();
    prompt(TASKS.count.prompt2(p));
    stage.draw((s) => drawLegend(s, p, L));
    const pct = await controls.keypad({ unit: '%', maxDigits: 3, max: 100, decimals: 1 }).done;
    return { n, pct };
  },
  reveal({ stage, task }) {
    const p = task.params;
    const L = TASKS.count.layout(p);
    // count them off, left to right, with a running total; then ring the asked-about kind
    const order = L.dots.map((d, i) => [d.x + d.y * 0.15, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const sorted = { dots: order.map((i) => L.dots[i]), links: [] };
    return stage.animate(Math.min(2600, 900 + p.n * 6), (s, t, raw) => {
      const k = Math.round(raw * p.n);
      drawDots(s, sorted, { dim: true });
      drawDots(s, sorted, { upTo: k });
      if (raw >= 1) {
        for (const d of L.dots) if (d.cat === 0) s.circle(d.x, d.y, d.r * 1.45 + 0.004, { stroke: s.c.good, width: 0.003 });
        s.text(0.5, 0.08, `${p.n} · ${Math.round(p.pct * 10) / 10}% ${categoryName(p)}`, { size: 0.06 });
      } else s.text(0.5, 0.08, String(k), { size: 0.08 });
    });
  },
};

// --- angle (on a tilted disc) ----------------------------------------------------------------------

function drawAngle(s, p, tilt, guess = null) {
  const P = (u, v) => project(p, u, v, tilt, Math.cos, Math.sin);
  const rim = Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * Math.PI * 2; return P(Math.cos(t), Math.sin(t)); });
  s.poly(rim, { fill: s.c.fill, stroke: s.c.muted, width: 0.004 });
  const a1 = p.start * DEG, a2 = (p.start + p.angle) * DEG;
  const V = P(0, 0), e1 = P(p.l1 * Math.cos(a1), p.l1 * Math.sin(a1)), e2 = P(p.l2 * Math.cos(a2), p.l2 * Math.sin(a2));
  if (p.illusion) { // Zöllner-style hatching across both arms, tilted opposite ways
    [[e1, 1], [e2, -1]].forEach(([e, sign]) => {
      const Lh = Math.hypot(e[0] - V[0], e[1] - V[1]);
      const ux = (e[0] - V[0]) / Lh, uy = (e[1] - V[1]) / Lh;
      const t = 40 * DEG * sign, hx = ux * Math.cos(t) - uy * Math.sin(t), hy = ux * Math.sin(t) + uy * Math.cos(t);
      for (let dd = 0.09; dd < Lh - 0.01; dd += 0.04) {
        const c = [V[0] + ux * dd, V[1] + uy * dd];
        s.line([c[0] - hx * 0.03, c[1] - hy * 0.03], [c[0] + hx * 0.03, c[1] + hy * 0.03], { stroke: s.c.muted, width: 0.004 });
      }
    });
  }
  const arc = Array.from({ length: 41 }, (_, i) => { const t = mix(a1, a2, i / 40); return P(0.2 * Math.cos(t), 0.2 * Math.sin(t)); });
  s.path(arc, false);
  s.ctx.strokeStyle = s.c.accent; s.ctx.lineWidth = 0.006; s.ctx.stroke();
  if (guess !== null) {
    const g = (p.start + guess) * DEG;
    s.line(V, P(0.97 * Math.cos(g), 0.97 * Math.sin(g)), { stroke: s.c.bad, width: 0.006, dash: [0.02, 0.015] });
  }
  s.line(V, e1, { width: 0.009 });
  s.line(V, e2, { width: 0.009 });
  s.circle(V[0], V[1], 0.008, { fill: s.c.ink });
  return { V, P };
}

const angle = {
  async run({ stage, controls, task }) {
    stage.draw((s) => drawAngle(s, task.params, task.params.tilt));
    return controls.keypad({ unit: '°', maxDigits: 3, max: 360, decimals: 1 }).done;
  },
  async reveal({ stage, task, answer }) {
    const p = task.params;
    // tip the disc flat, so the real angle shows
    return stage.animate(1100, (s, t, raw) => {
      const { P } = drawAngle(s, p, p.tilt * (1 - t), answer);
      if (raw >= 1) {
        const mid = (p.start + p.angle / 2) * DEG;
        const at = P(0.36 * Math.cos(mid), 0.36 * Math.sin(mid));
        s.text(at[0], at[1], `${p.angle}°`, { size: 0.06, fill: s.c.good });
      }
    });
  },
};

// --- area ------------------------------------------------------------------------------------------

function ebbinghaus(p) {
  const out = [];
  p.polys.forEach((poly, i) => {
    const [cx, cy] = p.centres[i];
    const ext = Math.max(...poly.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    const big = i === p.bigger;
    const n = big ? 6 : 9, r = big ? 0.042 : 0.018, dist = ext + (big ? 0.058 : 0.036);
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2 + 0.3;
      const x = cx + dist * Math.cos(t), y = cy + dist * Math.sin(t);
      if (x > r && x < 1 - r && y > r && y < 1 - r) out.push([x, y, r]);
    }
  });
  return out;
}

function drawArea(s, p, pick) {
  if (p.illusion) for (const [x, y, r] of ebbinghaus(p)) s.circle(x, y, r, { fill: s.c.faint });
  p.polys.forEach((poly, i) => s.poly(poly, { fill: s.c.fill, stroke: i === pick ? s.c.accent : s.c.ink, width: i === pick ? 0.012 : 0.005 }));
}

function pickPoly(polys, x, y) {
  const inside = polys.findIndex((poly) => pointInPolygon(x, y, poly));
  if (inside >= 0) return inside;
  const d = polys.map((poly) => { const [cx, cy] = centroid(poly); return Math.hypot(cx - x, cy - y); });
  const i = d[0] < d[1] ? 0 : 1;
  return d[i] < 0.3 ? i : null;
}

const area = {
  async run({ stage, controls, task, prompt }) {
    const p = task.params;
    let pick = null;
    const kp = controls.keypad({ unit: '% bigger', maxDigits: 3, decimals: 1, ready: () => pick !== null });
    stage.draw((s) => drawArea(s, p, pick));
    prompt('Tap the bigger shape');
    stage.onPointer((x, y, type) => {
      if (type !== 'down') return;
      const i = pickPoly(p.polys, x, y);
      if (i === null) return;
      pick = i;
      prompt('How much bigger is it? (%)');
      stage.redraw();
      kp.refresh();
    });
    const pct = await kp.done;
    return { pick, pct };
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    stage.draw((s) => {
      drawArea(s, p, answer ? answer.pick : null);
      const [bx, by] = centroid(p.polys[p.bigger]);
      const [sx, sy] = centroid(p.polys[1 - p.bigger]);
      s.text(bx, by, `+${TASKS.area.truthPct(p)}%`, { size: 0.065, fill: s.c.good });
      s.text(sx, sy, 'smaller', { size: 0.045, fill: s.c.muted });
    });
  },
};

// --- midpoint --------------------------------------------------------------------------------------

function fin(s, tip, ux, uy, outward, colour = s.c.ink) {
  const len = 0.05, t = 35 * DEG, dir = outward ? -1 : 1;
  for (const sg of [1, -1]) {
    const rx = dir * (ux * Math.cos(sg * t) - uy * Math.sin(sg * t)), ry = dir * (ux * Math.sin(sg * t) + uy * Math.cos(sg * t));
    s.line(tip, [tip[0] + rx * len, tip[1] + ry * len], { stroke: colour, width: 0.007 });
  }
}

function drawNoodle(s, p, colour = s.c.ink) {
  s.path(p.pts, false);
  s.ctx.strokeStyle = colour; s.ctx.lineWidth = 0.011; s.ctx.stroke();
  if (p.ends === 'fins') {
    const [a, a2] = [p.pts[0], p.pts[4]], [b, b2] = [p.pts[p.pts.length - 1], p.pts[p.pts.length - 5]];
    const ua = [a2[0] - a[0], a2[1] - a[1]], la = Math.hypot(...ua), ub = [b2[0] - b[0], b2[1] - b[1]], lb = Math.hypot(...ub);
    fin(s, a, ua[0] / la, ua[1] / la, false, colour); // arrowhead at one end
    fin(s, b, ub[0] / lb, ub[1] / lb, true, colour); // tail at the other
  }
}

/** Fraction (0..1) along the noodle of the point nearest (x, y). */
function nearestT(p, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const f = Math.max(0, Math.min(1, l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0));
    const ex = ax + f * dx - x, ey = ay + f * dy - y, dd = ex * ex + ey * ey;
    if (dd < bd) { bd = dd; best = mix(p.cum[i - 1], p.cum[i], f); }
  }
  return best;
}

function cross(s, x, y, colour, r = 0.022) {
  s.line([x - r, y - r], [x + r, y + r], { stroke: s.c.bg, width: 0.016 });
  s.line([x - r, y + r], [x + r, y - r], { stroke: s.c.bg, width: 0.016 });
  s.line([x - r, y - r], [x + r, y + r], { stroke: colour, width: 0.008 });
  s.line([x - r, y + r], [x + r, y - r], { stroke: colour, width: 0.008 });
}

/** The part of the noodle between fractions a and b. */
function noodleSlice(p, a, b) {
  const out = [pointAt(p, a)];
  p.cum.forEach((c, i) => { if (c > a && c < b) out.push(p.pts[i]); });
  out.push(pointAt(p, b));
  return out;
}

const midpoint = {
  async run({ stage, controls, task }) {
    const p = task.params;
    let at = null; // noodle: t; centre: [x, y]
    const btn = controls.button(p.sub === 'noodle' ? 'Drag the ✕ along the noodle' : 'Tap the shape first', { enabled: false });
    if (p.sub === 'noodle') at = 0.12 + 0.05 * (p.pts.length % 3); // start the ✕ near one end
    stage.draw((s) => {
      if (p.sub === 'noodle') { drawNoodle(s, p); const [x, y] = pointAt(p, at); cross(s, x, y, s.c.accent); }
      else { s.poly(p.poly, { fill: s.c.fill, stroke: s.c.ink, width: 0.005 }); if (at) s.marker(at[0], at[1], s.c.accent); }
    });
    stage.onPointer((x, y) => {
      at = p.sub === 'noodle' ? nearestT(p, x, y) : [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
      stage.redraw();
      btn.enable(true, 'Confirm');
    });
    await btn.done;
    return p.sub === 'noodle' ? { t: round4(at) } : { x: round4(at[0]), y: round4(at[1]) };
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    if (p.sub === 'centre') {
      stage.draw((s) => {
        s.poly(p.poly, { fill: s.c.fill, stroke: s.c.ink, width: 0.005 });
        if (answer) { s.line([answer.x, answer.y], p.truth, { stroke: s.c.muted, width: 0.003 }); s.marker(answer.x, answer.y, s.c.bad); }
        s.marker(p.truth[0], p.truth[1], s.c.good);
      });
      return null;
    }
    // trace both halves from the ends at the same speed: they meet in the true middle
    return stage.animate(1300, (s, t, raw) => {
      drawNoodle(s, p, s.c.faint);
      const h = 0.5 * t;
      for (const [a, b, col] of [[0, h, s.c.accent], [1 - h, 1, s.c.good]]) {
        if (b - a < 1e-4) continue;
        s.path(noodleSlice(p, a, b), false);
        s.ctx.strokeStyle = col; s.ctx.lineWidth = 0.013; s.ctx.stroke();
      }
      if (raw >= 1) {
        if (answer) { const [x, y] = pointAt(p, answer.t); cross(s, x, y, s.c.bad); }
        const [mx, my] = pointAt(p, 0.5);
        s.marker(mx, my, s.c.ink);
      }
    });
  },
};

// --- proportion ------------------------------------------------------------------------------------

function drawProportion(s, p) {
  s.poly(p.shape, { fill: s.c.empty });
  for (const piece of shadedPieces(p)) if (piece.length > 2) s.poly(piece, { fill: s.c.shade });
  s.poly(p.shape, { stroke: s.c.ink, width: 0.007 });
}

/** A small square of the 'coloured in' colour, so it's clear which part is which. */
const swatch = () => el('span', { class: 'swatch', 'aria-label': 'this colour' });

const proportion = {
  async run({ stage, controls, task, prompt }) {
    stage.draw((s) => drawProportion(s, task.params));
    prompt(el('span', {}, 'What % of the shape is coloured in ', swatch(), '?'));
    const unit = el('span', {}, '% ', swatch(), ' coloured');
    return controls.keypad({ unit, maxDigits: 3, max: 100, decimals: 1 }).done;
  },
  async reveal({ stage, task, answer }) {
    const p = task.params;
    // pour both parts into a pie of the same area: the coloured wedge is the true share
    const A = polyArea(p.shape), [cx, cy] = centroid(p.shape), r = Math.sqrt(A / Math.PI);
    const a0 = -Math.PI / 2;
    const M = 160;
    const outline = resample(p.shape, M, true);
    const circle = Array.from({ length: M }, (_, i) => { const t = a0 + (i / M) * Math.PI * 2; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
    const pieces = shadedPieces(p).filter((q) => q.length > 2);
    let start = a0;
    const targets = pieces.map((q) => {
      const span = (polyArea(q) / A) * Math.PI * 2, K = 90;
      const sector = [[cx, cy], ...Array.from({ length: K - 1 }, (_, i) => { const t = start + (i / (K - 2)) * span; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; })];
      start += span;
      return { from: resample(q, K, true), to: sector };
    });
    await wait(250);
    return stage.animate(1300, (s, t, raw) => {
      s.poly(lerpPts(outline, circle, t), { fill: s.c.empty, stroke: s.c.ink, width: 0.006 });
      for (const q of targets) s.poly(lerpPts(q.from, q.to, t), { fill: s.c.shade });
      if (raw >= 1) {
        if (answer !== null) {
          const g = a0 + (answer / 100) * Math.PI * 2;
          s.line([cx, cy], [cx + r * 1.12 * Math.cos(g), cy + r * 1.12 * Math.sin(g)], { stroke: s.c.bad, width: 0.007, dash: [0.02, 0.012] });
          s.line([cx, cy], [cx + r * 1.12 * Math.cos(a0), cy + r * 1.12 * Math.sin(a0)], { stroke: s.c.bad, width: 0.007, dash: [0.02, 0.012] });
        }
        const below = cy + r + 0.06 <= 0.96;
        s.text(cx, below ? cy + r + 0.05 : cy - r - 0.09, `${p.truth.toFixed(1)}% coloured`, { size: 0.055 });
        if (answer !== null) s.text(cx, below ? cy + r + 0.1 : cy - r - 0.04, `you said ${answer}%`, { size: 0.042, fill: s.c.bad, weight: 600 });
      }
    });
  },
};

// --- length ----------------------------------------------------------------------------------------

function drawLines(s, p, pick) {
  p.lines.forEach((l, i) => {
    s.path(l.pts, false);
    s.ctx.strokeStyle = i === pick ? s.c.accent : s.c.ink;
    s.ctx.lineWidth = i === pick ? 0.012 : 0.0075;
    s.ctx.stroke();
  });
}

function nearestLine(lines, x, y) {
  let best = null, bd = 0.08;
  lines.forEach((l, i) => {
    for (let k = 1; k < l.pts.length; k++) {
      const d = distToSegment(x, y, ...l.pts[k - 1], ...l.pts[k]);
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}

const length = {
  async run({ stage, controls, task }) {
    const p = task.params;
    let pick = null;
    const btn = controls.button('Tap a line first', { enabled: false });
    stage.draw((s) => drawLines(s, p, pick));
    stage.onPointer((x, y, type) => {
      if (type !== 'down') return;
      const i = nearestLine(p.lines, x, y);
      if (i === null) return;
      pick = i;
      stage.redraw();
      btn.enable(true, "That's the longest");
    });
    await btn.done;
    return pick;
  },
  async reveal({ stage, task, answer }) {
    const p = task.params;
    // unroll every line into a straight bar, longest at the top
    const n = p.lines.length, Lmax = p.lines[p.longest].L, k = 0.8 / Lmax, M = 120;
    const rank = p.lines.map((l, i) => [l.L, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const bars = p.lines.map((l, i) => {
      const y = 0.12 + (rank.indexOf(i) * 0.76) / (n - 1), len = l.L * k;
      return { from: resample(l.pts, M), to: Array.from({ length: M }, (_, j) => [0.07 + (j / (M - 1)) * len, y]), y, len, scale: mix(1, k, 0) };
    });
    await wait(200);
    return stage.animate(1500, (s, t, raw) => {
      bars.forEach((b, i) => {
        const pts = lerpPts(b.from, b.to.map(([x, y]) => [x, y]), t);
        // lengths shrink/grow smoothly to the common scale k as they straighten
        const cur = polylineLength(pts), want = mix(p.lines[i].L, b.len, t);
        const f = cur > 0 ? want / cur : 1, [ox, oy] = pts[0];
        const scaled = pts.map(([x, y]) => [ox + (x - ox) * f, oy + (y - oy) * f]);
        const col = i === p.longest ? s.c.good : i === answer ? s.c.bad : s.c.ink;
        s.path(scaled, false);
        s.ctx.strokeStyle = col; s.ctx.lineWidth = i === answer || i === p.longest ? 0.012 : 0.008; s.ctx.stroke();
        if (raw >= 1) {
          const pct = Math.round((p.lines[i].L / Lmax) * 1000) / 10;
          s.text(Math.min(0.93, 0.09 + b.len), b.y - 0.035, i === p.longest ? 'longest' : `${pct}%`, { size: 0.04, fill: col, align: 'right' });
        }
      });
    });
  },
};

// --- timing ----------------------------------------------------------------------------------------

const timing = {
  async run({ stage, controls, task, prompt }) {
    const p = task.params;
    let state = 'ready', t0 = 0, pulseUntil = 0, flick = false;
    const draw = (s) => {
      const now = performance.now();
      if (p.flicker && state === 'running' && flick) { s.ctx.fillStyle = s.c.faint; s.ctx.fillRect(0, 0, 1, 1); }
      if (state === 'running' && now < pulseUntil) s.circle(0.5, 0.5, 0.36, { stroke: s.c.muted, width: 0.012 });
      s.circle(0.5, 0.5, 0.25, { fill: state === 'running' ? s.c.bad : s.c.accent });
      s.text(0.5, 0.5, state === 'running' ? 'Stop' : 'Start', { size: 0.08, fill: '#fff', halo: false });
    };
    stage.draw(draw);
    controls.note(`Start, then stop after exactly ${p.seconds} seconds. No counting aloud!`);
    const timers = [];
    const ms = await new Promise((resolve) => {
      const hit = () => {
        if (state === 'ready') {
          state = 'running'; t0 = performance.now();
          prompt(`Stop at ${p.seconds} s`);
          for (const at of p.pulses) timers.push(setTimeout(() => { pulseUntil = performance.now() + 140; stage.redraw(); setTimeout(() => stage.redraw(), 150); }, at));
          if (p.flicker) timers.push(setInterval(() => { flick = !flick; stage.redraw(); }, 55));
          timers.push(setTimeout(() => hit(), 30000)); // nobody waits this long: stop for them
          stage.redraw();
        } else if (state === 'running') {
          state = 'done';
          resolve(Math.round(performance.now() - t0));
        }
      };
      stage.onPointer((x, y, type) => { if (type === 'down') hit(); });
      controls.listenKeys((e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) hit(); } });
    });
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    return ms;
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    stage.draw((s) => {
      s.text(0.5, 0.4, answer === null ? '—' : `${(answer / 1000).toFixed(2)} s`, { size: 0.13 });
      s.text(0.5, 0.56, `target ${p.seconds} s`, { size: 0.055, fill: s.c.muted, weight: 600 });
    });
  },
};

// --- colour ----------------------------------------------------------------------------------------

function swatchSpots(p) {
  const rng = new Rng(p.seed);
  const n = p.palette.length, rot = rng.next() * Math.PI * 2;
  const R = n > 6 ? 0.28 : 0.25;
  return p.colours.map((_, i) => {
    const t = rot + (i / n) * Math.PI * 2 + (rng.next() - 0.5) * 0.25;
    return [0.5 + R * Math.cos(t) * 1.25, 0.665 + R * Math.sin(t) * 0.92, 0.066];
  });
}

function drawColour(s, p, { sample = true, palette = true, pick = null, revealed = false } = {}) {
  if (sample) {
    if (p.surround) s.poly([[0.3, 0.02], [0.7, 0.02], [0.7, 0.27], [0.3, 0.27]], { fill: p.surround });
    s.circle(0.5, 0.145, 0.09, { fill: p.sample });
  }
  if (!palette) return;
  swatchSpots(p).forEach(([x, y, r], i) => {
    s.circle(x, y, r, { fill: p.colours[i] });
    if (revealed && i === p.answer) s.circle(x, y, r + 0.014, { stroke: s.c.good, width: 0.01 });
    else if (i === pick) s.circle(x, y, r + 0.014, { stroke: revealed ? s.c.bad : s.c.ink, width: 0.008 });
  });
}

const colour = {
  async run({ stage, controls, task, prompt }) {
    const p = task.params;
    let pick = null, palette = !p.memory;
    stage.draw((s) => drawColour(s, p, { sample: !p.memory || !palette, palette, pick }));
    const btn = controls.button(p.memory ? 'Remember the colour…' : 'Tap a colour first', { enabled: false });
    if (p.memory) {
      await frame(); await wait(p.memoryMs);
      palette = true;
      prompt('Tap the colour you saw');
      btn.enable(false, 'Tap a colour first');
      stage.redraw();
    }
    const spots = swatchSpots(p);
    if (window.__debug) window.__swatches = spots; // tools/e2e-ui.mjs taps these
    stage.onPointer((x, y, type) => {
      if (type !== 'down' || !palette) return;
      const i = spots.findIndex(([sx, sy, r]) => Math.hypot(sx - x, sy - y) < r * 1.3);
      if (i < 0) return;
      pick = i;
      stage.redraw();
      btn.enable(true, "That's the one");
    });
    await btn.done;
    return pick;
  },
  reveal({ stage, task, answer }) {
    stage.draw((s) => drawColour(s, task.params, { pick: answer, revealed: true }));
  },
};

export const RENDERERS = { count, angle, area, midpoint, proportion, length, timing, colour };
export { DOT_COLOURS };
