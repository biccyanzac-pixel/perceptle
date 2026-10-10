/**
 * Perceptle shared leaderboard: Cloudflare Worker + D1. Same shape as Factle's worker.
 *
 * No score is client-reported: the browser sends (day, task index, raw answer) and this worker regenerates that
 * day's tasks from the date with the same code the site uses (site/js/plan.js) and scores the answer itself.
 * What it can't verify is how the answer was reached (the generator is public, so a determined player could
 * compute answers, and the timing task's milliseconds come from the browser); that's the accepted trade-off of a
 * free static game, as with Factle, Yogle and ridd-le.
 *   - player ids/tokens are issued here (/api/session)
 *   - the day must be on or after EPOCH and not in the future; late (archive replay) = submitted after that UTC day
 *   - tasks must be answered in order, once each (insert-only, the first answer counts)
 *   - answer must validate for the task type, or be null (abandoned: 0 points)
 *   - ms (time to answer, for the speed bonus) is reported by the browser, like Factle's timings
 */
import { EPOCH, todayKey, validDay } from '../../site/js/daily.js';
import { dayPlan, scoreTask } from '../../site/js/plan.js';
import { TASKS_PER_DAY } from '../../site/js/scoring.js';
import { TASKS } from '../../site/js/tasks/index.js';

const MAX_NAME = 20;
const BOARD_SIZE = 20;

function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > MAX_NAME) return null;
  return name;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- HTTP plumbing ---

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return '*';
  return allowed.includes(origin) ? origin : allowed[0];
}

function cors(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(request, env) } });
}

function fail(request, env, code, message, status) {
  return json(request, env, { error: code, message }, status);
}

const hits = new Map(); // in-memory, per isolate: enough to blunt a burst
function rateLimited(ip, bucket, limit) {
  const now = Date.now(), key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  hits.set(key, recent);
  return over;
}

// --- routes ---

async function handleSession(request, env, ip) {
  if (rateLimited(ip, 'session', 30)) return fail(request, env, 'rate_limited', 'Too many new sessions from here.', 429);
  const playerId = crypto.randomUUID(), token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO players (id, token_hash, created_at) VALUES (?, ?, ?)')
    .bind(playerId, await sha256Hex(token), new Date().toISOString()).run();
  return json(request, env, { playerId, token });
}

async function verifyPlayer(env, playerId, token) {
  if (typeof playerId !== 'string' || typeof token !== 'string' || !playerId || !token) return false;
  const row = await env.DB.prepare('SELECT token_hash FROM players WHERE id = ?').bind(playerId).first();
  return !!row && row.token_hash === (await sha256Hex(token));
}

const view = (r, rank, playerId) => ({
  rank, name: r.display_name, total: r.total, played: r.played,
  rounds: r.rounds ? r.rounds.split(',').map(Number) : [], you: r.player_id === playerId,
});

