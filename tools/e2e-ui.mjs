// Browser end-to-end: plays all of today's tasks in headless Chrome at phone (360 px) and desktop widths,
// answering from the same generator code in Node (so it knows every true answer), against a local worker.
//   cd worker && npm run db:init:local && npm run dev:local     (in another terminal)
//   node tools/e2e-ui.mjs                 (API=off to skip the leaderboard checks)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { todayKey } from '../site/js/daily.js';
import { dayPlan, practiceTask } from '../site/js/plan.js';
import { centroid } from '../site/js/geometry.js';
import { pointAt } from '../site/js/tasks/midpoint.js';
import { serve } from './serve.mjs';

const API = process.env.API || 'http://127.0.0.1:8821';
const useApi = API !== 'off';
const today = todayKey();
const plan = dayPlan(today);
fs.mkdirSync('tools/results', { recursive: true });
const srv = await serve(8082);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
const HUB = process.env.HUB || 'http://127.0.0.1:8831'; // jacob.gg hub worker (ratings), run from the jacob.gg repo
const url = (q = '') => `http://localhost:8082/${q}${q ? '&' : '?'}api=${useApi ? encodeURIComponent(API) : 'off'}&hub=${encodeURIComponent(HUB)}`;

/** Click a stage point given in stage units. */
async function tapStage(page, x, y) {
  const box = await page.locator('.stage-canvas').boundingBox();
  await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
}

/** Answer a task. `exact` = the true answer (or as close as input allows); otherwise a deliberately off one. */
async function answer(page, task, exact = true) {
  const p = task.params;
  const type = async (n) => { await page.keyboard.type(String(n)); await page.keyboard.press('Enter'); };
  switch (task.type) {
    case 'count': await type(exact ? p.n : Math.round(p.n * 1.5)); return type(p.pct);
    case 'angle': return type(exact ? p.angle : Math.round(p.angle) + 20);
    case 'proportion': return type(exact ? p.truth : Math.min(100, Math.round(p.truth) + 25));
    case 'area': {
      const [x, y] = centroid(p.polys[exact ? p.bigger : 1 - p.bigger]);
      await tapStage(page, x, y);
      return type(Math.round((p.ratio - 1) * 100));
    }
    case 'midpoint': {
      const [x, y] = p.sub === 'noodle' ? pointAt(p, exact ? 0.5 : 0.65) : [p.truth[0] + (exact ? 0 : 0.1), p.truth[1]];
      await tapStage(page, x, y);
      return page.click('.ctl-btn');
    }
    case 'length': {
      const i = exact ? p.longest : (p.longest + 1) % p.lines.length;
      const [x, y] = p.lines[i].pts[Math.floor(p.lines[i].pts.length / 2)];
      await tapStage(page, x, y);
      return page.click('.ctl-btn');
    }
    case 'timing': {
      await tapStage(page, 0.5, 0.5);
      await page.waitForTimeout(p.seconds * 1000 * (exact ? 1 : 1.4) - 40);
      return tapStage(page, 0.5, 0.5);
    }
    case 'colour': {
      if (p.memory) await page.waitForTimeout(p.memoryMs + 200);
      await page.waitForFunction(() => document.querySelector('.ctl-btn')?.textContent.includes('Tap a colour'));
      const spots = await page.evaluate(() => window.__swatches);
      const [x, y] = spots[exact ? p.answer : (p.answer + 1) % p.palette.length];
      await tapStage(page, x, y);
      return page.click('.ctl-btn');
    }
  }
}

const expected = [];
async function playDay(page, tag, shots) {
  await page.waitForSelector('#daynum:has-text("Perceptle #")');
  if (shots) await page.screenshot({ path: `tools/results/${tag}-1-intro.png`, fullPage: true });
  if (await page.isVisible('#name')) await page.fill('#name', `Tester ${tag}`);
  await page.click('#start');
  await page.waitForSelector('.arena');
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i];
    await page.waitForFunction(([n, total]) => document.querySelector(".arena-name")?.textContent.startsWith(`${n}/${total}`), [i + 1, plan.tasks.length], { timeout: 15000 });
    await page.waitForTimeout(150);
    // layout lock: nothing scrolls, the stage is square and inside the viewport
    const lock = await page.evaluate(() => {
      const c = document.querySelector('.stage-canvas').getBoundingClientRect();
      return {
        locked: document.documentElement.classList.contains('locked'),
        scroll: document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth,
        square: Math.abs(c.width - c.height) < 1, inside: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight,
        w: c.width,
      };
    });
    check(`${tag} task ${i + 1} (${task.type}): page locked, no scroll, square stage in view`, lock.locked && lock.scroll && lock.square && lock.inside, `stage ${Math.round(lock.w)}px`);
    if (shots) await page.screenshot({ path: `tools/results/${tag}-2-task${i + 1}-${task.type}.png` });
    const exact = i !== 2; // get task 3 deliberately wrong
    await answer(page, task, exact);
    await page.waitForSelector('.arena-result:not([hidden])');
    const pts = Number(await page.textContent('.arena-points'));
    expected[i] = pts;
    const okScore = exact ? pts >= (task.type === 'timing' ? 85 : task.type === 'area' ? 90 : 95) : pts < 95;
    check(`${tag} task ${i + 1} (${task.type}) scored ${exact ? 'near 100 when right' : 'less when wrong'}`, okScore, String(pts));
    if (shots) await page.screenshot({ path: `tools/results/${tag}-3-reveal${i + 1}-${task.type}.png` });
    await page.click('.ctl-btn');
  }
  await page.waitForSelector('#done:not([hidden])');
  const totalShown = Number(await page.textContent('#daily-score'));
  check(`${tag} total is the sum of the tasks`, Math.abs(totalShown - expected.reduce((a, b) => a + b, 0)) < 0.005, String(totalShown));
  check(`${tag} page unlocked after the game`, !(await page.evaluate(() => document.documentElement.classList.contains('locked'))));
  if (shots) await page.screenshot({ path: `tools/results/${tag}-4-done.png`, fullPage: true });
  return totalShown;
}

