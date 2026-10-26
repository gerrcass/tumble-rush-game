# Tumble Rush M3 — Remix Season

**Version:** 1.0 (locked)
**Source decisions:** [`docs/m3/GRILL.md`](./GRILL.md)
**Baseline:** [`docs/METRICS.md`](../METRICS.md) — M2 Phase B: 206.96 s median show, 73.22 s Course, 47.72 s Hexapop, 54.77 s Crown, 20/20 living crown winners
**Status:** Ready for implementation

---

## Problem Statement

M2 made the show last. It did not make the show different. Every Show still
uses the same five Course sections in the same order, twice, and the same
three-tier Hexapop arena. The seed changes lane widths, hazard phases, colors,
and props, but the route a player learns on their first Show is the route they
get on their tenth. The Daily Show changes the seed, not the shape of the day.

That is the remaining replayability gap. Adding a second full Course would
multiply the content but leave the underlying problem: one authored sequence per
show. The show needs a **route grammar** that composes relocatable sections, a
small set of **arena plans** that change the survival floor, and a **Show Card**
that tells the player what kind of show they got. It also needs a gate that
proves variety did not break the pacing and fairness M2 just established.

## Solution

Make every seed a different, still-fair Show:

1. **Two new Course sections.** Add **Tumbler Tangle** and **Bounce Bazaar**,
   built from the existing hazard vocabulary (sweepers, pendulums, pushers,
   conveyors, bounce pads, moving platforms). The Course becomes a route of
   **A + three of five middle sections + E** per lap. Lap 1 and lap 2 use
   different routes and share at most two middle sections. A route has a
   difficulty total of 6–8 and never repeats a section.
2. **Relocatable Course modules.** Each section owns its geometry, colliders,
   checkpoint, waypoint chain, sign, and difficulty weight. A route planner owns
   the cursor, gaps, lap offsets, finish position, checkpoints, and waypoints.
   Modules are height-neutral at their boundaries, so any legal order is
   playable by the same bots and the same player controller.
3. **Three Hexapop arena plans.** RINGS (the current full honeycomb), SPIRAL
   (one sector removed per ring, offset ring by ring), and GEARWORKS
   (alternating notches on the outer rings). All three are connected from the
   centre, keep the centre perch, and use the same 3.3 s warning, 45 s Sugar
   Rush, 4-survivor end, and 49.9 s cap.
4. **A Show Card.** The Round intro and results name the two Course routes and
   the Hexapop arena. The Daily Show chip names today's card. No new screen.
5. **A 12-seed variety gate.** `npm run verify:variety` runs idle and scripted
   casual shows through the real `Match`, asserts at least 8 distinct Course
   signatures and all 3 arena plans, and re-checks every M2 pacing and fairness
   band per run.

The Crown Climb final stays fixed. It is the championship: a known test makes
the crown mean something, and the variety is in who survives to reach it.

## User Stories

1. As a player, I want each Show to have a different Course route, so that the
   second Show is not a memory test of the first.
2. As a player, I want to see the route and arena before the countdown, so that
   I know what kind of show I am about to play.
3. As a player, I want the route names to be readable and short, so that the
   Show Card does not become a manual.
4. As a player, I want both laps of the Course to be different, so that the
   second lap is not a repeat of the first.
5. As a player, I want every route to include a clear start and a single Finish
   Gate, so that the objective never changes.
6. As a player, I want the new Tumbler Tangle section to teach a distinct
   timing-and-panic lesson, so that it feels authored rather than random.
7. As a player, I want the new Bounce Bazaar section to reward commitment and
   bounce pads, so that it adds a different movement beat.
8. As a player, I want every section to have a sign and a checkpoint, so that
   I always know where I am.
9. As a player, I want the route difficulty to stay within a fair band, so that
   one seed does not produce three brutal sections in a row.
10. As a player, I want the qualification rule to stay "first 8 finishers", so
    that a remixed route never changes what qualifying means.
11. As a player, I want the bots to follow the same route and physics, so that a
    win on a new route feels legitimate.
12. As a player, I want the bots to make the same kind of mistakes on the new
    sections, so that the pack still looks like contestants.
