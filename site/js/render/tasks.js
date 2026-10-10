// Drawing and input for each task type. run() shows the task and resolves with the answer; reveal() redraws it
// with the truth marked. Everything is drawn in stage units, so it looks the same on every screen.
// Display-only code: Math.* is fine here (it never decides a task or a score).
import { centroid, distToSegment, pointInPolygon } from '../geometry.js';
import { Rng } from '../rng.js';
import { TASKS } from '../tasks/index.js';
import { shadedPieces } from '../tasks/proportion.js';

const DEG = Math.PI / 180;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const round4 = (v) => Math.round(v * 1e4) / 1e4;

// --- count -----------------------------------------------------------------------------------------

function drawDots(s, L, colour) {
  for (const [i, j] of L.links) s.line([L.dots[i].x, L.dots[i].y], [L.dots[j].x, L.dots[j].y], { stroke: colour, width: 0.0035 });
  const { ctx } = s;
  for (const d of L.dots) {
    if (d.kind === 'dot') s.circle(d.x, d.y, d.r, { fill: colour });
    else if (d.kind === 'ring') s.circle(d.x, d.y, d.r * 0.78, { stroke: colour, width: d.r * 0.45 });
    else {
      const k = d.kind === 'square' ? 4 : 3, rr = d.kind === 'square' ? d.r * 1.15 : d.r * 1.25;
      const pts = Array.from({ length: k }, (_, i) => {
        const t = d.rot * Math.PI * 2 + (i * Math.PI * 2) / k;
        return [d.x + rr * Math.cos(t), d.y + rr * Math.sin(t)];
      });
      s.poly(pts, { fill: colour });
    }
  }
  ctx.globalAlpha = 1;
}

const count = {
  async run({ stage, controls, task }) {
    const p = task.params;
    const L = TASKS.count.layout(p);
    stage.draw((s) => drawDots(s, L, s.c.ink));
    const kp = controls.keypad({ unit: 'dots', maxDigits: 3 });
    let hidden = false;
    const hide = () => { if (!hidden) { hidden = true; stage.draw((s) => s.text(0.5, 0.5, '?', { size: 0.22, fill: s.c.faint, halo: false })); } };
    frame().then(() => wait(p.exposureMs)).then(hide);
    const a = await kp.done;
    hide();
    return a;
  },
  reveal({ stage, task }) {
    const L = TASKS.count.layout(task.params);
    stage.draw((s) => { drawDots(s, L, s.c.muted); s.text(0.5, 0.5, String(task.params.n), { size: 0.16 }); });
  },
};

// --- angle -----------------------------------------------------------------------------------------

function angleGeom(p) {
  const V = [p.vx, p.vy];
  const e1 = [V[0] + p.l1 * Math.cos(p.rot * DEG), V[1] - p.l1 * Math.sin(p.rot * DEG)];
  const e2 = [V[0] + p.l2 * Math.cos((p.rot + p.angle) * DEG), V[1] - p.l2 * Math.sin((p.rot + p.angle) * DEG)];
  return { V, e1, e2 };
}

function drawAngle(s, p) {
  const { V, e1, e2 } = angleGeom(p);
  if (p.illusion) { // Zöllner-style hatching across both arms, tilted opposite ways
    [[e1, 1], [e2, -1]].forEach(([e, sign]) => {
      const L = Math.hypot(e[0] - V[0], e[1] - V[1]);
      const ux = (e[0] - V[0]) / L, uy = (e[1] - V[1]) / L;
      const t = 40 * DEG * sign, hx = ux * Math.cos(t) - uy * Math.sin(t), hy = ux * Math.sin(t) + uy * Math.cos(t);
      for (let d = 0.09; d < L - 0.01; d += 0.04) {
        const c = [V[0] + ux * d, V[1] + uy * d];
        s.line([c[0] - hx * 0.03, c[1] - hy * 0.03], [c[0] + hx * 0.03, c[1] + hy * 0.03], { stroke: s.c.muted, width: 0.004 });
      }
    });
  }
  const { ctx } = s;
  ctx.beginPath();
  ctx.arc(V[0], V[1], 0.06, -p.rot * DEG, -(p.rot + p.angle) * DEG, true);
  ctx.strokeStyle = s.c.accent; ctx.lineWidth = 0.006; ctx.stroke();
  s.line(V, e1, { width: 0.009 });
  s.line(V, e2, { width: 0.009 });
  s.circle(V[0], V[1], 0.008, { fill: s.c.ink });
}

