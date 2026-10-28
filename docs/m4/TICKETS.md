# Tumble Rush M4 — Ticket Breakdown

**Spec:** [`docs/m4/SPEC.md`](./SPEC.md)
**Grill:** [`docs/m4/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md)
**Milestone:** `Tumble Rush M4 — Twist Season`
**Delivery:** one integration branch (`feat/m4-twist-season`) → one PR into `main` → deploy.

Each ticket is a vertical slice that leaves the show playable and the build
green. Acceptance criteria are binary; a twist change without a measured
before/after is not accepted.

---

## Dependency graph

```
M4-001 Twist contract & pure plan
  ├─ M4-002 Physics/controller rules
  ├─ M4-003 Course/Hexapop/Match integration
  └─ M4-004 Show Card, HUD, start signs
        └─ M4-005 Twist gate & fairness tuning
              └─ M4-006 Evidence, performance, docs
                    └─ M4-007 Review, release, deploy, cleanup
```

M4-002, M4-003, and M4-004 can run in parallel once M4-001 lands. M4-005 needs
002 and 003. M4-006 needs 004 and 005. M4-007 is the release.

---

## M4-001 — Twist contract and pure plan

**Type:** engine + content · **Priority:** P0 · **Blocked by:** none

**What to build**

A pure `src/game/twist.ts` contract: `TwistId`, `TwistPlan`, `TwistRules`,
`TWISTS`, `CLASSIC_RULES`, `twistForSeed(seed)`, and `twistRulesFor(mode,
plan)`. `planShow(seed)` selects one twist deterministically, includes it in
the show plan, and adds it to the signature and label. `CLASSIC_RULES` must be
exactly the current constants. No level, UI, or physics change yet; the current
show still plays with classic rules until M4-002/003 land.

**Acceptance**

- [x] `twistForSeed(seed)` is deterministic and returns `moon`, `slippery`, or
      `rush`.
- [x] A 300-seed sweep has each twist between 20% and 45%.
- [x] `CLASSIC_RULES` equals the current gravity, jump, air control, air drag,
      accel, friction, hazard speed, and clock constants.
- [x] Every twist has a non-empty label, short, blurb, accent, and rules.
- [x] `planShow(seed).twist` is stable; `signature` and `label` include it; the
      route and arena for the same seed are unchanged from M3.
- [x] `twistRulesFor('course' | 'hexapop', plan)` returns the plan twist;
      `twistRulesFor('crown-climb' | 'training', plan)` returns
      `CLASSIC_RULES`.
- [x] Unit tests cover determinism, coverage, labels, and the classic baseline.
- [x] `npm run check` is green; no visible behavior change yet.

**Evidence:** plan JSON for the 12-seed set, selection distribution, test
output.

---

## M4-002 — Physics and controller rules

**Type:** engine · **Priority:** P0 · **Blocked by:** M4-001

**What to build**

Make the rules value reach the moving Tumbler without forking the controller.
`PhysicsWorld.setGravity(number)`; `BeanController.setRules(TwistRules)` and
reads of `jumpScale`, `airControlScale`, `airDragScale`, `accelScale`, and
`frictionScale` in the existing movement path. `Game.installLevel` resolves the
rules for the mode, sets the world gravity, and sets every contestant
controller's rules before the Round starts. The Crown, Training Deck, and menu
use `CLASSIC_RULES`.

**Acceptance**

- [x] `CLASSIC_RULES` reproduces the current jump apex, run speed, air drag,
      and stopping distance within the existing test tolerances.
- [x] `PhysicsWorld.setGravity` changes a fall over one fixed step; classic is
      unchanged.
- [x] A moon jump has a longer airtime and a slightly higher apex than classic.
- [x] A slippery stop is longer than classic; the maximum run speed is
      unchanged.
- [x] The controller never exceeds `MAX_RUN_SPEED`, the dive impulse, the grab
      range, the coyote time, or the jump buffer.
- [x] The player and every bot receive the same `TwistRules` object for a
      Round.
- [x] Course/Hexapop use the plan twist; Crown/Training/menu use classic.
- [x] Practice on the Course uses the seeded twist; Training Deck stays classic.
- [x] Switching from a twisted Round to the Crown resets gravity, friction,
      and jump to classic; no rule leaks between Rounds.
- [x] `npm run check` is green; the M2 Course/Hexpop unit probes are green.

**Evidence:** physics/controller test output, a debug probe of gravity and
friction per mode, before/after jump arc numbers.

---

## M4-003 — Course, Hexapop, and Match integration

**Type:** gameplay + content · **Priority:** P0 · **Blocked by:** M4-001, M4-002

**What to build**

Wire the twist into the qualifier rounds. The Course multiplies hazard speeds
and uses the twist time limit. Hexapop uses the twist Sugar Rush and cap while
keeping the 3.3 s warning and the no-warn-under-a-living-Tumbler rule. The
Match uses the twist time limits and exposes the twist to the HUD. The Course
and Hexapop start decks get a small twist sign built from `makeSign` and merged
into the static visuals. Bots and the casual pilot derive jump approach/trigger
and steer lead from the same rules.

**Acceptance**

- [x] Course status limit is 105 s on `rush`, 120 s on `moon`/`slippery`.
- [x] Course hazard speeds are multiplied by 1.10 on `rush`; geometry, routes,
      waypoints, checkpoints, and qualification are unchanged.
- [x] Hexapop reaches the Sugar Rush at 38 s on `rush`; the 3.3 s warning and
      the no-warn-under-a-living-Tumbler rule are unchanged.
- [x] Crown status is 120 s and `CLASSIC_RULES` on every twist.
- [x] The twist sign is visible on the Course and Hexapop starts, uses the
      existing sign path, and adds no new texture family.
- [x] Bots use the same controller and physics; their jump/steer adaptation is
      derived from `TwistRules`, never a hidden stat.
- [x] The real-Match 10-seed probe still has 8+ Course finishers, the Sugar
      Rush on every run, and a living crown winner on every run.
- [x] No wall-clock pacing assertion; use `simulate` / fixed steps.
- [x] `npm run check` is green; the focused Course/Hexapop specs are green.

**Evidence:** time-limit/hazard tests, Sugar Rush probe, start-sign screenshots
for all three twists, bot adaptation diff.

---

## M4-004 — Show Card, HUD, and Daily chip

**Type:** ux · **Priority:** P1 · **Blocked by:** M4-001, M4-003

**What to build**

Name the twist everywhere the player looks. The Round intro gets `TWIST <label>`
and the one-line rule; the Crown intro says `FINAL · CLASSIC`. The results and
show-end repeat the show twist. The Daily chip is `TODAY · <routes> · <arena> ·
<short>`. The HUD gets a compact `TWIST <short>` chip on Rounds 1–2 and
`FINAL · CLASSIC` on Round 3. The chip has an accessible label with the full
rule, uses text as well as colour, and fits 390×844 without covering the clock,
qualifier count, or play area.

**Acceptance**

- [x] Round 1/2 intro shows the full twist label and rule.
- [x] Round 3 intro shows `FINAL · CLASSIC`.
- [x] Results/show-end repeats the show twist.
- [x] Daily chip names today's twist.
- [x] HUD chip is `TWIST <short>` on Course/Hexapop and `FINAL · CLASSIC` on
      Crown.
- [x] The chip and card are keyboard/screen-reader reachable and have an
      accessible label.
- [x] Mobile 390×844: the chip and card do not cover the countdown, clock,
      qualifier count, or touch controls.
- [x] No new screen, no new control, no dead button.
- [x] Playwright covers the intro, HUD, results, Daily chip, and mobile layout.

**Evidence:** desktop and mobile screenshots of all three twist cards and the
`FINAL · CLASSIC` card, accessibility assertions, Playwright output.

---

## M4-005 — Twist gate and fairness tuning

**Type:** qa + gameplay · **Priority:** P0 · **Blocked by:** M4-002, M4-003

**What to build**

`npm run verify:twists`: 12 seeds × idle + scripted casual through the real
`Match`. It records the plan twist, the applied debug probe, every Round clock,
finishers, qualifiers, Sugar Rush, Crown living/touch, and total. It fails on
missing twist coverage, a plan/probe mismatch, any missed M2 band, idle
qualification, casual below 8/12, or a deficient Crown. It includes a negative
control that rejects a run with `applied: false`. Tune the ±15% multipliers
until every twist passes; record the sweep in `docs/METRICS.md`. Wire the gate
into CI and `gate:release`.

**Acceptance**

- [x] `npm run verify:twists` runs 12 seeds × idle + casual and emits JSON and a
      table.
- [x] Each twist appears in at least 3 of 12 seeds.
- [x] The applied probe matches the plan for Course and Hexapop; the Crown
      reports `classic` on every run.
- [x] Every run meets the M2 bands: Course 45–90 s and 8+ finishers, Hexapop
      30–50 s with the Sugar Rush, Crown 45–80 s with a living physical touch,
      total 3–5 min; no show below 150 s or above 360 s.
- [x] Idle 0/12; casual ≥8/12; living crown winner ≥23/24.
- [x] The negative control is rejected.
- [x] `npm run verify:variety` remains green with the twist active.
- [x] `npm run verify:pacing -- --phase=b` remains green, or the difference is
      documented and inside the bands.
- [x] CI runs the twist gate in parallel and `gate:release` includes it.
- [x] `docs/METRICS.md` records the sweep, the per-twist table, the final
      multipliers, and the command.

**Evidence:** twist JSON/table, failing/passing negative control, METRICS diff,
CI job log.

---

## M4-006 — Evidence, performance, and documentation

**Type:** qa + documentation · **Priority:** P1 · **Blocked by:** M4-004, M4-005

**What to build**

The release evidence and the public explanation of the twist. Capture the three
twist intro cards, three HUD chips, three start signs, the `FINAL · CLASSIC`
card, a mobile twist card, and the three-twist render samples. Update the
README, GLOSSARY, METRICS, ADR 0007, implementation notes, and AGENTS so the
public claim matches the build.

**Acceptance**

- [x] `npm run evidence` captures the M4 canonical set; files live in
      `docs/evidence/`.
- [x] Draw calls ≤320 and triangles ≤200k at 1440×810 high on the Course and
      Hexapop starts for all three twists; the values are recorded.
- [x] README describes the twist, the Show Card line, the fixed final, and the
      new gate; no fixed test count that will drift.
- [x] GLOSSARY adds **Twist**, **Twist Rules**, and **Twist Gate**.
- [x] ADR 0007 records "twists are qualifier rules; the Crown is classic".
- [x] METRICS records the 12-seed twist sweep and the performance samples.
- [x] `docs/m4/IMPLEMENTATION-NOTES.md` maps the twist seams for the next agent.
- [x] `GITHUB_PAGES=true npm run build` passes; no runtime network or external
      asset is introduced.
- [x] Accessibility: the chip/card is screen-reader reachable and the mobile
      layout is intact.

**Evidence:** screenshot set, performance table, docs diff, Pages build log.

---

## M4-007 — Review, release, deploy, cleanup

**Type:** qa + infra · **Priority:** P0 · **Blocked by:** M4-006

**What to build**

The release pass. Run the full gate, capture the PR evidence, run an independent
review with a written verdict, fix all blockers, merge into `main`, verify the
Pages deployment, and clean up the milestone.

**Acceptance**

- [ ] `npm run gate:release` is green (check, `verify:show`, pacing, variety,
      twists, Playwright).
- [ ] The independent review is in `docs/REVIEW-M4.md` with a verdict and a
      consequence/verification for each blocker; every blocker is fixed or
      explicitly accepted.
- [ ] The PR uses the `pr` skill template, links every ticket with `Closes #N`,
      and attaches the canonical evidence with `gh --attach`.
- [ ] CI is green on the PR; the PR is merged; the branch is deleted.
- [ ] The Pages deploy workflow is green; the live URL returns 200; the menu,
      Show Card, twist sign, and a real show load with no console or request
      errors.
- [ ] The README hero/screenshot is refreshed from the live deployment if the UI
      changed.
- [ ] The milestone is closed; `npm run release:audit -- --strict` is clean; no
      open issues, PRs, branches, or worktrees remain without a documented
      reason.
- [ ] `docs/RETRO-M4.md` is updated with what the next run should change.

**Evidence:** full gate log, review file, PR URL, deploy run, live screenshot,
release-audit output.

---

## Cross-cutting quality bar

Every ticket leaves `npm run check` green. No teleports or hidden speed. No new
mode, biome, hazard kind, or screen. No wall-clock pacing tests. No console
errors. No public claim the build does not meet. The 12-seed twist gate is the
tiebreaker.
