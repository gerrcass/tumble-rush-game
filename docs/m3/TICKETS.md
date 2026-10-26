# Tumble Rush M3 — Ticket Breakdown

**Spec:** [`docs/m3/SPEC.md`](./SPEC.md)
**Grill:** [`docs/m3/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md)
**Milestone:** `Tumble Rush M3 — Remix Season`
**Delivery:** one integration branch (`feat/m3-remix`) → one PR into `main` → deploy.

Each ticket is a vertical slice that leaves the show playable and the build
green. Acceptance criteria are binary; a pacing or variety change without a
measured before/after is not accepted.

---

## Dependency graph

```
M3-001 Course modules & show-plan contract
  ├─ M3-002 Remix routes + two new sections
  ├─ M3-003 Show Card UI & Daily chip
  └─ M3-004 Hexapop arena plans
        └─ M3-005 Variety gate & fairness tuning
              └─ M3-006 Evidence, performance, docs
                    └─ M3-007 Release QA, review, deploy
```

M3-002, M3-003, and M3-004 can run in parallel once M3-001 lands. M3-005 needs
both content tickets. M3-006 needs the Show Card and the gate. M3-007 is the
release.

---

## M3-001 — Relocatable Course modules and show-plan contract

**Type:** engine + content · **Priority:** P0 · **Blocked by:** none

**What to build**

A prefactor that makes the Course composable without changing what the player
sees yet. The five existing sections become modules with a single contract:
id, name, difficulty weight, authored length, build at a cursor, checkpoint,
waypoint chain, and height-neutral boundaries. A route planner owns the cursor,
gaps, lap offsets, finish position, and waypoints. A pure show-plan function
returns the two laps and the Hexapop arena id; the current Course and the
current RINGS arena are the first plan it returns. The Course and Hexapop levels
consume that plan instead of hard-coded absolute layout calls.

**Acceptance**

- [ ] `planShow(seed)` is pure, deterministic, and returns a Course plan, a
      Hexapop layout id, labels, and a stable signature.
- [ ] Existing sections A–E are relocatable modules; no module contains another
      module's z constants.
- [ ] A route planner builds the current A-B-C-D-E / A-B-C-D-E Course with the
      same visible start and finish, and the same qualification rule.
- [ ] The Course finish position, checkpoints, and waypoints are derived from
      the plan; no test hard-codes 174/358 as the only legal layout.
- [ ] Hexapop consumes the plan's RINGS layout with the same tile count, safe
      perch, spacing, and Sugar Rush behavior as M2.
- [ ] The M2 10-seed pacing gate still passes, or any drift is recorded as a
      before/after in `docs/METRICS.md` and kept inside the M2 bands.
- [ ] Existing unit tests, `verify:show`, and the Playwright smoke are green.
- [ ] No visible art-direction change; no new physics or hazard kind.

**Evidence:** before/after `measure:show` rows, plan JSON for the baseline seed,
`npm run check` and `verify:pacing` output.

---

## M3-002 — Remix routes and the two new Course sections

**Type:** content + gameplay · **Priority:** P0 · **Blocked by:** M3-001

**What to build**

The visible Course remix: two new sections, **Tumbler Tangle** and **Bounce
Bazaar**, and the route rules that compose A + three of five middles + E per
lap. Lap 1 and lap 2 use different routes and share at most two middles. Routes
have a difficulty total of 6–8 and never repeat a middle within a lap. The two
new sections reuse existing hazards and teach two new beats. Bots get the new
waypoints; the human-pace anchor and the first-8-finishers rule are unchanged.

**Acceptance**

- [ ] Route plans are valid: A + 3 distinct middles + E; difficulty 6–8; lap
      165–185 u; Course 330–370 u; lap 1 and lap 2 differ and share ≤2 middles.
- [ ] Tumbler Tangle and Bounce Bazaar are playable from the real spawn to the
      finish, with signs, checkpoints, waypoints, and no new physics kind.
- [ ] Every legal route includes the finish gate at the end of lap 2 and a lap
      gate at the end of lap 1.
- [ ] Bots use the same controller and physics, follow the module waypoints, and
      can finish on every route; no teleport, no free jump, no hidden speed.
- [ ] The 10-seed Course clock is 45–90 s and 8+ finishers on every seed; the
      idle human never qualifies; the scripted casual pilot qualifies ≥7/10.
- [ ] Qualification remains first 8 finishers; a timeout only advances
      finishers; a living 0% runner never takes a slot.
- [ ] The route plan tests cover all 10 legal three-middle combinations and the
      lap-overlap rule.
- [ ] `npm run check` and the focused Course specs are green; no console errors.

**Evidence:** route plan table, before/after Course rows, screenshots of both
new sections and a remixed results card.

---

## M3-003 — Show Card in the intro, results, and Daily chip

**Type:** ux · **Priority:** P1 · **Blocked by:** M3-001

**What to build**

The Show Card: a compact line that names the two Course routes and the Hexapop
arena. It appears in the Round intro, repeats on the results/show-end card, and
gives the Daily chip on the menu a visible identity. The card is text, not a new
screen. It is announced to assistive technology and fits 390×844 without
covering the countdown or the play area.

**Acceptance**

- [ ] The Round intro shows `COURSE <lap 1> / <lap 2>` and `ARENA <name>`.
- [ ] The results/show-end card repeats the same card and signature.
- [ ] The menu Daily chip names today's route and arena.
- [ ] The card is derived from the same `planShow` used by the levels; it cannot
      drift from the actual layout.
- [ ] The card has an accessible label and is readable at 390×844.
- [ ] Keyboard focus order and the existing intro/countdown behavior are
      unchanged.
- [ ] Playwright covers the intro, results, Daily chip, and mobile layout.

**Evidence:** desktop and mobile screenshots of the card, accessibility
snapshot, Playwright output.

---

## M3-004 — Hexapop arena plans

**Type:** content + gameplay · **Priority:** P0 · **Blocked by:** M3-001

**What to build**

Three connected Hexapop arena plans — **RINGS**, **SPIRAL**, and
**GEARWORKS** — generated from the existing hex grid. Every plan keeps the
centre tile and safe perch, seats the full 8-Tumbler field, and uses the same
3.3 s warning, 45 s Sugar Rush, 4-survivor end, and 49.9 s cap. Bots use the
existing tile query; a plan with a hole must not strand them.

**Acceptance**

- [ ] The show plan selects one of three layouts deterministically per seed.
- [ ] Every layout is connected from the centre to every tile and seats 8
      entrants; tile count stays in 180–230.
- [ ] The centre perch is the human's start on every layout and expires on the
      same 3.4 s grace.
- [ ] A stationary centre player is eliminated on every layout.
- [ ] Sugar Rush drops the outer ring on every layout with four survivors; the
      tile under a living Tumbler is never warned.
- [ ] The 10-seed Hexapop clock is 30–50 s and the Sugar Rush is reached on
      every run; the Round never resolves on the first step.
- [ ] The three layouts are visually distinct in screenshots and produce no
      console errors.
- [ ] Bots finish/survive on every layout with the same physics and tile rules.

**Evidence:** layout diagrams/tile counts, 3-layout pacing rows, screenshots of
all three arenas, stationary-perch test log.

---

## M3-005 — Variety gate and fairness tuning

**Type:** qa + gameplay · **Priority:** P0 · **Blocked by:** M3-002, M3-004

**What to build**

The 12-seed variety gate and the tuning pass it enables. The gate runs idle and
scripted casual shows through the real `Match`, records the route and arena
signature, and asserts both the variety targets and every M2 pacing/fairness
band. Tune the new routes and arena plans until the gate passes; record the
sweep in `docs/METRICS.md`.

**Acceptance**

- [ ] `npm run verify:variety` runs 12 seeds × idle + casual and emits JSON and
      a readable table.
- [ ] At least 8 distinct Course signatures appear; all three arena plans
      appear; F and G each appear in at least 4 shows.
- [ ] Every run meets Course 45–90 s and 8+ finishers, Hexapop 30–50 s with
      Sugar Rush, Crown 45–80 s with a living physical touch, and total 3–5 min.
- [ ] Idle human qualifies 0/12; casual human qualifies ≥8/12; living crown
      winner ≥23/24.
- [ ] The gate fails on a deliberately broken route/arena (negative test).
- [ ] `npm run verify:pacing -- --phase=b` remains green on the historical
      10-seed set, or the difference is documented and within bands.
- [ ] `docs/METRICS.md` records the sweep, the route/arena table, and the
      command.
- [ ] CI runs the gate in parallel and `gate:release` includes it.

**Evidence:** variety JSON/table, failing/passing gate log, METRICS diff.

---

## M3-006 — Evidence, performance, and documentation

**Type:** qa + documentation · **Priority:** P1 · **Blocked by:** M3-003, M3-005

**What to build**

The release evidence and the public explanation of the remix. Capture the Show
Card, both new sections, all three arenas, a remixed results card, and a mobile
card. Sample draw calls/triangles on at least three route signatures and all
three arena plans. Update the README, GLOSSARY, METRICS, and architecture notes
so the public claim matches the build.

**Acceptance**

- [ ] `npm run evidence` captures the M3 canonical set: Show Card, both new
      sections, three arena plans, remixed results, mobile card.
- [ ] Draw calls ≤320 and triangles ≤200k at 1440×810 high on the sampled
      route/arena starts; the values are recorded.
- [ ] README describes the remix, Show Card, route/arena variety, and the new
      gates; no fixed test count that will drift.
- [ ] GLOSSARY adds **Show Card**, **Route**, **Section Module**, **Arena Plan**,
      and **Variety Gate**.
- [ ] METRICS records the 12-seed sweep and the performance samples.
- [ ] The architecture notes describe the module contract and the fixed Crown
      decision.
- [ ] `GITHUB_PAGES=true npm run build` passes; no runtime network or external
      asset is introduced.
- [ ] Accessibility: the card is keyboard/screen-reader reachable and the mobile
      layout is intact.

**Evidence:** screenshot set, performance table, docs diff, Pages build log.

---

## M3-007 — Release QA, independent review, deploy, cleanup

**Type:** qa + infra · **Priority:** P0 · **Blocked by:** M3-006

**What to build**

The release pass. Run the full gate, capture the PR evidence, run an independent
review with a written verdict, fix all blockers, merge into `main`, verify the
Pages deployment, and clean up the milestone.

**Acceptance**

- [ ] `npm run gate:release` is green (check, `verify:show`, variety, Playwright).
- [ ] The independent review is in `docs/REVIEW-M3.md` with a verdict and a
      consequence/verification for each blocker; every blocker is fixed or
      explicitly accepted.
- [ ] The PR uses the `pr` skill template, links every ticket with `Closes #N`,
      and attaches the canonical evidence with `gh --attach`.
- [ ] CI is green on the PR; the PR is merged; the branch is deleted.
- [ ] The Pages deploy workflow is green; the live URL returns 200; the menu,
      Show Card, and a real show load with no console or request errors.
- [ ] The README hero/screenshot is refreshed from the live deployment if the UI
      changed.
- [ ] The milestone is closed; no open issues, PRs, branches, or worktrees
      remain without a documented reason.
- [ ] `docs/RETRO-M3.md` is updated with what the next run should change.

**Evidence:** full gate log, review file, PR URL, deploy run, live screenshot,
cleanup output.

---

## Cross-cutting quality bar

Every ticket leaves `npm run check` green. No teleports or hidden speed. No new
mode, biome, or hazard physics. No wall-clock pacing tests. No console errors.
No public claim the build does not meet. The 12-seed variety gate is the
tiebreaker.
