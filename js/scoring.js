import { pow } from './dmath.js';

// Scoring curves: how an error turns into 0-100 points. Every tuning knob is in CURVES below.
// Documented (with how they were chosen) in docs/scoring.md. Retune with calibrate.html.
//
//   err <= full            -> 100
//   err == half            -> 50
//   err == 2*half (roughly) -> 20 (k = 2)
//   score = 100 / (1 + ((err - full) / (half - full))^k), rounded
//
// Shared by the site and the leaderboard worker. Changing a curve changes scores from then on, never stored
// results: the worker stores the points it computed at the time.

export const CURVES = {
  // |ln(guess / true)|: being 10% out scores the same at 30 dots as at 300
  count: { full: 0.03, half: 0.32, k: 2 },
  // |guess - true| in degrees
  angle: { full: 1, half: 8, k: 2 },
  // |ln(guessed ratio) - ln(true ratio)|; picking the smaller shape makes the guessed ratio < 1
  area: { full: 0.015, half: 0.15, k: 2 },
  // distance from the true point / the line's length
  'midpoint.line': { full: 0.004, half: 0.03, k: 2 },
  // distance from the true centroid / sqrt(shape area)
  'midpoint.centre': { full: 0.01, half: 0.08, k: 2 },
  // |guess - true| in percentage points
  proportion: { full: 1, half: 7, k: 2 },
  // ln(longest / the one you picked); 0 if you picked the longest
  length: { full: 0, half: 0.03, k: 2 },
  // |tapped - target| / target
  timing: { full: 0.01, half: 0.1, k: 2 },
  // OKLab distance between the colour you picked and the sample; 0 if exact
  colour: { full: 0, half: 0.02, k: 2 },
};

export const MAX_POINTS = 100;
export const TASKS_PER_DAY = 5;
export const MAX_TOTAL = MAX_POINTS * TASKS_PER_DAY;

/** Points for an error under a curve. NaN/negative/missing -> 0. Deterministic (integer power only). */
export function curveScore(err, curve) {
  if (typeof err !== 'number' || !(err >= 0)) return 0;
  const { full, half, k } = curve;
  if (err <= full) return MAX_POINTS;
  const e = (err - full) / (half - full);
  let p = 1;
  for (let i = 0; i < k; i++) p *= e;
  return Math.round(MAX_POINTS / (1 + p));
}

/** Inverse: the error that scores `points` (for docs and the calibration page). */
export function errorFor(points, curve) {
  const { full, half, k } = curve;
  if (points >= MAX_POINTS) return full;
  return full + (half - full) * pow(MAX_POINTS / points - 1, 1 / k);
}

/** One emoji block per task for the share text and the board. */
export function scoreBlock(points) {
  if (points === null || points === undefined) return '⬜';
  if (points >= 90) return '🟩';
  if (points >= 60) return '🟨';
  if (points >= 30) return '🟧';
  return '🟥';
}
