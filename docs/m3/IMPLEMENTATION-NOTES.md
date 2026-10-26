# M3 implementation notes — current seams

This is a navigation note for the M3 implementer. It describes where the
current code lives and which seams the spec expects to change. It is not a
second spec; the decisions are in [`SPEC.md`](./SPEC.md).

## Show plan

- `src/game/levels/coursePlan.ts` is now the one pure `planShow(seed)`:
  - `COURSE_MODULES` is the section-module contract (id, name, weight, length,
    2 u lead-in, height-neutral middle, A/E bookends);
  - each lap is `A + three distinct middles + E`, with difficulty 6–8;
  - `CoursePlan.laps` owns the cursor, world positions, lap offset, finish gate,
    and course finish; `CoursePlan.sections` is the flat lap-1/lap-2 list;
  - `ShowPlan` adds the arena id/label, `courseSignature`, `routeLabel`,
    `signature`, and the one-line Show Card `label`.
- `planShow` has no Three.js, DOM, or match dependency. The Course, Hexapop,
  Show Card, variety gate, and tests all consume it.
- The route picker uses a separate seeded `Rng` stream so the historical A–E
  hazard parameter draw order stays comparable with the M2 baseline.

## Course

- `src/game/levels/Course.ts` builds `plan.laps` by switching on the module id.
  `this.sectionZ` is the planner's absolute cursor; section builders use local z
  only. Helpers add `sectionZ`/`lapY` to every visual and collider.
- Every middle module is height-neutral: B/C/F/G are flat at y 0; D's slime
  slide descends to −1.6 and now has an authored exit ramp back to y 0. E is the
  finish bookend and ends on the 4.5 finish deck.
- `MODULE_WAYPOINTS` and `CHECKPOINT_LOCAL` are module-local tables. The
  planner offsets them by `section.startZ` and `lap.offsetY`; bots never need to
  know the route order.
- The finish gate is at the end of lap 2 (`plan.courseFinishZ`). Lap 1's gate
  is a lap gate. `sectionAt`/`lapAt` read the plan, not absolute 174/358
  constants.
- F — Tumbler Tangle — is the narrow two-sweeper/pusher beat. G — Bounce Bazaar
  — is the bounce-pad/moving-platform beat. Both use the existing hazard
  builders and collider kinds.
- Module entry waypoints are `jump` so a bot commits at the 1.5–2.5 u module
  gap. The entry platforms of F/G sit on the module boundary.

## Hexapop

- `src/game/levels/hexGrid.ts` is pure axial math; `hexWorld.ts` owns the
  Three.js `Vector3` conversion so `arenaPlan.ts` stays data-only.
- `src/game/levels/arenaPlan.ts` owns the three plans:
  - **RINGS** — the M2 full honeycomb (225 planned tiles, 223 after the chute);
  - **SPIRAL** — one rotating 60° sector removed per ring (188 planned);
  - **GEARWORKS** — three alternating notches on the outer two rings, with a
    full outermost rim so the bots have a recovery edge (189 planned, 188
    after the chute).
  - `arenaCells`, `arenaTileCount`, and `arenaDisconnected` are pure and shared
    by the level, tests, and evidence.
- `Hexapop.ts` selects `planShow(seed).arena`, builds each tier from
  `arenaCells`, and keeps the M2 warning, Sugar Rush, 4-survivor end, and 49.9 s
  cap. Non-RINGS plans skip the solid under-rim so the holes read. A notched
  plan can underfill the row (2–3 survivors); the Round still reaches the
  Sugar Rush and the underfilled Crown still produces a living winner in the
  recorded sweep. The 4-survivor behavior itself is covered by
  `src/test/hexapop.test.ts`.
- The station/perch centre tile is always present. The Match holds a full
  8-bean field until the 45 s Sugar Rush even if it has already lost a slot;
  an underfilled (≤4 entrant) field still resolves after the grace. This is the
  M3 interpretation of "Sugar Rush reached on every run": the authored 45 s
  beat is not optional, and the round still ends at ≤4 survivors.
- `queryTiles`, `nearestSafeTile`, `spawnPoints`, `tileCount`, and
  `collapseOuterRing` keep their public shape. Bots use the same tile query; no
  bot-only bridge or jump.

## Crown (fixed)

The Crown Climb layout, slime speed, and rules are unchanged (ADR 0006). M3
adds two bot-AI fixes that do not alter the level for the player:

- `CrownBrain` uses a short start stagger so four finalists do not push the
  front runner off the start lip before the first jump;
- `CrownClimb.step` applies the slime to every body, not only `bodies[0]`.
  The old single-body check let a fallen finalist sit inside the start-deck
  side while the slime rose past it. This is a bug fix, not a rule variant.

The `CrownBrain` still uses the same controller, physics, waypoints, and
crown-contact test as the human.

## Show plumbing

- `Match.showPlan` is the plan instance exposed to the App. `Course` and
  `Hexapop` call the same pure `planShow(seed)` in their constructors, so the
  card cannot drift from the level.
- `src/app/screens/Overlays.ts` renders the Show Card with a shared
  `fillShowCard` helper in `RoundIntro`, `ResultsOverlay`, and
  `ShowEndOverlay`. The card has an `aria-label` and two chips:
  `COURSE <lap1> / <lap2>` and `ARENA <name>`.
- `StartScreen` receives today's `dailyCard` from `App` and renders
  `TODAY · <route> · <arena>` in the Daily chip.
- `Game` exposes `window.__tumble.plan` (course signature, route, arena,
  label) next to `course`, `renderInfo`, `simulate`, and the show hooks. The
  variety harness reads it; there is no second debug surface.

## Measurement

- `scripts/lib/show-harness.mjs` captures the plan at the start of each observed
  show. `measureSweep` returns idle and casual runs with rounds, totals, player
  status, physical winner fields, and the plan.
- `scripts/verify-variety.mjs` runs 12 seeds × idle + casual, calls
  `scripts/lib/variety.mjs`, and writes JSON plus a table. `--negative` proves
  the gate rejects a collapsed route/arena deck. `src/test/variety.test.ts` is
  the headless negative/positive control.
- `src/test/arenaPlanLevel.test.ts` proves each plan's tile count, 8 seats,
  connectivity, centre perch, stationary-player elimination, and outer-ring
  warning.
- `scripts/verify-pacing.mjs` remains the historical 10-seed M2 gate.

## Commands and budgets

- `npm run check` = invariants + typecheck + unit tests + build.
- `npm run verify:show` = real 16-bean Course + real Hexapop spawn.
- `npm run verify:pacing -- --phase=b` = 10-seed M2 bands.
- `npm run verify:variety` = 12-seed route/arena + M2 band gate.
- `npm run gate:release` = check + verify:show + pacing + variety + full Playwright.
- `npm run evidence` = phase-4 plus M3 canonical screenshots and the render
  budget sample (`docs/evidence/m3-performance.json`).
- CI runs `check`, `pacing`, `variety`, and 3 Playwright shards in parallel.
- Performance budget: 320 draw calls / 200k triangles at 1440×810 high. The M3
  samples are 154–159 / 155k–160k on three route starts and 53–58 / 17.6k–19.1k
  on three arena plans.
- The host is SwiftShader-only; never use FPS as a hardware signal.