const angle = {
  async run({ stage, controls, task }) {
    stage.draw((s) => drawAngle(s, task.params));
    return controls.keypad({ unit: '°', maxDigits: 3, max: 360 }).done;
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    stage.draw((s) => {
      drawAngle(s, p);
      const { V } = angleGeom(p);
      if (answer !== null) {
        const L = Math.max(p.l1, p.l2);
        const g = [V[0] + L * Math.cos((p.rot + answer) * DEG), V[1] - L * Math.sin((p.rot + answer) * DEG)];
        s.line(V, g, { stroke: s.c.bad, width: 0.006, dash: [0.02, 0.015] });
      }
      const mid = (p.rot + p.angle / 2) * DEG;
      s.text(V[0] + 0.13 * Math.cos(mid), V[1] - 0.13 * Math.sin(mid), `${p.angle}°`, { size: 0.06, fill: s.c.good });
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
    const kp = controls.keypad({ unit: '% bigger', maxDigits: 3, ready: () => pick !== null });
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

function fin(s, tip, ux, uy, outward) {
  const len = 0.06, t = 35 * DEG, dir = outward ? -1 : 1;
  for (const sg of [1, -1]) {
    const rx = dir * (ux * Math.cos(sg * t) - uy * Math.sin(sg * t)), ry = dir * (ux * Math.sin(sg * t) + uy * Math.cos(sg * t));
    s.line(tip, [tip[0] + rx * len, tip[1] + ry * len], { width: 0.007 });
  }
}

function drawMidpoint(s, p) {
  if (p.sub === 'centre') { s.poly(p.poly, { fill: s.c.fill, stroke: s.c.ink, width: 0.005 }); return; }
  const [a, b] = p.flip ? [p.b, p.a] : [p.a, p.b];
  s.line(a, b, { width: 0.009 });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  if (p.ends === 'caps') {
    s.circle(a[0], a[1], 0.03, { fill: s.c.ink });
    s.line([b[0] - uy * 0.015, b[1] + ux * 0.015], [b[0] + uy * 0.015, b[1] - ux * 0.015], { width: 0.006 });
  } else if (p.ends === 'fins') {
    fin(s, a, ux, uy, false); // arrowhead at a: <---
    fin(s, b, -ux, -uy, true); // tail at b:    --->-
  }
}

const midpoint = {
  async run({ stage, controls, task }) {
    const p = task.params;
    let at = null;
    const btn = controls.button('Tap the stage first', { enabled: false });
    stage.draw((s) => { drawMidpoint(s, p); if (at) s.marker(at[0], at[1], s.c.accent); });
    stage.onPointer((x, y) => {
      at = [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
      stage.redraw();
      btn.enable(true, 'Confirm');
    });
    await btn.done;
    return { x: round4(at[0]), y: round4(at[1]) };
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    stage.draw((s) => {
      drawMidpoint(s, p);
      if (answer) { s.line([answer.x, answer.y], p.truth, { stroke: s.c.muted, width: 0.003 }); s.marker(answer.x, answer.y, s.c.bad); }
      s.marker(p.truth[0], p.truth[1], s.c.good);
    });
  },
};

// --- proportion ------------------------------------------------------------------------------------

function drawProportion(s, p) {
  s.poly(p.shape, { fill: s.c.fill });
  for (const piece of shadedPieces(p)) if (piece.length > 2) s.poly(piece, { fill: s.c.shade });
  s.poly(p.shape, { stroke: s.c.ink, width: 0.006 });
}

const proportion = {
  async run({ stage, controls, task }) {
    stage.draw((s) => drawProportion(s, task.params));
    return controls.keypad({ unit: '% shaded', maxDigits: 3, max: 100 }).done;
  },
  reveal({ stage, task }) {
    stage.draw((s) => { drawProportion(s, task.params); s.text(0.5, 0.5, `${Math.round(task.params.truth * 10) / 10}%`, { size: 0.09 }); });
  },
};

// --- length ----------------------------------------------------------------------------------------

function drawLength(s, p, pick, revealed = false) {
  for (const d of p.distractors) {
    const o = { stroke: s.c.muted, width: 0.004 };
    if (d.kind === 'circle') s.circle(d.x, d.y, d.r, o);
    else if (d.kind === 'bar') {
      const t = d.rot * Math.PI;
      s.line([d.x - d.r * Math.cos(t), d.y - d.r * Math.sin(t)], [d.x + d.r * Math.cos(t), d.y + d.r * Math.sin(t)], o);
    } else {
      const k = d.kind === 'square' ? 4 : 3;
      s.poly(Array.from({ length: k }, (_, i) => {
        const t = d.rot * Math.PI * 2 + (i * Math.PI * 2) / k;
        return [d.x + d.r * Math.cos(t), d.y + d.r * Math.sin(t)];
      }), o);
    }
  }
  p.segs.forEach((g, i) => {
    const colour = revealed && i === p.longest ? s.c.good : i === pick ? s.c.accent : s.c.ink;
    const L = g.L, ux = (g.b[0] - g.a[0]) / L, uy = (g.b[1] - g.a[1]) / L;
    s.line(g.a, g.b, { stroke: colour, width: i === pick ? 0.013 : 0.009 });
    const save = s.c.ink;
    s.c.ink = colour;
    if (g.fins === 'heads') { fin(s, g.a, ux, uy, false); fin(s, g.b, -ux, -uy, false); }
    if (g.fins === 'tails') { fin(s, g.a, ux, uy, true); fin(s, g.b, -ux, -uy, true); }
    s.c.ink = save;
  });
}

function nearestSeg(segs, x, y) {
  let best = null, bd = 0.12;
  segs.forEach((g, i) => { const d = distToSegment(x, y, ...g.a, ...g.b); if (d < bd) { bd = d; best = i; } });
  return best;
}

const length = {
  async run({ stage, controls, task }) {
    const p = task.params;
    let pick = null;
    const btn = controls.button('Tap a line first', { enabled: false });
    stage.draw((s) => drawLength(s, p, pick));
    stage.onPointer((x, y, type) => {
      if (type !== 'down') return;
      const i = nearestSeg(p.segs, x, y);
      if (i === null) return;
      pick = i;
      stage.redraw();
      btn.enable(true, "That's the longest");
    });
    await btn.done;
    return pick;
  },
  reveal({ stage, task, answer }) {
    const p = task.params;
    stage.draw((s) => {
      drawLength(s, p, answer, true);
      const Lmax = p.segs[p.longest].L;
      p.segs.forEach((g, i) => {
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
        const pct = Math.round((g.L / Lmax) * 1000) / 10;
        s.text(mx, my - 0.045, i === p.longest ? 'longest' : `${pct}%`, { size: 0.042, fill: i === p.longest ? s.c.good : s.c.muted });
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
