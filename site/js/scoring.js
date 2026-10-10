import { pow } from './dmath.js';

// Scoring: how an answer turns into 0-100 points (to 2 decimal places). Every tuning knob is here.
// Documented in docs/scoring.md. Retune with calibrate.html.
//
// 1. Accuracy, per error measure:   acc = 100 / (1 + (err / half)^k)
//      err == 0        -> 100 (only an exact answer)
//      err == half     -> 50
//      err == 2 * half -> 20, and it never quite reaches 0
//    Tasks with two questions (count: how many + what %) weight their parts (WEIGHTS).
// 2. Speed: points = acc * (1 - SPEED_WEIGHT + SPEED_WEIGHT * speed), where speed is 1 when answered within
//    SPEED[type].fast ms of the task appearing, falling linearly to 0 at SPEED[type].slow. So a slow perfect answer
//    scores 85 and 100 needs exact *and* fast. Timing has no speed part (time is the task).
//
// Shared by the site and the leaderboard worker. Changing a curve changes scores from then on, never stored
// results: the worker stores the points it computed at the time.

export const CURVES = {
  // |ln(guess / true)|: being 10% out scores the same at 30 dots as at 300
  count: { half: 0.3, k: 2 },
  // |guess - true| in percentage points, for "what % were orange?"
  'count.pct': { half: 9, k: 2 },
  // |guess - true| in degrees (the angle on the tilted disc)
  angle: { half: 9, k: 2 },
  // |ln(guessed ratio) - ln(true ratio)|; picking the smaller shape makes the guessed ratio < 1
  area: { half: 0.15, k: 2 },
  // |position along the noodle - 0.5|, as a fraction of its length
  'midpoint.noodle': { half: 0.05, k: 2 },
  // distance from the true centroid / sqrt(shape area)
  'midpoint.centre': { half: 0.08, k: 2 },
  // |guess - true| in percentage points
  proportion: { half: 7, k: 2 },
  // ln(longest / the one you picked); 0 if you picked the longest
  length: { half: 0.04, k: 2 },
  // |tapped - target| / target
  timing: { half: 0.1, k: 2 },
  // OKLab distance between the colour you picked and the sample; 0 if exact
  colour: { half: 0.02, k: 2 },
};

/** How much each part counts, for tasks with more than one question. */
export const WEIGHTS = { count: [0.65, 0.35] };

export const SPEED_WEIGHT = 0.15;
/** Milliseconds from the task appearing to the final answer: full speed bonus within `fast`, none after `slow`. */
export const SPEED = {
  count: { fast: 9000, slow: 25000 },
  angle: { fast: 5000, slow: 18000 },
  area: { fast: 6000, slow: 20000 },
  midpoint: { fast: 4500, slow: 15000 },
  proportion: { fast: 4500, slow: 15000 },
  length: { fast: 5000, slow: 18000 },
  colour: { fast: 3500, slow: 12000 },
  timing: null,
};

export const MAX_POINTS = 100;
export const TASKS_PER_DAY = 5;
export const MAX_TOTAL = MAX_POINTS * TASKS_PER_DAY;

/** Round to 2 dp (deterministic). */
export const round2 = (x) => Math.round(x * 100) / 100;

/** Accuracy 0-100 (unrounded) for an error under a curve. NaN/negative/missing -> 0. Integer power only. */
export function curveScore(err, curve) {
  if (typeof err !== 'number' || !(err >= 0)) return 0;
  const e = err / curve.half;
  let p = 1;
  for (let i = 0; i < curve.k; i++) p *= e;
  return MAX_POINTS / (1 + p);
}

/** Inverse: the error that scores `points` accuracy (for docs and the calibration page). */
export function errorFor(points, curve) {
  if (points >= MAX_POINTS) return 0;
  return curve.half * pow(MAX_POINTS / points - 1, 1 / curve.k);
}

/** 0..1: how fast the answer was, or 1 for task types with no speed part. */
export function speedFactor(type, ms) {
  const s = SPEED[type];
  if (!s) return 1;
  if (typeof ms !== 'number' || !(ms >= 0)) return 0;
  if (ms <= s.fast) return 1;
  if (ms >= s.slow) return 0;
  return (s.slow - ms) / (s.slow - s.fast);
}

/** Final points from accuracy and time. */
export function withSpeed(type, acc, ms) {
  if (!SPEED[type]) return round2(acc);
  return round2(acc * (1 - SPEED_WEIGHT + SPEED_WEIGHT * speedFactor(type, ms)));
}

export const fmt2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '–');

/** One emoji block per task for the share text and the board. */
export function scoreBlock(points) {
  if (points === null || points === undefined) return '⬜';
  if (points >= 90) return '🟩';
  if (points >= 60) return '🟨';
  if (points >= 30) return '🟧';
  return '🟥';
}
