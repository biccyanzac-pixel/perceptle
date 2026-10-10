// localStorage, wrapped so the game works with storage blocked or empty (private mode, cleared data).
// Progress per day: { rounds: [{ type, answer, points, err }], started: { index: epochMs } }
// Today's real game and archive replays are kept apart ('day' vs 'late').
// v2, v3 (2026-10-10): day 1 was regenerated (redesigned tasks, then all 8 a day), so older saved progress is ignored.
const KEY = 'perceptle:progress:v3';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

let mem = readAll();

function writeAll() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: progress lasts for this page */ }
}

const k = (day, late) => `${late ? 'late' : 'day'}:${day}`;

export function progress(day, late = false) {
  const p = mem[k(day, late)] || {};
  return { rounds: p.rounds || [], started: p.started || {} };
}

export function saveRound(day, late, index, result) {
  const p = progress(day, late);
  p.rounds[index] = result;
  mem[k(day, late)] = p;
  writeAll();
}

/** Mark a task as shown. If the page is left before answering, that task scores 0 (no second look). */
export function markStarted(day, late, index, now = Date.now()) {
  const p = progress(day, late);
  p.started[index] = p.started[index] || now;
  mem[k(day, late)] = p;
  writeAll();
}

export const doneCount = (day, late) => progress(day, late).rounds.filter(Boolean).length;

/** Consecutive days (ending today or yesterday) with all tasks finished on the day itself. */
export function streak(today, addDays, n) {
  let s = 0;
  let d = doneCount(today, false) === n ? today : addDays(today, -1);
  while (doneCount(d, false) === n) { s++; d = addDays(d, -1); }
  return s;
}

// practice and calibration history (per-viewer convenience only)
const PKEY = 'perceptle:practice:v1';
export function practiceLog() { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } }
export function addPractice(entry) {
  const log = practiceLog();
  log.push(entry);
  try { localStorage.setItem(PKEY, JSON.stringify(log.slice(-2000))); } catch { /* ignore */ }
}
export function clearPractice() { try { localStorage.removeItem(PKEY); } catch { /* ignore */ } }
