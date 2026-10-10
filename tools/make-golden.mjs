// Writes test/fixtures/golden.json: digests of every day's tasks (and layouts) for the first 400 days.
// `node tools/make-golden.mjs` adds missing days and refuses to change any day already recorded.
import fs from 'node:fs';
import { EPOCH, addDays } from '../site/js/daily.js';
import { dayDigest } from '../site/js/digest.js';

const FILE = new URL('../test/fixtures/golden.json', import.meta.url);
const N = 400;
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { days: {} };
const days = { ...old.days };
let changed = 0;
for (let i = 0; i < N; i++) {
  const d = addDays(EPOCH, i);
  const h = dayDigest(d);
  if (days[d] && days[d] !== h) { changed++; console.error(`CHANGED ${d}: ${days[d]} -> ${h}`); }
  else days[d] = h;
}
if (changed) { console.error(`\n${changed} existing days would change. Not written. Gate the generator change on a future date.`); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify({ note: 'Digests of each day\'s tasks. Never edit by hand; see tools/make-golden.mjs.', days }, null, 1) + '\n');
console.log(`golden.json: ${Object.keys(days).length} days`);

// the browser check page (site/dev/determinism.html) compares against this
const { rangeDigest } = await import('../site/js/digest.js');
const r = rangeDigest(EPOCH, N);
fs.writeFileSync(new URL('../site/dev/expected.json', import.meta.url), JSON.stringify({ from: EPOCH, n: N, all: r.all }) + '\n');
console.log(`site/dev/expected.json: ${r.all}`);
