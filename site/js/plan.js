// A day's tasks (every type in the pool, once each, in a seeded order), generated from the date alone: everyone in the world gets identical tasks, with no server.
// Shared by the site, the tests and the leaderboard worker (which regenerates the day to score answers itself).
//
// NEVER change what an existing day generates. Golden hashes in test/fixtures/golden.json catch it. To change a
// generator, gate the change on a future date (if (day >= '2027-01-01') ...) and add golden days after it.
import { dayDifficulty, dayNumber, weekday } from './daily.js';
import { rngFor } from './rng.js';
import { speedFactor, withSpeed } from './scoring.js';
import { POOLS, TASKS } from './tasks/index.js';

export function poolFor(day) {
  let pool = POOLS[0];
  for (const p of POOLS) if (p.from <= day) pool = p;
  return pool.types;
}

/** { day, number, difficulty, weekday, tasks: [{ type, slot, illusion, params }] } */
export function dayPlan(day) {
  const difficulty = dayDifficulty(day);
  const sunday = weekday(day) === 0;
  const rng = rngFor('perceptle', day, 'plan');
  const types = rng.shuffle([...poolFor(day)]); // all of them, in a seeded order
  // Sunday: one of the tasks is the "illusion special"
  let special = -1;
  if (sunday) {
    const capable = types.filter((t) => TASKS[t].illusionCapable);
    special = types.indexOf(rng.pick(capable));
  }
  const tasks = types.map((type, slot) => {
    const illusion = slot === special;
    const params = TASKS[type].generate(rngFor('perceptle', day, slot, type), difficulty, { illusion });
    return { type, slot, illusion, params };
  });
  return { day, number: dayNumber(day), difficulty, weekday: weekday(day), tasks };
}

/** One task for practice or calibration: random unless `seed` is given. */
export function practiceTask(seed, { type, difficulty = 0.4, illusion = false, types } = {}) {
  const rng = rngFor('practice', seed);
  const t = type || rng.pick(types || Object.keys(TASKS));
  return { type: t, slot: 0, illusion, params: TASKS[t].generate(rngFor('practice', seed, t), difficulty, { illusion }) };
}

/**
 * Score one answer (null = abandoned). `ms` = time from the task appearing to the final answer.
 * Returns { points (2 dp), acc (accuracy 0-100), speed (0-1, or null if the type has none), err, parts }.
 */
export function scoreTask(task, answer, ms) {
  const r = TASKS[task.type].score(task.params, answer);
  const hasSpeed = task.type !== 'timing';
  return { ...r, points: answer === null ? 0 : withSpeed(task.type, r.acc, ms), speed: hasSpeed ? speedFactor(task.type, ms) : null };
}
