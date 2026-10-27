# Grill-with-docs — M4: Twist Season

> Session owner: planning agent. The human asked for a **very challenging
> objective**, delegated every decision, and asked for forward progress rather
> than a question queue. Each question is answered with the recommended option;
> the answer is recorded as a decision. Facts were measured or read from the
> code, never asked of the human.

## Context

M3 made the Show structurally different by seed: 12/12 Course signatures, 3/3
Hexapop arenas, and a Show Card that names both. The M2 bands survived the
remix: Course **68.7–73.4 s** with **8–9 finishers**, Hexapop **46.17–47.2 s**
with the Sugar Rush on every run, Crown **48.9–65.2 s** with **24/24 living,
physically-touching winners**, total median **205.55 s**, idle **0/12**, casual
**10/12**.

The remaining gap is **rules**. A player who has learned the Course grammar,
the three arena plans, and the Crown climb has learned every rule the Show can
throw at them. The seed changes the arrangement; it does not change how the
Tumbler moves or how the clock pressures the field. M4 makes the **rule set**
seeded, while keeping the fixed Crown final as the championship.

## Method

Three rounds: product frame, game design, engineering/quality. Each question
has a recommended answer; the human delegated the choice. The design tree is
worked in dependency order.

---

## Round 1 — Product frame

### ❓ Q1 — What is M4, exactly?

M3 proved that layout variety is measurable and safe. The next high-leverage
move is not another set of modules; it is a **seeded rule twist** that changes
how the existing Course and Hexapop play. The Show Card already tells the
player what kind of show they got; it can now name the rule.

**➡️ Recommended (selected):** M4 is **Twist Season**: every Show gets one of
three seeded twists — **MOON GRAVITY**, **SLIPPERY**, or **RUSH HOUR** — applied
to the Course and Hexapop. The Crown Climb stays classic. The twist is named in
the intro, HUD, results, and Daily chip, and a measured twist gate proves it did
not cost pacing or fairness.

**Decision:** M4-D1. Twist the qualifier rounds; keep the championship fixed.

### ❓ Q2 — Why not add a new mode, round, or biome?

A new mode doubles the tuning surface. A new biome is an art-direction project.
A twist reuses the existing three-Round show, the existing hazard vocabulary,
and the existing route/arena planner. It changes the decision space without
adding content the gate has to relearn.

**➡️ Recommended (selected):** No new mode, round, biome, or screen. Three
rule twists, one per Show, on the existing Course and Hexapop.

**Decision:** M4-D2. Rules before content.

### ❓ Q3 — Why is the Crown Climb fixed?

The Crown is the championship: a known test makes the crown mean something.
M3's ADR 0006 already records this. A twisted final would make the crown gate,
bot navigation, and the living-winner measurement a fresh tuning problem on
every seed. The qualifiers' road is the varied part.

**➡️ Recommended (selected):** The Crown Climb uses the **classic** rules on
every Show: baseline gravity, friction, jump, hazard speeds, slime speed, and
crown contact. The Show Card says `FINAL · CLASSIC` on Round 3. The twist is a
**qualifier rule**, not a show-wide physics rewrite.

**Decision:** M4-D3. Fixed final, twisted road.

### ❓ Q4 — Which three twists?

Each twist must teach one readable rule, use an existing system, and be
measurable without new content:

1. **MOON GRAVITY** — lower gravity, a slightly softer jump, more air control.
   The lesson is "float the gap, do not panic-dive."
2. **SLIPPERY** — less ground grip and a longer slide. The lesson is "steer
   before the edge, not at it."
3. **RUSH HOUR** — faster hazards, an earlier Sugar Rush, a shorter Course
   clock. The lesson is "commit on the first read."

**➡️ Recommended (selected):** MOON GRAVITY, SLIPPERY, RUSH HOUR. Three
different systems (gravity, friction, clocks) and three different verbs
(float, steer, commit). No new hazard kind.

