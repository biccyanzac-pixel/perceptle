# Tasks and generation

## How a day is made
`dayPlan(day)` in `site/js/plan.js`:
1. Difficulty from the UTC weekday (`site/js/daily.js`).
2. A seeded shuffle of the day's pool (`POOLS` in `site/js/tasks/index.js`) is played in full: every type once, in a seeded order.
3. On Sunday, one of them (an illusion-capable type) is the **illusion special**.
4. Each task gets its own seeded stream, `rngFor('perceptle', day, slot, type)`, and its generator makes the params
   (truth included). Heavy display data (dot positions, shaded pieces) comes from `layout()`/`shadedPieces()`,
   also seeded, so the worker never has to compute it.

Everyone gets identical tasks with no server because:
- the RNG is integer-only (FNV-1a + mulberry32);
- generators and scorers use only `+ - * /`, `Math.sqrt` (all exactly rounded by the JS spec) and
  `site/js/dmath.js` (sin, cos, exp, log, pow, cbrt built from those). `Math.sin` and friends are *not*
  guaranteed to give the same bits in V8, SpiderMonkey and JavaScriptCore. A test fails if a generator file
  uses them;
- `tools/determinism.mjs` generates 400 days (with layouts) in Chromium, Firefox and WebKit and compares every
  day's digest with Node. `site/dev/determinism.html` does the same check on any real device (e.g. an iPhone).

**Never change what an existing day generates.** `test/fixtures/golden.json` holds digests of the first 400 days
and `npm test` fails if any change. To change a generator, gate it on a future date
(`if (day >= '2027-01-01')`, passing the day into the generator), then run `node tools/make-golden.mjs`. It
only adds days and refuses to change recorded ones.

## Adding a task type
1. `site/js/tasks/<type>.js` with the same shape as the others: `generate(rng, d, { illusion })`, `validate`,
   `error`, `score`, `prompt`, `truthText`, `answerText`, `illusionCapable`.
2. A renderer in `site/js/render/tasks.js` (`run` resolves with the answer, `reveal` draws the truth).
3. A curve in `CURVES` (`site/js/scoring.js`) and a row in [scoring.md](scoring.md).
4. Append a **new** pool to `POOLS` with a future `from` date that lists the new type. Don't edit old pools.
5. `node tools/make-golden.mjs`, `npm test`, redeploy the worker (it bundles the generators to score answers).

## The library (difficulty d: 0 = Monday … 1 = Saturday)

| Task | What you do | Easier (Monday) | Harder (Saturday) | Sunday illusion special |
|---|---|---|---|---|
| Count 🔢 | dots for 2 s, then: how many in total? then: what % were one kind? The reveal counts them off | 20–70 dots, 2 colours | 70–400, 3 kinds by colour, size or pattern (chosen daily) | some neighbours joined by lines (connected dots look fewer) |
| Angle 📐 | the angle is drawn on a tilted disc (it looks like an ellipse): enter the real angle. The reveal tips the disc flat | almost face-on, near 30/45/60/90… | tilted 30–65°, off-landmark angles | Zöllner-style hatching on the arms |
| Area 🫧 | tap the bigger blob, type how much bigger (%) | ratio 1.35–1.9, smooth shapes | ratio 1.06–1.3, lumpy, stretched | Ebbinghaus: big circles around the bigger blob, small around the smaller |
| Midpoint 🎯 | drag the ✕ along a wiggly noodle to halfway along its length, or tap a shape's centre of mass (balance point). The noodle reveal traces both halves in from the ends | gentle, even wiggles; mostly noodles | dense wiggles bunched towards one end, bigger at one end; more shapes | Müller-Lyer arrowhead and tail at the noodle's ends |
| Proportion 🥧 | type the % of the shape that's coloured in. The reveal pours both parts into a pie of the same area | one straight cut | wedges and two-strip cuts, away from 25/50/75 | (not illusion-capable) |
| Length 📏 | tap the longest line. Each is one line bent into a shape (squiggle, zigzag, spiral, loop, coil, star). The reveal unrolls them into bars | 4 lines, all the same kind, 12–20% apart | 6 lines, all different kinds, 3–6% apart | (not illusion-capable) |
| Timing ⏱️ | Start, then Stop after N seconds | 3–5 s, whole seconds | 4–9 s in half seconds, off-beat pulses | flicker (filled durations feel longer) |
| Colour 🎨 | tap the swatch matching the sample | 6 swatches, near-matches ~0.035 OKLab apart | 8 swatches ~0.012 apart; sample hidden 1.5 s before the palette | sample on a strong complementary surround |

All except Timing have a speed bonus (see [scoring.md](scoring.md)).

Display rules: no grid lines, no snapping (the noodle marker follows the noodle, but along it it moves freely), and dot layouts are
random but non-overlapping (minimum spacing) inside an irregular region, with no clusters.

## Fairness
- The stage is a square sized to the screen (max 620 px), and everything is drawn and scored in stage units.
- While playing, the arena covers the page and the page can't scroll or zoom (touch-action, wheel/keyboard zoom
  blocked, and a warning if the page was already pinch-zoomed). Numbers are entered on an on-screen keypad so the
  phone keyboard never shifts the layout.
- Leaving or reloading during a task scores it 0 (no second look). The worker accepts `null` answers for this.

## What isn't defended
The generator is public JavaScript, so a determined player could compute the answers, and the timing task's
milliseconds come from the browser. That's the same trust model as Factle, Yogle and ridd-le, and it comes with
the spec's "no server" design.
