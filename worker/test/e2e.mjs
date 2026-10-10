// API checks against a running worker: node test/e2e.mjs http://127.0.0.1:8821
// (cd worker && npm run db:init:local && npm run dev:local). Uses the real generator to know true answers.
import { addDays, todayKey } from '../../site/js/daily.js';
import { centroid } from '../../site/js/geometry.js';
import { dayPlan, scoreTask } from '../../site/js/plan.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8821';
const ORIGIN = 'http://localhost:8082';
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };

async function call(path, body) {
  const res = await fetch(BASE + path, body === undefined ? { headers: { Origin: ORIGIN } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}

/** The true answer for each task type (or a deliberately wrong one). */
function answerFor(task, exact = true) {
  const p = task.params;
  switch (task.type) {
    case 'count': return { n: exact ? p.n : p.n * 2, pct: Math.round(p.pct) };
    case 'angle': return Math.round(p.angle) + (exact ? 0 : 30);
    case 'area': return { pick: exact ? p.bigger : 1 - p.bigger, pct: Math.round((p.ratio - 1) * 100) };
    case 'midpoint': return p.sub === 'noodle' ? { t: exact ? 0.5 : 0.7 } : { x: p.truth[0] + (exact ? 0 : 0.2), y: p.truth[1] };
    case 'proportion': return Math.round(p.truth) + (exact ? 0 : -5 * Math.sign(p.truth - 50) * 4);
    case 'length': return exact ? p.longest : (p.longest + 1) % p.lines.length;
    case 'timing': return Math.round(p.seconds * 1000 * (exact ? 1 : 1.5));
    case 'colour': return exact ? p.answer : (p.answer + 1) % p.palette.length;
  }
  return centroid; // unreachable
}

const today = todayKey();
const plan = dayPlan(today);
const s1 = (await call('/api/session', {})).data;
check('session issued', !!s1?.playerId && !!s1?.token);
const pre = await fetch(BASE + '/api/round', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
check('CORS allows the local site', pre.headers.get('access-control-allow-origin') === ORIGIN);

const bad = await call('/api/round', { ...s1, token: 'nope', day: today, round: 0, answer: answerFor(plan.tasks[0]), ms: 3000, name: 'A' });
check('bad token rejected', bad.status === 401);
const future = await call('/api/round', { ...s1, day: addDays(today, 1), round: 0, answer: 1, ms: 3000, name: 'A' });
check('future day rejected', future.status === 400);
const early = await call('/api/round', { ...s1, day: '2020-01-01', round: 0, answer: 1, ms: 3000, name: 'A' });
check('day before launch rejected', early.status === 400);
const skip = await call('/api/round', { ...s1, day: today, round: 1, answer: answerFor(plan.tasks[1]), ms: 3000, name: 'A' });
check('out of order rejected', skip.status === 409);
const garbage = await call('/api/round', { ...s1, day: today, round: 0, answer: { hack: true }, ms: 3000, name: 'A' });
check('invalid answer rejected', garbage.status === 400 && garbage.data.error === 'bad_answer');
const noName = await call('/api/round', { ...s1, day: today, round: 0, answer: answerFor(plan.tasks[0]), ms: 3000, name: '' });
const noTime = await call('/api/round', { ...s1, day: today, round: 0, answer: answerFor(plan.tasks[0]), name: 'A' });
check('missing answer time rejected', noTime.status === 400 && noTime.data.error === 'bad_time');
check('empty name rejected', noName.status === 400);

let expected = 0;
for (let i = 0; i < 5; i++) {
  const task = plan.tasks[i];
  const exact = i !== 3;
  const answer = answerFor(task, exact);
  const ms = 2500 + i * 1500; // later tasks answered slower: the speed bonus must match too
  const want = scoreTask(task, answer, ms).points;
  expected += want;
  const r = await call('/api/round', { ...s1, day: today, round: i, answer, ms, name: 'Alice' });
  check(`task ${i + 1} (${task.type}) scored by the server = browser's score`, r.status === 200 && r.data.points === want, `${r.data?.points} vs ${want}`);
}
const again = await call('/api/round', { ...s1, day: today, round: 4, answer: answerFor(plan.tasks[4]), ms: 3000, name: 'Alice' });
check('second answer to a task rejected', again.status === 409);

// a second player who abandons task 1 (null) and gets the rest right
const s2 = (await call('/api/session', {})).data;
let expected2 = 0;
for (let i = 0; i < 2; i++) {
  const answer = i === 0 ? null : answerFor(plan.tasks[i]);
  expected2 += answer === null ? 0 : scoreTask(plan.tasks[i], answer, 4000).points;
  const r = await call('/api/round', { ...s2, day: today, round: i, answer, ms: answer === null ? null : 4000, name: 'Bob' });
  check(`player 2 task ${i + 1} ${answer === null ? 'abandoned = 0' : 'ok'}`, r.status === 200 && (answer !== null || r.data.points === 0));
}

const board = (await call(`/api/leaderboard?day=${today}&playerId=${s2.playerId}`)).data;
const alice = board.top.find((r) => r.name === 'Alice'), bob = board.top.find((r) => r.name === 'Bob');
check('board: Alice has the server total (2 dp)', Math.abs(alice?.total - expected) < 0.005 && alice.played === 5, JSON.stringify(alice));
check('board: Bob part-way, marked as you', Math.abs(bob?.total - expected2) < 0.005 && bob.played === 2 && bob.you, JSON.stringify(bob));
check('board: sorted by total', board.top.every((r, i) => i === 0 || board.top[i - 1].total >= r.total));

// archive replay of yesterday goes on the late board
const y = addDays(today, -1);
const late = await call('/api/round', { ...s2, day: y, round: 0, answer: answerFor(dayPlan(y).tasks[0]), ms: 3000, name: 'Bob' });
if (y >= '2026-10-10') check('yesterday (replay) goes on the late board', late.status === 200 && late.data.late === true);
const days = (await call(`/api/days?from=${addDays(today, -3)}&to=${today}`)).data;
check('days summary', days?.days?.[today]?.players >= 2, JSON.stringify(days?.days?.[today]));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
