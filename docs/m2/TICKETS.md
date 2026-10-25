# Tumble Rush M2 — Ticket Breakdown

**Spec:** [`docs/m2/SPEC.md`](./SPEC.md)
**Grill:** [`docs/m2/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md)
**Milestone:** `Tumble Rush M2 — Show Pacing & Fairness`
**Delivery:** one feature branch (`feat/m2-pacing`) → one PR into `main` → deploy.

Each ticket is a vertical slice that leaves the show playable and the build green. Acceptance criteria are binary; a pacing change without a measured before/after is not accepted.

---

## Dependency graph

```
M2-001 Pacing harness & baseline gate
  ├─ M2-002 Course humanization & fair qualification
  ├─ M2-003 Hexapop tension
  └─ M2-004 Crown Climb living winner
        └─ M2-005 Spectate camera & show feel
              └─ M2-006 Pacing QA, evidence, hardware protocol
```

M2-002/003/004 can run in parallel once the harness exists. M2-005 needs the three Round tuning passes. M2-006 is the release gate.

---

## M2-001 — Full-show pacing harness and baseline gate

**Type:** infrastructure + qa · **Priority:** P0 · **Blocked by:** none

**What to build**

A repeatable command that drives the real `Match` through a full show with no input and with a scripted casual input path, and reports the numbers M2 is judged on. The existing `measure:show` only measures each Round independently; this ticket makes it a full-show, 10-seed release gate.

**Acceptance**

- [ ] `npm run measure:show -- --runs=10` outputs per-Round clocks, finishers, qualifiers, player status, living-winner state, total show clock, and a median.
- [ ] A full-show mode advances through all three Rounds using the real Match/Director; it does not use `forcePlayerWin` to skip play.
- [ ] A scripted "casual" input path exists and reports whether the human qualified (no wall-clock sleeps).
- [ ] `npm run verify:pacing` fails outside the M2 bands and passes when the bands are met.
- [ ] `docs/METRICS.md` records the v1 baseline and the new command.
- [ ] Unit/helper tests for the pace bands and anchor math; no flaky timing assertions.
- [ ] `npm run check` and the existing `verify:show` stay green.

**Evidence:** baseline JSON, 10-seed sweep output, failing/passing `verify:pacing` log.

---

## M2-002 — Course humanization and fair qualification

**Type:** gameplay + content · **Priority:** P0 · **Blocked by:** M2-001

**What to build**

A Course that lasts 45–90 seconds with humanized bots, a bounded human-pace anchor, 8+ real finishers, and a qualification window a casual human can use. If the current 173 u layout cannot reach the band, add a second lap of the existing five sections and move the finish gate to the end of lap 2.

**Acceptance**

- [ ] Show-preset Course clock is 45–90 s in the 10-seed sweep (median and per-seed bounds).
- [ ] 8+ real finishers before the timer on the baseline seed and the sweep.
- [ ] A scripted casual input path qualifies at least 7/10; an idle human never qualifies.
- [ ] Bots use 0.62–0.78 of max target speed with skill variation; no teleport, no free jump, no hidden speed above the player's cap.
- [ ] The human-pace anchor is bounded to 8–10% and only slows bots when the human is >25% behind; it never applies in the final.
- [ ] If a second lap is added, it reuses the existing section grammar, colliders, and waypoints; the finish gate and qualification rule are coherent.
- [ ] No new mode, biome, or art direction.
- [ ] Real-Match Course tests and Playwright results pass; no console errors.

**Evidence:** before/after `measure:show` Course rows, casual qualification log, screenshot of the extended Course/finish if a second lap is used.

---

## M2-003 — Hexapop tension and Sugar Rush

**Type:** gameplay + content · **Priority:** P0 · **Blocked by:** M2-001

**What to build**

A Hexapop that lasts 30–50 seconds, reaches the 45 s Sugar Rush, and makes standing still a losing strategy. Bots hop and choose tiles at a readable cadence; the center perch expires; the slime and kill plane are consistent.

**Acceptance**

- [ ] Show-preset Hexapop clock is 30–50 s in the sweep.
- [ ] Sugar Rush triggers at 45 s in rounds that reach it; the outer ring visibly collapses.
- [ ] A stationary center player is eliminated; no permanent safe podium.
- [ ] 4 survivors still advance; the Round never resolves on the first step.
- [ ] Bots hop and survive long enough that the floor is the threat; no pile-on-the-center behavior.
- [ ] Existing Hexapop tests and the real `jumpToRound(1)` spawn test stay green.

**Evidence:** before/after Hexapop duration, Sugar Rush screenshot, stationary-player elimination log.

---

## M2-004 — Crown Climb living winner

**Type:** gameplay + content · **Priority:** P0 · **Blocked by:** M2-001

**What to build**

A Crown Climb that lasts 45–80 seconds and produces a living winner in ≥95% of a 10-seed sweep. Bots climb, time the rotating beams/donuts, recover from knocks, and touch the crown. Timeout-height remains a rare safety net.

**Acceptance**

- [ ] Crown clock is 45–80 s in the sweep.
- [ ] Living crown winner ≥95% over 10 seeds.
- [ ] Bots physically touch the crown in the winning runs; no hidden teleport or free jump.
- [ ] Timeout-height fallback still exists and never names an eliminated bean as a living winner.
- [ ] The crown ceremony triggers correctly for a bot win and a human win.
- [ ] Existing Crown tests and the `jumpToRound(2)` path stay green.

**Evidence:** 10-seed Crown table, living-winner screenshots, timeout fallback test.

---

## M2-005 — Spectate camera and show feel

**Type:** ux + gameplay · **Priority:** P1 · **Blocked by:** M2-002, M2-003, M2-004

**What to build**

A clear spectate follow-cam and a show rhythm that does not fight the new pacing. The camera frames the living leader, hides non-target tags, and never ends up inside a bean or slime. Intro/results timing stays snappy enough for a 3–5 minute show.

**Acceptance**

- [ ] Spectate follows the living leader with a clear shot in a dense pack; non-target tags are hidden.
- [ ] Leader changes snap smoothly; no living leader resolves the Round immediately.
- [ ] Camera never ends inside a bot or slime in the evidence captures.
- [ ] Skip-to-results still appears after 3 s.
- [ ] Intro/countdown/results do not add more than ~90 s total to the show.
- [ ] Mobile 390×844 layout and keyboard focus remain intact.

**Evidence:** spectate screenshots at desktop and mobile, show timing table, no-console-error run.

---

## M2-006 — Pacing QA, evidence, and hardware protocol

**Type:** qa + infra · **Priority:** P0 · **Blocked by:** M2-002, M2-003, M2-004, M2-005

**What to build**

The release evidence for M2: a 10-seed pacing sweep, real-Match tests for each Round, Playwright coverage, updated screenshots, and the hardware-FPS protocol. The README and metrics reflect the new measured show length.

**Acceptance**

- [ ] `npm run check` passes; unit tests include the new pacing helpers and Match behavior.
- [ ] `npm run verify:show` and `npm run verify:pacing` pass.
- [ ] `npm run test:e2e` passes; no console errors.
- [ ] 10-seed sweep: median 3–5 min total, no show <2.5 or >6; Course 45–90 s / 8+ finishers; Hex 30–50 s; Crown 45–80 s / living winner ≥95%.
- [ ] Evidence refreshed: menu, Course, Hexapop, Crown, spectate, results, victory, mobile.
- [ ] `docs/METRICS.md` updated with the sweep and the hardware-FPS protocol; README show-length copy matches the build.
- [ ] `GITHUB_PAGES=true npm run build` passes; Pages deploy verified after merge.
- [ ] No open issues/PRs; branch/worktree cleaned.

**Evidence:** sweep JSON, test logs, screenshot set, live URL.

---

## Cross-cutting quality bar

Every ticket leaves `npm run check` green. No teleports or hidden speed. No new mode/biome. No wall-clock pacing tests. No console errors. No public claim that the build does not meet. The 10-seed sweep is the tiebreaker.
