# Tumble Rush

Tumble Rush is a browser party battle royale staged as a candy-carnival game show. This glossary defines the language used by the game, the design docs, and the code.

## The Show

**Show**:
A complete run from menu launch to crown or defeat, made of up to three Rounds.
_Avoid_: Match, session, game

**Round**:
One mini-game inside a Show with a single objective and a qualifier count.
_Avoid_: Level, stage, map

**Qualify**:
To meet a Round's advancement condition and continue in the Show.
_Avoid_: Pass, win

**Eliminate**:
To remove a Tumbler from the Show by falling, touching slime, or failing the Round condition.
_Avoid_: Die, kill, lose

**Qualifier**:
A Tumbler that has met the advancement condition.
_Avoid_: Winner, survivor

**Spectate**:
To watch the rest of a Round after elimination through a follow-cam.
_Avoid_: Ghost, replay

**Practice**:
A single-player Course run with respawns and no elimination.
_Avoid_: Tutorial, training

**Daily Show**:
A Show seeded from the calendar date with one recorded result per day.
_Avoid_: Daily challenge, daily run

**Seed**:
The deterministic input that drives layout and bot variation for a Show.
_Avoid_: Random seed, hash

## Contestants

**Tumbler**:
The jelly-bean contestant the player controls and the bots imitate.
_Avoid_: Bean in player-facing copy, character, avatar

**Bot**:
An AI-controlled Tumbler with a name, look, skill, reaction, and aggression.
_Avoid_: NPC, AI player

**Pack**:
The bounded group of bots that paces itself near the leader on a Course.
_Avoid_: Rubber band, catch-up

**Stumble**:
A short loss of control after a significant impact, expressed as a wobble.
_Avoid_: Stun, knockdown

**Dive**:
A committed forward lunge that crosses gaps and shoves nearby Tumblers.
_Avoid_: Slide, roll

**Grab**:
A short-range hold on another Tumbler, released as a shove.
_Avoid_: Tackle, push

## The Show's Parts

**Course**:
The linear obstacle Round, Sunrise Scramble.
_Avoid_: Race track, map

**Route**:
The ordered Sections that make up one Course lap. A Show has two Routes, one
per lap, and they are not identical.
_Avoid_: Path, track list

**Section**:
An authored chunk of the Course with one teaching idea.
_Avoid_: Zone, stage

**Section Module**:
A relocatable Section with its own geometry, checkpoint, waypoints, and
difficulty weight. A Route composes Section Modules; a Section Module does not
own the Route.
_Avoid_: Chunk, block

**Show Card**:
The seeded label that names a Show's Course Routes and Hexapop Arena Plan,
shown in the Round intro, results, and Daily chip.
_Avoid_: Seed card, summary

**Hazard**:
A moving or static Course object that can knock a Tumbler off.
_Avoid_: Trap, obstacle

**Finish Gate**:
The Course trigger that locks a Tumbler's qualification.
_Avoid_: Finish line

**Hexapop**:
The collapsing-tile survival Round.
_Avoid_: Hex-a-gone, tile game

**Arena Plan**:
The seeded shape of the Hexapop floor: RINGS, SPIRAL, or GEARWORKS. Every plan
keeps the centre perch and the same collapse rules.
_Avoid_: Map, layout

**Tile**:
A single hexagonal platform in Hexapop that can collapse.
_Avoid_: Hex, platform

**Sugar Rush**:
The auto-collapse wave that forces Hexapop to end.
_Avoid_: Sudden death, final wave

**Slime**:
The pink elimination surface below Hexapop and Crown Climb.
_Avoid_: Lava, water

**Crown Climb**:
The vertical final Round.
_Avoid_: Final climb, tower

**Crown**:
The final trigger that wins a Show; also the persistent win currency.
_Avoid_: Trophy, medal

**Kudos**:
The soft currency earned by qualifying and spent on cosmetics.
_Avoid_: Coins, money

**Look**:
A Tumbler's color, pattern, hat, and emote choices.
_Avoid_: Skin, outfit, cosmetic loadout

## Systems

**Show Director**:
The system that owns Round progression, qualification, tie-breaks, and results.
_Avoid_: Match manager, game mode

**HUD**:
The in-game overlay that shows objective, timer, qualifiers, and feedback.
_Avoid_: Interface, overlay

**Stamp**:
A large transient centre-screen message such as QUALIFIED! or ELIMINATED!.
_Avoid_: Toast, popup

**Variety Gate**:
The 12-seed measurement that proves Shows have distinct Routes and Arena Plans
while still meeting the pacing and fairness bands.
_Avoid_: Variety check, seed test

**Quality Tier**:
The renderer preset (high or low) controlling shadows, outlines, particles, and pixel ratio.
_Avoid_: Graphics setting, LOD
