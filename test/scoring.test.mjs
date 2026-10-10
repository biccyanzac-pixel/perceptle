import test from 'node:test';
import assert from 'node:assert/strict';
import { CURVES, SPEED, SPEED_WEIGHT, curveScore, errorFor, scoreBlock, speedFactor, withSpeed } from '../site/js/scoring.js';
import { practiceTask, scoreTask } from '../site/js/plan.js';
import { TASKS } from '../site/js/tasks/index.js';

const acc = (type, p, a) => TASKS[type].score(p, a).acc;

test('curve: 100 only when exact, 50 at "half", 20 at twice, never 0 for a real answer', () => {
  const c = { half: 9, k: 2 };
  assert.equal(curveScore(0, c), 100);
  assert.ok(curveScore(0.01, c) < 100);
  assert.equal(curveScore(9, c), 50);
  assert.equal(curveScore(18, c), 20);
  assert.ok(curveScore(900, c) > 0);
  assert.equal(curveScore(Infinity, c), 0);
  assert.equal(curveScore(NaN, c), 0);
  assert.equal(curveScore(-1, c), 0);
  for (const [name, curve] of Object.entries(CURVES)) {
    let prev = 101;
    for (let e = 0; e < curve.half * 6; e += curve.half / 50) {
      const s = curveScore(e, curve);
      assert.ok(s <= prev && s > 0 && s <= 100, name);
      prev = s;
    }
    assert.ok(Math.abs(errorFor(50, curve) - curve.half) < 1e-12);
  }
  assert.equal(scoreBlock(95), '🟩');
  assert.equal(scoreBlock(10), '🟥');
});

test('speed: perfect and fast = 100, perfect and slow = 85, timing has no speed part; 2 dp', () => {
  assert.equal(speedFactor('angle', SPEED.angle.fast), 1);
  assert.equal(speedFactor('angle', SPEED.angle.slow), 0);
  assert.equal(speedFactor('angle', (SPEED.angle.fast + SPEED.angle.slow) / 2), 0.5);
  assert.equal(withSpeed('angle', 100, 1000), 100);
  assert.equal(withSpeed('angle', 100, 999999), 100 * (1 - SPEED_WEIGHT));
  assert.equal(withSpeed('angle', 100, null), 85); // no time reported: no bonus
  assert.equal(withSpeed('timing', 73.456, 999999), 73.46);
  const v = withSpeed('area', 77.777, 7000);
  assert.equal(Math.round(v * 100) / 100, v);
  const t = practiceTask(1, { type: 'angle' });
  assert.equal(scoreTask(t, null, 100).points, 0);
  const exact = Math.round(t.params.angle);
  const fast = scoreTask(t, exact, 1000), slow = scoreTask(t, exact, 60000);
  assert.ok(fast.points > slow.points && slow.points === Math.round(slow.acc * 85) / 100);
});

test('count: log-scale on the total (same % off scores the same at 30 and 300) plus the % question', () => {
  const p30 = { n: 30, pct: 40 }, p300 = { n: 300, pct: 40 };
  assert.equal(acc('count', p30, { n: 33, pct: 40 }), acc('count', p300, { n: 330, pct: 40 }));
  assert.equal(acc('count', p300, { n: 300, pct: 40 }), 100);
  assert.ok(acc('count', p300, { n: 300, pct: 45 }) < 100);
  assert.equal(acc('count', p300, { n: 600, pct: 40 }), acc('count', p300, { n: 150, pct: 40 }));
  const r = TASKS.count.score(p300, { n: 330, pct: 31 });
  assert.ok(Math.abs(r.parts[0].err - Math.log(1.1)) < 1e-12 && r.parts[1].err === 9);
  assert.equal(TASKS.count.score(p300, null).acc, 0);
  assert.equal(TASKS.count.score(p300, { n: 1.5, pct: 3 }).acc, 0);
  assert.equal(TASKS.count.score(p300, 300).acc, 0); // old answer format: rejected
});

test('angle: absolute degrees', () => {
  const p = { angle: 73.4 };
  assert.ok(acc('angle', p, 73) < 100 && acc('angle', p, 73) > 99);
  assert.ok(Math.abs(TASKS.angle.score(p, 81).err - 7.6) < 1e-9);
  assert.equal(acc('angle', { angle: 73 }, 66), acc('angle', { angle: 73 }, 80));
});

test('area: ratio error; picking the smaller shape is scored through the same formula', () => {
  const p = { bigger: 1, ratio: 1.3 };
  assert.equal(acc('area', p, { pick: 1, pct: 30 }), 100);
  assert.ok(Math.abs(TASKS.area.score(p, { pick: 1, pct: 10 }).err - Math.log(1.3 / 1.1)) < 1e-12);
  assert.ok(Math.abs(TASKS.area.score(p, { pick: 0, pct: 10 }).err - Math.log(1.3 * 1.1)) < 1e-12);
  assert.ok(acc('area', p, { pick: 0, pct: 30 }) < acc('area', p, { pick: 1, pct: 0 }));
});

test('midpoint: noodle by fraction of length, centre relative to size (screen independent)', () => {
  const noodle = { sub: 'noodle' };
  assert.equal(acc('midpoint', noodle, { t: 0.5 }), 100);
  assert.equal(acc('midpoint', noodle, { t: 0.5 + CURVES['midpoint.noodle'].half }), 50);
  assert.equal(acc('midpoint', noodle, { t: 0.4 }), acc('midpoint', noodle, { t: 0.6 }));
  assert.equal(acc('midpoint', noodle, { x: 0.5, y: 0.5 }), 0); // wrong answer shape
  const small = { sub: 'centre', truth: [0.5, 0.5], size: 0.4 }, big = { sub: 'centre', truth: [0.5, 0.5], size: 0.8 };
  assert.equal(acc('midpoint', small, { x: 0.51, y: 0.5 }), acc('midpoint', big, { x: 0.52, y: 0.5 }));
  assert.equal(acc('midpoint', small, { x: 0.5 + 0.4 * CURVES['midpoint.centre'].half, y: 0.5 }), 50);
  assert.equal(acc('midpoint', small, { x: 'a', y: 0 }), 0);
});

test('proportion, length, timing, colour', () => {
  assert.ok(acc('proportion', { truth: 37.2 }, 37) > 99 && acc('proportion', { truth: 37.2 }, 37) < 100);
  assert.equal(acc('proportion', { truth: 30 }, 30 + CURVES.proportion.half), 50);
  const l = { longest: 2, lines: [{ L: 0.3 }, { L: 0.35 }, { L: 0.4 }] };
  assert.equal(acc('length', l, 2), 100);
  assert.ok(acc('length', l, 1) > acc('length', l, 0));
  assert.equal(acc('length', l, 5), 0);
  assert.equal(acc('timing', { seconds: 5 }, 5000), 100);
  assert.equal(acc('timing', { seconds: 5 }, 5500), acc('timing', { seconds: 5 }, 4500));
  const col = practiceTask(3, { type: 'colour', difficulty: 0.4 }).params;
  assert.equal(acc('colour', col, col.answer), 100);
  assert.ok(acc('colour', col, (col.answer + 1) % col.palette.length) < 100);
  assert.equal(acc('colour', col, 99), 0);
});
