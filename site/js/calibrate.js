// Calibration: play N random tasks (balanced across types) at a chosen weekday's difficulty, then print the raw
// errors, the scores under the current curves, and, per type, the `half` that would give this player a mean of
// TARGET. Copy the JSON into an issue or straight into CURVES in scoring.js. See docs/scoring.md.
import { Arena } from './arena.js';
import { WEEKDAYS, weekdayDifficulty } from './daily.js';
import { practiceTask } from './plan.js';
import { freshSeed, Rng } from './rng.js';
import { CURVES, curveScore } from './scoring.js';
import * as store from './storage.js';
import { TASKS } from './tasks/index.js';

const $ = (id) => document.getElementById(id);
const TARGET = 65;
// one entry per scored part: count has two (how many, what %), the rest one
const partsOf = (entries) => entries.flatMap((e) => (e.parts?.length ? e.parts : [{ curve: e.type === 'midpoint' ? `midpoint.${e.sub}` : e.type, err: e.err }]));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x) => (x === null ? '—' : Math.abs(x) >= 10 ? x.toFixed(1) : x.toPrecision(3));

/** The `half` that makes the mean accuracy of these errors equal `target` (keeping k). */
export function suggestHalf(errs, curve, target = TARGET) {
  const score = (h) => mean(errs.map((e) => curveScore(e === null ? Infinity : e, { ...curve, half: h })));
  let lo = 1e-9, hi = Math.max(curve.half, ...errs.filter((e) => e !== null && Number.isFinite(e))) * 50 + 1;
  if (score(hi) < target) return null; // too many misses for any half to reach the target
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (score(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function summarise(entries) {
  const groups = {};
  for (const e of partsOf(entries)) if (CURVES[e.curve]) (groups[e.curve] ||= []).push(e);
  return Object.entries(groups).map(([key, es]) => {
    const errs = es.map((e) => e.err);
    const finite = errs.filter((e) => e !== null);
    const curve = CURVES[key];
    return {
      curve: key, n: es.length,
      medianErr: finite.length ? median(finite) : null,
      meanScore: Math.round(mean(es.map((e) => curveScore(e.err === null ? Infinity : e.err, curve)))),
      current: curve, suggestedHalf: suggestHalf(errs, curve),
      errors: errs.map((e) => (e === null ? null : Math.round(e * 1e4) / 1e4)),
    };
  }).sort((a, b) => a.curve.localeCompare(b.curve));
}

function renderResults(entries, label) {
  const rows = summarise(entries);
  $('results').hidden = false;
  $('results-label').textContent = label;
  $('overall').textContent = entries.length
    ? `Mean points ${mean(entries.map((e) => e.points)).toFixed(2)} over ${entries.length} tasks, including the speed bonus (target for a typical adult on Wednesday: 60–70).`
    : 'No tasks yet.';
  $('table').replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    for (const v of [r.curve, r.n, fmt(r.medianErr), r.meanScore, `${r.current.half}`, r.suggestedHalf === null ? 'n/a' : fmt(r.suggestedHalf)]) {
      const td = document.createElement('td'); td.textContent = String(v); tr.append(td);
    }
    return tr;
  }));
  const json = JSON.stringify({ target: TARGET, at: new Date().toISOString(), tasks: rows }, null, 2);
  $('json').textContent = json;
  console.log('[perceptle calibration]', json);
}

async function run() {
  const n = Math.max(1, Math.min(100, Number($('n').value) || 20));
  const w = Number($('day').value);
  const d = weekdayDifficulty(w);
  const types = Object.keys(TASKS).filter((t) => $(`t-${t}`).checked);
  if (!types.length) return;
  const rng = new Rng(freshSeed());
  const order = [];
  while (order.length < n) order.push(...rng.shuffle([...types]));
  order.length = n;
  const session = [];
  let stopped = false;
  const arena = new Arena({ closable: true, onClose: () => { stopped = true; finish(); } });
  const finish = () => {
    renderResults(session, `This run: ${session.length} tasks, ${WEEKDAYS[w]} difficulty`);
    $('results').scrollIntoView({ block: 'start' });
  };
  arena.open();
  const scores = [];
  for (let i = 0; i < n && !stopped; i++) {
    const task = practiceTask(freshSeed(), { type: order[i], difficulty: d, illusion: w === 0 });
    arena.setPips(scores.slice(-9), -1);
    const { answer, ms, result } = await arena.play(task, { label: `Calibration ${i + 1}/${n}` });
    if (stopped) return;
    const entry = { type: task.type, sub: task.params.sub, d, err: result.err, parts: result.parts, ms, points: result.points, at: Date.now(), source: 'calibrate' };
    session.push(entry);
    store.addPractice(entry);
    scores.push(result.points);
    arena.setPips(scores.slice(-9), -1);
    await arena.reveal(task, answer, result, { next: i + 1 < n ? 'Next →' : 'See results →' });
  }
  if (!stopped) { arena.close(); finish(); }
}

$('t-list').append(...Object.values(TASKS).map((t) => {
  const label = document.createElement('label');
  label.className = 'check';
  label.innerHTML = `<input type="checkbox" id="t-${t.type}" checked> ${t.emoji} ${t.name}`;
  return label;
}));
$('go').addEventListener('click', run);
$('history').addEventListener('click', () => {
  const all = store.practiceLog().filter((e) => e.err !== undefined && e.type);
  const w = Number($('day').value), d = weekdayDifficulty(w);
  const same = all.filter((e) => Math.abs(e.d - d) < 1e-9);
  renderResults(same, `Everything saved on this device at ${WEEKDAYS[w]} difficulty (practice + calibration): ${same.length} tasks`);
});
$('clear').addEventListener('click', () => { if (confirm('Delete saved practice and calibration results on this device?')) { store.clearPractice(); $('results').hidden = true; } });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('json').textContent); $('copied').hidden = false; } catch { /* select it by hand */ }
});
