# Independent code review — M2

**Commit:** `360c06c` · **Reviewer:** fresh DeepSeek V4.1 Flash (Max) session · **Verdict:** not ready to merge

The pacing headline is real and reproducible: a 3-seed rerun matched the committed 10-seed JSON, Course 72.22–75.88 s with 8–9 finishers, Hex 46.33–47.78 s, Crown 53.42–56.25 s, total 203.37–209.82 s. The release gate and the Crown claims are not yet honest.

## Blocker

### B-1 — A Crown Climb total wipe revives and crowns an eliminated bean
- **Where:** `src/game/match/Match.ts` Crown resolution; `src/test/match.test.ts` asserts the wrong behavior.
- **Problem:** when every finalist is eliminated, the code takes `placements[0]`, sets `won=true`, `qualified=true`, `eliminated=false`, and clears `body.eliminated`. The committed casual JSON has a concrete case: seed `20993521`, Crown 32.13 s, 0 finishers, winner Jelly Jolene at 19% progress, `winnerTouchedCrown=false`, yet `livingWinner=true`.
- **Consequence:** an eliminated bean is declared the living Crown winner and the show-end card says “takes the crown.” This violates the M2 ticket.
- **Fix:** only force a champion when the top entrant has `finishTime !== null` or is not eliminated. If every entrant is eliminated, resolve a no-winner/draw (documented) and let the show-end UI handle a null champion. Never clear `eliminated` on a bean with `finishTime === null`. Update the test to assert the opposite.

## High

### H-1 — “Physical crown touch” is dais proximity
- **Where:** `src/game/levels/CrownClimb.ts` finish check; `scripts/lib/show-harness.mjs` `winnerTouchedCrown`.
- **Problem:** the finish check is `position.y > DAIS_TOP - 0.4` plus a 3.2 u horizontal radius. The crown is at 50.1; all ten idle winners sit at y≈48.4, progress 0.9661, under the floating crown. `winnerTouchedCrown` is just `finishTime !== null`. A short/no-hat winner can win without touching the crown.
- **Fix:** require a real crown contact: use the winner capsule/head against the crown centre/band (height + horizontal radius), or lower the crown so a bean standing on the dais physically touches it. Make the harness and tests assert the physical condition, not the finish flag.

### H-2 — The Phase B gate and docs hide the casual Crown failure; Hex/Crown are idle-only and median-only
- **Where:** `scripts/lib/pacing.mjs` summarize/evaluate; `docs/METRICS.md`.
- **Problem:** Crown, Hex and show total are summarized from idle runs only; casual runs only feed `casualQualified`. Hex/Crown check only the median. The committed casual Crown at seed `20993521` is 32.13 s, 0 finishers, touch false, and is never summarized. “Living winner 10/10” is inflated by B-1.
- **Fix:** summarize both idle and casual for Crown/Hex/total (or a combined 20-run set), enforce per-seed min/max for Hex/Crown, add a physical `touchedCrown` check, and report the casual Crown row in `docs/METRICS.md`.

## Medium

### M-1 — Spectate camera can lock onto a finished Course bot
- `Match.currentLeader()` skips only eliminated/eliminatedAt, not `finishTime !== null`. A finished, frozen bot at progress 1 can be followed while the pack is still racing. Exclude finished/qualified contestants and retarget immediately when the followed leader finishes. Add a Course spectate test.

### M-2 — The “casual” pilot is a top-band bot, not a below-median casual
- `createCasualPilot` only sets `laneScale` and a *wider* hazard radius; the player contestant has skill 1, so `courseBotSpeed(1)=0.78` (top of the band), and `hazardRadius: 3.1` reads hazards earlier than bots (2.35). Set a genuinely below-median speed/reaction/hazard profile, re-run the 10-seed sweep, and report the rate honestly.

### M-3 — Sugar Rush’s outer-ring wave is suppressed at exactly four survivors
- `Hexapop` only calls `collapseOuterRing()` when `living > 4`. With exactly four survivors the HUD stamp fires but the ring may not drop. The empty-field unit test bypasses the guard. Either collapse the outer ring with four survivors while preserving the last four safe tiles, or document the exception and change the acceptance/evidence. Assert the warning/after counts in a real four-survivor run.

### M-4 — Crown tests assert self-fulfilling flags, not physical outcomes
- `pacingRounds.test.ts` derives `livingWinner` from `!winner.eliminated` and `winnerTouchedCrown` from `winner.finishTime !== null`; both are set by the code under test. Assert winner y, horizontal distance to the crown, `finishTime`, and `body.eliminated`; make the harness flags derive from those physical fields.

