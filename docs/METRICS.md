# Metrics and pacing baseline

This file is the measurement record for the show. It exists so a tuning change can be compared against a real baseline instead of a feeling.

## How to measure

```bash
npm run measure:show                         # baseline seed, idle + casual full shows
npm run measure:show -- --runs=10            # 10-seed full-show sweep, JSON
npm run measure:show -- --mode=idle --runs=3 # no-input only
npm run verify:pacing                        # 10-seed Phase A gate (fails outside the bands)
npm run verify:pacing -- --phase=b           # Phase B: Hexapop/Crown/total become hard
```

Both commands start a private Vite dev server (or use `TUMBLE_URL` for an existing one) and drive the real `Match`/`Game` through **all three Rounds**. The page advances the fixed 1/60 s loop itself; no wall-clock sleep decides a pacing number.

Each show reports per-Round clocks, finishers, qualifiers, player status, living-winner state, the total show clock, and JSON. `verify:pacing` runs an **idle** sweep and a **scripted casual** sweep:

- `idle`: no player input. The human must never qualify.
- `casual`: debug-only `startCasualRun()` / `setPlayerAutopilot('casual')` installs a scripted player brain. It fills the same `ControllerFrame` and runs the same body, controller, camera basis and physics as a human. It is never active in normal play.

The show is **observed** for measurement (`startObservedShow`/`startCasualRun`): after the human is eliminated, the Director still advances the qualifying bots through the remaining Rounds. This is the only difference from normal play, where a missed qualification still ends the show.

## v1 baseline — 2026-10-25, commit `5e61ac2`

| Round | Duration | Qualifiers | Finishers | Player (idle) | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| Sunrise Scramble | 26.03 s | 8 | 8 | ELIMINATED | 8th bot finishes at 26 s; a casual human has no realistic qualification window |
| Hexapop | 6.15 s | 4 | — | ELIMINATED | Round resolves long before the 45 s Sugar Rush |
| Crown Climb | 36.48 s | 1 | 1 | ELIMINATED | Living winner on this seed; fallback still exists on weaker seeds |
| **Total gameplay** | **68.66 s** | | | | ~1.1 minutes; not the 4–6 minute show target |

Additional v1 numbers:

- Draw calls / triangles at the 1440×810 high Course start: **243 / 117,160** (v1 budget 250 / 120k).
- Hardware FPS: **not validated** on the dev host. It is SwiftShader-only (no `/dev/dri`); recorded high/low FPS is not a hardware signal.
- `npm run verify:show`: real 16-bean Course + real Hexapop spawn gate passes.

## M2 Phase A — 2026-10-25, branch `feat/m2-pacing`

Changes measured here:

- Sunrise Scramble now runs the **same five authored sections twice** with a lap gate at the end of lap 1 and the finish gate at the end of lap 2. Existing section grammar, colliders and waypoints are reused; no new mode, biome or art direction.
- Course bots target **0.62–0.78** of max speed by skill, react later to hazards, hesitate and wobble visibly, and the pack stays on the centre line at the Slime Slide bridge.
- The bounded **human-pace anchor** slows Course bots by at most 10% when the human is more than 25% behind and has left the start deck. It never speeds a bot up, never applies outside the Course, and never touches player physics.
- Push-chair hazard distance is measured to the rotated bar footprint, not its centre, and pushers are jumped even when they are beside the runner.

### 10-seed sweep (`npm run verify:pacing -- --runs=10`)

Seeds: `20260418, 20365147, 20469876, 20574605, 20679334, 20784063, 20888792, 20993521, 21098250, 21202979`.

| Seed | Course clock | Finishers | Idle player | Casual player |
| --- | ---: | ---: | --- | --- |
| 20260418 | 74.88 s | 9 | ELIMINATED | **QUALIFIED** |
| 20365147 | 72.22 s | 8 | ELIMINATED | **QUALIFIED** |
| 20469876 | 75.88 s | 9 | ELIMINATED | **QUALIFIED** |
| 20574605 | 73.22 s | 9 | ELIMINATED | **QUALIFIED** |
| 20679334 | 73.87 s | 9 | ELIMINATED | **QUALIFIED** |
| 20784063 | 74.22 s | 8 | ELIMINATED | ELIMINATED |
| 20888792 | 72.32 s | 8 | ELIMINATED | **QUALIFIED** |
| 20993521 | 75.88 s | 8 | ELIMINATED | **QUALIFIED** |
| 21098250 | 75.55 s | 8 | ELIMINATED | **QUALIFIED** |
| 21202979 | 74.85 s | 8 | ELIMINATED | **QUALIFIED** |