**Decision:** M4-D4. Three twists: MOON GRAVITY, SLIPPERY, RUSH HOUR.

### ❓ Q5 — What is the variety target?

A twist that never appears is not a feature. Across the 12-seed gate, every
twist must appear at least three times, and the assignment must be
deterministic for a seed.

**➡️ Recommended (selected):** Three twists, each in **≥3 of 12** seeds, all
deterministic. The gate records the twist per run and fails on a missing
twist. A 300-seed unit sweep checks the selection is balanced (no twist below
20% or above 45%).

**Decision:** M4-D5. Every twist appears at least 3/12; selection is balanced
and seeded.

### ❓ Q6 — What is the fairness bar?

A twist is only fun if it is the same rule for everyone and the Show still
finishes. The M2 bands are the contract. The twist must not create a hidden bot
advantage, a teleport, a free jump, or a speed above the player's cap.

**➡️ Recommended (selected):** Every twist run must meet the M2 bands: Course
**45–90 s** and **8+ finishers**, Hexapop **30–50 s** with the Sugar Rush
reached, Crown **45–80 s** with a living physical touch, total **3–5 min**,
idle **0/12**, casual **≥8/12**, living crown winner **≥23/24**. Bots and the
player consume the same `TwistRules`; the bot may adapt its jump timing from
the public rules, but it never gets a different gravity, friction, jump, or
speed.

**Decision:** M4-D6. M2 bands are the M4 contract; one rule set for everyone.

### ❓ Q7 — What does the player see?

The twist must be legible before the countdown and during play. A hidden
physics change is a bug. The Show Card already has a line for the route and
arena; it can carry the twist. A small HUD chip keeps it visible during play.

**➡️ Recommended (selected):** The Round intro shows `TWIST MOON GRAVITY` with
a one-line rule; the HUD shows a compact `TWIST MOON` chip; the results and
show-end repeat the full twist; the Daily chip names it. The Course and Hexapop
start decks get a small **twist sign** with the name and rule. The Crown intro
and HUD say `FINAL · CLASSIC`. No new screen, no new control.

**Decision:** M4-D7. Show Card, HUD chip, start sign, results, Daily chip.

### ❓ Q8 — What is explicitly out of scope?

**➡️ Recommended (selected):** New modes, round types, biomes, or Crown
variants; new hazard physics or movement verbs; multiplayer, backend, accounts,
or leaderboards; new cosmetics, economy, audio, or localization; a level
editor; profile migration; a replay system; new runtime assets or network
calls.

**Decision:** M4-D8. Scope frozen.

---

## Round 2 — Game design

### ❓ Q9 — How does MOON GRAVITY work?

Lower gravity alone makes every jump floatier, but it can also make the bots
overshoot authored landings. A slightly softer jump keeps the apex readable
while extending the airtime. More air control lets both the player and the bots
correct a floaty landing.

**➡️ Recommended (selected):** Gravity **×0.78**, jump impulse **×0.90**, air
control **×1.10**, air drag **×0.90**. Airtime rises about 15%, apex about 4%.
The bot's jump approach and trigger distances are derived from the same rules,
not hard-coded. The final is classic.

**Decision:** M4-D9. Moon is a floaty, not a moon-hop.

### ❓ Q10 — How does SLIPPERY work?

Lower friction makes stopping and turning slower. It should be felt on the
landing and the bridge, not make the Course a pinball table. Acceleration stays
close to baseline so the player can still build speed; the slide is the rule.

**➡️ Recommended (selected):** Ground friction **×0.55**, ground acceleration
**×0.90**, air drag **×0.85**. Jump arc unchanged. Bots steer earlier because
the same public rules tell them the stopping distance. The final is classic.

**Decision:** M4-D10. Slippery is a longer slide, not a loss of control.

### ❓ Q11 — How does RUSH HOUR work?

The Course is usually decided by the 8th finisher around 70 s, so a shorter
clock alone is not enough. The pressure should come from the hazards and the
Hexapop Sugar Rush, with the clock as a visible backstop.

