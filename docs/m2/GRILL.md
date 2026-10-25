# Grill-with-docs — M2: Show Pacing & Fairness

> Session owner: implementation agent. The human delegated every decision in this grilling session and asked for forward progress. Questions are answered with the recommended option, and each answer is recorded as a decision.

## Context

The v1 show is complete but too short. Measured on commit `5e61ac2` with `npm run measure:show -- --seed=20260418`:

| Round | Clock | Result |
| --- | ---: | --- |
| Sunrise Scramble | 26.03 s | 8 finishers, idle human ELIMINATED |
| Hexapop | 6.15 s | 4 survivors, Sugar Rush never mattered |
| Crown Climb | 36.48 s | 1 qualifier, living winner on this seed |
| **Gameplay total** | **68.66 s** | not the 4–6 minute show target |

The fix is not more levels. It is making the existing show last long enough to breathe, giving a casual human a real qualification window, and making the survival/final rounds reach their designed beats. This milestone is **M2 — Show Pacing & Fairness**.

## Method

Three rounds: product frame, game design, engineering/measurement. Each question has a recommended answer; the human delegated the choice. Facts were measured or read from the code, never asked of the human.

---

## Round 1 — Product frame

### ❓ Q1 — What is M2, exactly?

A content pack would multiply the current pacing problem. A graphics pass would not fix it. The show needs to feel like a game show before it gets more levels.

**➡️ Recommended (selected):** M2 is a focused **pacing and fairness** milestone. No new modes, no new biomes, no multiplayer. The Course may be extended within its existing section grammar if that is the only way to hit the clock; that is the one content-shaped exception.

**Decision:** M2-D1. Pacing/fairness first; no new modes.

### ❓ Q2 — What is the target show length?

The original 6–9 minute target was aspirational for a 173 u course with 8 u/s movement. The v1 baseline is 69 s. A realistic target must be honest and testable.

**➡️ Recommended (selected):** **3–5 minutes including intros/results**, with **2.5–4 minutes of Round clocks**. The median of a 10-show sweep should be 3–5 minutes. A show under 2.5 minutes is a failure; over 6 minutes is a failure.

**Decision:** M2-D2. Target 3–5 minutes total; 2.5–4 minutes of Round clocks.

### ❓ Q3 — What is the Course target?

The Course is the signature race. It must give a casual human a real chance to qualify while still producing a full field for Hexapop.

**➡️ Recommended (selected):** **45–90 seconds** of Course clock, **8+ real finishers**, and a **scripted casual input path that qualifies** at least 7/10 times on the Show difficulty. The idle human must never qualify. If 45–90 s is impossible on the 173 u layout, extend the Course with a second lap of the existing sections rather than slowing movement to a crawl.

**Decision:** M2-D3. Course 45–90 s, 8+ finishers, casual qualifies, idle never qualifies.

### ❓ Q4 — What is the Hexapop target?

At 6 s, the Sugar Rush never happens and the survival round is a formality.

**➡️ Recommended (selected):** **30–50 seconds** typical, with the Sugar Rush at 45 s actually reached in most rounds. The center perch expires; a stationary player must be eliminated. Bots should hop and survive long enough to make the floor the threat.

**Decision:** M2-D4. Hexapop 30–50 s, Sugar Rush meaningful, no idle perch.

### ❓ Q5 — What is the Crown Climb target?

The final should produce a hero moment, not a timeout fallback.

**➡️ Recommended (selected):** **45–80 seconds** typical; a **living winner in ≥95% of seeds** over a 10-seed sweep. Timeout-height remains the safety net but should be rare. Bots must climb, time the beams, and touch the crown.

**Decision:** M2-D5. Crown 45–80 s, living winner ≥95%.

### ❓ Q6 — How much content is allowed?

The user originally wanted more levels. The correct sequence is to fix the loop first, then add levels.

**➡️ Recommended (selected):** No new modes or biomes. The Course may gain a **second lap** of the existing five sections if the measurement harness proves it is the only way to reach 45–90 s. No new art direction, no new round type, no new currency.

**Decision:** M2-D6. No new modes; second Course lap is the only content-shaped exception.

---

## Round 2 — Game design

### ❓ Q7 — Why are the bots so fast, and what should change?

The v1 bots run near max speed with near-perfect waypoint following. The 8th finisher at 26 s leaves no room for a human who is learning the hazards.

**➡️ Recommended (selected):** Humanize the pack: target speed **0.62–0.78 of max** with skill-based variation, longer reaction to hazards, fewer perfect gap jumps, and visible mistakes. The fastest bots can still sprint, but the pack should not be a metronome. Tune to the measurement harness, not to a feeling.

**Decision:** M2-D7. Humanize bot speed/reactions; tune against the Course clock.

### ❓ Q8 — Should the game help the human catch up?

A visible rubber-band is cheap. Doing nothing is unfair when the pack is faster and knows the course.

**➡️ Recommended (selected):** A **bounded human-pace anchor**: when the human is more than ~25% of the Course behind the pack, bots lose at most **8–10% target speed**; the anchor never speeds bots up, never teleports, and never applies in the final. The human's own physics and max speed are unchanged. The effect is invisible unless you measure it.

**Decision:** M2-D8. Subtle, bounded pack slowdown when the human falls behind.

