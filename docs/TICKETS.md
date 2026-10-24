# Tumble Rush — Ticket Breakdown

**Spec:** [`docs/SPEC.md`](./SPEC.md)
**Milestone:** `Tumble Rush v1`
**Delivery:** one feature branch (`feat/tumble-rush-v1`) → one PR into `main` → deploy.

Tickets are ordered by dependency. Each ticket maps to one or more commits and is closed by the merged PR. Acceptance criteria are binary and verifiable; "looks good" is not a criterion.

---

## Dependency graph

```
TR-001 Foundation
  ├─ TR-002 Physics
  │    ├─ TR-003 Bean + camera + input
  │    │    ├─ TR-004 Course
  │    │    ├─ TR-005 Hexapop
  │    │    └─ TR-006 Crown Climb
  │    │         └─ TR-007 Bots + Match/Director
  ├─ TR-008 UI shell + HUD + screens
  ├─ TR-009 Profile + cosmetics
  └─ TR-010 Audio + FX + accessibility
        └─ TR-011 QA + evidence
              └─ TR-012 Docs + deployment
```

TR-008, TR-009, and TR-010 may proceed in parallel once TR-003's public types exist. TR-007 requires all three levels.

---

## TR-001 — Project foundation, build, and CI

**Type:** infrastructure · **Priority:** P0 · **Depends on:** none

**Scope**

- Scaffold Vite + TypeScript + Three.js, strict TS, npm scripts (`dev`, `build`, `preview`, `test`, `test:e2e`, `check`).
- App shell (`index.html`, root mount, boot/error boundary), design-token CSS skeleton, font bundling.
- Vite base path: `/tumble-rush-game/` in CI, `/` locally.
- `ci.yml` (typecheck, unit tests, build, Playwright smoke) and `deploy.yml` (Pages).
- `.gitignore`, `.editorconfig`, `LICENSE` (MIT), `package-lock.json`.
- Basic `window.__tumble` debug hook behind dev/test flag.

**Acceptance**

- [ ] `npm ci && npm run check` passes from a clean checkout.
- [ ] `npm run dev` serves a page with the app shell and no console errors.
- [ ] `npm run build` produces `dist/` with correct asset URLs for a Pages subpath.
- [ ] CI workflow is valid and runs on PRs; deploy workflow runs on `main`.
- [ ] No CDN/network dependencies at runtime.

**Evidence:** checks output, build listing, screenshot of shell.

---

## TR-002 — Deterministic physics and collision core

**Type:** engine · **Priority:** P0 · **Depends on:** TR-001

**Scope**

- Seeded `Rng` (mulberry32) with tests.
- Fixed-step world (1/60), accumulator, contact resolution.
- Capsule (two-sphere) vs OBB and cylinder collision; collide-and-slide; friction; grounding; moving-platform velocity transfer; conveyor surfaces; bounce pads; kill plane.
- Kinematic transform history (`prevPosition`, `prevQuaternion`, surface velocity).
- Bean-bean sphere resolution and shove impulses.
- Debug visualization (toggle in dev) for colliders.
- Unit tests for rest, jump, wall slide, platform carry, kill plane, no tunneling at max speed.

**Acceptance**

- [ ] Unit tests cover the listed cases and pass.
- [ ] A bean dropped from 10 u lands and rests without jitter.
- [ ] A bean jumping reaches an apex of 1.35–1.55 u and returns to the ground.
- [ ] A bean on a moving platform stays attached at platform speeds up to 6 u/s.
- [ ] Fast horizontal movement (≤20 u/s) cannot tunnel through a 0.5 u wall.
- [ ] No allocations in the per-step hot path beyond small pooled vectors (reviewable).

**Evidence:** test output; debug screenshot of collider wireframes.

---

## TR-003 — Bean character, controller, camera, and input

**Type:** gameplay · **Priority:** P0 · **Depends on:** TR-002

**Scope**

- Bean visual: body, face, arms, feet, pattern texture, hat, name tag; toon shading and outline.
- Animation: idle breathe, run lean/bob, jump tuck, dive spin, land squash, stumble wobble, celebrate/slump.
- Controller: run/jump/coyote/buffer/dive/grab/emote; stumble state; cooldowns.
- Camera rig: follow, orbit, zoom, look-ahead, collision, FOV kick, shake.
- Input: keyboard, mouse drag, pointer lock toggle, gamepad, touch joystick + buttons.
- Basic test level for feel (a platform, gap, wall, bounce pad).

**Acceptance**

- [ ] All five actions are bound and visibly animated on desktop and touch.
- [ ] Coyote time and jump buffering are demonstrable with a debug overlay.
- [ ] Camera never clips through the floor or walls in the test level.
- [ ] Bean faces match chosen color/pattern/hat immediately.
- [ ] No input sticks after focus loss / window blur.

**Evidence:** gameplay GIF or screenshots (run, jump, dive), debug overlay screenshot.

---

## TR-004 — Sunrise Scramble course

**Type:** content · **Priority:** P0 · **Depends on:** TR-003

**Scope**