## Low

- **L-1:** `coursePlan.finishZ=-166`, `courseFinishZ=-350`, `courseLength=368` vs actual gate `-156`/`-340`/`358`; final checkpoint y=4.5/maxY=6.5 vs finish deck y=9.0; README practice claim needs verification.
- **L-2:** lap-2 HUD label shows “LAP 2 · SECTION E” at the connector; lap-2 finish crowd is duplicated/missing because crowd z is hard-coded.
- **L-3:** CI `tee` only captures stdout (per-run lines are stderr); commit a Phase B e2e log; add this review file.
- **L-4:** `m2-crown-ceremony.png` shows the defeat overlay, not the ceremony; capture the dais before the show-end card.
- **NIT:** stale 0.45 s warning comment in Hexapop; Phase A detail text still in Phase B checks; “7/10” label with 3 runs.

## Verified

- Course two-lap route is real; 10-seed idle 72.22–75.88 s, 8–9 finishers, idle 0/10; 3-seed rerun matches the JSON.
- Bot speed band 0.62–0.78, anchor max 10% / >25% behind / min progress / Course-only; no teleport/free jump; no exploit found.
- Hexapop 223 tiles, 3.3 s warning, stationary perch dies, underfilled grace, 4 survivors; Sugar Rush runs in the idle sweep.
- Spectate hides non-target tags and stays clear of beans/slime; no-living-leader resolves.
- CI pacing gate is ordered after Playwright install and before e2e; 35-minute timeout fits observed timings.
- `npm run check` 109/109; no v1 unit regressions observed; full e2e not rerun by the reviewer.

## Verdict

**Not ready.** Fix B-1, H-1, H-2, then re-run the 10-seed `verify:pacing --phase=b` (including casual Crown) and the focused e2e. Fix or explicitly accept the medium/low items. The pacing numbers themselves are real.

## Fix pass — 2026-10-26, `feat/m2-pacing`

**Status:** B-1, H-1, H-2 and M-1…M-4 are addressed; L-1…L-4 and the NITs are
addressed or explicitly recorded. Re-measured with the real `Match` on the same
10 seeds; see the M2 Phase B section of [`docs/METRICS.md`](METRICS.md).

- **B-1:** Crown resolution only promotes a champion with a real finish time or
  a living body. A total wipe is a documented no-winner defeat; the show-end
  card names no champion. The wrong timeout test now asserts the opposite, and
  a separate test keeps the living timeout-height fallback.
- **H-1:** The crown band sits at y 49.0 on the 48.4 dais. `isAtFinish` is
  capsule-vs-band contact (head to centre height + 2.87 u horizontal). Harness
  `winnerTouchedCrown` is derived from `height`/`distanceToCrown`; all 20
  winners are at y 48.4 with distance ≤ 2.857 u.
- **H-2:** The gate now summarizes Crown/Hex/total over the combined 20 runs,
  enforces Crown clock per living-winner seed, asserts physical touch, and
  allows at most one reported no-winner run. Result: 20/20 living and 20/20
  physical, 0 no-winner outliers; casual qualification 7/10. No hidden row.
- **M-1:** `currentLeader` excludes finished/qualified bots and the follow-cam
  retargets when the followed leader finishes; a Course spectate test covers it.
- **M-2:** Casual pilot cruises at ~0.71, reacts later, reads hazards at 2.30
  (bots 2.35), and carries a small mistake chance. It commits jumps at the
  human cap for the authored 4 u gaps. Honest 10-seed result: 7/10.
- **M-3:** The Sugar Rush outer ring drops with exactly four survivors, holding
  the tiles under living beans; the remaining tile count can settle below four
  as warnings expire, while the Round still ends at four survivors. The
  real-Match test asserts warning/after counts.
- **M-4:** Winners are asserted by `height`, `distanceToCrown`, `finishTime` and
  `eliminated`; flags are derived from those fields. The old self-fulfilling
  flags are gone.
- **L-1/L-2:** Gate/plan numbers are -156 / -340 / 358; final checkpoint y 9.0 /
  maxY 11.0; lap-2 crowds translate; connector reads “LAP 2 · CONNECTOR”.
- **L-3:** CI tees with `2>&1`; `docs/evidence/pacing/m2-e2e-final.log` is
  committed.
- **L-4:** The ceremony evidence frame hides the show-end DOM card so the dais
  and confetti are visible.
- **NIT:** The stale 0.45 s comment is corrected, Phase B details no longer say
  “M2-003/004 owns”, and the casual check label no longer hard-codes “7/10”.
