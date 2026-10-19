// Perceptle UI: intro -> countdown -> 5 tasks (answer, reveal) -> results, share, leaderboard. Archive replays.
// Practice (unlimited random tasks) unlocks after today's tasks.
import * as api from './api.js';
import { Arena } from './arena.js';
import { WEEKDAYS, EPOCH, addDays, dayNumber, msUntilNextUtcDay, todayKey, weekday, weekdayDifficulty } from './daily.js';
import { dayPlan, practiceTask } from './plan.js';
import { freshSeed } from './rng.js';
import { MAX_TOTAL, TASKS_PER_DAY, fmt2, round2, scoreBlock } from './scoring.js';
import * as store from './storage.js';
import { TASKS } from './tasks/index.js';

const $ = (id) => document.getElementById(id);
const SITE = 'https://biccyanzac-pixel.github.io/perceptle/';
const LEVELS = ['Sunday special', 'easiest', 'easy', 'medium', 'harder', 'hard', 'hardest'];

let mode = { day: todayKey(), late: false };
let playing = false;

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
}
const show = (id, on = true) => { $(id).hidden = !on; };
// jacob.gg motion (kit/jgg.js, loaded with defer, so it may be missing): every call has a plain fallback.
const motion = () => window.JGG?.motion;

/** Show #intro or #done. A change of phase after the first paint enters (JGG.motion.swap: old goes at once, new enters in 220 ms). */
function phase(id) {
  const to = $(id), from = $(id === 'intro' ? 'done' : 'intro');
  if (!to.hidden && from.hidden) return;
  const m = motion();
  if (m && !from.hidden && booted) m.swap(from, to);
  else { from.hidden = true; to.hidden = false; }
}
let booted = false;
const pad = (n) => String(n).padStart(2, '0');
const short = (msg) => (String(msg).length > 140 ? `${String(msg).slice(0, 139)}…` : String(msg)); // server text in the UI
const total = (rounds) => round2(rounds.reduce((a, r) => a + (r?.points || 0), 0));

function tickCountdown() {
  const s = Math.floor(msUntilNextUtcDay() / 1000);
  $('countdown').textContent = `Next in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  if (!mode.late && mode.day !== todayKey() && !playing) { mode = { day: todayKey(), late: false }; render(); }
}

// --- abandoned tasks -------------------------------------------------------------------------------

/** A task that was shown but never answered (page closed or reloaded) scores 0: no second look. */
function settleAbandoned(day, late) {
  const p = store.progress(day, late);
  const plan = dayPlan(day);
  for (let i = 0; i < TASKS_PER_DAY; i++) {
    if (p.started[i] && !p.rounds[i] && i === store.doneCount(day, late)) {
      store.saveRound(day, late, i, { type: plan.tasks[i].type, answer: null, points: 0, err: null, abandoned: true });
      submit(day, i, null, null);
    }
  }
}

function submit(day, round, answer, ms) {
  if (!api.enabled()) return;
  api.submitRound({ day, round, answer, ms, name: api.savedName() })
    .then(() => renderBoard())
    .catch((e) => { $('board-note').textContent = `Couldn't save to the leaderboard: ${short(e.message)}`; show('board-note', true); });
}

// --- views ----------------------------------------------------------------------------------------

/** reveal: the day was just finished, so the score counts up and the bars grow (never on a reload or re-render). */
function render({ reveal = false } = {}) {
  const { day, late } = mode;
  settleAbandoned(day, late);
  const plan = dayPlan(day);
  const w = weekday(day);
  $('daynum').textContent = `Perceptle #${dayNumber(day)}${late ? ` · ${day} (played later)` : ''}`;
  if (window.JGG) $('level').replaceChildren(JGG.levelChip(day));
  else $('level').textContent = `${WEEKDAYS[w]} · ${LEVELS[w]}`;
  const n = store.doneCount(day, late);
  if (n >= TASKS_PER_DAY) {
    phase('done');
    renderDone(reveal);
  } else {
    phase('intro');
    $('today-tasks').replaceChildren(...plan.tasks.map((t, i) => el('li', { class: `chip${i < n ? ' done' : ''}${t.illusion ? ' special' : ''}` },
      `${TASKS[t.type].emoji} ${TASKS[t.type].name}${t.illusion ? ' ✨' : ''}`)));
    show('special-note', plan.tasks.some((t) => t.illusion));
    $('start-label').textContent = n === 0 ? 'Start' : `Continue: task ${n + 1} of ${TASKS_PER_DAY}`;
    const name = api.savedName();
    $('name').value = name;
    show('name-field', !name);
    if (window.JGG) JGG.playingAs({ mount: $('playing-as'), name, onChange: (n) => { api.saveName(n); $('name').value = n; } });
    else { $('playing-as').textContent = name ? `Playing as ${name}.` : ''; show('playing-as', !!name); }
  }
  renderBoard();
}

