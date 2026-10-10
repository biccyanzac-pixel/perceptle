// Days, puzzle numbers and weekly difficulty. Shared by the site and the leaderboard worker
// (worker/src/index.js imports this file), so the day and the difficulty can never disagree between the two.

export const EPOCH = '2026-10-10'; // Perceptle #1. Never change once live: it renumbers every day.

/** UTC day key YYYY-MM-DD. The game changes at 00:00 UTC for everyone. */
export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function dayNumber(day) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / 864e5) + 1;
}

export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}

export function msUntilNextUtcDay(now = Date.now()) {
  return Math.ceil((now + 1) / 864e5) * 864e5 - now;
}

export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

/** 0 = Sunday ... 6 = Saturday, of the UTC day. */
export function weekday(day) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Difficulty 0..1: Monday 0, Tuesday 0.2, Wednesday 0.4 (the calibration day), ... Saturday 1.
 * Sunday sits mid-week (0.5) and has one "illusion special" task instead (see plan.js).
 */
export function dayDifficulty(day) {
  const w = weekday(day);
  return w === 0 ? 0.5 : (w - 1) / 5;
}

/** Difficulty of a named weekday, for practice and calibration. */
export function weekdayDifficulty(w) {
  return w === 0 ? 0.5 : (w - 1) / 5;
}