**➡️ Recommended (selected):** Hazard speed **×1.10**, Course limit **105 s**,
Hexapop Sugar Rush at **38 s**, Hexapop cap **42.9 s**. Crown is classic. The
Hexapop clock stays inside 30–50 s and the show stays 3–5 min. The Sugar Rush
warning remains 3.3 s.

**Decision:** M4-D11. Rush is faster hazards plus an earlier Sugar Rush.

### ❓ Q12 — Are the exact multipliers a product promise?

No. The numbers are the starting tuning, not a public contract. The bands are
the contract. If the gate shows a twist breaking the 8-finisher or casual
qualification bar, the multiplier moves; the label, the rule, and the gate stay.

**➡️ Recommended (selected):** The spec records the initial values and the
allowed tuning band (±15% on each multiplier). Any change is recorded in
`docs/METRICS.md` with the before/after sweep. The sign, label, and rule do not
change to hide a tuning failure.

**Decision:** M4-D12. Tune the multiplier, never the band.

### ❓ Q13 — Does the twist change qualification or the field?

No. The Course is still first 8 finishers; Hexapop is still last 4 standing;
the Crown is still first to touch. A twist changes how the Tumbler moves and how
the clock pressures the field, not who advances.

**➡️ Recommended (selected):** Qualification, field sizes, and the top-8 /
last-4 / first-to-crown rules are unchanged. The human-pace anchor remains
bounded to 10% and applies only to the Course.

**Decision:** M4-D13. Same qualification rules on every twist.

### ❓ Q14 — How do bots handle a twist?

The bots already use the same controller and physics. A change in gravity or
friction changes their jump arc and stopping distance exactly as it changes the
human's. A bot that ignores the twist will look stupid; a bot with a hidden
speed will be unfair.

**➡️ Recommended (selected):** The bot brain reads the same `TwistRules` the
level uses. It adjusts the **jump approach/trigger distance** from the rule's
airtime and the **steer lead** from the rule's stopping distance. It never
receives a different gravity, friction, jump impulse, or maximum speed. The
casual pilot uses the same adaptation.

**Decision:** M4-D14. Bots adapt through public rules, not hidden stats.

### ❓ Q15 — How does the twist reach the physics world?

The physics world and controller are shared by every Round. The twist must be
applied when the Round is installed, not read from a global that can drift.

**➡️ Recommended (selected):** A pure `TwistRules` value is included in
`ShowPlan`. `Game.installLevel` resolves the twist for the mode (Course and
Hexapop use the show twist; Crown, Training, and menu use `CLASSIC_RULES`),
sets `PhysicsWorld` gravity, and sets every contestant controller's rules
before the Round starts. Levels read the same plan for hazard speed, time
limits, and the start sign.

**Decision:** M4-D15. One rules value, applied at Round install.

### ❓ Q16 — How does the Course use the twist?

The Course already reads `planShow(seed)` for routes, lane scales, hazard
phases, and speeds. The twist can multiply the authored speeds and change the
clock. The start sign can name the rule.

**➡️ Recommended (selected):** The Course multiplies sweeper, pusher,
conveyor, and pendulum speeds by `hazardSpeedScale`; its status time limit
comes from the twist; its start sign names the twist and the one-line rule.
Geometry, section grammar, checkpoints, and waypoints are unchanged.

**Decision:** M4-D16. Course uses the twist for speeds, clock, and signage.

### ❓ Q17 — How does Hexapop use the twist?

Hexapop's rules are its identity: 3.3 s warning, 45 s Sugar Rush, 4-survivor
end, 49.9 s cap. A twist may move the Sugar Rush earlier, but it must not
shorten the warning or surprise a living Tumbler.

**➡️ Recommended (selected):** RUSH HOUR moves the Sugar Rush to 38 s and the
cap to 42.9 s; the 3.3 s warning and the no-warn-under-a-living-Tumbler rule
are unchanged. MOON and SLIPPERY change the movement physics, not the tile
rules. The arena plan, connectivity, centre perch, and 8 seats are unchanged.
The start sign names the twist.

