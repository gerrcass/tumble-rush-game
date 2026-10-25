# Independent code review — round 1

**Commit:** `eb537bc` · **Reviewer:** fresh DeepSeek V4.1 Flash (Max) session · **Verdict:** not ready to merge

This review was run against `main...feat/tumble-rush-v1` with the spec, tickets, glossary, and ADRs as context. The reviewer did not change code. Findings are ordered by severity; each is a release gate unless explicitly deferred.

## Blockers

### B1 — Course finish gate credits every remaining bean with a finish time
- **Files:** `src/game/levels/Course.ts` (`step`, `isAtFinish`), `src/game/match/Match.ts` (`afterPhysics`).
- **Problem:** `Course.step()` calls `finishNow()` when the player reaches the gate, which sets `result`. `Course.isAtFinish()` then returns `this.result !== null || spatialCheck`, so Match records a finish for every entrant on the same step. A live probe marked 16/16 entrants as finishers, including bots still at 1–4% progress.
- **Fix:** Make `isAtFinish()` purely spatial. Remove the `finishNow()` call from `Course.step()`. Match is the sole recorder of course finishers. Add a test with one teleported finisher and assert exactly one `finishTime`.

### B2 — Restart Show / Restart Practice from pause is a no-op soft-lock
- **Files:** `src/app/App.ts` (pause handlers), `src/game/Game.ts` (`restart`, `startShow`, `startPractice`, `pause`), `src/app/screens/Overlays.ts`.
- **Problem:** the pause overlay closes itself, then `Game.restart()` calls `startShow()`/`startPractice()`, which return immediately when `state === 'paused'`. The game stays paused with no overlay. On touch there is no Esc recovery.
- **Fix:** route restart through an App-level `restartShow`/`restartPractice` that resets per-show UI state and audio, and make the Game restart path leave `paused`. Verify on desktop and 390×844; the fresh intro/results/rewards must work and audio must be unducked.

## High

### H1 — Course bots mostly fall; the signature race has only 2 real finishers
- **Files:** `src/game/levels/Course.ts` (A→B gap, jump waypoint), `src/game/bots/BotBrain.ts` (ledge takeoff).
- **Problem:** a no-input run leaves 7/16 bots dead by ~5 s at the A→B gap (`z ≈ -16…-25`); only 2 finish. The jump waypoint is inside the gap and the lookahead does not reliably clear it.
- **Fix:** tune the A→B transition and give the Course brain a real ledge takeoff. Verify 8+ finishers before the 120 s timer with no human input. Add a headless test.

### H2 — Course qualification ranks fallen beans above living beans and labels fallback beans QUALIFIED
- **Files:** `src/game/match/Director.ts` (`compareCourse`, `resolveRound`), `src/game/match/Match.ts`.
- **Problem:** progress is compared before elimination, and `resolveRound` always fills every qualifier slot, so fallen bots can outrank living bots and be marked QUALIFIED. This contradicts "elimination is real."
- **Fix:** after finish times, rank all living entrants before eliminated entrants, then by progress. Follow SPEC §4: if fewer qualifiers than slots, all remaining advance; only if zero remain do the last eliminated fill. Update tests and remove the old "always fill exactly N" expectation.

### H3 — Hexapop has a permanent safe podium; standing still qualifies
- **Files:** `src/game/levels/Hexapop.ts` (podium, center tile `safe`, Sugar Rush).
- **Problem:** the center podium is permanent and the center tile is `safe`, so a player can idle and survive to the top 4.
- **Fix:** make the start perch temporary (disable the podium collider and clear `safe` after a short grace/countdown); let the center collapse like the rest. Verify a stationary center player is eliminated.

