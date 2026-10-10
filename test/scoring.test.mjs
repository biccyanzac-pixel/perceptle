import test from 'node:test';
import assert from 'node:assert/strict';
import { CURVES, curveScore, errorFor, scoreBlock } from '../site/js/scoring.js';
import { practiceTask } from '../site/js/plan.js';
import { TASKS } from '../site/js/tasks/index.js';

test('curve: 100 within "full", 50 at "half", 20 at twice the distance, 0 for nonsense', () => {
  const c = { full: 1, half: 9, k: 2 };
  assert.equal(curveScore(0, c), 100);
  assert.equal(curveScore(1, c), 100);
  assert.equal(curveScore(9, c), 50);
  assert.equal(curveScore(17, c), 20);
  assert.equal(curveScore(Infinity, c), 0);
  assert.equal(curveScore(NaN, c), 0);
  assert.equal(curveScore(-1, c), 0);
  for (const [name, curve] of Object.entries(CURVES)) {
    let prev = 101;
    for (let e = 0; e < curve.half * 6; e += curve.half / 50) {
      const s = curveScore(e, curve);
      assert.ok(s <= prev && s >= 0 && s <= 100, name);
      prev = s;
    }
    assert.ok(Math.abs(errorFor(50, curve) - curve.half) < 1e-12);
  }
  assert.equal(scoreBlock(95), '🟩');
  assert.equal(scoreBlock(10), '🟥');
});

test('count: log-scale error, so the same % off scores the same at 30 and 300', () => {
  const p30 = { n: 30 }, p300 = { n: 300 };
  assert.equal(TASKS.count.score(p30, 33).points, TASKS.count.score(p300, 330).points);
  assert.equal(TASKS.count.score(p30, 30).points, 100);
  assert.ok(Math.abs(TASKS.count.score(p300, 330).err - Math.log(1.1)) < 1e-12);
  // over- and under-estimating by the same factor score the same
  assert.equal(TASKS.count.score(p300, 600).points, TASKS.count.score(p300, 150).points);
  assert.equal(TASKS.count.score(p300, 0).points, 0);
  assert.equal(TASKS.count.score(p300, null).points, 0);
  assert.equal(TASKS.count.score(p300, 1.5).points, 0); // not an integer: rejected
});

test('angle: absolute degrees', () => {
  const p = { angle: 73.4 };
  assert.equal(TASKS.angle.score(p, 73).points, 100);
  assert.ok(Math.abs(TASKS.angle.score(p, 81).err - 7.6) < 1e-9);
  assert.equal(TASKS.angle.score({ angle: 73 }, 66).points, TASKS.angle.score({ angle: 73 }, 80).points);
  assert.equal(TASKS.angle.score(p, 400).points, 0);
});

test('area: ratio error; picking the smaller shape is scored through the same formula', () => {
  const p = { bigger: 1, ratio: 1.3 };
  assert.equal(TASKS.area.score(p, { pick: 1, pct: 30 }).points, 100);
  const right = TASKS.area.score(p, { pick: 1, pct: 10 }).err;
  assert.ok(Math.abs(right - Math.log(1.3 / 1.1)) < 1e-12);
  const wrong = TASKS.area.score(p, { pick: 0, pct: 10 }).err;
  assert.ok(Math.abs(wrong - Math.log(1.3 * 1.1)) < 1e-12);
  assert.ok(TASKS.area.score(p, { pick: 0, pct: 30 }).points < TASKS.area.score(p, { pick: 1, pct: 0 }).points);
});

test('midpoint: error is relative to the shape size, so it is the same on any screen', () => {
  const small = { sub: 'line', truth: [0.5, 0.5], size: 0.4 };
  const big = { sub: 'line', truth: [0.5, 0.5], size: 0.8 };
  assert.equal(TASKS.midpoint.score(small, { x: 0.51, y: 0.5 }).points, TASKS.midpoint.score(big, { x: 0.52, y: 0.5 }).points);
  assert.equal(TASKS.midpoint.score(small, { x: 0.5, y: 0.5 }).points, 100);
  assert.ok(Math.abs(TASKS.midpoint.score(small, { x: 0.53, y: 0.54 }).err - 0.05 / 0.4) < 1e-12);
  const c = { sub: 'centre', truth: [0.4, 0.6], size: 0.5 };
  assert.equal(TASKS.midpoint.score(c, { x: 0.4 + 0.5 * CURVES['midpoint.centre'].half, y: 0.6 }).points, 50);
  assert.equal(TASKS.midpoint.score(c, { x: 'a', y: 0 }).points, 0);
});

test('proportion, length, timing, colour', () => {
  assert.equal(TASKS.proportion.score({ truth: 37.2 }, 37).points, 100);
  assert.equal(TASKS.proportion.score({ truth: 30 }, 30 + CURVES.proportion.half).points, 50);
  const l = { longest: 2, segs: [{ L: 0.3 }, { L: 0.35 }, { L: 0.4 }] };
  assert.equal(TASKS.length.score(l, 2).points, 100);
  assert.ok(TASKS.length.score(l, 1).points > TASKS.length.score(l, 0).points);
  assert.ok(Math.abs(TASKS.length.score(l, 1).err - Math.log(0.4 / 0.35)) < 1e-12);
  assert.equal(TASKS.timing.score({ seconds: 5 }, 5000).points, 100);
  assert.equal(TASKS.timing.score({ seconds: 5 }, 5500).points, TASKS.timing.score({ seconds: 5 }, 4500).points);
  assert.equal(TASKS.timing.score({ seconds: 5 }, 5000 * (1 + CURVES.timing.half)).points, 50);
  const col = practiceTask(3, { type: 'colour', difficulty: 0.4 }).params;
  assert.equal(TASKS.colour.score(col, col.answer).points, 100);
  const wrong = (col.answer + 1) % col.palette.length;
  assert.ok(TASKS.colour.score(col, wrong).points < 100);
  assert.equal(TASKS.colour.score(col, 99).points, 0);
});
