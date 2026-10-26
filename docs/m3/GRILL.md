# Grill-with-docs — M3: Remix Season

> Session owner: implementation agent. The human asked for a **very challenging
> objective**, delegated every decision, and asked for forward progress rather
> than a question queue. Each question is answered with the recommended option;
> the answer is recorded as a decision. Facts were measured or read from the
> code, never asked of the human.

## Context

M2 fixed the show's length and fairness. The measured show is now **206.96 s
median** over 20 runs: Course **73.22 s** with **8–9 finishers**, Hexapop
**47.72 s** with the Sugar Rush reached **20/20**, Crown **54.77 s** with a
living, physically-touching winner **20/20**. A casual scripted pilot qualifies
**7/10**; an idle human qualifies **0/10**. The show is finally a show.

The next gap is **variety**. Every Show uses the same Course grammar: section
A → B → C → D → E, twice. The seed changes lane widths, hazard phases, colors,
and props, but a player who has seen one Course has seen the route. Hexapop is
always the same three-tier honeycomb. The Daily Show changes the seed, not the
shape of the day.

This milestone makes the seeded promise real without doubling the content or
breaking the M2 fairness result. The objective is **M3 — Remix Season**.

## Method

Three rounds: product frame, game design, engineering/quality. Each question
has a recommended answer; the human delegated the choice. The design tree is
worked in dependency order, so no question guesses at an unsettled answer.

---

## Round 1 — Product frame

### ❓ Q1 — What is M3, exactly?

A second full show would double the content and split the tuning surface. A new
biome would be a large art-direction project. The cheaper, higher-leverage move
is to make the **existing** three-Round show structurally different by seed:
different Course routes, different Hexapop arenas, and a visible Show Card that
tells the player what kind of show they got.

**➡️ Recommended (selected):** M3 is **Remix Season**: a seeded Course route
system, two new Course sections, three Hexapop arena plans, and a Show Card.
The three-Round show, the Crown Climb finale, the controls, physics, and
difficulty presets stay the same.

**Decision:** M3-D1. Remix the existing show; do not add a mode, biome, or
second show.

### ❓ Q2 — Why not add a second Course or a second full show?

A second Course would be more content, but it would inherit the same authored
sequence problem: one fixed route per show. The variety ceiling would still be
"two routes, repeated." A modular route system makes **every** seed a new
combination and gives future content a place to plug in. It is also the harder
engineering problem, which is the point of the milestone.

**➡️ Recommended (selected):** Build the **route system** first. Two new
sections prove it can carry new content; a second full show is post-M3.

**Decision:** M3-D2. Route system before more Courses.

### ❓ Q3 — What varies and what stays fixed?

Variety is only worth it if the show remains legible and fair. The Course and
the survival arena can vary; the final is the championship and should be a
known test.

**➡️ Recommended (selected):**
- **Course:** two laps, each a seeded route of A + three of five middle
  sections + E. Lap 1 and lap 2 are not the same route.
- **Hexapop:** one of three seeded arena plans, all using the same tile,
  warning, Sugar Rush, and 4-survivor rules.
- **Crown Climb:** fixed tower and fixed rules. The variety is who reaches it.
- **Show Card:** names the route and arena in the intro and results.

**Decision:** M3-D3. Course and Hexapop vary; the Crown finale is fixed.

### ❓ Q4 — What is the variety target?

"Different every time" needs a number. Across a 12-seed gate, the route system
must produce at least 8 distinct Course signatures, all three Hexapop layouts
must appear, and each new section must appear in at least 4 shows.

**➡️ Recommended (selected):** **12-seed variety gate**: ≥8 distinct Course
signatures, 3/3 Hexapop layouts, and each of the two new sections visible in
≥4/12 shows. A seed with the same full deck as an earlier seed is a failure.

**Decision:** M3-D4. Variety is measured across 12 seeds, not asserted.

### ❓ Q5 — What is the fairness bar across variants?

A new route is not allowed to collapse the pacing or make the human's
qualification window worse. The M2 bands are the contract; the variety gate
must re-check them per run.

**➡️ Recommended (selected):** Every run in the 12-seed sweep must meet the M2
bands: Course **45–90 s** and **8+ finishers**; Hexapop **30–50 s** with Sugar
Rush reached; Crown **45–80 s** and a living, physically-touching winner; total
show **3–5 min**; idle human **0/12** qualified; casual human **≥8/12**;
living winner **≥23/24** runs. No new bot speed, teleport, or free jump.

**Decision:** M3-D5. Every variant is measured against the M2 bands.