13. As a casual player, I want a real qualification window on every route, so
    that a new layout is not a hidden difficulty spike.
14. As an idle player, I want to be eliminated on every route, so that
    qualification stays meaningful.
15. As a player, I want the Course clock to stay 45–90 seconds, so that a remix
    does not turn the show into a marathon.
16. As a player, I want Hexapop to sometimes use a spiral or gear-shaped floor,
    so that the survival round feels different by seed.
17. As a player, I want every Hexapop layout to be connected, so that I am never
    stranded on an island with no route.
18. As a player, I want the centre perch to remain the safe start on every
    layout, so that the first three seconds are readable.
19. As a player, I want the Sugar Rush to still eat the arena from the outside
    in, so that the ending is familiar even when the floor shape is not.
20. As a player, I want a stationary centre player to be eliminated on every
    layout, so that standing still is never a winning strategy.
21. As a player, I want Hexapop to last 30–50 seconds on every layout, so that
    the Sugar Rush still matters.
22. As a player, I want the Crown Climb to stay the same tower, so that the
    final feels like a championship and not another random layout.
23. As a player, I want the Crown winner to be a living Tumbler physically
    touching the crown, so that the hero moment is real.
24. As a Daily Show player, I want today's route and arena named on the menu, so
    that the daily seed has a visible identity.
25. As a Daily Show player, I want the one-result-per-day rule to stay, so that
    the daily card does not change the competition.
26. As a Practice player, I want to practise the same route my Show will use, so
    that the safety net is useful.
27. As a player, I want the route and arena labels to be available to a screen
    reader, so that the Show Card is not visual-only.
28. As a mobile player, I want the Show Card to fit the phone layout, so that it
    does not cover the countdown or the play area.
29. As a player, I want no new controls, so that a remix does not require
    relearning the game.
30. As a player, I want no new physics rules, so that the new sections are
    surprising arrangements of things I already understand.
31. As a player, I want the show to stay 3–5 minutes, so that I can replay it.
32. As a player, I want a route signature I can compare with a friend, so that
    "I got B-D-G / Spiral" is a thing we can say.
33. As a player, I want the results card to repeat the route and arena, so that I
    can remember what I just played.
34. As a maintainer, I want one pure show-plan function, so that the Course, the
    arena, the Show Card, and the gate cannot disagree.
35. As a maintainer, I want section modules with a single contract, so that a
    future section can be added without editing every route.
36. As a maintainer, I want route plans to be deterministic, so that a seed
    always reproduces the same show.
37. As a maintainer, I want the exact 174/358 constants replaced by route
    invariants, so that tests describe the grammar rather than one old layout.
38. As a maintainer, I want a 12-seed variety gate, so that "different every
    time" is a number, not a claim.
39. As a maintainer, I want every run in the gate to check the M2 bands, so that
    variety cannot silently cost pacing or fairness.
40. As a maintainer, I want the variety gate in CI and in `gate:release`, so
    that a new section cannot merge with an unmeasured regression.
41. As a maintainer, I want the new sections and arenas in the screenshot set,
    so that the PR evidence shows the actual variety.
42. As a maintainer, I want draw calls and triangles sampled across route
    signatures, so that the remix does not break the render budget.
43. As a maintainer, I want the same physics and fixed step, so that M3 does not
    reopen the determinism work.
44. As a maintainer, I want no profile migration, so that existing players keep
    their cosmetics and results.
45. As a maintainer, I want no new runtime assets or network calls, so that the
    static-host guarantee stays true.
46. As a maintainer, I want the new sections to reuse the merge/instancing path,
    so that the increase in geometry does not become draw-call debt.
47. As a maintainer, I want a written review with a verdict, so that the route
    refactor gets an independent check.
48. As a maintainer, I want METRICS to record the exact 12-seed sweep, so that
    the next milestone has a baseline.
49. As a maintainer, I want the README to describe the remix and Show Card, so
    that the public claim matches the build.
50. As a maintainer, I want the Pages deployment verified after merge, so that
    the live game is the one with the remix.
51. As a maintainer, I want no open issues or branches after release, so that
    the next run starts from a clean main.