const errors = [];
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text())); };

// --- phone, 360 px ---
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.addInitScript(() => { window.__debug = true; });
const phone = await ctx.newPage();
watch(phone);
await phone.goto(url());
const scoreP = await playDay(phone, 'phone', true);
const scrollW = await phone.evaluate(() => document.documentElement.scrollWidth);
check('no horizontal scroll at 360 px', scrollW <= 360, String(scrollW));
if (useApi) {
  await phone.waitForSelector('#rows .row', { timeout: 10000 });
  await phone.waitForTimeout(800);
  await phone.reload();
  await phone.waitForSelector('#rows .row');
  const board = await phone.$$eval('#rows .row', (rs) => rs.map((r) => r.textContent));
  check('leaderboard shows the player with the same total the browser showed', board.some((t) => t.includes("Tester phone") && t.endsWith(scoreP.toFixed(2))), JSON.stringify(board));
}
await phone.reload();
await phone.waitForSelector('#done:not([hidden])');
check('finished state survives a reload', Number(await phone.textContent('#daily-score')) === scoreP);
check('practice unlocked after finishing', await phone.isVisible('#practice'));
await phone.click('#practice-start');
await phone.waitForSelector('.arena .arena-close');
check('practice opens a closable arena', true);
await phone.click('.arena-close');
check('closing practice unlocks the page', !(await phone.evaluate(() => document.documentElement.classList.contains('locked'))));
await phone.click('#archive-browse');
await phone.waitForSelector('#archive-list:not([hidden])');
check('archive opens', (await phone.textContent('#archive-list')).length > 0);

// --- abandoning a task mid-way scores it 0 ---
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const quitter = await ctx2.newPage();
watch(quitter);
await quitter.goto(url());
await quitter.fill('#name', 'Quitter');
await quitter.click('#start');
await quitter.waitForFunction(() => document.querySelector('.arena-name')?.textContent.startsWith('1/8'), null, { timeout: 15000 });
await quitter.reload();
await quitter.waitForSelector('#intro:not([hidden])');
check('reload mid-task: that task scores 0, continue from the next', (await quitter.textContent('#start-label')).includes('task 2 of 8'));

// --- desktop, 1280 px ---
const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await dctx.addInitScript(() => { window.__debug = true; });
const desk = await dctx.newPage();
watch(desk);
await desk.goto(url());
await playDay(desk, 'desktop', true);

// --- storage blocked: still playable ---
const ctx3 = await browser.newContext();
await ctx3.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
const blocked = await ctx3.newPage();
const blockedErrors = []; blocked.on('pageerror', (e) => blockedErrors.push(e.message));
await blocked.goto('http://localhost:8082/');
await blocked.fill('#name', 'NoStorage');
await blocked.click('#start');
await blocked.waitForFunction(() => document.querySelector('.arena-name')?.textContent.startsWith('1/8'), null, { timeout: 15000 });
check('works with localStorage blocked', blockedErrors.length === 0, blockedErrors.join(' | '));

// --- one of every task type, rendered at 360 px, for the screenshots ---
const gallery = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
watch(gallery);
for (const type of ['count', 'angle', 'area', 'midpoint', 'proportion', 'length', 'timing', 'colour']) {
  for (const [w, illusion] of [[0.4, false], [1, false], [0.5, true]]) {
    const t = practiceTask(`gallery-${type}-${w}`, { type, difficulty: w, illusion });
    await gallery.goto(`http://localhost:8082/dev/show.html?seed=gallery-${type}-${w}&type=${type}&d=${w}&illusion=${illusion ? 1 : 0}`);
    await gallery.waitForSelector('.stage-canvas');
    await gallery.waitForTimeout(250);
    await gallery.screenshot({ path: `tools/results/gallery-${type}-${illusion ? 'illusion' : `d${w}`}.png` });
    if (!t) check('gallery task', false);
  }
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); srv.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
