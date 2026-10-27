# Tumble Rush M4 — Twist Season

**Version:** 1.0 (locked)
**Source decisions:** [`docs/m4/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md) — M3 12-seed variety sweep: 12/12 routes, 3/3 arenas, Course 68.7–73.4 s, Hexapop 46.17–47.2 s, Crown 48.9–65.2 s, total median 205.55 s, idle 0/12, casual 10/12, 24/24 living crown winners
**Status:** Ready for implementation

---

## Problem Statement

M3 made the Show structurally different by seed. The route and arena change; the
rules do not. Every Tumbler has the same gravity, the same grip, the same jump,
and the same hazard speeds on every seed. A player who has learned the Course
grammar and the Crown climb has learned the whole rule set.

That is the remaining replayability gap. The next Show can look different and
still feel the same to play. The show needs a **seeded rule twist** that changes
how the qualifier rounds move, while the fixed Crown final remains the
championship test. It also needs a gate that proves the twist did not cost the
pacing and fairness M2 established.

## Solution

Make every seed a different, still-fair **rule set**:

1. **Three twists.** **MOON GRAVITY** changes gravity, jump, and air control;
   **SLIPPERY** changes ground grip and acceleration; **RUSH HOUR** changes
   hazard speed and the Hexapop Sugar Rush clock. One twist per Show.
2. **Twist rules in the show plan.** A pure `planShow(seed)` selects the twist,
   names it, and carries a `TwistRules` value. The Course, Hexapop, Match, HUD,
   Show Card, and gate all read the same value.
3. **Qualifier-only.** The twist applies to the Course and Hexapop. The Crown
   Climb, Training Deck, and menu use `CLASSIC_RULES`. The Crown remains the
   known championship.
4. **Readable.** The twist is named in the Round intro, a compact HUD chip, a
   start-deck sign, the results/show-end card, and the Daily chip. The Crown
   card says `FINAL · CLASSIC`.
5. **Measured.** A 12-seed `verify:twists` gate runs idle and scripted casual
   shows through the real `Match`, proves all three twists appear and are
   physically applied, and re-checks every M2 pacing and fairness band.

No new mode, round, biome, hazard kind, movement verb, screen, or asset.

## User Stories

1. As a player, I want each Show to have a named rule twist, so that the second
   Show is not just a new route with the same feel.
2. As a player, I want the twist explained before the countdown, so that a
   floaty jump or a long slide is not a mystery.
3. As a player, I want a compact twist chip during play, so that I can remember
   the rule without opening a menu.
4. As a player, I want the twist sign on the start deck, so that the rule is
   visible in the world, not only in the UI.
5. As a player, I want the results card to repeat the twist, so that I can
   compare shows with a friend.
6. As a player, I want the Daily chip to name today's twist, so that the daily
   seed has a visible identity.
7. As a player, I want the Crown Climb to stay classic, so that the final is a
   known championship and not another random rule.
8. As a player, I want the twist to apply to the bots too, so that a win is
   legitimate.
9. As a player, I want the twist to be readable in 3D, so that I can see the
   rule while I play.
10. As a player, I want no new controls, so that a twist does not require
    relearning the game.
11. As a player, I want the twist to stay inside the 3–5 minute show, so that I
    can replay it.
12. As a player, I want the Course to still have eight qualifiers on every
    twist, so that a rule change does not change what qualifying means.
13. As a player, I want the idle human to still be eliminated, so that
    qualification stays meaningful.
14. As a casual player, I want a real qualification window on every twist, so
    that a new rule is not a hidden difficulty spike.
15. As a player, I want the Sugar Rush to keep its warning on every twist, so
    that the floor never disappears without a read.
16. As a player, I want the Crown to remain physically touchable, so that the
    hero moment is real.
17. As a player, I want the twist names to be short and readable, so that the
    HUD chip does not become a paragraph.
18. As a mobile player, I want the twist chip and card to fit 390×844, so that
    they do not cover the countdown or the play area.
19. As a screen-reader user, I want the twist name and rule announced, so that
    the card is not visual-only.
20. As a colour-blind player, I want the twist to have a text label, so that
    the accent colour is not the only signal.
21. As a Practice player, I want to practise the same twist my Show will use,
    so that the safety net is useful.
22. As a Training Deck player, I want the movement tutorial to stay classic, so
    that the first lesson is not randomized.
23. As a Daily Show player, I want the one-result-per-day rule to stay, so that
    the daily card does not change the competition.
24. As a maintainer, I want one pure twist contract, so that the physics, the
    levels, the UI, and the gate cannot disagree.
25. As a maintainer, I want `CLASSIC_RULES` to reproduce the current constants,
    so that the Crown and Training Deck do not drift.
26. As a maintainer, I want the twist selection to be deterministic and
    balanced, so that a seed always reproduces its show.
27. As a maintainer, I want every twist in at least 3 of 12 seeds, so that a
    twist cannot silently disappear.
28. As a maintainer, I want a physical applied probe, so that a plan label
    cannot lie about the gravity or the Sugar Rush clock.
29. As a maintainer, I want the M2 bands checked per run, so that a twist cannot
    hide a pacing regression in the median.
30. As a maintainer, I want the 12-seed variety gate to keep running, so that
    M3's route and arena variety is not lost under the twist.
31. As a maintainer, I want the twist gate in CI and `gate:release`, so that a
    new twist cannot merge unmeasured.
32. As a maintainer, I want the twist signs to reuse the existing sign texture
    path, so that the feature adds no asset pipeline.
33. As a maintainer, I want the draw-call and triangle budgets sampled on all
    three twists, so that the new signs do not become render debt.
34. As a maintainer, I want no profile migration, so that existing players keep
    their cosmetics and results.
35. As a maintainer, I want no new runtime assets or network calls, so that the
    static-host guarantee stays true.
36. As a maintainer, I want a written review with a verdict, so that the twist
    refactor gets an independent check.
37. As a maintainer, I want METRICS to record the exact 12-seed twist sweep, so
    that the next milestone has a baseline.
38. As a maintainer, I want the README to describe the twist, so that the public
    claim matches the build.
39. As a maintainer, I want the Pages deployment verified after merge, so that
    the live game is the one with the twist.
40. As a maintainer, I want no open issues or branches after release, so that
    the next run starts from a clean main.
41. As a reviewer, I want the twist contract and the real-Match gate in the test
    suite, so that I can trust the shape without replaying 12 shows by hand.
42. As a reviewer, I want the Crown to report `CLASSIC_RULES` on every run, so
    that the fixed-final decision is testable.

## Implementation Decisions

### Twist contract

`src/game/twist.ts` is pure (no Three.js, DOM, Match, or Level import cycles):

```ts
export type TwistId = 'moon' | 'slippery' | 'rush';

export interface TwistRules {
  id: TwistId | 'classic';
  gravityScale: number;
  jumpScale: number;
  airControlScale: number;
  airDragScale: number;
  accelScale: number;
  frictionScale: number;
  hazardSpeedScale: number;
  courseTimeLimit: number;
  hexTimeLimit: number;
  hexSugarRush: number;
}

export interface TwistPlan {
  id: TwistId;
  label: string;      // MOON GRAVITY
  short: string;      // MOON
  blurb: string;      // Low gravity. Float your jumps.
  accent: number;     // 0x57c7ff
  rules: TwistRules;
}
```

`CLASSIC_RULES` must equal the current physics/controller/clock constants:
gravity `-26`, jump `8.6`, air control `0.65`, air drag `1.2`, accel `55`,
friction `14`, hazard speed `1`, Course limit `120`, Hexapop limit `49.9`,
Sugar Rush `45`.

The twist rules are initial tuning, not a public promise. The implementer may
move any multiplier by up to **±15%** to pass the gate. The label, short name,
blurb, accent, `TwistId`, and the M2 bands do not move to hide a tuning failure.
Any final value is recorded in `docs/METRICS.md`.

### Twists

| Twist | Label | Short | Rule | Initial rules |
| --- | --- | --- | --- | --- |
| `moon` | MOON GRAVITY | MOON | Low gravity. Float your jumps. | gravity ×0.78, jump ×0.90, air control ×1.10, air drag ×0.90 |
| `slippery` | SLIPPERY | SLIP | Less grip. Longer slides. | friction ×0.55, accel ×0.90, air drag ×0.85 |
| `rush` | RUSH HOUR | RUSH | Faster hazards. Earlier Sugar Rush. | hazard ×1.10, Course 105 s, Hexapop 42.9 s, Sugar Rush 38 s |

All other `TwistRules` fields are `1` / the classic value.

### Selection

A salted 32-bit hash of the seed selects one of the three twists. It is
deterministic and independent of the route/arena draw, so it does not shift the
M3 route or arena sequence. A 300-seed sweep checks each twist is between 20%
and 45% of the population. The 12-seed gate must produce at least 3 of each; if
it does not, the salt changes, not the seeds.

`planShow(seed)` returns `twist` and includes it in:

- `signature`: `<course> · <arena> · <short>` (e.g. `B-D-G/C-F-G · SPIRAL · MOON`);
- `label`: `COURSE <routes> · ARENA <arena> · TWIST <label>`;
- the Show Card, Daily chip, HUD, and evidence.

`twistRulesFor(mode, plan)` returns the plan twist for `course` and `hexapop`,
and `CLASSIC_RULES` for `crown-climb`, `training`, and menu previews. Practice
on the Course uses the plan twist. The Crown, Training Deck, and menu are
classic.

### Physics and controller

- `PhysicsWorld` gains `setGravity(number)`; it is applied before the first
  fixed step of the Round. The existing `gravity` getter remains.
- `BeanController` gains `setRules(TwistRules)` and reads:
  - `jumpScale` in `tryJump`;
  - `accelScale` and `frictionScale` in `applyMovement`;
  - `airControlScale` and `airDragScale` in the air branch.
- `MAX_RUN_SPEED`, dive impulse, grab range, coyote time, jump buffer, and all
  other movement verbs are unchanged. A twist never raises the player's speed
  cap.
- `Game.installLevel` resolves `twistRulesFor(mode, planShow(seed))`, calls
  `world.setGravity(GRAVITY * rules.gravityScale)`, and calls
  `contestant.controller.setRules(rules)` for every contestant before the
  Round begins. On disposal/next Round, the rules are set again; no global
  leaks between modes.

### Course

- `Course` reads `planShow(seed).twist` and multiplies sweeper, pusher,
  conveyor, and pendulum speeds by `hazardSpeedScale`.
- The Course status `timeLimit` is `twist.rules.courseTimeLimit`.
- The start deck gets a small **twist sign**: the full label, the short rule,
  and the accent color. It uses the existing `makeSign` path and the level's
  material cache, and is merged into the static visuals.
- Geometry, section grammar, routes, checkpoints, waypoints, qualification,
  and the human-pace anchor are unchanged.

### Hexapop

- `Hexapop` reads the plan twist. The Sugar Rush time is
  `rules.hexSugarRush`; the cap is `rules.hexTimeLimit`; the 3.3 s warning is
  unchanged.
- `MOON` and `SLIPPERY` change movement physics only; the tile rules are
  unchanged.
- The start sign names the twist. The arena plan, connectivity, centre perch,
  tile count, and 8 seats are unchanged.
- The no-warn-under-a-living-Tumbler rule is unchanged.

### Match and HUD

- `Match` uses the plan twist for the Course and Hexapop time limits; the Crown
  keeps `120 s`.
- `MatchHud` gains `twistLabel`, `twistShort`, `twistRule`, and `twistClassic`.
  The HUD shows a compact chip: `TWIST MOON` on Rounds 1–2, `FINAL · CLASSIC`
  on Round 3. The chip has an accessible label with the full rule.
- The Round intro card shows `TWIST <label>` and the one-line rule; the Crown
  intro shows `FINAL · CLASSIC`.
- The results/show-end card repeats the show twist (not the Crown classic note).
- The Daily chip is `TODAY · <routes> · <arena> · <short>`.
- The twist chip is text, not colour-only, and fits 390×844.

### Bot adaptation

- `BotBrain` reads the same `TwistRules` as the level. It derives the jump
  approach and trigger distances from the rule's airtime/jump scale, and the
  steer lead from the stopping distance. The casual pilot uses the same
  adaptation.
- The bot never receives a different gravity, friction, jump impulse, or
  maximum speed. The same `TwistRules` value is the only difference.
- No teleport, free jump, hidden speed, or bot-only bridge.

### Twist gate

`npm run verify:twists` runs 12 seeds × (idle + scripted casual) through the
real `Match`, using the M2 observation hooks. It writes JSON and a table and
fails when any of these is false:

- every seed's plan twist is one of the three valid ids;
- each twist appears in at least 3 of 12 seeds;
- the applied debug probe matches the plan for the Course and Hexapop:
  - `moon`: `world.gravity` is `-26 × 0.78` (±0.01);
  - `slippery`: the controller's `frictionScale` is 0.55 (±0.001);
  - `rush`: the Hexapop Sugar Rush stamp appears at 38 s (±1 s);
  - `crown-climb`: the probe reports `classic` on every run;
- every M2 band holds per run: Course 45–90 s and 8+ finishers; Hexapop
  30–50 s with the Sugar Rush reached; Crown 45–80 s with a living,
  physically-touching winner; total 3–5 min; no show below 150 s or above
  360 s;
- idle human qualified 0/12; casual human qualified ≥8/12; living crown winner
  ≥23/24;
- the negative control (runs relabelled `applied: false`) is rejected.

The gate is a CI job and part of `gate:release`. `verify:variety` remains the
M3 historical gate and must stay green with the twist active.

### Evidence and performance

- `npm run evidence` captures the three twist intro cards, the three HUD chips,
  the three start signs, the `FINAL · CLASSIC` card, a mobile twist card, and
  the three-twist render samples.
- Draw calls ≤320 and triangles ≤200k at 1440×810 high on the sampled Course
  and Hexapop starts. The twist signs go through the existing merge path.
- Hardware FPS remains a manual protocol; this host is SwiftShader-only.

### Compatibility

The profile schema does not change. Existing cosmetics, crowns, kudos, and
daily bests remain valid. A seed now includes a twist; M3 seeds replay with the
M4 twist by design. The README, GLOSSARY, METRICS, and ADR 0007 state that
twists begin with M4.

## Testing Decisions

A good test checks an externally visible behavior or a pure contract, not a
private implementation detail. The new seam is the **twist plan**; the highest
seam remains the **real `Match`**.

### Pure twist tests

- `twistForSeed(seed)` is deterministic and returns a valid id.
- Each twist is between 20% and 45% of a 300-seed sweep.
- `CLASSIC_RULES` equals the current constants (gravity, jump, friction,
  accel, air control, air drag, hazard speed, clocks).
- Every twist has a non-empty label, short, blurb, accent, and rules.
- `planShow(seed).signature` and `label` include the twist; the route and arena
  are unchanged for the same seed compared with M3's draw order.
- `twistRulesFor('course' | 'hexapop', plan)` returns the plan twist;
  `twistRulesFor('crown-climb' | 'training', plan)` returns `CLASSIC_RULES`.

### Physics and controller tests

- `PhysicsWorld.setGravity` changes the integrated fall speed; classic gravity
  is unchanged.
- A classic jump apex is within the existing tolerance; a moon jump has a
  higher/longer arc; a slippery stop is longer than classic.
- `BeanController.setRules` does not change the maximum run speed, dive
  impulse, or jump buffer.
- Bots and the player receive the same `TwistRules` object.

### Level and Match tests

- The Course status time limit is 105 s on `rush`, 120 s on `moon`/`slippery`.
- Course hazard speed is multiplied by 1.10 on `rush`; geometry and waypoints
  are unchanged.
- Hexapop reaches the Sugar Rush at 38 s on `rush`; the 3.3 s warning is
  unchanged; the tile under a living Tumbler is never warned.
- The Crown reports `CLASSIC_RULES` and 120 s on every twist.
- `Match.hud` exposes the twist fields and `FINAL · CLASSIC` on Round 3.
- Practice uses the seeded twist; Training Deck is classic.

### Playwright

- The intro card names the twist and the rule for all three twists.
- The HUD chip is visible during Course and Hexapop and says `FINAL · CLASSIC`
  on the Crown.
- The start sign is visible in the Course and Hexapop with the twist label.
- The results and Daily chip repeat the twist.
- The card and chip fit 390×844 and have an accessible label.
- No console errors and no failed requests.

### Real-Match twist gate

- 12 seeds × idle + casual; every M2 band; twist coverage; applied probe;
  negative control. See above.

## Out of Scope

- New modes, round types, or a second full show.
- New biomes or art direction; the Sunrise Carnival palette and props stay.
- Crown Climb layout or rule variants.
- New hazard physics, a new movement verb, or a physics rewrite.
- Multiplayer, backend, accounts, cloud saves, or leaderboards.
- A level editor or user-generated content.
- New cosmetics, economy, battle pass, audio rework, or localization.
- Replay export, cinematic camera, or spectator tools.
- Mobile-native app or console support.
- Reworking the M2 pacing bands or the difficulty presets.

## Further Notes

- The twist is a **qualifier rule**, not a show-wide rewrite. The Crown is the
  constant; the road is the variable.
- The three twists are deliberately different systems: gravity, friction, and
  clocks. A fourth twist should be a separate, measured feature.
- The start sign is the 3D proof; the HUD chip is the in-play proof; the Show
  Card is the pre-round proof. All three read the same plan.
- The twist gate is the tiebreaker. A twist that looks good in a screenshot but
  misses the finisher or casual win rate is not shipped.
- If a multiplier must move, move it inside the ±15% band and record the
  before/after in METRICS. Never change the band to hide a failure.