### ❓ Q6 — What does the player actually see?

The show should tell the player it is a remix without adding a new screen. The
Round intro card already has a seed chip and facts; it can carry one extra
line. The results footer can repeat it.

**➡️ Recommended (selected):** A **Show Card** line in the Round intro and
results: `COURSE B · D · G / C · F · G` and `ARENA SPIRAL`. The Daily Show
shows today's card on the menu chip. No new tab, no new overlay, no new HUD
element during play.

**Decision:** M3-D6. Show Card in intro/results and the Daily chip only.

### ❓ Q7 — How much new content is allowed?

Two new Course sections and three arena shapes are enough to prove the system,
and they reuse the existing candy-carnival art and hazard vocabulary. No new
biome, no new round type, no new physics verb.

**➡️ Recommended (selected):** Two new Course sections, **Tumbler Tangle** and
**Bounce Bazaar**, built from existing sweepers, pendulums, pushers, conveyors,
bounce pads, and moving platforms. No new hazard physics. Three Hexapop arena
plans built from the existing hex grid. No new art direction, music, or
cosmetics.

**Decision:** M3-D7. Two sections, three arena plans, zero new physics.

### ❓ Q8 — What is explicitly out of scope?

**➡️ Recommended (selected):** New modes, biomes, or round types; a second
full show; Crown Climb layout variants; new hazard physics; multiplayer,
backend, accounts, or leaderboards; a level editor; new cosmetics, economy,
audio, or localization; mobile-native work; a replay system.

**Decision:** M3-D8. Scope frozen.

---

## Round 2 — Game design

### ❓ Q9 — How is a Course lap composed?

The current Course is one authored 174 u lap with five absolute sections,
translated by 184 u for lap 2. The new grammar needs relocatable pieces.

**➡️ Recommended (selected):** A lap is **A (start) + three of B/C/D/F/G
(middle) + E (finish)**. A and E are fixed bookends; the middle modules are
relocatable and height-neutral at their boundaries. Every module starts with a
**1.5–2.5 u gap** and ends at the same height it began. The route planner owns
the cursor, the gaps, the finish position, the checkpoints, and the waypoint
offsets. Lap 1 and lap 2 choose different sets; both laps share at most two
middle modules.

**Decision:** M3-D9. A + 3-of-5 middles + E; relocatable modules; different
routes per lap.

### ❓ Q10 — What makes the two new sections different?

They must feel like a new teaching idea, not a reskin of B/C/D.

**➡️ Recommended (selected):**
- **F — Tumbler Tangle:** a narrow lane with two counter-rotating sweepers and
  a pusher wall. The lesson is "thread the needle, do not panic-dive."
- **G — Bounce Bazaar:** a chain of bounce pads and moving platforms with one
  committed gap. The lesson is "use the pad, trust the landing."

Both reuse existing collider kinds and hazard builders. Signage and a unique
checkpoint make them readable.

**Decision:** M3-D10. F and G are new arrangements of existing hazards.

### ❓ Q11 — How do routes stay readable instead of random?

A route made of three hard modules in a row is unfair. The modules have
authored difficulty weights: B 2, C 2, D 3, F 3, G 2. The planner accepts a
route only when its three-middle total is 6–8 and the two laps share at most
two modules. A route never repeats a module within a lap.

**➡️ Recommended (selected):** Weighted routes in the **6–8** band, no repeats,
at most 2 shared modules across laps. Every module keeps a sign and a
checkpoint; the route planner adds a **LAP 2** connector that names the next
route.

**Decision:** M3-D11. Weighted 6–8 routes, no repeat, at most 2 shared.

### ❓ Q12 — How long is a lap, and why does that matter?

The current lap is 174 u and the two-lap Course is 358 u; that produces the M2
73 s median. Module lengths must stay in the same envelope so the Course clock
does not become a lottery.

**➡️ Recommended (selected):** Each middle module is **36–40 u** of authored
route, so a lap is **165–185 u** and a two-lap Course is **330–370 u**. The
variety gate asserts Course 45–90 s per seed; the route plan reports its
length. A route outside the envelope is rejected by the plan tests.

**Decision:** M3-D12. Modules 36–40 u; laps 165–185 u; Course 330–370 u.

### ❓ Q13 — How does qualification work on a remixed Course?

The rule is a core readability promise; variety must not complicate it.

**➡️ Recommended (selected):** Unchanged: **first 8 finishers** qualify. The
lap gate is at the end of lap 1; the finish gate is at the end of lap 2. A
timeout qualifies only finishers; a living 0% runner never takes a slot. The
finishers count and the `QUALIFIED` stamp are identical on every route.

