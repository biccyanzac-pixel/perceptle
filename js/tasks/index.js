// The task library. To add a type: write tasks/<type>.js with the same shape, a renderer in render/<type>.js,
// a curve in scoring.js, and append a NEW pool to POOLS with a future start date (never edit an old pool:
// that would change days already played). See docs/tasks.md.
import angle from './angle.js';
import area from './area.js';
import colour from './colour.js';
import count from './count.js';
import length from './length.js';
import midpoint from './midpoint.js';
import proportion from './proportion.js';
import timing from './timing.js';

export const TASKS = { count, angle, area, midpoint, proportion, length, timing, colour };

/** Which types a day draws its five from. Ordered by start date; a day uses the last pool that has started. */
export const POOLS = [
  { from: '2026-10-10', types: ['count', 'angle', 'area', 'midpoint', 'proportion', 'length', 'timing', 'colour'] },
];