export async function fetchBoard(env, day, late, playerId) {
  const lateN = late ? 1 : 0;
  const { results } = await env.DB.prepare(
    `SELECT player_id, display_name, total, played, rounds, last_at FROM totals
      WHERE day_key = ? AND is_late = ? ORDER BY total DESC, last_at ASC LIMIT ?`,
  ).bind(day, lateN, BOARD_SIZE).all();
  const top = (results ?? []).map((r, i) => view(r, i + 1, playerId));
  const stats = await env.DB.prepare('SELECT players, top FROM day_stats WHERE day_key = ? AND is_late = ?')
    .bind(day, lateN).first();
  let you = null;
  if (playerId && !top.some((r) => r.you)) {
    const mine = await env.DB.prepare(
      'SELECT player_id, display_name, total, played, rounds, last_at FROM totals WHERE player_id = ? AND day_key = ? AND is_late = ?',
    ).bind(playerId, day, lateN).first();
    if (mine) {
      const above = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM totals WHERE day_key = ? AND is_late = ?
           AND (total > ? OR (total = ? AND last_at < ?))`,
      ).bind(day, lateN, mine.total, mine.total, mine.last_at).first();
      you = view(mine, (above?.n ?? 0) + 1, playerId);
    }
  }
  return { day, late: !!late, players: stats?.players ?? 0, top, you };
}

async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') || todayKey();
  if (!validDay(day)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  return json(request, env, await fetchBoard(env, day, url.searchParams.get('late') === '1', url.searchParams.get('playerId')));
}

async function handleDays(request, env) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') || todayKey();
  const from = url.searchParams.get('from') || EPOCH;
  if (!validDay(from) || !validDay(to)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  const { results } = await env.DB.prepare(
    'SELECT day_key, is_late, players, top FROM day_stats WHERE day_key BETWEEN ? AND ?',
  ).bind(from, to).all();
  const days = {};
  for (const r of results ?? []) {
    days[r.day_key] ??= { players: 0, top: null, latePlayers: 0 };
    if (r.is_late) days[r.day_key].latePlayers = r.players;
    else Object.assign(days[r.day_key], { players: r.players, top: r.top });
  }
  return json(request, env, { days });
}

async function handleRound(request, env, ip) {
  if (rateLimited(ip, 'round', 300)) return fail(request, env, 'rate_limited', 'Too many submissions from here. Try again later.', 429);
  let body;
  try { body = await request.json(); } catch { return fail(request, env, 'bad_request', 'Invalid JSON.', 400); }
  const { playerId, token, day, round, answer, ms } = body ?? {};
  if (!(await verifyPlayer(env, playerId, token))) return fail(request, env, 'bad_session', 'Invalid or missing session. Reload the page.', 401);
  const today = todayKey();
  if (!validDay(day) || day < EPOCH) return fail(request, env, 'bad_day', 'There is no game for that day.', 400);
  if (day > today) return fail(request, env, 'bad_day', "That day hasn't happened yet.", 400);
  if (!Number.isInteger(round) || round < 0 || round >= TASKS_PER_DAY) return fail(request, env, 'bad_round', 'Invalid task.', 400);
  const task = dayPlan(day).tasks[round];
  if (answer !== null && (answer === undefined || !TASKS[task.type].validate(answer))) return fail(request, env, 'bad_answer', 'Invalid answer.', 400);
  if (answer !== null && (!Number.isInteger(ms) || ms < 200 || ms > 3600_000)) return fail(request, env, 'bad_time', 'Invalid answer time.', 400);
  const answerJson = answer === null ? null : JSON.stringify({ answer, ms });
  if (answerJson && answerJson.length > 200) return fail(request, env, 'bad_answer', 'Invalid answer.', 400);
  const name = validateName(body.name);
  if (!name) return fail(request, env, 'bad_name', `Name must be 1-${MAX_NAME} characters.`, 400);

  const late = day !== today ? 1 : 0;
  const prev = await env.DB.prepare('SELECT COUNT(*) AS n FROM picks WHERE player_id = ? AND day_key = ? AND is_late = ?')
    .bind(playerId, day, late).first();
  const done = prev?.n ?? 0;
  if (round < done) return fail(request, env, 'already', 'You already answered that task.', 409);
  if (round > done) return fail(request, env, 'out_of_order', 'Tasks must be answered in order.', 409);

  const { points, err } = scoreTask(task, answer, answer === null ? null : ms);
  const now = new Date().toISOString();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO picks (id, player_id, day_key, is_late, round, task_type, answer, err, points, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), playerId, day, late, round, task.type, answerJson, err, points, now),
    env.DB.prepare(
      `INSERT INTO totals (player_id, day_key, is_late, display_name, total, played, rounds, last_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (player_id, day_key, is_late) DO UPDATE SET
         total = ROUND(total + excluded.total, 2), played = played + 1, rounds = rounds || ',' || excluded.rounds,
         last_at = excluded.last_at`,
    ).bind(playerId, day, late, name, points, String(points), now),
  ];
  if (round === 0) {
    stmts.push(env.DB.prepare(
      `INSERT INTO day_stats (day_key, is_late, players, top) VALUES (?, ?, 1, 0)
       ON CONFLICT (day_key, is_late) DO UPDATE SET players = players + 1`,
    ).bind(day, late));
  }
  stmts.push(env.DB.prepare(
    `UPDATE day_stats SET top = MAX(top, (SELECT total FROM totals WHERE player_id = ? AND day_key = ? AND is_late = ?))
      WHERE day_key = ? AND is_late = ?`,
  ).bind(playerId, day, late, day, late));
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(request, env, 'already', 'You already answered that task.', 409);
    throw e;
  }
  return json(request, env, { ok: true, late: !!late, type: task.type, points });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request, env) });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (url.pathname === '/api/session' && request.method === 'POST') return await handleSession(request, env, ip);
      if (url.pathname === '/api/round' && request.method === 'POST') return await handleRound(request, env, ip);
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') return await handleLeaderboard(request, env);
      if (url.pathname === '/api/days' && request.method === 'GET') return await handleDays(request, env);
      return fail(request, env, 'not_found', 'No such endpoint.', 404);
    } catch (err) {
      console.error(err);
      return fail(request, env, 'server_error', 'Something broke. Try again.', 500);
    }
  },
};