### H4 — Global keyboard handler hijacks Space/arrows in form controls and buttons
- **Files:** `src/game/input/Input.ts` keydown; App keyboard handlers; Customize/Settings/Start screens.
- **Problem:** Space cannot activate focused buttons, cannot be typed in the name input, and arrows cannot adjust sliders. This breaks the keyboard UX contract.
- **Fix:** ignore editable/range/select/button targets in the global gameplay handler; only consume Space/arrows during actual gameplay. Add Playwright keyboard tests.

### H5 — A qualified finisher can be marked ELIMINATED and switched to spectate
- **Files:** `src/game/match/Match.ts` (`afterPhysics`).
- **Problem:** a bean with a finish time keeps being simulated; if it falls off the finish pad while waiting for other finishers, it is marked eliminated/hidden and the human sees ELIMINATED + spectate while results say QUALIFIED.
- **Fix:** skip elimination handling for finished contestants; lock/pin finished beans to a celebration state. Add a test.

## Medium

### M1 — Hexapop HUD progress is inverted and its text is stale
- `Match.hud()` uses `player.progress` (height) for the bar but `status.progressLabel` (tile collapse) for text; the bar starts full and the text stays 0%. Use `status.progress` and update the label/aria whenever the label changes.

### M2 — Defeat screen claims a bot "takes the crown" after a Round 1/2 loss
- `finishShow()` always picks a winner and the defeat card always says "takes the crown". Only claim a crown when the final Round was Crown Climb; otherwise use "the pack moves on" / Round leader copy.

### M3 — Draw calls/triangles exceed budget
- Measured 704 draw calls / 193,938 triangles at the Course start high quality; SPEC budget is 250 / 120k. Cause: each bean is many separate meshes, plus hats. Merge static bean parts by material, cache/instance hats, and reduce repeated scenery draws where cheap. Re-measure; do not chase the budget if it destabilizes the show, but report the final numbers and any remaining gap.

### M4 — Every show leaks ~65 geometries (hats are never disposed)
- `Bean.dispose()` disposes only the name tag; `createHat()` allocates per bean. Repeated shows grow geometry count by 65 each time. Cache hat geometry/materials or dispose them; verify geometry count stability over three shows and repeated Customize changes.

### M5 — High-value tests are missing
- Add: one-finisher Course integration, pause restart, no-input bot completion, stationary Hexapop podium, Hexapop HUD values, keyboard Space/arrow behavior, draw-call/triangle budget assertions. Do not let `forcePlayerWin` be the only show path.

### M6 — Quick Show reuses the same seed for every replay in a session
- Generate a fresh quick seed at each quick-show start; preserve `?seed=` override and the daily date seed. Verify two Quick Shows differ.

### M7 — Customize rebuilds the swatch grid and drops focus
- After `renderGrid()`, restore focus to the new button with the same cosmetic id, or update buttons in place. Verify Enter on a swatch keeps focus.

## Low / quick wins
- Web Audio filter nodes leak (track/disconnect BiquadFilterNodes).
- Daily best is overwritten with the latest result, not `Math.min`.
- Course progress tops out ~95% because `finishZ` is -166 but the gate is at -156.
- Spectator HUD uses the dead player's progress; use the followed leader. Skip button can appear immediately (spec says 3 s) — decide and document.
- Hexapop slime check reads only `bodies[0]`; unify with the kill plane.
- Malformed unlock strings can throw and reset the profile; validate kind/id before `cosmeticItem`.
- Course `propColors`/`crowdArrangement` are generated but unused; wire or remove.
- CI does not build with `GITHUB_PAGES=true`; add it.
- Hexapop `queryTiles()` allocates a 117-object array per bot per fixed step; cache a snapshot per step.
- Course pusher art floats 0.5 u above its collider; use a per-motion visual offset.
- README/page title still describe Phase 1; no live link or retro. Phase 5 owns this.

## Release verdict
**Not ready.** Fix B1, B2, H1–H5, M1, M2, M4, M6, M7 and the high-value tests. M3 is a performance hardening task; report final draw-call/triangle numbers and the hardware-FPS limitation. Then re-review and ship.