52. As a reviewer, I want the route planner's invariants and the real-Match
    variety gate in the test suite, so that I can trust the shape without
    replaying 12 shows by hand.

## Implementation Decisions

### Show plan

A single pure `planShow(seed)` is the source of truth for:

- the two Course route sequences (lap 1 and lap 2), each A + three middles + E;
- the module lengths, lap offsets, finish position, and total Course length;
- the Hexapop arena layout id;
- display labels (`routeLabel`, `arenaLabel`, `signature`);
- the random parameters the existing Course and arena already use (hazard
  phases, lane scales, colors, props).

It has no Three.js, DOM, or match dependency. The Course level, Hexapop level,
Show Card UI, and variety gate all consume it. The same seed always produces the
same plan. A route signature is stable and human-readable, for example
`B-D-G/C-F-G` plus `SPIRAL`.

### Course module contract

Each middle section is a relocatable module with:

- an id, name, and difficulty weight;
- an authored length of 36–40 world units;
- a build operation that places its geometry and colliders at a given z cursor
  and lap height;
- a checkpoint near its exit;
- a waypoint chain in its local coordinates;
- a sign and a distinct visual beat;
- height-neutral entry and exit boundaries (the same y at both ends), so any
  legal order is playable.

The route planner owns the sequence, z cursor, 1.5–2.5 u inter-module gaps, the
lap connector, the finish gate, the final checkpoint, and the waypoint offsets.
A and E are bookends, not middle modules.

The existing B, C, and D sections become modules. Their geometry is preserved
where possible, but their absolute z coordinates become module-local. The two
new sections, F (Tumbler Tangle) and G (Bounce Bazaar), use the existing hazard
families. No new collider kind or physics behavior.

### Route rules

- A lap is A + three of B/C/D/F/G + E.
- No middle module repeats within a lap.
- Difficulty weights: B 2, C 2, D 3, F 3, G 2. A route's middle total is 6–8.
- Lap 1 and lap 2 are different routes and share at most two middle modules.
- A lap is 165–185 units; a two-lap Course is 330–370 units.
- The lap gate is at the end of lap 1; the finish gate is at the end of lap 2.
- Qualification is first 8 finishers, unchanged.
- The human-pace anchor remains bounded to 10% and applies only to the Course.

### Hexapop plans

Three arena plans are generated from the existing hex grid:

- **RINGS** — the full honeycomb used by M2.
- **SPIRAL** — one 60-degree sector removed from each ring, with the removed
  sector rotating by ring so the remaining cells form a coiled route.
- **GEARWORKS** — alternating notches on the outer rings, leaving a connected
  gear-shaped floor.

Every plan:

- keeps the centre tile and the safe start perch;
- is connected from the centre to every remaining tile;
- keeps the tile count in 180–230;
- seats the full 8-Tumbler field;
- uses the same 3.3 s warning, 45 s Sugar Rush, 4-survivor end, and 49.9 s cap;
- never warns the tile under a living Tumbler during the Sugar Rush.

The bots keep their existing tile query and neighbour scoring. No bot-only
bridge, jump, or safe tile.

### Course and arena integration

The Course level derives its route from the show plan instead of fixed section
calls. The Hexapop level derives its floor from the show plan instead of the
full disc. The Crown Climb level is untouched.

The show plan is computed from the show seed for a Quick Show, a Daily Show,
`?seed=`, and Practice. The same plan is used for the level and the Show Card.

### Show Card

The Show Card is a small text block, not a new screen:

- Round intro: one line with `COURSE <lap 1> / <lap 2>` and `ARENA <name>`.
- Results: the same line in the footer or round summary.
- Menu Daily chip: `TODAY · <route> · <arena>`.
- ARIA label includes the route and arena names.
- The card uses the existing chip/card typography and fits 390×844.

### Variety gate

`npm run verify:variety` runs 12 seeds × (idle + scripted casual) through the
real `Match`, using the M2 observation hooks. It writes JSON and a table and
fails when any of these is false:

- at least 8 distinct Course signatures across 12 seeds;
- all 3 Hexapop arena plans represented;
- each new section (F and G) appears in at least 4 of 12 shows;
- every run meets the M2 bands: Course 45–90 s and 8+ finishers, Hexapop 30–50 s
  with Sugar Rush reached, Crown 45–80 s and a living, physically-touching
  winner, total 3–5 min;