**Decision:** M4-D17. Twist the movement or the clock, never the warning.

### ❓ Q18 — How does Practice use the twist?

Practice is the safety net for learning the Course. It must practise the same
route and the same rules the Show will use.

**➡️ Recommended (selected):** Practice uses the Course route and the twist
from the current seed, with the same sign, physics, and checkpoints. No new
controls. The pause menu's restart keeps the same plan. Training Deck remains
classic (it is a movement tutorial, not a Show).

**Decision:** M4-D18. Practice uses the seeded twist; Training stays classic.

### ❓ Q19 — How does the Daily Show use the twist?

The Daily Show is already seeded by the calendar date and has one recorded
result per day. The twist makes the daily card more distinctive.

**➡️ Recommended (selected):** The Daily chip shows `TODAY · <route> · <arena>
· <twist>`. The intro and results use the same plan. The one-result-per-day
rule and the daily best are unchanged.

**Decision:** M4-D19. Daily card names the twist; same daily rules.

### ❓ Q20 — What is the show-length target?

The M2 bands remain the contract. RUSH HOUR intentionally shortens the
qualifier rounds; the total must still be 3–5 minutes. The Crown is unchanged.

**➡️ Recommended (selected):** Course 45–90 s, Hexapop 30–50 s, Crown 45–80 s,
total 3–5 min, no show below 150 s or above 360 s. The twist gate reports the
median per twist and every run.

**Decision:** M4-D20. Same show-length bands, per twist.

---

## Round 3 — Engineering and quality

### ❓ Q21 — What is the twist contract?

The twist is a pure value that every system can read. It must not import
Three.js, DOM, or Match. It needs an id, a display label, a short label, a
one-line rule, an accent color, and the numeric rules.

**➡️ Recommended (selected):** `src/game/twist.ts` exports `TwistId`,
`TwistPlan`, `TwistRules`, `TWISTS`, `CLASSIC_RULES`, `twistForSeed(seed)`, and
`twistRulesFor(mode, plan)`. `ShowPlan` carries `twist`. The plan is
deterministic; the same seed always returns the same twist.

**Decision:** M4-D21. One pure twist contract, included in the show plan.

### ❓ Q22 — How is the twist selected?

A biased or predictable selection makes the feature disappear. A plain `seed %
3` is too regular. A salted hash is deterministic and balanced over a large
sweep; the 12-seed gate must still cover all three.

**➡️ Recommended (selected):** A salted 32-bit hash of the seed selects from
the three twists. A 300-seed unit test asserts each twist is between 20% and
45% of the sweep. The gate's fixed 12 seeds must produce ≥3 of each; if not,
the selection salt moves, not the seeds.

**Decision:** M4-D22. Salted, balanced, deterministic selection.

### ❓ Q23 — How is the twist applied to the controller and physics?

The existing constants are module-level. A rules value must be able to override
them without forking the controller or the physics world.

**➡️ Recommended (selected):** `PhysicsWorld` gets `setGravity(number)`.
`BeanController` gets `setRules(TwistRules)` and reads `jumpScale`,
`airControlScale`, `airDragScale`, `accelScale`, and `frictionScale` in
`tryJump` / `applyMovement`. The baseline rules are exactly the current
constants, so a classic round is byte-for-byte the same behavior. A unit test
asserts `CLASSIC_RULES` reproduces the current jump apex, run speed, and
stopping distance.

**Decision:** M4-D23. Additive rules, baseline preserved.

### ❓ Q24 — How is the twist tested?

The highest seam remains the real `Match`. Pure rules tests are necessary but
do not prove the Course still has eight finishers or the casual pilot still
qualifies.

**➡️ Recommended (selected):**
- Pure: selection determinism, balance, labels, `CLASSIC_RULES` equals the
  current constants, each twist's rules are applied for Course/Hexapop and
  classic for Crown.
