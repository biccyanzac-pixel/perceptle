import test from 'node:test';
import assert from 'node:assert/strict';
import * as dm from '../site/js/dmath.js';
import { Rng, hashString, mulberry32 } from '../site/js/rng.js';

const close = (a, b, tol = 1e-13) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('deterministic sin/cos match Math within 1e-13', () => {
  for (let x = -40; x <= 40; x += 0.0137) {
    assert.ok(close(dm.sin(x), Math.sin(x)), `sin ${x}`);
    assert.ok(close(dm.cos(x), Math.cos(x)), `cos ${x}`);
  }
  assert.equal(dm.sin(0), 0);
  assert.equal(dm.cos(0), 1);
});

test('deterministic exp/log/pow/cbrt match Math', () => {
  for (let x = -30; x <= 30; x += 0.0093) assert.ok(close(dm.exp(x), Math.exp(x)), `exp ${x}`);
  for (let x = 1e-6; x < 1e6; x *= 1.037) {
    assert.ok(close(dm.log(x), Math.log(x)), `log ${x}`);
    assert.ok(close(dm.pow(x, 1 / 2.4), Math.pow(x, 1 / 2.4), 1e-12), `pow ${x}`);
    assert.ok(close(dm.cbrt(x), Math.cbrt(x)), `cbrt ${x}`);
  }
  assert.ok(close(dm.cbrt(-8), -2));
  assert.equal(dm.log(0), -Infinity);
  assert.ok(Number.isNaN(dm.log(-1)));
});

test('rng: known values (pins the stream; changing it would change every day)', () => {
  assert.equal(hashString('perceptle'), hashString('perceptle'));
  const r = mulberry32(12345);
  const seq = [r(), r(), r()].map((v) => Math.round(v * 1e9));
  assert.deepEqual(seq, [979728268, 306752264, 484205422]);
  const g = new Rng(7);
  for (let i = 0; i < 1000; i++) {
    const v = g.int(3, 5);
    assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
    const u = g.logUniform(20, 400);
    assert.ok(u >= 20 && u < 400.0001);
  }
});
