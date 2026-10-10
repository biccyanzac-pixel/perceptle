# Perceptle: notes for coding agents

Start with README.md, then docs/build-status.md, docs/tasks.md and docs/scoring.md.

Critical rules:
- **Never change what a past or current day generates.** Everything is generated from the date by `site/js/plan.js`
  and the generators in `site/js/tasks/`. `test/fixtures/golden.json` pins 400 days; `npm test` must stay green.
  Gate generator changes on a future date and add task types only via a new entry in `POOLS` with a future date.
  Never change `EPOCH`, the RNG, or `dmath.js`.
- **Determinism:** generators and scorers may use only `+ - * /`, `Math.sqrt/round/floor/ceil/abs/min/max/sign`
  and `site/js/dmath.js`. Never `Math.sin/cos/exp/log/pow/hypot/atan2/cbrt/random` or `**` (a test checks).
  Drawing code (`site/js/render/`) may use anything. After generator changes run `node tools/determinism.mjs`.
- After changing anything the worker bundles (`site/js/{daily,plan,scoring,dmath,rng,geometry,colour}.js`,
  `site/js/tasks/*`), redeploy the worker: `cd worker && npx wrangler deploy`.
- Free project: ask the owner before adding any paid service or analytics.
- Commit as `biccyanzac-pixel <285977456+biccyanzac-pixel@users.noreply.github.com>` (repo-local config). Deploy the
  site with `git subtree split --prefix site -b gh-pages && git push -f origin gh-pages`.
- Local ports: site 8082, worker 8821 (8080/8081 and 8787/8797/8798/8799/8811 belong to the other games). Don't
  touch other games' workers or databases.
- Tests: `npm test`, `node tools/determinism.mjs`, `cd worker && npm run dev:local` + `npm test`, `node tools/e2e-ui.mjs`.
