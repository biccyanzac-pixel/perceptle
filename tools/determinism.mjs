// Cross-engine determinism: generates 400 days of tasks (with layouts) in Chromium (V8), Firefox (SpiderMonkey)
// and WebKit (JavaScriptCore, as in Safari), and checks every day's digest matches Node's. Needs Playwright's
// Firefox/WebKit builds (npx playwright install firefox webkit); uses installed Chrome for Chromium.
//   node tools/determinism.mjs
import fs from 'node:fs';
import os from 'node:os';
import { chromium, firefox, webkit } from 'playwright-core';
import { EPOCH } from '../site/js/daily.js';
import { rangeDigest } from '../site/js/digest.js';
import { serve } from './serve.mjs';

const N = 400;
// Use the matching Playwright build if installed, else any older one found (the page is plain JS, so it works).
function exe(kind) {
  const root = `${os.homedir()}/AppData/Local/ms-playwright`;
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith(kind + '-')).sort().reverse() : [];
  const rel = kind === 'firefox' ? 'firefox/firefox.exe' : 'Playwright.exe';
  for (const d of dirs) if (fs.existsSync(`${root}/${d}/${rel}`)) return { executablePath: `${root}/${d}/${rel}` };
  return {};
}
const node = rangeDigest(EPOCH, N);
const srv = await serve(8083);
let failures = 0;
const engines = [
  ['chromium (V8)', () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })],
  ['firefox (SpiderMonkey)', () => firefox.launch(exe('firefox'))],
  ['webkit (JavaScriptCore)', () => webkit.launch(exe('webkit'))],
];
for (const [name, launch] of engines) {
  let browser;
  try { browser = await launch(); } catch (e) { console.log(`SKIP  ${name}: ${e.message.split('\n')[0]}`); failures++; continue; }
  const page = await browser.newPage();
  await page.goto('http://localhost:8083/dev/determinism.html');
  const r = await page.waitForFunction(() => window.__result, null, { timeout: 120000 }).then((h) => h.jsonValue());
  const diff = Object.keys(node.days).filter((d) => node.days[d] !== r.days[d]);
  const ok = r.all === node.all && r.ok && !diff.length;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${r.all}${diff.length ? `  ${diff.length} days differ, first ${diff[0]}` : ''}`);
  if (!ok) failures++;
  await browser.close();
}
console.log(`node: ${node.all}`);
srv.close();
console.log(failures ? `\n${failures} FAILED` : '\nall engines identical');
process.exit(failures ? 1 : 0);