- idle human qualified 0/12;
- casual human qualified ≥8/12;
- living crown winner ≥23/24 runs;
- no show below 150 s or above 360 s.

The gate is a CI job and part of `gate:release`. `verify:pacing` remains the
historical 10-seed M2 gate.

### Performance

- Keep the 320 draw-call / 200k triangle budget at 1440×810 high.
- Sample at least three route signatures and all three arena plans.
- New static geometry goes through the existing per-level material cache and
  merge path; no new textures or external assets.
- Low quality keeps the same visual grammar and remains playable.
- Hardware FPS remains a manual protocol; this host is SwiftShader-only.

### Compatibility

The profile schema does not change. Existing cosmetics, crowns, kudos, and
daily bests remain valid. Course layouts for a given seed change by design;
there is no attempt to reproduce M2 routes. The README and METRICS state that
route repeatability starts with M3.

## Testing Decisions

A good test checks an externally visible behavior or a pure contract, not a
private implementation detail. The new seam is the **show plan**; the highest
seam remains the **real `Match`**.

### Pure plan tests

- `planShow(seed)` is deterministic and stable for the same seed.
- Different seeds produce different signatures (at least 8/12 in the gate).
- Every lap is A + three distinct middles + E.
- Difficulty totals are 6–8.
- Lap lengths are 165–185; Course lengths are 330–370.
- Lap 1 and lap 2 differ and share at most two middles.
- Both F and G can appear; each new section is covered across the sweep.
- Hexapop plans are one of the three valid layouts, deterministic, connected,
  centre-safe, and within the tile-count bounds.
- Labels are non-empty and stable.

### Module and level tests

- Each module builds colliders and a checkpoint at its planned position.
- Waypoints are monotonic along the route and cover every module.
- The finish position matches the planned end of lap 2.
- The Course can be built for every legal route without overlapping the start
  and finish bookends.
- Hexapop spawns 8 entrants on every plan and exposes a connected tile set.
- The existing M2 tests for Crown, Director, and physics remain green.

### Real-Match tests

- A 12-seed observed show sweep re-checks the M2 bands and the variety targets.
- The idle human never qualifies.
- The scripted casual pilot qualifies at least 8/12.
- Crown winners are living and physically touch the crown.
- Spectate still resolves when no leader is alive.
- No wall-clock sleeps decide a pacing number; use `simulate`/fixed steps.

### Playwright

- The Show Card is visible in the intro, names the route and arena, and fits
  desktop and 390×844.
- The results card repeats the card.
- A real show reaches gameplay on at least two different route signatures.
- Both new sections and all three arena plans are reachable through the debug
  hooks and produce no console errors.
- The canonical evidence set includes the two new sections and three arenas.
- The Course start stays inside the draw-call and triangle budget on sampled
  routes.

## Out of Scope

- New modes, round types, or a second full show.
- New biomes or art direction; the Sunrise Carnival palette and props stay.
- Crown Climb layout or rules variants.
- New hazard physics, a new movement verb, or a physics rewrite.
- Multiplayer, backend, accounts, cloud saves, or leaderboards.
- Level editor or user-generated content.
- New cosmetics, economy, battle pass, audio rework, or localization.
- Replay export or cinematic camera.
- Mobile-native app or console support.
- Reworking the M2 pacing bands or the difficulty presets.

## Further Notes

- The exact M2 Course length (174 per lap, 358 total) was a pacing tool, not a
  product promise. M3 replaces it with a range and a measured route plan.
- The fixed Crown is deliberate: variety in the qualifiers, certainty in the
  championship. If a future milestone wants a variant final, it should be a
  separate, measured feature.
- A route signature is part of the Show's identity; it should be printed in the
  results so players can compare shows.
- The variety gate is the tiebreaker. A route that looks good in a screenshot
  but misses the clock or the casual win rate is not shipped.
- The two new sections reuse existing hazard vocabulary on purpose. The
  challenge is composition and fairness, not a new physics feature.