| Signal | v1 | M2 Phase A | Band |
| --- | ---: | ---: | --- |
| Course clock | 26.03 s | **74.54 s median** (72.22–75.88) | 45–90 s |
| Course finishers | 8 | **8–9** (median 8) | 8+ |
| Idle human qualified | never | **0 / 10** | never |
| Casual human qualified | n/a | **9 / 10 (90%)** | ≥ 7 / 10 |
| Hexapop clock | 6.15 s | 8.88 s median | 30–50 s — **PENDING M2-003** |
| Crown clock | 36.48 s | 32.64 s median | 45–80 s — **PENDING M2-004** |
| Living crown winner | seed-dependent | 10 / 10 (100%) | ≥ 95% — **PENDING M2-004** |
| Total show clock | 68.66 s | 145.98 s median (126.85–155.17) | 3–5 min — **PENDING M2-003/004** |

Phase A recorded the Hexapop, Crown and total rows as pending. Phase B (below) turns every row into a hard assertion and meets them.

Evidence: [`docs/evidence/pacing/m2-phase-a-pacing.json`](evidence/pacing/m2-phase-a-pacing.json), [`docs/evidence/pacing/m2-phase-a-pacing.log`](evidence/pacing/m2-phase-a-pacing.log). Visual evidence: `docs/evidence/m2-course-lap2.png`, `m2-course-finish.png`, `m2-course-results.png`.

## M2 Phase B — 2026-10-25, branch `feat/m2-pacing`

Changes measured here:

- **Hexapop tension.** The top tier is now a 6-ring arena (223 tiles including the
  two lower decks and the perch chute). A touched tile warns for **3.3 s** and
  the bots dwell on it for a readable beat before hopping, so the floor, not a
  first-step pile-on, is the threat. The warning shortens to **1 s** during the
  **45 s Sugar Rush**, which warns and drops the current outer ring. A
  four-survivor field is held to the Sugar Rush settle (46.15 s) instead of
  resolving early; a smaller field still resolves at once. The Round hard-caps
  at **49.9 s**.
- **Crown Climb living winner.** Bots re-route to the highest platform at or
  below them after a knock instead of pressing into a lip they cannot reach,
  probe the ledge before running off it, and take authored watching beats at
  the beams, donuts and final pads. The climb is slower but still the same
  controller and gravity: no teleport, no free jump. The winner must touch the
  crown; timeout-height remains the safety net.
- **Spectate camera.** The Course/Crown follow-cam is a wider 9.8 u / 40° shot
  that smoothly retargets a new living leader instead of hard-cutting. Hexapop
  switches to a 16.5 u / 14° outside-the-rim arena shot so the stacked decks
  cannot pull the lens under the floor. Non-target name tags are hidden. The
  crown ceremony now frames the dais for a bot win as well as a human win.
- **Show feel.** Round intros/countdowns/results add **30.9 s** across the whole
  show (target ≤ 90 s), and the measured total is **3.48 minutes**.

### 10-seed sweep (`npm run verify:pacing -- --phase=b`)

Seeds: `20260418, 20365147, 20469876, 20574605, 20679334, 20784063, 20888792, 20993521, 21098250, 21202979`.

| Seed | Total show | Course | Finishers | Hexapop | Hex survivors | Sugar Rush | Crown | Living winner | Touched crown |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |
| 20260418 | 209.82 s | 74.88 s | 9 | 47.78 s | 4 | yes | 56.25 s | yes | yes |
| 20365147 | 203.37 s | 72.22 s | 8 | 46.33 s | 4 | yes | 53.92 s | yes | yes |
| 20469876 | 207.38 s | 75.88 s | 9 | 47.18 s | 4 | yes | 53.42 s | yes | yes |
| 20574605 | 198.20 s | 73.22 s | 9 | 46.17 s | 4 | yes | 47.92 s | yes | yes |
| 20679334 | 227.28 s | 73.87 s | 9 | 48.28 s | 4 | yes | 74.23 s | yes | yes |
| 20784063 | 215.80 s | 74.22 s | 8 | 48.27 s | 4 | yes | 62.42 s | yes | yes |
| 20888792 | 201.80 s | 72.32 s | 8 | 48.30 s | 4 | yes | 50.28 s | yes | yes |
| 20993521 | 218.85 s | 75.88 s | 8 | 48.35 s | 4 | yes | 63.72 s | yes | yes |
| 21098250 | 210.02 s | 75.55 s | 8 | 46.17 s | 4 | yes | 57.40 s | yes | yes |
| 21202979 | 207.62 s | 74.85 s | 8 | 49.92 s | 4 | yes | 51.95 s | yes | yes |

Scripted casual sweep: **9 / 10 qualified** (seed `20784063` was eliminated);
idle sweep: **0 / 10 qualified**.

