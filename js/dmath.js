// Deterministic maths: the same bits on every JavaScript engine.
//
// The spec only guarantees + - * / and Math.sqrt to be correctly rounded. Math.sin, cos, exp, log, pow, hypot,
// atan2 and cbrt may differ in the last bit between V8 (Chrome, Android, the worker), SpiderMonkey (Firefox) and
// JavaScriptCore (Safari). One flipped bit can move a dot or change a rounded score, so everything that decides a
// task or a score uses these instead. Drawing code may use Math.* freely.
//
// Accuracy is ~1e-15 relative, which is plenty: what matters is that it's identical everywhere.
// test/dmath.test.mjs checks accuracy against Math.*, tools/determinism.mjs checks the bits across engines.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const DEG = PI / 180;

// Cody-Waite splits (fdlibm constants), so range reduction loses no precision.
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;
const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;

function horner(x, c) {
  let y = c[c.length - 1];
  for (let i = c.length - 2; i >= 0; i--) y = y * x + c[i];
  return y;
}

// Taylor coefficients, built with exact-order arithmetic (deterministic too).
const SIN_C = [], COS_C = [], EXP_C = [], LOG_C = [];
{
  let f = 1;
  for (let n = 1; n <= 18; n++) {
    f *= n;
    if (n % 2) SIN_C.push(((n - 1) / 2) % 2 ? -1 / f : 1 / f);
    else COS_C.push((n / 2) % 2 ? -1 / f : 1 / f);
  }
  COS_C.unshift(1);
  let g = 1;
  EXP_C.push(1);
  for (let n = 1; n <= 14; n++) { g *= n; EXP_C.push(1 / g); }
  for (let n = 0; n <= 11; n++) LOG_C.push(1 / (2 * n + 1));
}

function reduce(x) {
  const k = Math.round(x / (PI / 2));
  const r = (x - k * PIO2_HI) - k * PIO2_LO;
  return { r, q: ((k % 4) + 4) % 4 };
}

const sinP = (r) => r * horner(r * r, SIN_C);
const cosP = (r) => horner(r * r, COS_C);

export function sin(x) {
  const { r, q } = reduce(x);
  return q === 0 ? sinP(r) : q === 1 ? cosP(r) : q === 2 ? -sinP(r) : -cosP(r);
}

export function cos(x) {
  const { r, q } = reduce(x);
  return q === 0 ? cosP(r) : q === 1 ? -sinP(r) : q === 2 ? -cosP(r) : sinP(r);
}

export const sinDeg = (d) => sin(d * DEG);
export const cosDeg = (d) => cos(d * DEG);

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2_HI);
  const r = (x - k * LN2_HI) - k * LN2_LO;
  let y = horner(r, EXP_C);
  // scale by 2^k with exact doublings
  if (k > 0) for (let i = 0; i < k; i++) y *= 2;
  else for (let i = 0; i < -k; i++) y *= 0.5;
  return y;
}

export function log(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let m = x, e = 0;
  while (m >= SQRT2) { m *= 0.5; e++; }
  while (m < SQRT1_2) { m *= 2; e--; }
  const s = (m - 1) / (m + 1);
  const lnm = 2 * s * horner(s * s, LOG_C);
  return e * LN2_HI + (lnm + e * LN2_LO);
}

/** x^y for x >= 0. Integer powers should just be multiplied out. */
export function pow(x, y) {
  if (x === 0) return y === 0 ? 1 : 0;
  return exp(y * log(x));
}

export function cbrt(x) {
  if (x === 0) return 0;
  const a = Math.abs(x);
  let y = pow(a, 1 / 3);
  y -= (y * y * y - a) / (3 * y * y); // one Newton step
  return x < 0 ? -y : y;
}

export const hypot = (x, y) => Math.sqrt(x * x + y * y);

/** Round to `dp` decimal places (deterministic: only * / and Math.round). */
export function roundTo(x, dp) {
  let f = 1;
  for (let i = 0; i < dp; i++) f *= 10;
  return Math.round(x * f) / f;
}
