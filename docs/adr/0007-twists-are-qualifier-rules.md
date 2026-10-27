# ADR 0007 — Twists are qualifier rules; the Crown stays classic

**Status:** Accepted · **Date:** 2026-10-27

## Context

M3 made the Course routes and Hexapop arenas seeded and measurable. M4 adds a
seeded rule twist: MOON GRAVITY, SLIPPERY, or RUSH HOUR. A twist could apply to
the whole Show, including the Crown Climb, or only to the qualifier rounds.

The Crown Climb is the championship: a fixed tower, a fixed slime speed, and a
physical crown contact. M3's ADR 0006 records that decision. The living,
physically-touching winner is measured on every seed; M3's 24/24 result is a
product promise, not an accident.

## Decision

A twist is a **qualifier rule**. It applies to the Course and Hexapop only.
The Crown Climb, the Training Deck, the menu preview, and any non-Show Course
use `CLASSIC_RULES`: the exact M3 gravity, friction, jump, hazard speed, slime
speed, and crown contact.

The Show Card and HUD name the show twist on Rounds 1–2 and say
`FINAL · CLASSIC` on Round 3. Practice on the Course uses the seeded twist;
Training Deck stays classic.

## Consequences

- The crown gate stays a known test; a twist cannot break the living-winner or
  physical-contact measurement.
- The player learns a rule in the qualifiers and then plays the familiar final;
  the twist is the road, not the destination.
- The twist gate still measures the Crown on every run, but the Crown is
  expected to report `CLASSIC_RULES`.
- A future "twisted final" is a separate, measured feature with its own ADR; it
  is not an extension of this flag.