| Signal | v1 | Phase A | M2 Phase B | Band | Result |
| --- | ---: | ---: | ---: | --- | --- |
| Course clock | 26.03 s | 74.54 s median | **74.54 s median** (72.22–75.88) | 45–90 s | PASS |
| Course finishers | 8 | 8–9 | **8–9** | 8+ | PASS |
| Idle human qualified | never | 0 / 10 | **0 / 10** | never | PASS |
| Casual human qualified | n/a | 9 / 10 | **9 / 10** | ≥ 7 / 10 | PASS |
| Hexapop clock | 6.15 s | 8.88 s median | **48.03 s median** (46.17–49.92) | 30–50 s | PASS |
| Sugar Rush reached | never | never | **10 / 10** | ≥ 7 / 10 | PASS |
| Crown clock | 36.48 s | 32.64 s median | **55.09 s median** (47.92–74.23) | 45–80 s | PASS |
| Living crown winner | seed-dependent | 10 / 10 | **10 / 10** | ≥ 95% | PASS |
| Crown winner touched the crown | n/a | n/a | **10 / 10** | ≥ 95% | PASS |
| Total show clock | 68.66 s (round sum) | 145.98 s median | **208.72 s median** (198.20–227.28) | 180–300 s | PASS |
| Show bounds | n/a | 126.85–155.17 s | **198.20–227.28 s** | 150–360 s | PASS |
| Show overlays | n/a | 30.9 s | **30.9 s** | ≤ ~90 s | PASS |
| Round-clock sum | 68.66 s | 115.0 s | **177.82 s** | — | — |

`npm run verify:pacing -- --phase=b` exits **0** on this sweep with **0 pending**
checks. The JSON evidence (per-run rounds, placements, winner flags) is
[`docs/evidence/pacing/m2-phase-b-pacing.json`](evidence/pacing/m2-phase-b-pacing.json);
the text log is [`docs/evidence/pacing/m2-phase-b-pacing.log`](evidence/pacing/m2-phase-b-pacing.log).
The sweep takes about 9 minutes on the SwiftShader host, so CI runs it after the
build/unit gate and before the Playwright smoke. Visual evidence:
`m2-hexapop.png`, `m2-hexapop-sugar-rush.png`, `m2-crown.png`,
`m2-crown-ceremony.png`, `m2-spectate.png`, `m2-spectate-leader-change.png`.

The Phase B sweep is also asserted headlessly by
`src/test/pacingRounds.test.ts` (10 complete observed shows through the real
`Match`) and `src/test/hexapop.test.ts` (the 45 s outer-ring drop).

## M2 targets

| Signal | v1 baseline | M2 target |
| --- | ---: | ---: |
| Course Round clock | 26 s | 45–90 s |
| Hexapop Round clock | 6 s | 30–50 s |
| Crown Climb Round clock | 36 s | 45–80 s |
| Total show clock | 69 s | 3–5 min |
| Course real finishers | 8 | 8+ |
| Idle human qualification | never | never |
| Scripted casual qualification | n/a | ≥ 7 / 10 |
| Living crown winner | seed-dependent | ≥ 95% of seeds |
| Hardware FPS | unverified | ≥ 55 fps at 1080p high on a real GPU |

## Measurement caveats

- The idle and casual runs are separate sweeps, so the casual rate is 7/10 of **casual runs**, not a mixture.
- The total is the full simulated show (all three Round clocks plus intros, countdowns and results). The v1 baseline was the sum of the three Round clocks only; the Phase A row is therefore not directly comparable. `summary.roundSeconds` reports the sum for a like-for-like comparison.
- The anchor uses the human's progress, not their input. An idle human at 0% does not slow the pack (`HUMAN_ANCHOR_MIN_PROGRESS`); a player who has left the start deck does.
- FPS is only meaningful on hardware WebGL. Use `window.__tumble.renderInfo` for draw calls/triangles in this environment; validate FPS manually on a real GPU and record it here.

## Hardware FPS protocol (manual, real GPU)

This dev host is SwiftShader-only (`/dev/dri` is absent). Recorded FPS here is a software-rasteriser number and is not a hardware signal. A maintainer with a real GPU should run:

1. Build with the Pages base path: `GITHUB_PAGES=true npm run build`, then `npm run preview` (or load the live Pages URL) at `1440×810`.
2. Set quality to **high** in Settings, start a Show on a fixed `?seed=20260418`, and play for 30 s of wall-clock gameplay (Course start through the first hazards is enough).
3. Open DevTools → Performance, record 30 s, and read:
   - average FPS over the steady segment (exclude the first 2 s of shader compile);
   - p95 frame time (95th percentile of the frame-time track);
   - `window.__tumble.renderInfo` at the Course start and at the Hexapop start.
4. Pass condition: **≥ 55 fps average** at 1440×810 high with no p95 frame over 33 ms during ordinary play. Low quality must stay playable on the same machine.
5. Record the GPU, driver, browser build, average FPS, p95 frame time, draw calls and triangles in this file. Do not substitute the SwiftShader number.

Known SwiftShader-only dev-host numbers (not a hardware claim): the two-lap Course start reports **305 draw calls / 186,560 triangles** at 1440×810 high against the M2 budget of 320 / 200k. The 250 / 120k v1 budget was deliberately scaled once for the second lap; see the `Course start stays inside the draw-call and triangle budgets` Playwright check.
