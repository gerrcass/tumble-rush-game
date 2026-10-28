# M4 implementation notes — twist seams

These notes map the code a twist touches. They are a starting point for the
implementation agent, not a second spec. The spec is the contract.

## Twist contract and plan

- New pure module: `src/game/twist.ts`. No Three.js, DOM, Match, or Level
  import cycle. Export `TwistId`, `TwistPlan`, `TwistRules`, `TWISTS`,
  `CLASSIC_RULES`, `twistForSeed(seed)`, `twistRulesFor(mode, plan)`.
- `src/game/levels/coursePlan.ts`:
  - `ShowPlan` gains `twist: TwistPlan`.
  - `planShow(seed)` selects the twist from a salted hash of the normalized
    seed, independent of the route/arena RNG. Do not draw it from the existing
    `routeRng`; that would shift the M3 route and arena sequence.
  - `signature` becomes `<course> · <arena> · <short>`; `label` becomes
    `COURSE ... · ARENA ... · TWIST <label>`.
  - Keep `courseSignature`, `lapRoutes`, `routeLabel`, and `arenaLabel` stable
    for `scripts/lib/variety.mjs` and `src/types/debug.ts`.
- `src/types/debug.ts`: add a `DebugTwist` record to `TumbleDebugApi`
  (`id`, `label`, `short`, `rule`, `gravity`, `frictionScale`,
  `sugarRushSeconds`, `applied`, `classic`) and expose it from `Game.debug`.
  The twist gate reads this probe; it must reflect the live world, not the plan
  alone.

## Physics and controller

- `src/game/physics/PhysicsWorld.ts`:
  - `GRAVITY = -26` is exported.
  - `gravity` is currently `readonly` and set from the constructor; add a
    `setGravity(value)` method and keep the getter.
  - The fixed step integrates `this.gravity`; no other change.
- `src/game/player/BeanController.ts`:
  - Constants: `GROUND_ACCEL 55`, `AIR_CONTROL 0.65`, `GROUND_FRICTION 14`,
    `AIR_DRAG 1.2`, `JUMP_VELOCITY 8.6`.
  - Add a `private rules: TwistRules = CLASSIC_RULES` and `setRules(rules)`.
    Use `rules.jumpScale` in `tryJump`, `rules.accelScale`/`frictionScale` in
    `applyMovement`, and `airControlScale`/`airDragScale` in the air branch.
  - Do not change `MAX_RUN_SPEED`, dive impulse, grab range, coyote time, jump
    buffer, or the camera.
- `src/game/Game.ts`:
  - `installLevel(mode, seed)` builds the level. After `createLevel`, resolve
    `twistRulesFor(mode, planShow(seed))`, call `this.world.setGravity(GRAVITY *
    rules.gravityScale)`, and call `contestant.controller.setRules(rules)` for
    every contestant (including practice/free-play bots).
  - `installLevel` runs before `prepareRound` resets the entrants; setting the
    rules on all contestants there is enough. A later `resetWorldFor` does not
    recreate controllers.
  - `startPractice('course')` and `startMode('course' | 'hexapop')` go through
    `installLevel`, so they inherit the twist automatically.
  - `startMode('crown-climb')`, `startMode('training')`, and the menu preview
    resolve to `CLASSIC_RULES`.

## Course

- `src/game/levels/Course.ts` builds from `this.plan = planShow(seed).course`
  but currently discards the show twist. Store
  `private readonly twist = planShow(this.seed).twist`.
- Hazard speeds are passed through `this.sweeperSpeed`, `pusherSpeed`,
  `conveyorSpeed`, and pendulum speed. Multiply them at the point they are
  read or when the level is built; do not mutate the shared plan object.
- `status()` should use `this.twist.rules.courseTimeLimit` for `timeLimit`.
- `buildFinishGate` and the module cursor are sensitive; the finish markers
  are now guarded by `courseRoutes.test.ts` (`finishGateZs`, `finishLineZs`).
- Add the twist sign near the start deck with the existing `makeSign` path and
  the level's `ownedTextures`/`materials` cache; put it in `staticVisuals` so
  `mergeColoredMeshes` keeps the draw-call budget.
