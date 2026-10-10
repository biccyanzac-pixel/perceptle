// Fingerprints of a day's tasks, including the display layouts (dot positions, shaded pieces), so the
// determinism checks compare everything a player sees. Used by the tests, tools/determinism.mjs and dev/determinism.html.
import { addDays } from './daily.js';
import { dayPlan } from './plan.js';
import { hashString } from './rng.js';
import { TASKS } from './tasks/index.js';
import { shadedPieces } from './tasks/proportion.js';

export function displayData(plan) {
  return plan.tasks.map((t) => {
    if (t.type === 'count') return TASKS.count.layout(t.params);
    if (t.type === 'proportion') return shadedPieces(t.params);
    return null;
  });
}

/** 64-bit (two FNV-1a passes) hex digest of a string. */
export function digestString(s) {
  const a = hashString(s), b = hashString(`${s.length}:${s}`);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function dayDigest(day) {
  const plan = dayPlan(day);
  return digestString(JSON.stringify({ plan, display: displayData(plan) }));
}

/** Digest of `n` consecutive days from `from`, plus each day's own digest. */
export function rangeDigest(from, n) {
  const days = {};
  for (let i = 0; i < n; i++) { const d = addDays(from, i); days[d] = dayDigest(d); }
  return { all: digestString(JSON.stringify(days)), days };
}
