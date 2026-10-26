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

## M2 Phase B — 2026-10-26, branch `feat/m2-pacing`

Changes measured here (hardening pass after [`docs/REVIEW-M2.md`](REVIEW-M2.md)):

- **B-1 no-winner Crown.** A total wipe no longer revives or crowns an eliminated
  bean. A champion is promoted only when the top finalist has a real finish
  time or is still living. If every finalist is eliminated, the Round is a
  documented no-winner/draw: no placement is qualified, `ShowResult.winnerName`
  and `winnerLook` are `null`, and the show-end card says “Nobody touched the
  crown.” A bean with `finishTime === null` is never un-eliminated.
- **H-1 physical crown contact.** The crown band was lowered to **y = 49.0**
  (bottom ≈ 48.43) so a bean standing on the 48.4 dais physically reaches it.
  `CrownClimb.isAtFinish` is now capsule-vs-band contact: the head must reach the
  band centre (`y + 1.5 >= 49.0`), the feet must be below the band top, and the
  horizontal distance must be at most `2.45 + 0.42 = 2.87 u`. The old 3.2 u dais
  proximity is gone. The pacing harness derives `winnerTouchedCrown` from the
  winner's height and `distanceToCrown`; it does not trust the finish flag.
- **H-2 honest gate.** Crown, Hexapop and the show total are summarized over the
  combined **20 runs** (10 idle + 10 casual), not idle only. Crown clock bounds
  are enforced per living-winner run, the physical touch is asserted, and at
  most one no-winner run is allowed (and would be printed as an outlier). This
  sweep has **zero no-winner runs**.
- **M-1 spectate.** `currentLeader()` excludes finished/qualified Course bots and
  the follow-cam retargets on the same step a followed leader finishes. A real
  Course spectate test covers it.
