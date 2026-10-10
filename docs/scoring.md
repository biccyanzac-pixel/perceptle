# Scoring curves

Every task turns an **error** into **0–100 points** with one curve shape. All the knobs are in `CURVES` in
[`site/js/scoring.js`](../site/js/scoring.js).

```
err <= full          -> 100
otherwise            -> round(100 / (1 + ((err - full) / (half - full))^k))
```

- **full**: errors this small score 100 (so a perfect-feeling answer gets full marks despite rounding).
- **half**: the error that scores exactly 50. This is the main dial: raise it to make a task more generous.
- **k**: steepness (integer, so the maths is identical on every device). With k = 2, twice the half-error
  scores about 20, and the tail never quite reaches 0.

## Status: starting guesses, not yet calibrated

The goal is for **a typical adult to average 60–70 per task on a Wednesday** (difficulty 0.4). The values
below are first guesses from rough perception-research ballparks (numerosity estimates are typically 20–30%
out, unaided angle estimates a few degrees, and so on). They have **not** been tested on real players yet.
Tune them with the calibration page (below).

| Curve | Error measured | full | half | 90 pts at | 80 at | 50 at | 20 at |
|---|---|---|---|---|---|---|---|
| `count` | \|ln(guess / true)\| | 0.03 | 0.32 | 0.13 (≈13% out) | 0.18 (≈19%) | 0.32 (≈38%) | 0.61 (≈84%) |
| `angle` | \|guess − true\| in degrees | 1 | 8 | 3.3° | 4.5° | 8° | 15° |
| `area` | \|ln(your ratio) − ln(true ratio)\| | 0.015 | 0.15 | 0.06 | 0.08 | 0.15 | 0.29 |
| `midpoint.line` | distance / line length | 0.004 | 0.03 | 1.3% | 1.7% | 3% | 5.6% |
| `midpoint.centre` | distance / √(shape area) | 0.01 | 0.08 | 3.3% | 4.5% | 8% | 15% |
| `proportion` | \|guess − true\| in percentage points | 1 | 7 | 3 pp | 4 pp | 7 pp | 13 pp |
| `length` | ln(longest / your pick); 0 if right | 0 | 0.03 | 1% shorter | 1.5% | 3% | 6% |
| `timing` | \|tapped − target\| / target | 0.01 | 0.1 | 4% | 5.5% | 10% | 19% |
| `colour` | OKLab distance to the sample; 0 if right | 0 | 0.02 | 0.007 | 0.01 | 0.02 | 0.04 |

Notes on the measures:
- **Count** uses a log ratio, so being 10% out scores the same at 30 dots as at 300, and saying double scores
  the same as saying half.
- **Area**: you pick a shape and say "X% bigger". Your implied ratio of the truly bigger shape to the smaller is
  `1 + X/100` if you picked right, or `1 / (1 + X/100)` if you picked the smaller one. A wrong pick is scored by
  the same formula, so it costs exactly as much as the misjudgement and needs no separate penalty.
- **Midpoint** and every other spatial error is relative to the shape's own size, and everything is drawn on a
  square stage in stage units, so phones and desktops score identically.
- **Length** and **colour** are pick-one tasks: the right pick scores 100, and a wrong pick is scored by how close
  it was (a line 1% shorter than the longest, or a nearly identical colour, still scores well).
- A task left unanswered (page closed or reloaded mid-task) scores 0.

## Difficulty

Difficulty is a number from 0 to 1 set by the UTC weekday (`dayDifficulty` in `site/js/daily.js`): Monday 0,
Tuesday 0.2, **Wednesday 0.4**, Thursday 0.6, Friday 0.8, Saturday 1. Sunday is 0.5 and one task is the
"illusion special". The curves stay the same all week: harder days make the *stimuli* harder (more dots,
off-landmark angles, closer lengths, nearer colours…), so the same perception skill scores lower on Saturday.
What each task changes with difficulty is listed in [tasks.md](tasks.md).

## How to retune

1. Open `calibrate.html` (linked in the site footer). Choose Wednesday and 20 tasks, and play.
2. The results table shows, per curve: your median error, your mean score under the current curves, and
   **"Half for 65"**, the `half` that would give you a mean of 65. It also prints JSON (copy button, and the
   browser console). "Show all saved results" pools every practice and calibration task saved on that device at
   that difficulty, so a few sessions (and other people's devices) give steadier numbers.
3. Set the new `half` values in `CURVES` (keep `full` and `k` unless there's a reason).
4. Run `npm test`, then **redeploy the worker** (`cd worker && npx wrangler deploy`): it bundles `scoring.js`
   to score submissions. Then deploy the site.

Changing a curve changes scores **from then on**. Points already on the leaderboard were computed and stored at
the time and don't change. Curves don't affect which tasks a day generates, so the golden digests are unaffected.

Aim for a typical player (not a keen one) at 60–70. One person's results are one data point, so pool a few
players before making big changes.
