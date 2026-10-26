# Retrospective — M2 Show Pacing & Fairness

This is the post-M2 retrospective. It focuses on the **agent environment** and the test/CI loop, not on relitigating the design.

## What worked

- The **pacing harness came first**. `measure:show` and the 10-seed `verify:pacing` gate turned a vague “make the show longer” goal into measured bands. The final sweep is 206.96 s median, 20/20 living/physical crown winners, 8–9 Course finishers, 7/10 casual qualification, 0/10 idle qualification.
- The **grill → spec → tickets → fresh sessions** loop kept the work scoped. The second Course lap was the only content-shaped exception, and it was justified by the measurement.
- **Independent review found the real bug**: a Crown total wipe revived and crowned an eliminated bean, and “physical crown touch” was dais proximity. The hardening commit fixed both and made the gate include casual Crown runs.
- The **release gate** (unit + real-pack + pacing + e2e + Pages build) caught a CI-only failure before merge.

## What hurt

### 1. Wall-clock tests are a trap on SwiftShader
The Hexapop smoke test waited 12 real seconds for a 3.3 s tile warning. At ~3 fps, the fixed loop advances ~0.15× real time, so the tile never dropped in CI. The first fix (teleport to a tile) was still wall-clock; the second (center trapdoor) was still wall-clock; the third used `simulate(6)`, which exposed that `Game.simulate` returned early when there was no `Match`. Fixing `simulate` to advance debug free-play made the test deterministic and fast (3.7 s).

**Environment change:** `Game.simulate` now advances free-play rounds; `AGENTS.md` says to use `simulate` for deterministic test time and never wall-clock waits for pacing/collapse. The test comment documents the CI FPS trap.

### 2. The gate hid a casual Crown outlier
The first Phase B gate summarized Crown/Hex/total from idle runs only and checked medians. A 32.13 s casual Crown with no finishers passed. The review caught it; the hardening gate now summarizes idle + casual, checks per-living-winner seed bounds, and asserts physical contact.

**Environment change:** keep the review rule “if a mode has two input paths, the gate must summarize both.” The M2 spec and `docs/METRICS.md` now state the combined-run rule.

### 3. Docs claimed more than the code proved
“Crown touched 10/10” was a finish flag, not a physical contact; “never below four tiles” was not enforced. The hardening review corrected both. The final docs distinguish physical contact, no-winner runs, and the tile-count caveat.

**Environment change:** a public claim needs a physical/measured assertion, not a boolean set by the code under test. The review template already asks for the user-visible consequence and verification; keep using it.

### 4. CI duration is close to the practical limit
The 10-seed pacing gate (~9 min) plus 49 e2e tests (~10–16 min) plus install/check/build fits the 35-minute job, but only just. The repeated CI reruns during the test fix consumed most of the wall-clock budget.

**Environment change:** if M3 adds another long gate, split pacing and e2e into parallel jobs. Until then, keep the 35-minute timeout and run the focused gate locally before pushing.

## Concrete next actions

1. Keep `npm run measure:show` and `npm run verify:pacing -- --phase=b` as the pacing source of truth.
2. Use `simulate` for deterministic time in tests; no wall-clock waits for game-state transitions.
3. Keep the combined idle+casual gate and physical crown assertion.
4. Add a parallel CI job if the total gate exceeds ~25 minutes.
5. Keep the timebox/steer loop and independent review per PR.
6. Document `TUMBLE_E2E_PORT` for local runs when 5173 is occupied.

## M2 result

The show now lasts **3.45 minutes of gameplay** (3–4 minutes including overlays), gives a casual path a 7/10 qualification window, reaches the Sugar Rush 20/20, and produces a living, physically-touching crown winner 20/20. The remaining gap is hardware FPS validation, which this SwiftShader-only host cannot provide.