- Practice uses the same Course class, so the sign and rules follow.

## Hexapop

- `src/game/levels/Hexapop.ts` reads `planShow(seed)` for the arena plan. Store
  the twist too.
- The Sugar Rush time and cap currently come from `Match`'s
  `HEXAPOP_SUGAR_RUSH_SECONDS` / `HEXAPOP_RUSH_SETTLE_SECONDS`, not the level.
  Move the clock to a shared `twist.rules` value and use it in both the Match
  and the level status. The 3.3 s warning is in the level and stays fixed.
- The no-warn-under-a-living-Tumbler rule is in the level; do not change it.
- Add the twist sign near the existing Hexapop sign, using the same materials.
- `spawnPoints`, the centre perch, connectivity, and 8 seats are unchanged.

## Match and HUD

- `src/game/match/Match.ts`:
  - `showPlan` already exists. Use `this.showPlan.twist.rules` for the Course
    and Hexapop time limits and the Sugar Rush time.
  - `definition.timeLimit` remains the Crown 120 s; do not change the Director
    definitions.
  - `MatchHud` gains `twistLabel`, `twistShort`, `twistRule`, `twistClassic`.
  - `hud(level)` fills them from the plan and the current round.
- `src/app/Hud.ts`: add a compact chip next to the seed/clock. It must not
  cover the clock, qualifier count, or touch controls at 390×844.
- `src/app/screens/Overlays.ts`: `fillShowCard` currently prints the route and
  arena. Add the twist label/rule to the intro and results; on Round 3 print
  `FINAL · CLASSIC`. The Daily chip in `StartScreen.ts` gets the short twist.
- `src/app/App.ts` already computes `dailyPlan = planShow(this.daily.seed)`;
  use the same plan for the Daily chip.

## Bots

- `src/game/bots/BotBrain.ts`:
  - Course jump approach is tuned around `jumpApproach 6.4`, `jumpDistance 1.7`
    and `jumpSpeed = COURSE_SPEED_MAX * this.tuning.jumpSpeedScale`.
  - A moon jump has longer airtime. Derive the approach/trigger from the rule
    (e.g. a `jumpApproachScale`/`jumpTriggerScale` on `TwistRules`, or compute
    from the same gravity/jump constants) instead of hard-coding 6.4/1.7.
  - The slippery stop is longer; give the steer a lead based on the stopping
    distance. Do not add a hidden speed or teleport.
  - The casual pilot (`createCasualPilot`) uses the same rules; its jump
    commitment may need its own tuning within the spec. The pilot persists
    across Rounds, so it must resolve the rules for the **current mode** rather
    than capturing the show twist once; the Crown is classic.
- `createBotBrain(mode, contestant, seed)` can read `planShow(seed).twist` or
  receive the rules from `Game`. Prefer passing the rules so the brain cannot
  disagree with the physics.

## Gates and evidence

- `scripts/lib/show-harness.mjs` reads `window.__tumble.plan`, `.show`,
  `.rounds`, `.spectate`, and `.contestants`. Add the twist probe to the
  per-round record; do not add a wall-clock wait.
- `scripts/lib/variety.mjs` is the M3 evaluator. It must keep working; the
  show plan's `courseSignature` and `arenaLabel` are unchanged.
- New `scripts/verify-twists.mjs` + `scripts/lib/twist-gate.mjs` evaluate the
  coverage, applied probe, negative control, and M2 bands. Reuse
  `measureSweep`; do not fork the harness.
- `package.json`: add `verify:twists`; wire it into `gate:release` and CI.
- `e2e/` evidence: add the three twist intro/HUD/sign shots and the
  `FINAL · CLASSIC` card; keep the existing M3 canonical set.
- `docs/METRICS.md`: record the 12-seed twist sweep, per-twist medians, the
  final multipliers, and the render samples.

## Known traps

- **The Crown is classic.** If `Game.installLevel` leaves moon gravity on after
  a Course, the Crown gate will fail and the fixed-final decision is broken.
  Reset gravity and controller rules on every install.