- Section builders: Bunting Run, Whirlybird Alley, Jelly Jumps, Slime Slide, Crown Gate.
- Hazards: rotating sweepers, pendulum hammers, conveyors, moving platforms, bounce pads, pushers, narrow bridges.
- Finish gate with qualifier lock and fanfare.
- Seeded variation: hazard phases, lane width, shortcut placement, prop colors.
- Checkpoints for Practice; kill plane; out-of-bounds reset.
- Art: floating candy islands, bunting, clouds, spectators, balloons, signposts.
- Course progress API for HUD and director.

**Acceptance**

- [ ] A full run start→finish is completable in 60–110 s.
- [ ] All five zones are visually and mechanically distinct.
- [ ] Every hazard can knock a bean off; none can permanently trap a bean.
- [ ] Changing the seed changes at least 5 visible/behavioral parameters.
- [ ] Practice checkpoints respawn the player at the last pad.
- [ ] Course can be run by a bot from start to finish.

**Evidence:** screenshots of each zone; course seed comparison; finish screenshot.

---

## TR-005 — Hexapop survival arena

**Type:** content · **Priority:** P0 · **Depends on:** TR-003

**Scope**

- Three-tier hex arena with procedural tile materials and crack states.
- Touch-to-collapse logic (warning → fall), collider removal, tile fall animation.
- Sugar-rush outer-ring collapse waves.
- Slime pool with shader/animation; kill on contact.
- Survival ranking and tie-breaks; 4-survivor end condition.
- Spectator camera behavior.

**Acceptance**

- [ ] Stepping on a tile starts a visible 0.45 s warning then drops it.
- [ ] A bean standing on a dropped tile falls into slime and is eliminated.
- [ ] After 45 s, collapse waves visibly remove the outer ring every 4 s.
- [ ] Round ends with exactly 4 survivors or at 75 s with the documented tie-break.
- [ ] Arena runs at 60 fps with 8 beans and all tiles.
- [ ] No tile can be re-triggered after falling.

**Evidence:** before/after collapse screenshots; timing data; test output for ranking.

---

## TR-006 — Crown Climb final

**Type:** content · **Priority:** P0 · **Depends on:** TR-003

**Scope**

- Four-stage vertical ascent: rotating beam carousel, rising donuts, pendulum alley, crown dais.
- Rising slime with acceleration and a visible height marker/HUD.
- Moving platforms and rotating beams with correct physics.
- Crown trigger, victory sequence hook, fall/elimination.
- Timer fallback winner by height.
- Set dressing: sunrise backdrop, hot-air balloons, cheering crowd, banners.

**Acceptance**

- [ ] A skilled player can reach the crown in 45–90 s.
- [ ] Rising slime forces progress and can eliminate a stationary bean.
- [ ] Crown touch ends the round instantly with the correct winner.
- [ ] On timeout, the highest bean wins.
- [ ] Camera handles the vertical ascent and crown orbit without clipping.
- [ ] Bots can complete the climb.

**Evidence:** climb screenshots, victory screenshot, timeout test.

---

## TR-007 — Bots, match director, and show flow

**Type:** gameplay · **Priority:** P0 · **Depends on:** TR-004, TR-005, TR-006

**Scope**

- Bot roster: 15 original names, colors, patterns, hats, skill/reaction/aggression.
- Course waypoint chain, hazard timing, gap dives, recovery, shoving.
- Hexapop tile scoring and panic jumps; Crown Climb vertical navigation.
- Same-physics movement, no teleporting, bounded pack pacing.
- Match state machine: round intro → countdown → play → results → next round → victory/defeat.
- Qualification with tie-breaks and zero-survivor fallback.
- Human elimination → spectate (follow leader, skip to results).
- Practice mode (respawn, no elimination).
- Daily seed from date; Quick seed random; seed shown in results.
- Debug API: `forceRound`, `win`, `state`, `seed`, `playerPos`.

**Acceptance**

- [ ] 15/7/3 bot counts are correct in each round.
- [ ] A full show completes automatically (debug/headless accelerate) with exactly 8 → 4 → 1 qualifiers.
- [ ] Human can win; bots can win; both are observed in testing.
- [ ] Eliminated human sees spectate then results, and can skip.
- [ ] Every round ends within its timer even with zero input.
- [ ] Bots never teleport or exceed the player's speed cap by more than 8%.
- [ ] Difficulty presets measurably change bot skill and hazard speed.

**Evidence:** director unit tests; full-show log; spectate/victory screenshots.

---

## TR-008 — UI shell, screens, and HUD

**Type:** UX · **Priority:** P0 · **Depends on:** TR-001, TR-003

**Scope**

- Main menu with 3D diorama, logo, CTAs, profile chip, sound/fullscreen.
- Customize, Settings, How to Play screens.
- Match intro, countdown, HUD (timer, qualifiers, progress, stamps, alerts), pause overlay, toasts.
- Round results table, victory/defeat screens.
- Error/unsupported WebGL card, context-lost handling.
- Responsive layout at 900 px and 600 px; touch HUD.
- Keyboard focus states, focus trap, ARIA live region.
- Reduced motion and settings wiring.

