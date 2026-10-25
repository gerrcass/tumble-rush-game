# Independent code review — round 2

**Commit:** `2768637` · **Reviewer:** fresh DeepSeek V4.1 Flash (Max) session · **Verdict:** not ready to merge

Round 1's B1, B2, H2, H4, H5, M1, M2, M6, M7 and the capsule collision fix are verified. M3 is real: 243 draw calls / 117,160 triangles at 1440×810 high. Two blockers and two medium issues remain.

## Blockers

### RB1 — H1 is not fixed in the real pack; the race underfills and the idle human is credited
- **Files:** `src/test/courseRun.test.ts` (isolated test), `src/game/bots/BotBrain.ts` (`think` context), `src/game/match/Match.ts`, `src/game/levels/Course.ts`.
- **Problem:** the no-input test gives each brain `contestants: [bot.contestant]`, disabling shove/pack awareness. In the real 16-bean Match:
  - seed `20260418`: **7 finishers**, 8 dead
  - seed `7`: **5 finishers**, 10 dead
  - seed `123456`: **1 finisher**, 14 dead
  Deaths occur at the first 2.5 u gap (`z ≈ -9`), A→B (`z ≈ -21`), Jelly Jumps (`z ≈ -65…-89`) and the Slime Slide pushers (`z ≈ -127`). The isolated test's 10-finisher result is not representative.
- **Consequence:** Round 1 usually runs to the 120 s timeout; on seed `20260418` the stationary human is ranked **#8, QUALIFIED, 0% course** and earns +75 kudos while eight fallen bots are ELIMINATED. On seed `123456` Round 2 starts with two entrants.
- **Fix:** pass every active entrant to `brain.think`, add a Match-level no-input pack test using the real 16 contestants, and retune the course/bot behavior until 8+ real finishers. Reduce shove aggression near gaps if that is the cause. Do not accept the per-bot test as the H1 gate.
- **Verify:** real-build `simulate` in fixed-step chunks; read the live results overlay; assert 8+ finishers and no idle qualification.

### RB2 — Hexapop human spawns on a ring-1 tile and falls in ~0.5 s
- **Files:** `src/game/Game.ts` (`startPositions`), `src/game/levels/Hexapop.ts` (center `safe`, `PERCH_GRACE`), `src/test/courseRun.test.ts` (synthetic body).
- **Problem:** `Game.startPositions` sorts arena perches by descending z and gives `positions[0]` to the player, so the human spawns at `(1.0, 1.7)`, a ring-1 tile. Only `coord.q === 0 && coord.r === 0` is safe. The tile warns on the first step and drops; the human is eliminated at ~3.25 s with no input. The unit test places a synthetic body at the centre, so it passes while the real spawn is broken.
- **Fix:** reserve the centre perch for the human (do not sort it away) or mark the player's actual spawn tile safe for `PERCH_GRACE`. Test through `Game.startPositions` / a real `jumpToRound(1)`, not a hand-placed body.
- **Verify:** real `jumpToRound(1)` probe: player at centre `(0, 0.43, 0)`, survives the perch grace, and a stationary player is eventually eliminated when the perch expires (not at 0.5 s).

## High

### RH1 — Course timeout qualifies a non-finisher through the living-fill branch
- **Files:** `src/game/match/Match.ts` (`tick`, `resolveRound`), `src/game/match/Director.ts` (`resolveRound`).
- **Problem:** at the 120 s limit, `resolveRound` fills slots from all living entrants. With 7 finishers and 8 dead, the idle human is the eighth living entrant and is marked QUALIFIED. The Course win condition is "top 8 finishers", not "top 8 survivors".
- **Fix:** carry a `timedOut` flag into `resolveRound`; on a Course timeout qualify only finishers. If fewer than the qualifier count finish, advance the finishers (the next Round may have fewer entrants). If zero finish, use the last eliminated by elimination order (not a living non-finisher). Add a Director test with 7 finishers + one idle living player.
- **Verify:** seed `20260418`, simulate to 120 s; the idle human must be ELIMINATED, not QUALIFIED, and no kudos awarded.

## Medium

### RM1 — Round 2 can resolve instantly when Round 1 advances fewer than four
- **Files:** `src/game/match/Match.ts` (`afterPhysics`).
- **Problem:** `alive.length <= definition.qualifiers` is true at t=0 when only two entrants advance, so Hexapop resolves without play.
- **Fix:** require a short grace/at least one elimination before evaluating the survivor count, or explicitly skip an underfilled Round with a "NOT ENOUGH SURVIVORS" stamp and advance. Add a test for a two-entrant Hexapop.
- **Verify:** force a two-qualifier Round 1; Round 2 must either play or skip cleanly, never resolve on the first step.

### RM2 — The geometry-leak Playwright test is flaky
- **File:** `e2e/review1.spec.ts:211-221`.
- **Problem:** the baseline is read immediately after `#play-show` becomes visible, before the menu frame uploads its geometries. First run `before = 14`, `after = 90`; rerun passes. The product leak is fixed; the test is not.
- **Fix:** wait for a rendered menu frame (or 300 ms) before reading `before`. Verify three consecutive runs.
- **Also:** `renderer.info.memory.textures` rose 49 → 52 → 56 → 60 across four shows. Add a texture-count assertion or cache/dispose name-tag textures; do not let it grow unbounded.

## Low (accept or fix)
- **Skip-to-results** appears immediately rather than after SPEC §4's 3 s. Show the banner immediately, reveal the button after 3 s, or document the deviation.
- README/page title/live link/retro remain phase 5.

## Release verdict
**Not ready.** Fix RB1, RB2, RH1, RM1, RM2, then re-run the real 16-bean race, the real Hexapop spawn, the full e2e suite, and a focused round 3 review. Do not accept isolated-bot tests or synthetic spawn tests as proof.