- **The route/arena RNG must not shift.** Select the twist with a separate
  salted RNG or hash; `verify:variety` expects the same route/arena signatures
  for the M3 seeds.
- **The Sugar Rush warning is a readability contract.** RUSH HOUR moves the
  38 s start, not the 3.3 s warning.
- **The twist sign is not a new asset.** Use `makeSign` and the existing
  material cache; the draw-call budget is 320.
- **No wall-clock pacing.** Use `window.__tumble.simulate(seconds)` and the
  fixed step; this host is SwiftShader-only.
- **The start sign must be reachable in the screenshots.** Place it where the
  start camera sees it, not behind the player.

## As built (M4) — final seams

- `src/game/twist.ts` owns `TWISTS`, `CLASSIC_RULES`, `twistForSeed(seed)` and
  `twistRulesFor(mode, plan)`. The hash salt is `0x74776973`; it never draws
  from `routeRng`. The 12-seed deck is 6 MOON / 3 SLIPPERY / 3 RUSH HOUR.
- Final tuning records the only move: moon **airControlScale 1.10 → 1.15**
  (+4.5%, inside the ±15% band). This keeps seed `21098250` inside the Course
  band. `scripts/lib/twist-gate.mjs` mirrors the numbers in `TWIST_TUNING` and
  `src/test/twistGate.test.ts` fails if they drift from `TWISTS`.
- `Game.installLevel(mode, seed, rulesOverride?)` resolves the rule value,
  calls `world.setGravity(GRAVITY * rules.gravityScale)`, and calls
  `controller.setRules(rules)` on every contestant plus the persistent casual
  pilot. The same resolved rules object is passed into `createLevel` so the
  Course hazard scale/clock and the Hexapop Sugar Rush clock cannot disagree
  with the installed physics. `quitToMenu` passes `CLASSIC_RULES` and hides the
  menu start sign; the constructor also resets the menu preview to classic
  gravity. Practice builds its bots before `installLevel`, so the practice pack
  receives the seeded twist too.
- `Game.debug.twist` reads the live world: `gravity`, `frictionScale`,
  `sugarRushSeconds`, `sugarRushReached`, `applied`, `classic`. `applied` is
  derived from the live values and uniform controller rule identity, not from
  the plan label.
- `Course` stores `TwistPlan`, multiplies sweeper/pusher/conveyor/pendulum
  speeds through `hazardSpeed()`, uses `rules.courseTimeLimit`, and builds a
  merged start sign (`buildTwistSign`) with the full label and one-line rule.
  `Hexapop` stores `sugarRushSeconds` / `roundLimit` from the rule set, keeps
  `TILE_WARNING = 3.3`, and adds a second start sign beside the arena sign.
- `Match.roundTimeLimit()` owns the qualifier clocks (Course 105 on RUSH,
  Hexapop 42.9 on RUSH); `Match.sugarRushSeconds()` owns the 38 s beat. The
  Crown keeps `definition.timeLimit = 120`. `MatchHud` exposes
  `twistLabel/twistShort/twistRule/twistClassic`.
- `BotBrain.rules` is the same object the controller receives. Derived
  `airtimeScale = jumpScale / gravityScale` moves the jump approach/trigger;
  `steerLead = 1 / frictionScale` moves the pusher prediction and the grounded
  drift lead. No bot-only speed, jump, teleport or gravity exists. The debug
  casual pilot keeps the same adaptation; its target speed was recalibrated
  from 0.91 to 0.93 (≈0.725 of max, below the 0.78 bot-band top) so the M2
  competence window survives the twists.
- The M4 gate is `scripts/verify-twists.mjs` + `scripts/lib/twist-gate.mjs`.
  It reuses `measureSweep` (no forked harness), emits JSON/table, always runs
  the `applied:false` negative control, and asserts coverage, the live probe,
  the classic Crown and every M2 band. `e2e/m4.spec.ts` covers the UI and the
  live probe; `e2e/m4-evidence.spec.ts` captures the canonical set.