- Physics/controller: gravity, jump apex, stopping distance, air drag.
- Levels: Course time limit, hazard speed multiplier, start sign; Hexapop
  Sugar Rush at 38 s and the 3.3 s warning; the tile-under-a-living-Tumbler
  rule.
- Real Match: 12 seeds × idle + casual, all M2 bands, twist coverage, applied
  probe.
- Playwright: intro/HUD/results/Daily card, the three start signs, the
  `FINAL · CLASSIC` card, mobile 390×844, no console errors.
- Negative control: a run recorded with `applied: false` must fail the gate.

**Decision:** M4-D24. Same measurement seam, new rules.

### ❓ Q25 — What is the twist gate, exactly?

**➡️ Recommended (selected):** `npm run verify:twists` runs the same 12 seeds as
M3, idle and scripted casual (24 shows), through the real `Match`. It emits
JSON plus a table and fails when:
- any seed's twist is missing or the plan disagrees with the applied debug
  probe (gravity, friction, or Sugar Rush clock);
- fewer than 3 seeds use any twist;
- any M2 band is missed;
- idle qualifies, casual is below 8/12, or the living crown winner is below
  23/24;
- the negative control is accepted.

The gate is a CI job and part of `gate:release`. `verify:variety` remains the
M3 historical gate; because it runs the same seeds, it also runs the twists and
must stay green.

**Decision:** M4-D25. A measured 12-seed twist gate is the release gate.

### ❓ Q26 — What about performance and assets?

The twist is numbers and text. The start sign uses the existing `makeSign`
texture path. There are no new models, textures, atlases, audio samples, or
network calls.

**➡️ Recommended (selected):** Keep the 320 draw-call / 200k triangle budget at
1440×810 high. Sample the Course and Hexapop start on all three twists. The
twist sign is one merged static mesh per level. Hardware FPS remains a manual
protocol because this host is SwiftShader-only.

**Decision:** M4-D26. No new assets; same budgets.

### ❓ Q27 — What about saved profiles and old seeds?

The twist is part of the show plan, not the profile. Existing cosmetics,
crowns, kudos, and daily bests are valid. A saved profile needs no migration.
A replay of an M3 seed now gets the M4 twist, by design.

**➡️ Recommended (selected):** No profile migration. Keep profile version 1.
Document that M4 is a new season and seed layouts include the twist from this
build.

**Decision:** M4-D27. No migration; seeds are a new season.

### ❓ Q28 — What is the definition of done?

**➡️ Recommended (selected):**
- `planShow(seed)` returns a deterministic twist; all three appear ≥3/12.
- Course and Hexapop use the twist; the Crown is classic on every Show.
- `npm run verify:twists` passes all M2 bands and the applied probe; the
  negative control is rejected; `verify:variety` stays green.
- `npm run check`, `gate:release`, the Pages build, and CI are green.
- Evidence: three twist intro cards, three HUD chips, three start signs, the
  `FINAL · CLASSIC` card, a mobile card, and render samples.
- README, GLOSSARY, METRICS, ADR 0007, implementation notes, and AGENTS updated.
- Independent review with a verdict; blockers fixed or accepted.
- PR merged, Pages deployed, live URL verified, README hero refreshed, release
  audit clean, no open issues/PRs/branches.

**Decision:** M4-D28. Definition of done locked.

---

## Shared-understanding checkpoint

The design tree is exhausted. The objective is **Twist Season**: every Show
gets one deterministic qualifier-rule twist from MOON GRAVITY, SLIPPERY, or
RUSH HOUR; the Crown Climb stays the classic championship; the Show Card, HUD,
start sign, results, and Daily chip name the twist; and a 12-seed twist gate
proves the M2 bands still hold. Implementation proceeds against
[`docs/m4/SPEC.md`](./SPEC.md) and [`docs/m4/TICKETS.md`](./TICKETS.md).