**Acceptance**

- [ ] Every screen in SPEC §9 exists and is reachable.
- [ ] Menu is fully keyboard-navigable and focus is visible.
- [ ] HUD is readable at 390 px wide and does not overlap the touch controls.
- [ ] Pause freezes gameplay and can be opened/closed with Esc.
- [ ] Settings apply immediately and persist.
- [ ] No default browser styling leaks into primary screens.
- [ ] Screens match the Sunrise Carnival design tokens.

**Evidence:** screenshots of every screen at desktop and mobile widths.

---

## TR-009 — Profile, cosmetics, and progression

**Type:** meta · **Priority:** P0 · **Depends on:** TR-001, TR-003

**Scope**

- Versioned profile load/save/reset, corrupt-data recovery.
- Cosmetics catalog (8 colors, 6 patterns, 8 hats, 4 emotes), starter set, kudos costs.
- Live 3D preview, equip/randomize/reset, locked/unlocked states.
- Kudos/crown awards on qualification/win; profile stats.
- Daily result tracking; name editing with validation.
- Toast feedback for unlocks.

**Acceptance**

- [ ] Reload preserves name, cosmetics, settings, crowns, kudos, and stats.
- [ ] Corrupt or old profile data resets safely without a crash.
- [ ] Every catalog item renders (color, pattern, hat, emote).
- [ ] Buying an item deducts kudos, unlocks it, and survives reload.
- [ ] Winning awards a crown once, not twice.
- [ ] No personal data leaves localStorage.

**Evidence:** unit tests; customization screenshots; storage snapshot.

---

## TR-010 — Audio, effects, and accessibility polish

**Type:** polish · **Priority:** P1 · **Depends on:** TR-003, TR-008

**Scope**

- Procedural music (menu/round/final layers) and SFX (jump, land, dive, hit, splat, qualify, eliminate, countdown, crown, UI).
- Audio buses, mute persistence, pause ducking, voice cap.
- Particles: confetti, dust, impact stars, slime splashes, finish burst, crown celebration.
- Screen shake, FOV kick, hit flashes.
- Reduced motion and high-contrast name tags.
- Quality auto-detection and low mode.

**Acceptance**

- [ ] Audio starts only after a gesture and loops without an audible seam.
- [ ] Music and SFX volumes are independently adjustable and persist.
- [ ] Muting silences all audio; unmuting restores it.
- [ ] Reduced motion removes camera shake and reduces confetti.
- [ ] Low quality disables shadows/outlines and maintains ≥45 fps.
- [ ] No more than 12 audio voices are active at once.

**Evidence:** audio settings screenshot; low/high quality comparison; performance log.

---

## TR-011 — Automated QA, screenshots, and performance

**Type:** QA · **Priority:** P0 · **Depends on:** TR-007, TR-008, TR-009, TR-010

**Scope**

- Complete Vitest suites (physics, director, profile, RNG, cosmetics).
- Playwright smoke: menu, start show, HUD visible, mobile touch, settings, pause.
- Screenshot script: menu, course, Hexapop, final, victory at 1440×810.
- Performance measurement (avg FPS over 30 s) with a dev HUD.
- Cross-browser manual checklist (Chrome/Firefox/Safari).
- Fix all console errors/warnings.

**Acceptance**

- [ ] `npm run check` passes clean.
- [ ] `npm run test:e2e` passes headless.
- [ ] Screenshot set exists and is committed under `docs/evidence/`.
- [ ] Full-show run has zero console errors.
- [ ] Average FPS ≥ 55 at 1080p high on the dev machine; ≥ 45 on low.
- [ ] Mobile viewport test proves touch controls are visible and functional.

**Evidence:** test logs, `docs/evidence/*.png`, FPS report.

---

## TR-012 — Docs, Pages deployment, and release

**Type:** delivery · **Priority:** P0 · **Depends on:** TR-011

**Scope**

- README: hero screenshot, live link, pitch, features, controls, modes, architecture, commands, credits, license.
- Deploy to GitHub Pages via Actions; verify public URL and asset loading.
- Capture README screenshot from the live build (not localhost).
- PR body with summary, ticket links, evidence attachments, test plan.
- Retrospective (`docs/RETRO.md`).
- Close issues, delete branches, remove worktrees, confirm no dangling PRs.

**Acceptance**

- [ ] Public URL returns 200 and the game is playable.
- [ ] README screenshot is from the deployed build and visible on GitHub.
- [ ] README live link works without auth.
- [ ] PR merged into `main`; Actions deploy succeeded.
- [ ] All milestone issues closed with a summary comment.
- [ ] Feature branch deleted; no stray worktrees; `main` clean and synced.
- [ ] Retro committed.

**Evidence:** live URL, deployment run link, README render, `git status` clean.

---

## Cross-cutting quality bar

Every ticket must leave the build green. No `any` in new public APIs. No dead controls. No console noise. No placeholder art in shipped screens (debug visuals are gated). Every user-visible action has feedback within 100 ms. Every screen has a keyboard path out. Every mode has a documented way to end.