**Decision:** M3-D13. Qualification rules unchanged.

### ❓ Q14 — How do bots navigate the new routes?

The bots use authored waypoints and the same physics. New modules must supply
waypoints, not a hidden speed or teleport. The human-pace anchor stays bounded
at 10% and only applies to the Course when the human is >25% behind.

**➡️ Recommended (selected):** Every module returns its own waypoint chain and
checkpoint; the planner concatenates them with the module offset. Bots still
read hazards through the existing brain, use the same controller, and never
receive a speed above the player's cap. The anchor is unchanged.

**Decision:** M3-D14. Per-module waypoints; same physics; anchor unchanged.

### ❓ Q15 — How does Hexapop vary?

The survival round's rules are its identity; the floor shape is the variable.
Three plans use the same hex grid and the same warning/collapse rules.

**➡️ Recommended (selected):**
- **RINGS** — the current full honeycomb.
- **SPIRAL** — one 60° sector removed from each ring, offset ring by ring, so
  the safe route coils inward.
- **GEARWORKS** — alternating notches on the outer rings, leaving a connected
  gear-like floor.

All plans keep the centre perch tile, the 3.3 s warning, the 45 s Sugar Rush,
the 4-survivor end, and the 49.9 s cap. Every plan must be connected from the
centre; the tile count stays in **180–230**.

**Decision:** M3-D15. Three connected arena plans; same survival rules.

### ❓ Q16 — How do bots handle the arena plans?

Bots already query tiles and choose safe neighbours. A plan with a hole must
not strand them on an island.

**➡️ Recommended (selected):** Keep the bot tile query; add a plan-level
connectivity test (breadth-first from the centre) and a spawn test for 8
entrants. If a plan cannot seat the field or connect the centre to the outer
rings, it is invalid. No bot-only jump or bridge.

**Decision:** M3-D16. Connected plans, 8 seats, no bot-only movement.

### ❓ Q17 — Why is Crown Climb fixed?

A remixed final would make the crown gate, bot navigation, and the 20/20 living
winner result a fresh tuning problem, and it would weaken the championship as a
known test. The qualifiers' route to the final is the varied part.

**➡️ Recommended (selected):** Crown Climb keeps its layout, slime speed, and
rules. The only variation is the field that reaches it. If M3 has budget left,
the final may get cosmetic seed variation, not a new route.

**Decision:** M3-D17. Fixed final.

### ❓ Q18 — How does the Daily Show use the card?

The Daily Show is already seeded by the calendar date. The card should make
that seed legible.

**➡️ Recommended (selected):** The Daily chip on the menu shows today's route
and arena names; the intro and results show the same card. The one-result-per-
day rule is unchanged. Quick Show and `?seed=` use the same planner.

**Decision:** M3-D18. Daily Show card, same rules.

### ❓ Q19 — How does Practice use the routes?

Practice is the safety net for learning the Course. It must not send the player
to a route the show will never use.

**➡️ Recommended (selected):** Practice uses the Course route from the current
seed, with the same module checkpoints and respawns. A "new route" button is
not needed; the menu seed already chooses a route. No elimination.

**Decision:** M3-D19. Practice uses the seeded route, no new controls.

### ❓ Q20 — What is the show-length target after the remix?

The M2 result is the baseline; M3 must not drift the show longer than a coffee
break.

**➡️ Recommended (selected):** Keep the M2 bands: Course **45–90 s**, Hexapop
**30–50 s**, Crown **45–80 s**, total **3–5 min** (no show <2.5 or >6). The
variety gate reports the median and every seed; the 12-seed median must stay
inside the same bands.

**Decision:** M3-D20. M2 pacing bands are the M3 contract.

---

## Round 3 — Engineering and quality

### ❓ Q21 — What is the module contract?

The module is the unit that makes routes composable. It must own its geometry,
colliders, checkpoint, waypoint chain, sign, and difficulty weight, but not the
lap or the show.

**➡️ Recommended (selected):** A Course section module exposes: id, name,
difficulty weight, authored length, a build operation that places it at a
cursor and lap offset, a checkpoint near its exit, and a waypoint chain in
local coordinates. Start and finish are bookends, not middle modules. The route
planner is the only owner of the sequence, z cursor, gaps, and finish position.

**Decision:** M3-D21. One module contract; routes own composition.

### ❓ Q22 — What is the show-plan contract?

The Course, Hexapop, UI, and gate all need the same seed interpretation. Two
implementations would drift.