async function play() {
  const { day, late } = mode;
  const plan = dayPlan(day);
  const arena = new Arena();
  playing = true;
  const first = store.doneCount(day, late);
  arena.open({ enter: first === 0 }); // only when the countdown follows, so the entrance never overlaps a task
  try {
    const scores = store.progress(day, late).rounds.map((r) => r?.points);
    if (first === 0) { arena.setPips(Array(TASKS_PER_DAY).fill(undefined), -1); await arena.countdown(); }
    for (let i = first; i < TASKS_PER_DAY; i++) {
      const task = plan.tasks[i];
      arena.setPips(Array.from({ length: TASKS_PER_DAY }, (_, j) => scores[j]), i);
      store.markStarted(day, late, i);
      const { answer, ms, result } = await arena.play(task, { label: `${i + 1}/${TASKS_PER_DAY}` });
      scores[i] = result.points;
      store.saveRound(day, late, i, { type: task.type, answer, ms, points: result.points, acc: result.acc, err: result.err });
      submit(day, i, answer, ms);
      arena.setPips(Array.from({ length: TASKS_PER_DAY }, (_, j) => scores[j]), i);
      await arena.reveal(task, answer, result, { next: i + 1 < TASKS_PER_DAY ? 'Next →' : 'See results →' });
    }
  } finally {
    arena.close();
    playing = false;
  }
  render({ reveal: store.doneCount(day, late) >= TASKS_PER_DAY });
  $('card').scrollIntoView({ block: 'start' });
}

function renderDone(reveal) {
  const { day, late } = mode;
  const rounds = store.progress(day, late).rounds;
  $('daily-score-caption').textContent = late ? `Your replay of ${day}` : "Today's score";
  // Counts up once, straight after the last task (a tap skips it). Share and the board never wait for it.
  const score = $('daily-score'), m = motion();
  score._jggSkip?.(); // a re-render ends a running count-up first
  if (reveal && m) m.settle(score, total(rounds), { format: fmt2 });
  else score.textContent = fmt2(total(rounds));
  $('out-of').textContent = `out of ${MAX_TOTAL}`;
  $('bars').replaceChildren(...rounds.map((r, i) => {
    const t = TASKS[r.type], label = `${t.emoji} ${t.name}`;
    return el('li', { class: 'bar-row' },
      el('span', { class: 'bar-label', text: label, title: label }),
      el('span', { class: 'bar-track' }, el('span', {
        class: `bar-fill ${r.points >= 60 ? 'good' : r.points >= 30 ? 'ok' : 'bad'}${reveal ? ' grow' : ''}`,
        style: `width:${r.points}%;--jgg-i:${i}`,
      })),
      el('span', { class: 'bar-score', text: r.abandoned ? '0 (left)' : fmt2(r.points) }));
  }));
  show('share-done', false);
  // jacob.gg shared kit: 'rate today's game' (fails soft if the hub is down or the kit didn't load)
  if (!late && window.JGG?.rate) window.JGG.rate({ game: 'perceptle', day, mount: $('rate') });
  const unlocked = store.doneCount(todayKey(), false) >= TASKS_PER_DAY;
  show('practice', unlocked);
}

function shareText() {
  const { day, late } = mode;
  const rounds = store.progress(day, late).rounds;
  const best = rounds.reduce((b, r) => (r.points > b.points ? r : b), rounds[0]);
  const streak = late ? 0 : store.streak(todayKey(), addDays, TASKS_PER_DAY);
  return `👁️ Perceptle #${dayNumber(day)}${late ? ' (replay)' : ''} — ${fmt2(total(rounds))}/${MAX_TOTAL}, best: ${TASKS[best.type].name.toLowerCase()} ${fmt2(best.points)}\n`
    + `${rounds.map((r) => scoreBlock(r.points)).join('')}${streak > 1 ? `  🔥${streak}` : ''}\n${SITE}`;
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    show('share-done', true);
  } catch {
    prompt('Copy your result:', text);
  }
}

// --- practice -------------------------------------------------------------------------------------

async function practice() {
  const type = $('practice-type').value || null;
  const w = Number($('practice-day').value);
  let stopped = false;
  const arena = new Arena({ closable: true, onClose: () => { stopped = true; playing = false; } });
  playing = true;
  arena.open(); // no entrance: a practice task starts at once, and stimulus timing starts with it
  const done = [];
  try {
    while (!stopped) {
      const task = practiceTask(freshSeed(), { type, difficulty: weekdayDifficulty(w), illusion: w === 0 });
      arena.setPips(done.slice(-9), -1);
      const avg = done.length ? fmt2(done.reduce((a, b) => a + b, 0) / done.length) : null;
      const { answer, ms, result } = await arena.play(task, { label: `Practice${avg !== null ? ` · avg ${avg}` : ''}` });
      done.push(result.points);
      store.addPractice({ type: task.type, sub: task.params.sub, d: weekdayDifficulty(w), err: result.err, parts: result.parts, ms, points: result.points, at: Date.now() });
      arena.setPips(done.slice(-9), -1);
      await arena.reveal(task, answer, result, { next: 'Another →' });
    }
  } catch { /* closed mid-task */ }
  if (!stopped) arena.close();
  playing = false;
}

