# Scoring

Every task scores **0–100 points to 2 decimal places** (so 800.00 a day: all eight tasks every day). All the knobs are in
[`site/js/scoring.js`](../site/js/scoring.js): `CURVES`, `WEIGHTS`, `SPEED` and `SPEED_WEIGHT`.

## 1. Accuracy
```
accuracy = 100 / (1 + (err / half)^k)
```
- Only an **exact** answer gets 100 accuracy (there's no "close enough" zone).
- **half** is the error that scores 50. It's the main dial: raise it to make a task more generous.
- **k** = 2: twice the half-error scores 20, and the curve never quite reaches 0. Only no answer scores 0.
- Count asks two questions (how many in total, then what % were one kind). They're weighted
  `WEIGHTS.count` = 65% / 35%.

## 2. Speed bonus
```
points = accuracy × (0.85 + 0.15 × speed)
```
`speed` is 1 if you answer within `SPEED[type].fast` ms of the task appearing, falling linearly to 0 at
`SPEED[type].slow`. A perfect but slow answer scores 85.00, and **100.00 needs exact and fast**. Timing has no
speed part, because time is the task. The time comes from the browser (the same trust model as Factle).

| Task | fast (full bonus) | slow (no bonus) |
|---|---|---|
| Count (includes the 2 s look and both questions) | 9 s | 25 s |
| Angle | 5 s | 18 s |
| Area | 6 s | 20 s |
| Midpoint | 4.5 s | 15 s |
| Proportion | 4.5 s | 15 s |
| Length | 5 s | 18 s |
| Colour | 3.5 s | 12 s |

## Curves: starting guesses, not yet calibrated
Target: **a typical adult averages 60–70 points per task on a Wednesday** (difficulty 0.4), speed bonus
included. These values are first guesses and haven't been tested on real players. Tune them on the calibration page.

| Curve | Error measured | half | 90 acc at | 80 at | 50 at | 20 at |
|---|---|---|---|---|---|---|
| `count` | \|ln(guess / true)\| | 0.3 | 0.1 (≈10% out) | 0.15 | 0.3 (≈35%) | 0.6 (≈80%) |
| `count.pct` | \|guess − true\| in % points ("what % were orange?") | 9 | 3 | 4.5 | 9 | 18 |
| `angle` | \|guess − true\| in degrees (the real angle on the tilted disc) | 9 | 3° | 4.5° | 9° | 18° |
| `area` | \|ln(your ratio) − ln(true ratio)\| | 0.15 | 0.05 | 0.075 | 0.15 | 0.3 |
| `midpoint.noodle` | \|position along the noodle − ½\| (fraction of its length) | 0.05 | 1.7% | 2.5% | 5% | 10% |
| `midpoint.centre` | distance from the centroid / √(area) | 0.08 | 2.7% | 4% | 8% | 16% |
| `proportion` | \|guess − true\| in % points | 7 | 2.3 | 3.5 | 7 | 14 |
| `length` | ln(longest / your pick); 0 if right | 0.04 | 1.3% shorter | 2% | 4% | 8% |
| `timing` | \|tapped − target\| / target | 0.1 | 3.3% | 5% | 10% | 20% |
| `colour` | OKLab distance to the sample; 0 if right | 0.02 | 0.007 | 0.01 | 0.02 | 0.04 |

Notes:
- **Count** uses a log ratio, so 10% out scores the same at 30 dots as at 300, and saying double scores the same
  as saying half.
- **Area**: your implied ratio is `1 + X/100` if you picked the bigger shape, or `1 / (1 + X/100)` if you picked
  the smaller. A wrong pick is scored by the same formula, so no separate penalty is needed.
- **Midpoint**: the noodle marker is stuck to the noodle, so the only error is how far along it you are. Spatial
  errors are relative to the shape's size, and the stage is a square drawn in stage units, so phones and desktops
  score the same.
- **Length** and **colour** are pick-one tasks: the right pick is 100 accuracy, and a wrong one is scored by how
  close it was.
- A task left unanswered (page closed or reloaded mid-task) scores 0.

## Difficulty
From the UTC weekday (`dayDifficulty` in `site/js/daily.js`): Monday 0, Tuesday 0.2, **Wednesday 0.4**,
Thursday 0.6, Friday 0.8, Saturday 1. Sunday is 0.5 plus one illusion special. The curves stay the same all
week; harder days make the *stimuli* harder (see [tasks.md](tasks.md)).

## How to retune
1. Open `calibrate.html` (footer link), choose Wednesday and 20 tasks, and play.
2. For each curve, the table shows your median error, your mean accuracy, and **"Half for 65"** (the `half` that
   would give you a mean accuracy of 65). It also prints JSON. "Show all saved results" pools everything saved
   on that device at that difficulty. The overall line shows mean points with the speed bonus.
3. Set the new `half` values in `CURVES`. Adjust `SPEED` if the fast/slow windows feel wrong.
4. `npm test`, then **redeploy the worker** (`cd worker && npx wrangler deploy`; it bundles `scoring.js`), then
   deploy the site.

Changing a curve changes scores from then on. Points on the leaderboard were stored when they were made and
don't change. Curves don't affect which tasks a day generates, so the golden digests are unaffected.
