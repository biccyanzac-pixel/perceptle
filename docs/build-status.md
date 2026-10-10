# Perceptle: build status (2026-10-10)

All four phases were built in one go: the owner asked for a daily game with a leaderboard on the jacob.gg hub,
like the other games, rather than stopping after each phase. Puzzle #1 is 2026-10-10.

## Phase 1: seeded generation + tasks ✅
- `dayPlan(day)` makes 5 tasks from the UTC date: integer RNG (FNV-1a + mulberry32) and a deterministic maths
  library (`dmath.js`), because `Math.sin` and similar functions can differ by a bit between JS engines.
- **Verified identical** across Node, Chromium (V8), Firefox (SpiderMonkey) and WebKit (JavaScriptCore) for 400
  days including layouts (`tools/determinism.mjs`). Golden digests are in `test/fixtures/golden.json`.
- **Not yet verified on real phones.** Open `/perceptle/dev/determinism.html` on an iPhone and an Android phone:
  it should say "Identical".

## Phase 2: scoring + calibration ✅ (curves not yet calibrated)
- One curve shape for all tasks (100 within `full`, 50 at `half`), documented in `docs/scoring.md`.
- `calibrate.html` plays N random tasks and prints errors, scores and a suggested `half` per curve for a mean of 65.
- **The curve values are starting guesses.** Nobody has played them yet. Play 20+ on the calibration page
  (Wednesday) and retune.

## Phase 3: all 8 tasks, weekly difficulty, results, share ✅
- Count, angle, area, midpoint, proportion, length, timing, colour. Difficulty runs from Monday 0 to Saturday 1;
  Sunday is 0.5 with one illusion special (connected dots, Zöllner, Ebbinghaus, Müller-Lyer, flicker,
  simultaneous contrast).
- Flow: name → 3-2-1 → 5 tasks (each answer is followed by the true answer and the points) → 5 bars, total, share
  line (`👁️ Perceptle #1 — 412/500, best: angle 96` + blocks + streak), leaderboard. Practice (unlimited, any
  type and difficulty) unlocks after today's five. There's an archive with a "played later" board.
- Leaving mid-task scores that task 0.

## Phase 4: leaderboard ✅
- Worker `perceptle-leaderboard` + D1 `perceptle-leaderboard` (WEUR) deployed. The server scores the raw answers
  by regenerating the day.
- `worker/test/e2e.mjs`: 20 API checks (server score = browser score for every type, ordering, auth, abandon).

## Tests
- `npm test`: 16 tests (deterministic maths vs Math.*, RNG pinned, golden digests, 5 distinct types a day, Sunday
  special, all types rotate in, count layouts non-overlapping and exact, parameter ranges, a static scan for
  engine-dependent Math, scoring with known inputs).
- `node tools/e2e-ui.mjs`: 34 checks. Full games at 360×640 (touch) and 1280×900, with every task correct except
  one deliberately wrong; layout lock (no scroll, square stage in view); reload mid-task = 0; reload keeps the
  result; practice; archive; storage blocked; leaderboard total = browser total. It also takes screenshots of every
  task type at Wednesday, Saturday and Sunday settings.

## Open / ideas
- Calibrate the curves with real players (see above).
- Real-device checks: iPhone Safari pinch-zoom blocking and the determinism page.
- The timing task trusts the browser's clock, and the generator is public (see docs/tasks.md).
