# Tumble Rush M2 — Show Pacing & Fairness

**Version:** 1.0 (locked)
**Source decisions:** [`docs/m2/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md) — 26.03 s Course + 6.15 s Hexapop + 36.48 s Crown = **68.66 s**
**Status:** Ready for implementation

---

## Problem Statement

Tumble Rush v1 is a complete game, but it does not feel like a game show. The measured no-input show is **68.66 seconds of Round clocks**:

- Sunrise Scramble ends at **26.03 s** when the 8th bot finishes. A casual human is still learning the first sections; an idle human is eliminated in every round.
- Hexapop resolves in **6.15 s**, so the 45 s Sugar Rush never happens and the arena never breathes.
- Crown Climb lasts **36.48 s** on the baseline seed, but other seeds end in a timeout-height fallback instead of a living winner.

The result is a sprint, not a show. Adding more levels now would multiply the problem: every new course would inherit the same bot pace, the same 8-finisher cutoff, and the same missing qualification window. The game needs a pacing and fairness milestone before it needs more content.

## Solution

Make the existing three-Round show last **3–5 minutes including intros/results**, with a Course a casual human can actually qualify in, a Hexapop that reaches the Sugar Rush, and a Crown Climb that usually ends with a living Tumbler touching the crown.

The work has four levers:

1. **Measure the real show.** Extend `npm run measure:show` into a full-show pacing harness with a scripted casual input path, per-Round clocks, finishers, qualifiers, living-winner state, and a 10-seed sweep. It becomes a release gate.
2. **Humanize the Course pack.** Slow the bots to 0.62–0.78 of max with skill-based variation, longer hazard reactions, and visible mistakes. Add a bounded human-pace anchor: when the human is far behind, bots lose at most 8–10% target speed; the anchor never speeds bots up or teleports them.
3. **Give the Course room.** If the 173 u layout cannot reach 45–90 s with humanized bots, extend it with a **second lap of the existing five sections**. The finish gate moves to the end of lap 2. Qualification remains first 8 finishers. No new mode, biome, or art direction.
4. **Make the survival and final rounds reach their beats.** Slow Hexapop bot hopping and tile cadence so the Round lasts 30–50 s and the Sugar Rush matters. Tune Crown Climb bot navigation and recovery so a living winner occurs in ≥95% of seeds; keep timeout-height as a rare safety net. Improve the spectate follow-cam.

A human must never qualify by standing still. A bot must never teleport or receive speed the player cannot match.

## User Stories

1. As a player, I want a Course that lasts long enough to learn its five sections, so that I am not eliminated before I understand the hazards.
2. As a casual player, I want a real qualification window, so that a reasonable run can reach the top 8.
3. As a player, I want the bots to make mistakes and react like contestants, so that the race feels like a show rather than a speedrun.
4. As a player, I want the pack to stay readable when I fall behind, so that I can rejoin the race instead of watching it disappear.
5. As a player, I want the pack never to teleport or cheat, so that a win feels legitimate.
6. As a player, I want an idle run to be eliminated, so that qualification means something.
7. As a player, I want the Course to have a second-lap option only if it makes the race better, so that length is not padding.
8. As a player, I want Hexapop to last long enough that I see the tiers collapse, so that the survival round has tension.
9. As a player, I want the Sugar Rush to actually happen, so that the round has a dramatic ending.
10. As a player, I want the center perch to expire, so that standing still is not a winning strategy.
11. As a player, I want Crown Climb to be won by touching the crown, so that the final has a hero moment.
12. As a player, I want the final to last 45–80 seconds, so that the climb has an arc.
13. As a player, I want a living winner in almost every seed, so that the result feels earned.
14. As an eliminated player, I want the spectate camera to frame the leader clearly, so that I can follow the rest of the Round.
15. As a player, I want the show to last 3–5 minutes, so that it feels like a complete game show.
16. As a player, I want a show that does not drag, so that I can replay it.
17. As a maintainer, I want a repeatable pacing command, so that tuning is measured, not guessed.
18. As a maintainer, I want a 10-seed sweep, so that one lucky seed does not hide a pacing regression.
19. As a maintainer, I want the pacing gate in CI/release, so that a future content change cannot silently collapse the show.
20. As a maintainer, I want a documented hardware-FPS protocol, so that the SwiftShader dev host is not mistaken for a performance signal.
21. As a maintainer, I want the README/metrics to state the real show length, so that the public claim matches the build.
22. As a maintainer, I want no new modes or biomes in M2, so that pacing is fixed before scope grows.

## Implementation Decisions

- **Pacing harness first.** `scripts/measure-show.mjs` grows a full-show mode: real `Match`, no input and a scripted casual input path, per-Round clocks, finishers, qualifiers, player status, living-winner state, and JSON output. `npm run verify:pacing` runs the 10-seed sweep and fails outside the bands.
- **Baseline record.** `docs/METRICS.md` is updated with the v1 baseline, M2 targets, and every sweep result. A pacing change without a before/after measurement is not accepted.
- **Bot humanization.** Course bots use a skill-scaled target speed of 0.62–0.78 of max, longer hazard reaction, fewer perfect jumps, and a visible mistake chance. The pack can still produce 8+ finishers. No teleports, no free jumps, no hidden speed above the player's cap.
- **Human-pace anchor.** A bounded slowdown of at most 8–10% for bots when the human is >25% of the Course behind. It never speeds bots up, never applies in the final, and never changes the human's physics. It is implemented in the Course brain/pack logic, not in physics.
- **Course extension.** If the 45–90 s target is not reachable on the current 173 u layout, add a **second lap** of the five existing sections with a lap gate and a finish gate at the end. The section builders take a z/lap offset; colliders and waypoints are duplicated consistently. The existing Course art and grammar are reused. No new mode.
- **Qualification.** Course remains **first 8 finishers**. A timeout qualifies only finishers; a living 0% runner never qualifies. If fewer than 8 finish, advance the finishers and let the next Round use a smaller field. The existing zero-finisher fallback stays.
- **Hexapop.** Slower bot hop cadence and tile choice; tile warning-to-drop stays readable; Sugar Rush at 45 s removes the outer ring. Target 30–50 s. The center perch expires; a stationary player is eliminated. The existing kill plane applies to all bodies.
- **Crown Climb.** Bot waypoint/timing tuning at the rotating beams and rising donuts, plus a small recovery grace after a knock (not an elimination). A 10-seed sweep must produce a living winner ≥95%. Timeout-height remains the safety net.
- **Spectate camera.** Follow the living leader with a higher/wider shot, hide non-target name tags, snap smoothly when the leader changes, and resolve immediately if no leader is alive. No cinematic system.
- **Difficulty.** Keep Chill / Show / Champion. Tune the Show preset to the target; Chill is more forgiving, Champion is tighter. Player physics do not change per difficulty.
- **No new content.** No new modes, biomes, currencies, cosmetics, audio rework, multiplayer, or level editor. The second Course lap is the only content-shaped exception.
- **Hardware FPS.** Keep draw-call/triangle assertions in CI. Add a manual protocol in `docs/METRICS.md`: 1440×810, high quality, 30 s show, record avg/p95 on a real GPU. Do not treat SwiftShader FPS as a signal.

## Testing Decisions

- **Highest seam:** the real `Match`/`Game` show, driven by `window.__tumble`. Pacing is a system property, not a pure function. Isolated bot tests are allowed for helper logic but cannot be the pacing gate.
- **Unit tests:** pacing helper math (speed bands, anchor clamp, lap offsets, round-target calculations), Director qualification/timeout behavior, and any pure schedule logic.
- **Real-Match tests:** Course clock + 8+ finishers; idle human eliminated; scripted casual path qualifies 7/10; Hexapop duration + Sugar Rush; stationary center player eliminated; Crown living winner over 10 seeds; full-show duration band.
- **Playwright:** the visible show still works end to end, results/spectate/victory, mobile 390×844, no console errors, and the canonical evidence set. Do not use wall-clock sleeps as pacing assertions.
- **Measurement:** `npm run measure:show -- --runs=10` reports the median and per-round values. `npm run verify:pacing` asserts:
  - median total 3–5 min (target), no show <2.5 or >6;
  - Course 45–90 s, 8+ finishers;
  - Hexapop 30–50 s and Sugar Rush reached;
  - Crown 45–80 s and living winner ≥95%;
  - idle human never qualified.
- **Release gate:** `npm run check`, `npm run verify:show`, `npm run verify:pacing`, `npm run test:e2e`, `GITHUB_PAGES=true npm run build`. Follow `docs/RELEASE.md`.
- **Hardware:** draw calls/triangles measured and asserted; FPS manual protocol documented, not asserted in this environment.

## Out of Scope

- New modes or biomes.
- Multiplayer, backend, accounts, cloud saves, global leaderboards.
- Level editor or user-generated content.
- New cosmetics, currencies, battle pass, or monetization.
- Audio rework.
- Physics or match architecture rewrite.
- Mobile-native app, consoles, localization, key remapping.
- A cinematic replay system.

## Further Notes

- The 3–5 minute target is deliberately lower than the original 6–9 minute aspiration. It is achievable on the existing content and is measured, not asserted from a design document.
- The second Course lap is a pacing tool, not a content expansion. If the measurement shows the target is reached without it, do not add it.
- The 10-seed sweep is the tiebreaker. A single seed is an anecdote.
- The human-pace anchor must remain invisible in normal play; if it reads as rubber-banding, it is too strong.
- The show is allowed to be lost. The target is a fair window, not a guaranteed qualification.
