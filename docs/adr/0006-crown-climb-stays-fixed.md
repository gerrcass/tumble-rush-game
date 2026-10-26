# The Crown Climb final stays fixed across seeds

M3 varies the Course route and the Hexapop arena, but deliberately leaves Crown
Climb's tower, slime speed, and rules unchanged. The final is the championship:
a known test makes the crown comparable, keeps the bot navigation and the
20/20 living-winner result honest, and gives the qualifiers a shared summit.
The variety is in who survives the two qualifiers and from which route, not in
the shape of the last climb.

**Consequences:** a future variant final needs its own pacing and fairness gate;
it cannot inherit the M2 Crown result. Crown cosmetics or crowd variation may
change, but the route and win condition are a fixed contract.

## M3 clarification (2026-10-26)

The M3 implementation does not change the tower, slime speed, win condition,
or Crown contact. Two implementation fixes are explicitly in scope and do not
create a variant:

- the slime loop now tests every finalist body, not only the first body in the
  world list; the old code could leave a fallen bot wedged inside the start-deck
  side while the slime rose past it;
- the bot brain uses a short start stagger and normal steering over the fixed
  waypoints. The player's controller, physics, and the level geometry are
  unchanged.

The recorded 12-seed sweep still measures the Crown as a living, physically
touching winner on 23/24 runs; the one no-winner is reported in `METRICS.md`.
