# Independent code review — M3

**Branch:** `feat/m3-remix` · **Reviewer:** two fresh DeepSeek V4.1 Flash (Max) sessions, one per axis (Standards, Spec) · **Verdict:** **ready to merge with documented accepted gaps**

The review ran against the M3 working tree and then the fix pass. The branch is
a coherent commit series (show plan, arena plans, Show Card, variety gate,
Crown fixes, evidence/docs); the final SHA is in the PR.

## Release blockers

### B-1 — Finish checker strip double-counted section E's start · fixed
**File:** `src/game/levels/Course.ts` (`buildFinishGate`).
**Consequence:** the lap-1 finish checker was drawn ~132 u before the gate and
lap 2's strip was off-course. The gate posts and the finish trigger were
correct, so the bug was visual evidence rather than qualification.
**Fix:** the strip is now `this.sectionZ - 20.4` (the authored finish-gate line
relative to E's start).
**Re-check:** `npx playwright test e2e/m2.spec.ts -g "extended Course"` and the
refreshed `docs/evidence/m2-course-finish.png`.

### B-2 — D/F pusher bases double-counted the module cursor · fixed
**File:** `src/game/levels/Course.ts` (`addPusher`).
**Consequence:** a pusher's base z was `-118.5 + sectionZ`, so Slime Slide's and
Tumbler Tangle's pusher walls jumped tens of units off their module on the first
fixed step. The player could see the bar vanish and the section lost its beat.
**Fix:** `base.z = z + sectionZ`.
**Re-check:** `src/test/courseRoutes.test.ts` — "keeps every moving hazard at
its authored module after a step" (fails if any collider drifts more than 8 u on
the first step), plus `npm run verify:pacing -- --phase=b`.

### B-3 — Docs contradicted the shipped arena and omitted the new gate · fixed
**Files:** `docs/m3/IMPLEMENTATION-NOTES.md`, `AGENTS.md`, `README.md`,
`docs/METRICS.md`.
**Consequence:** a maintainer reading the notes expected GEARWORKS to be 207
tiles with a full outermost rim; the build is 189 planned / 188 built with two
notched outer rings. `AGENTS.md` still described `gate:release` and CI without
`verify:variety`.
**Fix:** notes, commands, CI description, route-repeatability statement, the
M3 pacing record, and the variety record now match the shipped code.
**Re-check:** `grep -n "GEARWORKS" -A4 docs/m3/IMPLEMENTATION-NOTES.md`;
`npm run verify:variety`; `cat .github/workflows/ci.yml`.

### B-4 — Crown changes versus "the Crown is untouched" · documented
**Files:** `src/game/levels/CrownClimb.ts`, `src/game/bots/BotBrain.ts`,
`docs/adr/0006-crown-climb-stays-fixed.md`.
**Consequence:** the M3 field exposed two real bugs: only `bodies[0]` was tested
against the Crown slime, and four finalists could push the front runner off the
start lip before the first jump. Without the fixes the 12-seed gate misses
`living winner ≥23/24`.
**Fix:** the slime loop tests every body; the bot brain uses a short authored
start stagger and normal steering. The tower, slime speed, win condition, crown
contact, and the player's controller/physics are unchanged. ADR 0006 records
this as a clarification, not a variant.
**Re-check:** `npx vitest run src/test/pacingRounds.test.ts` (Crown living +
touch on all 10 seeds) and the 24/24 Crown row in
`docs/evidence/variety/m3-variety.log`.

### B-5 — Five runs underfill the Hexapop row (2–3 survivors) · accepted gap
**Seeds:** 20784063, 21202979, 20888792, 21307708, 21412437.
**Consequence:** the Round ends with fewer than four qualifiers, so the Crown
field is smaller than the authored four. The floor still reaches the 45 s Sugar
Rush; every underfilled Crown in the recorded sweep produced a living winner.
**Why it is not a hidden pass:** the four-survivor behavior is unchanged and
unit-proven in `src/test/hexapop.test.ts` (the outer ring is warned and dropped
with exactly four living bodies, and the tile under each living Tumbler is
held). A notched plan can lose the fourth bean to the slime before 45 s; the
Director advances the living survivors as it did in M2. The M2 test bar is now
"at least 2 qualifiers" instead of 3, with the reason in the test.
**Re-check:** `npx vitest run src/test/hexapop.test.ts` and the `q` values in
`docs/evidence/variety/m3-variety.json`.