// --- leaderboard ----------------------------------------------------------------------------------

async function renderBoard() {
  if (!api.enabled()) { show('board', false); return; }
  const { day, late } = mode;
  show('board', true);
  $('board-title').textContent = late ? `Played later: ${day}` : "Today's leaderboard";
  let b;
  try { b = await api.board(day, late); }
  catch (e) { $('board-note').textContent = `Leaderboard unavailable: ${short(e.message)}`; show('board-note', true); return; }
  show('board-note', false);
  const plan = dayPlan(day);
  $('players').textContent = b.players ? `${b.players} player${b.players === 1 ? '' : 's'}` : '';
  const rows = [...b.top];
  if (b.you) rows.push(null, b.you);
  $('rows').replaceChildren(...rows.map((r) => r === null ? el('li', { class: 'row-gap', text: '···' })
    : el('li', { class: `row${r.you ? ' me' : ''}` },
      el('span', { class: 'row-rank', text: `${r.rank}` }),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-name', text: r.name || '', title: r.name || '', dir: 'auto' }),
        el('div', { class: 'row-sub', title: (r.rounds || []).map((p, i) => `${TASKS[plan.tasks[i].type].name} ${fmt2(p)}`).join(', ') },
          el('span', { class: 'row-emoji', text: (r.rounds || []).map(scoreBlock).join('') }),
          r.played < TASKS_PER_DAY ? ` · ${r.played}/${TASKS_PER_DAY} tasks` : '')),
      el('span', { class: 'row-score', text: fmt2(r.total) }))));
  show('board-empty', !b.top.length);
}

// --- archive --------------------------------------------------------------------------------------

async function browseArchive() {
  const list = $('archive-list');
  if (!list.hidden) { list.hidden = true; return; }
  const items = [];
  for (let d = addDays(todayKey(), -1); d >= EPOCH; d = addDays(d, -1)) items.push(d);
  let summary = {};
  try { if (api.enabled() && items.length) summary = (await api.days(items[items.length - 1], items[0])).days || {}; }
  catch { /* the list works without counts */ }
  list.replaceChildren(...(items.length ? items.map((d) => {
    const s = summary[d];
    const mine = store.doneCount(d, false) >= TASKS_PER_DAY ? total(store.progress(d).rounds)
      : store.doneCount(d, true) >= TASKS_PER_DAY ? total(store.progress(d, true).rounds) : null;
    return el('li', {}, el('button', { class: 'archive-list-item', type: 'button', onclick: () => openArchive(d) },
      el('span', { class: 'archive-list-day', text: `Perceptle #${dayNumber(d)} · ${WEEKDAYS[weekday(d)]} ${d}` }),
      el('span', { class: 'archive-list-prompt', text: [
        s?.players ? `${s.players} played on the day, best ${fmt2(s.top)}` : 'Nobody played on the day',
        mine !== null ? `you: ${fmt2(mine)}` : null].filter(Boolean).join(' · ') })));
  }) : [el('li', { class: 'archive-list-empty', text: 'No past days yet. Perceptle started today.' })]));
  const m = motion();
  if (m) m.enter(list); else list.hidden = false;
}

function openArchive(d) {
  mode = store.doneCount(d, false) >= TASKS_PER_DAY ? { day: d, late: false } : { day: d, late: true };
  $('archive-list').hidden = true;
  render();
  const m = motion();
  if (m) m.scroll($('card'), { block: 'start' }); else $('card').scrollIntoView({ block: 'start' });
}

// --- boot -----------------------------------------------------------------------------------------

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  show('start-error', false);
  const name = ($('name').value || api.savedName()).replace(/\s+/g, ' ').trim();
  if (!name) { $('start-error').textContent = 'Enter a name for the leaderboard.'; show('start-error', true); return; }
  api.saveName(name.slice(0, 20));
  play();
});
$('share').addEventListener('click', share);
$('archive-browse').addEventListener('click', browseArchive);
$('practice-start').addEventListener('click', practice);
$('practice-type').append(...Object.values(TASKS).map((t) => el('option', { value: t.type, text: `${t.emoji} ${t.name}` })));

(async function boot() {
  await api.loadConfig();
  const q = new URLSearchParams(location.search).get('day');
  if (q && q >= EPOCH && q < todayKey()) openArchive(q);
  else render();
  booted = true;
  tickCountdown();
  setInterval(tickCountdown, 1000);
})();