- **M-2 honest casual pilot.** The scripted casual pilot now cruises at
  **0.91 × 0.78 ≈ 0.71** of max (below the bot band's top and the player's
  8 u/s cap), has a longer reaction beat (`+0.18` vs the bots' `+0.14`), reads
  hazards later (`2.30` vs `2.35`), and carries a small mistake chance. It still
  commits jumps at the human controller cap so the authored 4 u final gaps are
  clearable; that is a run-up, not a hidden cruise speed. It is a competence
  proxy, not a median human: jump commitment is stronger than the bot default. The measured casual
  qualification is **7 / 10**, exactly the M2 floor.
- **M-3 Sugar Rush at four survivors.** The outer-ring wave is no longer
  suppressed by `living > 4`. It warns and drops the current outer ring with
  exactly four survivors, holding the tiles under living beans. The surviving
  tile count can settle below four as the warnings expire; the Round still ends
  at four survivors. The 10-seed real-Match test asserts the
  warning and post-wave counts (all sampled four-survivor rounds: warnings > 0,
  remaining outer ring 0).
- **M-4 physical assertions.** The real-Match test asserts winner `height`,
  `distanceToCrown`, `finishTime`, and `eliminated`; the harness flags are
  derived from those fields. The committed failing shape (casual seed
  `20993521`, 32.13 s, 0 finishers, 19% progress) now resolves through the
  no-winner path instead of crowning Jelly Jolene.
- **L-1/L-2.** `coursePlan.finishZ/courseFinishZ/courseLength` now match the
  authored gate: **-156 / -340 / 358** (one lap 174 u). The final checkpoint is
  on lap 2's raised deck (y 9.0, maxY 11.0). Lap-2 finish crowds are translated
  with the lap instead of duplicated on lap 1, and the connector reads
  “LAP 2 · CONNECTOR” instead of “LAP 2 · SECTION E”.
- **L-3/L-4.** CI captures the pacing command's stderr with `2>&1`; the Phase B
  e2e log is committed. The crown-ceremony evidence frame hides the show-end DOM
  card so the real dais/confetti shot is visible.

### 10-seed sweep, idle + casual (`npm run verify:pacing -- --phase=b --runs=10`)

Seeds: `20260418, 20365147, 20469876, 20574605, 20679334, 20784063, 20888792, 20993521, 21098250, 21202979`.

| Seed | Mode | Course | Finishers | Casual player | Hexapop | Crown | Living | Touched | Winner y | Crown dist | Total show |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: |
| 20260418 | idle | 73.22 s | 8 | — | 48.33 s | 61.92 s | yes | yes | 48.4 | 2.784 | 214.37 s |
| 20260418 | casual | 74.22 s | 8 | **Q** | 46.17 s | 55.52 s | yes | yes | 48.4 | 2.787 | 206.80 s |
| 20365147 | idle | 76.87 s | 8 | — | 46.17 s | 48.55 s | yes | yes | 48.4 | 2.781 | 202.48 s |
| 20365147 | casual | 73.22 s | 8 | **Q** | 48.03 s | 48.57 s | yes | yes | 48.4 | 2.789 | 200.72 s |
| 20469876 | idle | 73.22 s | 8 | — | 49.70 s | 53.30 s | yes | yes | 48.4 | 2.847 | 207.12 s |
| 20469876 | casual | 72.18 s | 8 | **Q** | 47.67 s | 54.02 s | yes | yes | 48.4 | 2.784 | 204.77 s |
| 20574605 | idle | 72.88 s | 9 | — | 47.77 s | 48.02 s | yes | yes | 48.4 | 2.785 | 199.57 s |
| 20574605 | casual | 72.88 s | 8 | **Q** | 46.17 s | 47.95 s | yes | yes | 48.4 | 2.825 | 197.90 s |
| 20679334 | idle | 73.22 s | 8 | — | 46.17 s | 74.30 s | yes | yes | 48.4 | 2.794 | 224.58 s |
| 20679334 | casual | 71.87 s | 8 | OUT | 49.15 s | 74.10 s | yes | yes | 48.4 | 2.767 | 226.02 s |
| 20784063 | idle | 73.88 s | 8 | — | 46.17 s | 57.57 s | yes | yes | 48.4 | 2.802 | 208.52 s |
| 20784063 | casual | 74.22 s | 8 | **Q** | 48.17 s | 62.30 s | yes | yes | 48.4 | 2.807 | 215.58 s |
| 20888792 | idle | 72.88 s | 8 | — | 45.02 s | 50.47 s | yes | yes | 48.4 | 2.780 | 199.27 s |
| 20888792 | casual | 74.55 s | 8 | OUT | 48.00 s | 50.28 s | yes | yes | 48.4 | 2.795 | 203.73 s |
| 20993521 | idle | 72.55 s | 8 | — | 47.28 s | 53.75 s | yes | yes | 48.4 | 2.777 | 204.48 s |
| 20993521 | casual | 74.53 s | 8 | OUT | 46.78 s | 64.30 s | yes | yes | 48.4 | 2.764 | 216.52 s |
| 21098250 | idle | 74.43 s | 8 | — | 46.17 s | 56.60 s | yes | yes | 48.4 | 2.857 | 208.10 s |
| 21098250 | casual | 72.88 s | 8 | **Q** | 49.65 s | 51.97 s | yes | yes | 48.4 | 2.777 | 205.40 s |
| 21202979 | idle | 73.23 s | 8 | — | 48.87 s | 56.27 s | yes | yes | 48.4 | 2.820 | 209.27 s |
| 21202979 | casual | 73.85 s | 8 | **Q** | 48.78 s | 56.45 s | yes | yes | 48.4 | 2.803 | 209.98 s |

Scripted casual: **7 / 10 (70%)** — seeds `20679334`, `20888792`, `20993521`
missed the top 8. Idle: **0 / 10** qualified. There are **no hidden Crown
outliers**: every one of the 20 runs has a living winner who physically touches
the crown. The best (largest) winning horizontal distance is **2.857 u**, inside
the 2.87 u contact radius.

| Signal | v1 | Phase A | M2 Phase B | Band | Result |
| --- | ---: | ---: | ---: | --- | --- |
| Course clock | 26.03 s | 74.54 s median | **73.22 s median** (72.55–76.87) | 45–90 s | PASS |
| Course finishers | 8 | 8–9 | **8–9** | 8+ | PASS |
| Course qualifiers | 8 | 8 | **8** | 8 | PASS |
| Idle human qualified | never | 0 / 10 | **0 / 10** | never | PASS |
| Casual human qualified | n/a | 9 / 10 | **7 / 10 (70%)** | ≥ 7 / 10 | PASS |
| Hexapop clock (20 runs) | 6.15 s | 8.88 s median | **47.72 s median** (45.02–49.70) | 30–50 s | PASS |
| Sugar Rush reached | never | never | **20 / 20** | ≥ 7 / 10 | PASS |
| Crown clock (living runs, 20) | 36.48 s | 32.64 s median | **54.77 s median** (47.95–74.30) | 45–80 s | PASS |
| Living crown winner | seed-dependent | 10 / 10 idle | **20 / 20 (100%)** | ≥ 19 / 20 | PASS |
| Crown winner touched the crown | n/a | n/a | **20 / 20 (100%)** physical | ≥ 95% | PASS |
| No-winner Crown runs | total wipe possible | hidden | **0**, reported if any | ≤ 1, reported | PASS |
| Total show clock (20 runs) | 68.66 s (round sum) | 145.98 s median | **206.96 s median** (197.90–226.02) | 180–300 s | PASS |
| Show bounds | n/a | 126.85–155.17 s | **197.90–226.02 s** | 150–360 s | PASS |
| Show overlays | n/a | 30.9 s | **30.9 s** | ≤ ~90 s | PASS |
| Round-clock sum | 68.66 s | 115.0 s | **176.0 s** | — | — |

`npm run verify:pacing -- --phase=b` exits **0** on this sweep with **0 pending**
checks. JSON evidence (per-run rounds, physical winner fields, outliers):
[`docs/evidence/pacing/m2-phase-b-pacing.json`](evidence/pacing/m2-phase-b-pacing.json);
text log: [`docs/evidence/pacing/m2-phase-b-pacing.log`](evidence/pacing/m2-phase-b-pacing.log).
The sweep takes about 5–9 minutes on the SwiftShader host, so CI runs it after
the build/unit gate and before the Playwright smoke. Visual evidence:
`m2-hexapop.png`, `m2-hexapop-sugar-rush.png`, `m2-crown.png`,
`m2-crown-ceremony.png`, `m2-spectate.png`, `m2-spectate-leader-change.png`.

The Phase B sweep is also asserted headlessly by
`src/test/pacingRounds.test.ts` (10 complete observed shows through the real
`Match`, physical winner fields, and the four-survivor Sugar Rush counts),
`src/test/crown.test.ts` (capsule-vs-band contact), and
`src/test/hexapop.test.ts` (the 45 s outer-ring drop with four survivors).

### Documented no-winner path

Crown Climb’s timeout-height fallback still promotes the highest **living**
finalist. A total wipe is not the same thing: when every finalist has
`finishTime === null` and is eliminated, the placements are all `ELIMINATED`,
the show ends in defeat, and the results card reports that nobody touched the
crown. This is the path the committed casual `20993521` case used; the hardened
sweep no longer reaches it on any seed, but the behavior is covered by
`src/test/match.test.ts` so a future regression cannot crown a dead bean.

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

- The idle and casual runs are separate runs. Crown, Hexapop and show total are summarized over the combined 20 runs (10 idle + 10 casual); the casual qualification rate is 7/10 of **casual runs**, not a mixture.
- Crown clock bounds are applied only to living-winner runs. A no-winner total wipe legitimately ends early; it would be listed as an outlier and is not allowed to hide inside the median.
- The total is the full simulated show (all three Round clocks plus intros, countdowns and results). The v1 baseline was the sum of the three Round clocks only; the Phase A row is therefore not directly comparable. `summary.roundSeconds` reports the sum for a like-for-like comparison.
- The anchor uses the human's progress, not their input. An idle human at 0% does not slow the pack (`HUMAN_ANCHOR_MIN_PROGRESS`); a player who has left the start deck does.
- FPS is only meaningful on hardware WebGL. Use `window.__tumble.renderInfo` for draw calls/triangles in this environment; validate FPS manually on a real GPU and record it here.

## Accepted gaps (not M2 blockers)

- A no-winner Crown can record the top placement as a career best even though
  the card says CROWN MISSED; no crown/kudos win is awarded. This is a product
  decision for a follow-up, not a pacing failure.
- The non-Crown total-wipe fallback can still name the last-row bean as the
  pack leader; this predates M2 and is outside the Crown fix.
- Hardware FPS remains a manual check; the SwiftShader host cannot validate it.

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
