import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EPOCH, addDays, dayDifficulty, weekday } from '../site/js/daily.js';
import { dayDigest, displayData } from '../site/js/digest.js';
import { area } from '../site/js/geometry.js';
import { dayPlan, practiceTask } from '../site/js/plan.js';
import { TASKS } from '../site/js/tasks/index.js';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'));
const DAYS = Array.from({ length: 120 }, (_, i) => addDays(EPOCH, i));

test('same date gives identical tasks (twice in a row, and the recorded golden digests)', () => {
  for (const d of DAYS.slice(0, 30)) assert.equal(JSON.stringify(dayPlan(d)), JSON.stringify(dayPlan(d)));
  let n = 0;
  for (const [d, h] of Object.entries(golden.days)) { assert.equal(dayDigest(d), h, `day ${d} changed`); n++; }
  assert.ok(n >= 365, 'golden covers a year');
});

test('different dates give different tasks', () => {
  const seen = new Set(DAYS.map((d) => JSON.stringify(dayPlan(d).tasks)));
  assert.equal(seen.size, DAYS.length);
});

test('every day: all 8 types once each, order varies; Sunday has exactly one illusion special; difficulty by weekday', () => {
  const counts = {};
  for (const d of DAYS) {
    const p = dayPlan(d);
    assert.equal(p.tasks.length, 8);
    assert.equal(new Set(p.tasks.map((t) => t.type)).size, 8);
    const specials = p.tasks.filter((t) => t.illusion);
    if (weekday(d) === 0) {
      assert.equal(specials.length, 1, d);
      assert.ok(TASKS[specials[0].type].illusionCapable);
    } else assert.equal(specials.length, 0, d);
    assert.equal(p.difficulty, dayDifficulty(d));
    for (const t of p.tasks) counts[t.type] = (counts[t.type] || 0) + 1;
  }
  assert.deepEqual(dayDifficulty('2026-10-12'), 0); // Monday
  assert.deepEqual(dayDifficulty('2026-10-14'), 0.4); // Wednesday
  assert.deepEqual(dayDifficulty('2026-10-17'), 1); // Saturday
  assert.deepEqual(dayDifficulty('2026-10-11'), 0.5); // Sunday
  for (const t of Object.keys(TASKS)) assert.equal(counts[t], DAYS.length, t);
  // the order changes day to day: each type opens the day sometimes
  const firsts = new Set(DAYS.map((d) => dayPlan(d).tasks[0].type));
  assert.equal(firsts.size, 8);
});

test('count: 20-400 dots in 2-3 kinds, laid out without overlaps, inside the stage, exactly n, true %', () => {
  for (let s = 0; s < 60; s++) {
    const d = (s % 6) / 5;
    const t = practiceTask(s, { type: 'count', difficulty: d, illusion: s % 7 === 0 });
    const p = t.params;
    assert.ok(p.n >= 20 && p.n <= 400, String(p.n));
    const { dots } = TASKS.count.layout(p);
    assert.equal(dots.length, p.n);
    assert.equal(p.counts.reduce((a, b) => a + b, 0), p.n);
    assert.equal(dots.filter((q) => q.cat === 0).length, p.counts[0]);
    assert.ok(Math.abs(p.pct - (100 * p.counts[0]) / p.n) <= 0.05 && p.counts.every((c) => c >= 1));
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      assert.ok(a.x > 0.02 && a.x < 0.98 && a.y > 0.02 && a.y < 0.98);
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r, 'dots overlap');
      }
    }
  }
  // Monday stays small, Saturday can go large
  const mon = Array.from({ length: 200 }, (_, s) => practiceTask(s, { type: 'count', difficulty: 0 }).params.n);
  const sat = Array.from({ length: 200 }, (_, s) => practiceTask(s, { type: 'count', difficulty: 1 }).params.n);
  assert.ok(Math.max(...mon) <= 70 && Math.max(...sat) > 300);
});

