# Perceptle

The daily perception olympics. Five quick estimation tasks a day, each a few seconds long, each scored 0–100
for precision, out of 500. No knowledge needed: it tests eyes and instinct. The tasks come from a library of
eight (count, angle, area, midpoint, proportion, length, timing, colour), get harder from Monday to Saturday, and
Sunday has an illusion special. Everyone gets the same tasks each UTC day, and there's a shared leaderboard.

**Play:** https://biccyanzac-pixel.github.io/perceptle/ (also on the [jacob.gg](https://biccyanzac-pixel.github.io/jacob.gg/) hub)

## How it works
```
site/     the static game (GitHub Pages, gh-pages branch = site/)
worker/   leaderboard API (Cloudflare Worker + D1), https://perceptle-leaderboard.jacob-gg-leaderboard-worker.workers.dev
docs/     tasks.md (generation, the task library, fairness), scoring.md (curves and how to retune), build-status.md
test/     unit tests (determinism, golden digests, scoring)
tools/    local server, cross-browser determinism check, browser end-to-end test
```
- **Generated from the date, in the browser.** `dayPlan(day)` (`site/js/plan.js`) seeds an integer RNG with the
  UTC date. Generators use only exactly-rounded arithmetic plus `site/js/dmath.js`, so every engine (Chrome,
  Firefox, Safari, the worker) produces bit-identical tasks. No server and no schedule file.
- **Leaderboard:** the browser sends only `(day, task index, raw answer)`. The worker regenerates that day's
  task with the same code and scores the answer itself. Archive replays go on a separate "played later" board.
- **Fair across screens:** a square stage drawn and scored in stage units, and the page locked against
  scrolling and zooming while you play. Details in [docs/tasks.md](docs/tasks.md).

## Develop
```
npm install
node tools/serve.mjs                       # http://localhost:8082/  (add ?api=off for no leaderboard)
npm test                                   # determinism, golden digests, generator invariants, scoring
node tools/determinism.mjs                 # 400 days in Chromium, Firefox and WebKit vs Node
cd worker && npm install && npm run db:init:local && npm run dev:local     # local leaderboard on :8821
cd worker && npm test                      # API checks against the local worker
node tools/e2e-ui.mjs                      # full games at 360 px and desktop against the local worker, screenshots in tools/results/
```
Use `http://localhost:8082/?api=http://127.0.0.1:8821` for the site with a local worker.
Dev pages: `calibrate.html` (tune the scoring curves), `dev/determinism.html` (does this device generate the
same tasks?), `dev/show.html?type=angle&d=0.4&seed=x` (any single task).

## Deploy
```
git push origin main
git subtree split --prefix site -b gh-pages && git push -f origin gh-pages
cd worker && npx wrangler deploy     # redeploy whenever site/js changes generation or scoring: the worker bundles it
```

## Credits
OKLab colour space by Björn Ottosson (public domain). Game code: no licence chosen yet.