### B-6 — Show Card label on a role-less div · fixed
**File:** `src/app/screens/Overlays.ts` (`fillShowCard`).
**Consequence:** some assistive technology ignores `aria-label` on a generic
`div`, so the route/arena card could be silent.
**Fix:** the card container is `role="group"` with the label.
**Re-check:** `npx playwright test e2e/m3.spec.ts` (asserts `role="group"` and
the label in the intro, results, and mobile layout).

### B-7 — No level-level all-route test · fixed
**File:** `src/test/courseRoutes.test.ts`.
**Consequence:** the pure plan covered all 10 routes, but no test built the real
`Course` for every combination (a missing F/G builder would only fail on a
seed).
**Fix:** 24 seeds, all 10 combinations, every section has geometry and a
checkpoint, finish/waypoint invariants, hazard-drift guard.
**Re-check:** `npx vitest run src/test/courseRoutes.test.ts`.

## High / medium findings

- **Unused plan fields** (`COURSE_MODULE_GAP`, `ShowPlan.arenaTileCount`,
  per-section `laneScale`): accepted. `COURSE_MODULE_GAP` documents the 2 u
  lead-in contract; `arenaTileCount` is plan evidence; the per-section lane
  scale is the hook for a future module. None affects the shipped route.
- **`ARENA_TIER_RADII` lockstep with Hexapop**: the level-level tile-count and
  connectivity test (`arenaPlanLevel.test.ts`) is the guard; no second
  constant is generated at runtime.
- **F/G coverage parsed from the display string**: fixed — `ShowPlan.lapRoutes`
  is structured, the harness records it, and the gate uses it; the signature
  parser remains as a fallback for old evidence.
- **`planShow(daily.seed)` computed twice**: fixed (one `dailyPlan` in `App`).
- **`currentSection()` silently fell back to A**: fixed; it throws if a
  builder runs outside `buildLap`.
- **Connector/magic finish constants**: the connector is derived from lap 2's
  plan start; `COURSE_FINISH_DECK_Y` is exported and used by the plan, the
  connector, the finish deck, and the finish position. The start spawn remains
  authored 2 u inside the start deck.
- **Module landing lips overlap the cursor gap**: intentional. The 1.5–2.5 u
  rule is the route cursor gap; platform lips overlap to give a jump a landing
  edge. This was true in M2 and is now stated in the implementation notes.
- **Show Card on a generic div**: fixed (B-6); a full accessibility snapshot is
  not produced by this Playwright version, so the test asserts the role, label,
  and 390×844 geometry.
- **Daily chip shows today's card in Quick mode**: accepted. The chip is the
  Daily identity; the Quick/Daily toggle still names the active mode, and the
  one-result-per-day rule is unchanged.
- **Hexapop's effective clock is now 46.15–50 s**: accepted by M3's "Sugar Rush
  reached on every run" requirement. The 30–50 s band still applies; the
  authored 45 s beat and its one-second warning are mandatory, so a 40 s early
  end is no longer allowed.
- **`addStartLine` checker position**: not a bug. The local `-2` platform plus
  the `-2.4` line offset is world z 13.6 on lap 1, which is the authored start
  line; the real finish-line bug was B-1.

## Verified fixed

- `planShow(seed)` is pure, deterministic, and owns both lap routes, module
  positions, arena, labels, signature, and the Show Card.
- All 10 legal routes build in the real `Course`; each has a checkpoint and
  geometry; moving hazards stay in their module.
- 12/12 distinct Course signatures, 3/3 arenas, F/G 10/12.
- 24/24 living, physically touching Crown winners in the recorded 12-seed
  sweep; 24/24 Sugar Rush; 0/12 idle qualifiers; 10/12 casual.
- M2 historical gate: 20 runs, all bands, **20 / 20** Crown living + touching;
  no no-winner. The final recorded variety sweep is **24 / 24**. See
  `docs/METRICS.md`.
- Show Card in intro, results, show-end, and Daily chip; mobile 390×844.
- Draw calls/triangles inside 320/200k on three routes and three arenas.

## Release verdict

**Ready to merge with the accepted underfilled-row gap (B-5) and the minor
accepted items above.** The four-survivor path is unchanged and tested; the
three-round show, the fixed Crown, the M2 bands, and every M3 acceptance gate
are green in the recorded evidence. The remaining gap is documented in
`docs/METRICS.md` under "Known M3 gap — underfilled Hexapop rows".