test('angle, area, midpoint, proportion, length, timing, colour: parameters in range and on stage', () => {
  for (let s = 0; s < 300; s++) {
    const d = (s % 6) / 5, illusion = s % 5 === 0;
    const a = practiceTask(s, { type: 'angle', difficulty: d, illusion }).params;
    assert.ok(a.angle >= 10 && a.angle <= 170, `angle ${a.angle}`);
    assert.ok(a.tilt >= 0 && a.tilt <= 65 && (d < 0.15 || a.tilt >= 15));

    const ar = practiceTask(s, { type: 'area', difficulty: d, illusion }).params;
    assert.ok(ar.ratio > 1.05 && ar.ratio < 1.91, `ratio ${ar.ratio}`);
    assert.ok(Math.abs(area(ar.polys[ar.bigger]) / area(ar.polys[1 - ar.bigger]) - ar.ratio) < 1e-12);
    for (const poly of ar.polys) for (const [x, y] of poly) assert.ok(x > 0 && x < 1 && y > 0 && y < 1);

    const m = practiceTask(s, { type: 'midpoint', difficulty: d, illusion }).params;
    if (m.sub === 'centre') assert.ok(m.truth.every((v) => v > 0.05 && v < 0.95));
    else {
      assert.ok(m.pts.every(([x, y]) => x >= 0.06 && x <= 0.94 && y >= 0.06 && y <= 0.94));
      assert.ok(m.cum[0] === 0 && Math.abs(m.cum.at(-1) - 1) < 1e-12 && m.cum.every((c, i) => i === 0 || c > m.cum[i - 1]));
    }

    const pr = practiceTask(s, { type: 'proportion', difficulty: d }).params;
    assert.ok(pr.truth > 5 && pr.truth < 95 && Math.round(pr.truth * 10) / 10 === pr.truth, `proportion ${pr.truth}`);

    const l = practiceTask(s, { type: 'length', difficulty: d, illusion }).params;
    const Ls = l.lines.map((g) => g.L);
    assert.equal(Math.max(...Ls), Ls[l.longest]);
    assert.equal(new Set(Ls).size, Ls.length);
    assert.equal(Ls.length, d < 0.35 ? 4 : d < 0.7 ? 5 : 6);
    const sorted = [...Ls].sort((x, y) => y - x);
    assert.ok(sorted[1] / sorted[0] < 1 - (d >= 0.7 ? 0.02 : 0.05), 'runner-up clearly shorter');
    for (const g of l.lines) assert.ok(g.pts.every(([x, y]) => x > 0.02 && x < 0.98 && y > 0.02 && y < 0.98));

    const tm = practiceTask(s, { type: 'timing', difficulty: d, illusion }).params;
    assert.ok(tm.seconds >= 3 && tm.seconds <= 9);

    const c = practiceTask(s, { type: 'colour', difficulty: d, illusion }).params;
    assert.ok(c.palette.length >= 6 && new Set(c.colours).size === c.palette.length);
    assert.equal(c.colours[c.answer], c.sample);
  }
});

test('the display data (layouts) is deterministic too', () => {
  for (const d of DAYS.slice(0, 14)) {
    const p = dayPlan(d);
    assert.equal(JSON.stringify(displayData(p)), JSON.stringify(displayData(dayPlan(d))));
  }
});

test('generators and scorers never use engine-dependent Math functions', () => {
  const files = ['plan.js', 'geometry.js', 'colour.js', 'scoring.js', 'daily.js', 'rng.js', 'digest.js',
    ...fs.readdirSync(new URL('../site/js/tasks/', import.meta.url)).map((f) => `tasks/${f}`)];
  const bad = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt|sinh|cosh|tanh|random)\b|[\w)\]]\s*\*\*\s*[\w(]/;
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../site/js/${f}`, import.meta.url), 'utf8')
      .split('\n').filter((line) => !line.trim().startsWith('//') && !line.includes('freshSeed') && !line.includes('Math.random() * 2'));
    src.forEach((line, i) => assert.ok(!bad.test(line), `${f}:${i + 1} uses ${line.match(bad)?.[0]}: ${line.trim()}`));
  }
});
