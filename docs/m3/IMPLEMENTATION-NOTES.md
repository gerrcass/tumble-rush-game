# M3 implementation notes — current seams

This is a navigation note for the M3 implementer. It describes where the
current code lives and which seams the spec expects to change. It is not a
second spec; the decisions are in [`SPEC.md`](./SPEC.md).

## Course

- The pure planner is `src/game/levels/coursePlan.ts`. It currently returns the
  fixed five-section grammar, two laps, `finishZ = -156`,
  `courseFinishZ = -340`, `courseLength = 358`, `COURSE_LAP_OFFSET_Z = -184`,
  and `COURSE_LAP_OFFSET_Y = 4.5`.
- `src/game/levels/Course.ts` builds A–E inside `buildLap`; section builders use
  absolute lap-local z values. `this.lapZ`/`this.lapY` are added by the
  `addPlatform`/`addBox`/`addCylinder`/`addSign` helpers, so a section’s
  horizontal/vertical offset is already a first-class idea.
- The waypoint list is a single hard-coded array at the bottom of `Course.ts`
  (`buildWaypoints`). It must be split by module and re-offset by the route
  planner.
- Checkpoints are built in the constructor from a hard-coded z table. They must
  follow the route modules.
- The finish gate and finish position are `Course.finishPosition` and
  `buildSectionE`; the lap connector is `buildLapConnector`. The HUD `sectionAt`
  and `progress` use the plan’s section ranges.
- `CoursePlan.finishZ/courseFinishZ/courseLength` are asserted in
  `src/test/coursePlan.test.ts`; replace exact values with route invariants.
- Current height quirk: section D ends at y −1.6 while A/B/C end at 0. A
  height-neutral module contract needs D to exit at 0, or the planner must own a
  connector ramp. Pick one and make it explicit.

## Hexapop

- `src/game/levels/Hexapop.ts` builds three tiers with `hexDisc(radius)` and
  filters a centre chute. `buildTiers` is the shape seam.
- The safe centre tile is `(tier 0, q 0, r 0)` and `safeTileIndices`.
  `openPerch` disables the podium, clears `safe`, and warns the centre tile.
- `queryTiles`, `nearestSafeTile`, `spawnPoints`, `tileCount`, and
  `collapseOuterRing` are the public/bot seams. Keep the same snapshot shape.
- `src/game/levels/hexGrid.ts` has `hexDisc`, `hexRing`, `hexNeighbours`, and
  `hexDistance`; use them for plan connectivity tests.
- The M2 counts are 223 tiles, 3.3 s warning, 45 s Sugar Rush, 4 survivors,
  49.9 s cap. The M3 plans must stay in 180–230 tiles and keep those rules.

## Show plumbing

- `src/game/levels/factory.ts` is the only level switch (`createLevel(mode,
  seed)`). If the show plan is passed explicitly, this is the boundary; if the
  levels call `planShow(seed)` themselves, keep it deterministic and cheap.
- `src/game/Game.ts` creates the Match, installs levels in `prepareRound`, and
  exposes the debug hook. `startShow`, `startObservedShow`,
  `startCasualRun`, `startMode`, and `prepareRound` are the entry points.
- `src/game/match/Director.ts` owns `SHOW_ROUNDS` and the labels/objectives.
  M3 should not add a new mode; the Course and Hexapop labels can stay the
  `SUNRISE SCRAMBLE` / `HEXAPOP` titles.
- `src/app/screens/Overlays.ts` has `RoundIntro` and the results/show-end card;
  `src/app/App.ts` builds the intro from `Match` and the show result.
- `src/app/Hud.ts` reacts to `roundTitle`; do not add a live HUD element for the
  Show Card.

## Measurement

- `scripts/lib/show-harness.mjs` drives the real page/`Match`; `measureSweep`
  returns per-run rounds, totals, player status, and physical winner fields.
- `scripts/verify-pacing.mjs` is the 10-seed M2 gate; `scripts/lib/pacing.mjs`
  summarizes and evaluates. Add the 12-seed variety gate beside it, reusing the
  harness rather than a new probe.
- `src/test/pacingRounds.test.ts` is the headless real-Match M2 test; add a
  smaller variety equivalent, and keep the external gate as the exhaustive one.
- `window.__tumble` exposes `simulate`, `startMode`, `startObservedShow`,
  `startCasualRun`, `jumpToRound`, `course`, `renderInfo`, `tileCount`,
  `crownPosition`, and `levelStatus`. Use it for Playwright; do not add a second
  debug surface.

## Commands and budgets

- `npm run check` = invariants + typecheck + unit tests + build.
- `npm run verify:show` = real 16-bean Course + real Hexapop spawn.
- `npm run verify:pacing -- --phase=b` = 10-seed M2 bands.
- `npm run gate:release` = check + verify:show + pacing + full Playwright.
- CI: parallel `check`, `pacing`, and 3-shard Playwright. Use `npx playwright
  test --shard=N/3` to reproduce a shard.
- Performance budget: 320 draw calls / 200k triangles at 1440×810 high; the
  M2 Course start is 305 / 186,560. Sample route signatures and arena plans.
- The host is SwiftShader-only; never use FPS as a hardware signal.
