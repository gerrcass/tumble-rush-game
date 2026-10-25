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

`verify:pacing` passes Phase A on these numbers and prints the Hexapop, Crown and total rows as **PENDING**. It does not claim those bands are met. Phase B (`--phase=b`) turns every row into a hard assertion.

Evidence: [`docs/evidence/pacing/m2-phase-a-pacing.json`](evidence/pacing/m2-phase-a-pacing.json), [`docs/evidence/pacing/m2-phase-a-pacing.log`](evidence/pacing/m2-phase-a-pacing.log). Visual evidence: `docs/evidence/m2-course-lap2.png`, `m2-course-finish.png`, `m2-course-results.png`.

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