### ❓ Q9 — How should Course qualification work?

The v1 rule is first 8 finishers. It is readable and authentic, but it only works if the pack is paced so the 8th finish is late enough.

**➡️ Recommended (selected):** Keep **first 8 finishers** if the Course can be tuned to 45–90 s. If the second lap is used, the finish gate is at the end of lap 2 and the same rule applies. Do not reserve a human slot and do not qualify a living 0% runner at timeout.

**Decision:** M2-D9. Keep first-8-finishers; extend the Course if needed.

### ❓ Q10 — How should Hexapop be slowed without making it boring?

The v1 bots collapse the floor in 6 s. The player barely sees the tiers.

**➡️ Recommended (selected):** Slower bot hop cadence, more cautious tile choice, a slightly slower tile warning-to-drop, and a Sugar Rush at 45 s that removes the outer ring. Target 30–50 s. The player's controls and tile physics stay the same; the bots and collapse cadence do the work.

**Decision:** M2-D10. Slow bot hopping and collapse cadence; Sugar Rush at 45 s.

### ❓ Q11 — How should Crown Climb produce a living winner?

The v1 bots often fall before the crown and the timeout fallback decides the show. The final should be won by touching the crown.

**➡️ Recommended (selected):** Improve the bot path/timing at the rotating beams and rising donuts, add a small recovery grace when a bot is knocked but not eliminated, and validate a **10-seed sweep**. A living winner ≥95% is the gate. Do not give the human a hidden advantage.

**Decision:** M2-D11. Tune Crown bot navigation; living winner ≥95%.

### ❓ Q12 — What should the spectate camera do?

The v1 spectate view is better than launch but can still be crowded or look past the leader.

**➡️ Recommended (selected):** Follow the current living leader with a higher, wider shot; hide non-target name tags; if the leader changes, snap smoothly; if no leader is alive, resolve the round immediately. No cinematic camera system in M2.

**Decision:** M2-D12. Clear follow-cam; no new cinematic system.

### ❓ Q13 — Do the difficulty presets change?

They already scale bot skill and aggression. M2 should preserve them and use the **Show** preset as the pacing baseline.

**➡️ Recommended (selected):** Keep Chill / Show / Champion. Tune the Show preset to the 3–5 minute target; Chill is more forgiving, Champion is tighter. Do not change player physics per difficulty.

**Decision:** M2-D13. Keep presets; Show is the baseline.

---

## Round 3 — Engineering and quality

### ❓ Q14 — How do we prove the pacing changed?

The v1 failure was discovered by a one-off probe after release. The measurement must be a first-class command.

**➡️ Recommended (selected):** Extend `npm run measure:show` to support a **full-show** mode with a scripted casual input path, per-round clocks, finishers, qualifiers, living-winner state, and a JSON output. Add a **10-seed sweep** command and a `verify:pacing` gate that fails outside the target bands. Record results in `docs/METRICS.md`.

**Decision:** M2-D14. Measurement harness is a ticket and a release gate.

### ❓ Q15 — What automated tests are required?

Pacing is a real-system property, not a pure function. The existing real-Match gate is the right seam.

**➡️ Recommended (selected):** Keep unit tests for pure pacing helpers; add real-Match tests for Course clock/finishers, Hexapop duration/Sugar Rush, Crown living winner, idle human elimination, and a full-show duration band. Playwright covers the visible results and mobile layout. Do not add wall-clock sleeps as pacing assertions.

**Decision:** M2-D15. Real-Match pacing tests + Playwright.

### ❓ Q16 — How do we handle hardware FPS?

The dev host is SwiftShader-only. FPS is not measurable here.

**➡️ Recommended (selected):** Keep draw-call/triangle assertions in CI. Add a manual **hardware FPS protocol** to `docs/METRICS.md` (1440×810, high quality, 30 s show, record avg/p95 on a real GPU). Do not block M2 on a number this environment cannot produce; report the limitation.

**Decision:** M2-D16. Draw-call CI gate + manual hardware protocol.

### ❓ Q17 — What is explicitly out of scope?

- New modes or biomes.
- Multiplayer, backend, accounts, global leaderboards.
- A level editor.
- New cosmetic economy or battle pass.
- Audio rework.
- Mobile-native app.
- Rewriting the physics or match architecture.

**Decision:** M2-D17. Scope frozen.

### ❓ Q18 — What is the definition of done?

**➡️ Recommended (selected):**

- 10-show sweep: median total 3–5 minutes, no show <2.5 or >6.
- Course: 45–90 s, 8+ real finishers, scripted casual qualifies 7/10, idle never qualifies.
- Hexapop: 30–50 s, Sugar Rush reached, stationary player eliminated.
- Crown: 45–80 s, living winner ≥95%.
- No console errors; no open issues/PRs; live Pages deploy verified.
- README/metrics updated; release checklist and retro followed.

**Decision:** M2-D18. Definition of done locked.

---

## Shared-understanding checkpoint

The design tree is exhausted. The objective is **not more content**: it is a show that lasts 3–5 minutes, gives a casual human a fair Course window, lets Hexapop breathe, and produces a living Crown winner. Implementation proceeds against `docs/m2/SPEC.md` and `docs/m2/TICKETS.md`.