**➡️ Recommended (selected):** A pure **show plan** function takes a seed and
returns the two Course routes, the Hexapop layout, display labels, and a stable
signature. The Course and Hexapop levels derive their layout from it; the UI
reads it for the Show Card; the variety gate records it. It is deterministic
and has no Three.js or DOM dependency.

**Decision:** M3-D22. One pure show plan is the source of truth.

### ❓ Q23 — How is the route plan tested? The current plan tests hard-code 174/358.

The existing tests assert the exact M2 constants. M3 intentionally makes them
seed-dependent. The tests must move from exact values to **invariants**.

**➡️ Recommended (selected):** Plan tests assert determinism, legal sections,
no repeats, 6–8 difficulty, 165–185 per lap, 330–370 total, different laps,
section coverage across seeds, and stable labels. Level tests assert waypoints
and checkpoints are monotonic and the finish gate is at the planned position.
The exact 174/358 constants are removed from tests and docs.

**Decision:** M3-D23. Invariants replace exact M2 lengths.

### ❓ Q24 — What is the highest test seam?

Pacing and fairness are system properties. Pure plans cannot prove that a bot
can finish a new section.

**➡️ Recommended (selected):** The highest seam remains the **real Match**
driven through the existing observation hooks: start an observed show, run the
fixed step, and read per-Round clocks, finishers, qualifiers, winner height and
crown distance. Pure plan tests below it; Playwright above it for the visible
card and screenshots. No new test seam if the existing harness can carry the
variety gate.

**Decision:** M3-D24. Real-Match variety gate; pure plan tests; Playwright for
the card.

### ❓ Q25 — What is the variety gate, exactly?

**➡️ Recommended (selected):** `npm run verify:variety` runs **12 seeds**, idle
and scripted casual (24 shows), using the same harness as `verify:pacing`. It
emits JSON plus a table and fails when:
- fewer than 8 distinct Course signatures across 12 seeds;
- fewer than 3 distinct Hexapop layouts;
- either new section appears in fewer than 4 shows;
- any run misses an M2 band, the idle human qualifies, the casual rate is below
  8/12, or a living winner is missing/not physically touching the crown.

It becomes a CI job and part of `gate:release`. `verify:pacing` stays as the
historical 10-seed gate.

**Decision:** M3-D25. A measured 12-seed variety gate is the release gate.

### ❓ Q26 — What about performance and visual budgets?

More sections and alternate floors increase geometry. The existing budget is
305 draw calls / 186,560 triangles at the Course start, inside the 320/200k M2
budget.

**➡️ Recommended (selected):** Keep the 320 draw-call / 200k triangle budget
at 1440×810 high. Sample at least three route signatures and all three arena
plans. New static geometry must use the existing merge/instancing path; no new
texture atlases. Low quality must stay playable; hardware FPS remains a manual
protocol because this host is SwiftShader-only.

**Decision:** M3-D26. Same budgets, sampled across variants.

### ❓ Q27 — What happens to saved profiles and old seeds?

The show plan changes layouts for every seed. A saved profile has no route
data, only results and cosmetics, so it is compatible. A player replaying an
old seed gets a new route.

**➡️ Recommended (selected):** No profile migration. Keep the profile version.
Document that M3 seeds are a new season and that route repeatability begins
with this build. Daily bests remain per date.

**Decision:** M3-D27. No migration; seed layouts change by design.

### ❓ Q28 — What is the definition of done?

**➡️ Recommended (selected):**
- 12-seed variety gate passes with ≥8 route signatures and 3/3 arenas.
- Every run meets the M2 pacing/fairness bands; idle 0/12; casual ≥8/12.
- `npm run check`, `verify:show`, `verify:variety`, full Playwright and the
  Pages build are green; CI is green.
- Screenshots: Show Card, both new sections, all three arenas, a remixed
  results card.
- README/METRICS/GLOSSARY updated; review verdict ready; PR merged; Pages
  deployment verified; no open issues/PRs/branches.
- Independent review with a written verdict and all blockers fixed or accepted.

**Decision:** M3-D28. Definition of done locked.

---

## Shared-understanding checkpoint

The design tree is exhausted. The objective is **Remix Season**: the existing
three-Round show now varies its Course route and Hexapop arena by seed, shows
the player a Show Card, and proves with a 12-seed gate that variety did not
cost pacing, fairness, or readability. Implementation proceeds against
[`docs/m3/SPEC.md`](./SPEC.md) and [`docs/m3/TICKETS.md`](./TICKETS.md).
