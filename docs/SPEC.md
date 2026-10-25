# Tumble Rush — Product & Technical Specification

**Version:** 1.0 (locked for v1)
**Source decisions:** [`docs/GRILL.md`](./GRILL.md)
**Status:** Ready for implementation

---

## 1. Objective

Build **Tumble Rush**, a complete single-player 3D party battle royale that runs in the browser.

A first-time visitor should open the public link, click once, and be dropped into a bright obstacle-course game show with 15 AI beans. They play up to three rounds — a race, a collapsing-tile survival round, and a final climb — and either win a crown or get eliminated and watch the rest. The whole show lasts 6–9 minutes. Everything is original, procedurally rendered, and static-hosted.

The quality bar is a **small-studio jam release**, not a prototype: designed UI, readable movement, comedy, sound, progression, touch support, tests, CI, and a live deployment.

### Success criteria

1. A stranger can go from URL to playing in ≤ 3 clicks.
2. A full show can be completed end to end without a developer.
3. The game holds ≥ 55 fps at 1080p on a 2021-era integrated GPU with the default quality.
4. Every mode has a clearly readable objective, timer, and qualifier count.
5. Losing is funny, fast, and immediately recoverable via restart/practice.
6. The public deployment is reachable and the README shows the game.

---

## 2. Design pillars

| Pillar | What it means in practice |
| --- | --- |
| **Readable chaos** | Many beans, big hazards, strong silhouettes, no hidden rules. The player always knows what hit them. |
| **Funny failure** | Wobbles, dives, splats, and ragdoll-ish reactions. Falling is a punchline, not a punishment screen. |
| **Different every time** | Authored course grammar, seeded variation, daily seed, bot personality variance. |
| **One more show** | 6–9 minute sessions, one-click restart, crowns and unlocks that persist. |
| **Show business** | Countdowns, crowd, confetti, finish fanfare, crown ceremony. The game feels hosted, not simulated. |

**Tiebreaker:** when two options are equal, choose the funnier and more readable one.

---

## 3. Audience & platforms

- **Primary:** desktop browser players, keyboard + mouse, 13–35, casual-to-mid skill.
- **Secondary:** mobile browser players, portrait or landscape, touch.
- **Browsers:** current Chrome, Edge, Firefox, Safari (desktop and iOS/Android). WebGL2 required.
- **Resolution:** 1280×720 minimum; responsive from 360 px wide. 16:9 is the design target; ultrawide must not break the HUD.
- **Network:** initial static assets only. No APIs, no accounts, no telemetry.

---

## 4. Game flow

```
Boot
 └─ Main Menu ──┬─ Play Show ── Round Intro ─ Countdown ─ Round 1
                ├─ Practice ── Round Intro ─ Countdown ─ Course (no elimination)
                ├─ Customize
                ├─ How to Play
                └─ Settings
Round 1 (Course) ─ Results ─ Round 2 (Survival) ─ Results ─ Round 3 (Final)
                                                              ├─ Victory (crown ceremony)
                                                              └─ Defeat / Spectate
Any round ─ Pause (resume / restart / settings / quit)
Results ─ Play Again / Main Menu
```

### Match structure

| Round | Mode | Starters | Qualifiers | Timer | Win condition |
| --- | --- | --- | --- | --- | --- |
| 1 | Sunrise Scramble (Course) | 16 | 8 | 120 s | Finish line; top 8 finishers advance |
| 2 | Hexapop (Survival) | 8 | 4 | 75 s | Last 4 standing; collapse waves force an end |
| 3 | Crown Climb (Final) | 4 | 1 | 120 s | First to touch the crown |

- The human always starts in the show. Bots fill the lobby.
- If the human is eliminated, the round resolves in **spectate** mode. A "Skip to results" action appears after 3 seconds.
- If a round ends with fewer qualifiers than expected (mass elimination), all remaining beans advance. If zero remain, the last eliminated beans advance by elimination order. The show always continues.
- On a Course timeout only finishers advance: seven finishers means seven entrants in the next Round, and a living 0% runner never takes a qualifier slot. If nobody finished, the last eliminated beans advance by elimination order.
- If a survival Round starts with no more beans than qualifier slots, it plays a short 4 s grace and then advances with a **NOT ENOUGH SURVIVORS** stamp instead of resolving on the first step.
- Practice uses Round 1 only, with respawns at the last checkpoint, no bots collision damage? (Bots still present, but no elimination; timer off.)
- Daily Show uses `YYYY-MM-DD` as the seed and shows the seed in the intro/results.

---

## 5. Core mechanics

### 5.1 Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD / arrow keys | Left stick | Left virtual stick |
| Camera | Mouse drag / pointer lock optional | Right stick | Drag right screen |
| Jump | Space | A / cross | Jump button |
| Dive | Shift / right mouse | B / circle | Dive button |
| Grab / shove | E / left mouse | X / square | Grab button |
| Emote | Q | Y / triangle | Emote button |
| Pause | Esc | Start | Pause icon |
| Restart round (practice) | R | — | Pause menu |

- Keyboard hints appear in the HUD for the first 20 seconds and in the pause menu.
- Pointer lock is optional; camera orbit works by dragging. A "Capture mouse" toggle in settings.
- Touch controls fade when unused and are hidden on devices without touch.

### 5.2 Movement feel

- Max ground speed: **8.0 u/s**. Acceleration: **55 u/s²**. Ground friction: **14 u/s²**. Air control: **0.65**.
- Gravity: **26 u/s²**. Jump velocity: **8.6 u/s** (≈1.42 u apex). Coyote time: **0.12 s**. Jump buffer: **0.12 s**.
- Dive: forward impulse **8.0 u/s**, downward snap, 0.45 s recovery, 1.1 s cooldown. Knocks beans within 1.4 u. A successful dive that crosses a gap feels heroic; a missed dive is a faceplant.
- Grab: hold within 1.2 u of a bean; both beans slow; release within 0.9 s to shove. A grab that lasts too long releases automatically.
- Stumble: any impact above a threshold triggers a 0.5 s wobble with reduced control and a comic animation. Never fully stuns.
- Landing compression, run lean, jump tuck, dive spin, and idle breathing are required animations.

### 5.3 Camera

- Third-person follow at 5.2 u distance, 33° pitch, FOV 68 (kicks to 74 at speed).
- Smooth position/look damping; auto-aligns behind movement after 0.8 s.
- Mouse orbit clamps pitch to −5°..65°, distance 3.5..8.0.
- Camera collision: sphere cast against world, pull in to avoid clipping.
- Shake on impacts, scaled by reduced-motion setting.

### 5.4 Elimination

- Falling below the course kill plane (`y < -14`) or touching slime eliminates the bean.
- Elimination triggers a splat particle burst, a short "ELIMINATED" stamp, and switches the human to spectate (or the round results if the round is over).
- Beans can be knocked off by hazards, dives, shoves, and moving platforms.
- Practice mode respawns at the last checkpoint after 0.8 s with a brief invulnerability and no eliminations.

---

## 6. Modes

### 6.1 Sunrise Scramble (Course)

A 5-zone linear course floating above a pastel canyon, ~180 u long.

| Zone | Name | Hazards | Teaching |
| --- | --- | --- | --- |
| A | Bunting Run | Wide start, low hurdles, first sweeper | Move, jump |
| B | Whirlybird Alley | Rotating sweepers, pendulum hammers, conveyor strips | Timing, dive |
| C | Jelly Jumps | Gap jumps, moving platforms, bounce pads | Air control, commitment |
| D | Slime Slide | Angled slide, pushers, narrow bridge, crowd chokepoint | Recovery, shoving |
| E | Crown Gate | Final climb, finish gate, crowd, confetti | Sprint to the line |

- Finish order determines qualification. A finish gate triggers a personal fanfare and locks the result.
- Seeded variation: hazard phase offsets, lane widths (±15%), platform positions, prop colors, crowd arrangement, and the placement of one optional risky shortcut.
- Checkpoints for Practice: start, B, C, D, E.
- The course is authored as a sequence of section builders, not a monolithic scene.

### 6.2 Hexapop (Survival)

- Arena of three honeycomb tiers (radius 9.5 / 7.0 / 4.5) at y = 0 / −2.6 / −5.2, over a slime pool at y = −9.
- Each tile hex is 1.15 u radius. Stepping on a tile starts a **0.45 s** warning; it fades, shakes, then drops. Tiles respawn only between rounds, never within a round.
- Stale tiles are visible as cracks and color desaturation. Bots and players see the same warning.
- After **45 s**, a sugar-rush collapse wave removes the outer ring every 4 s; after **65 s**, one ring every 2.5 s.
- Round ends at 4 survivors or at 75 s. Tie-break: most remaining tiles under the player, then highest y, then closest to center, then random.
- Camera widens to show the arena; the HUD shows tiers remaining.
- A "safety bounce" on the slime is **not** provided; touching slime eliminates.

### 6.3 Crown Climb (Final)

- Vertical ascent (~48 u) with four stages: rotating beam carousel, rising donut platforms, pendulum alley, crown dais.
- Candy slime rises from the bottom at **0.35 u/s**, accelerating to 0.8 u/s after 60 s. Touching slime eliminates.
- Rotating beams and pendulums sweep the route. Moving platforms rise and fall.
- First bean to touch the crown wins. The camera does a hero orbit; confetti and fanfare fire.
- If the timer expires, the highest bean wins; ties go to the bean closest to the crown horizontally.
- Bots are capable of winning; the player is not given a hidden advantage.

---

## 7. AI contestants

- 15 bots in Round 1, 7 in Round 2, 3 in Round 3 (qualifier count minus one).
- Each bot has:
  - `name`: original puns ("Beanie Baby", "Tumbleweed", "Sir Flopsalot", "Mochi Mayhem", etc.)
  - `skill`: 0.45–0.95, weighted around 0.7.
  - `reaction`: 0.12–0.38 s.
  - `mistakeChance`: 0.02–0.12 per decision.
  - `aggression`: 0.0–1.0 (shove/dive frequency).
  - `color`, `pattern`, `hat`.
- Course AI: follow a per-lane waypoint chain; choose lane based on hazard phase; jump at trigger volumes; dive across wide gaps; recover from knocks; occasionally taunt.
- Hex AI: score neighboring tiles by support, distance to center, and collapse risk; hop to the best two; panic-jump when their tile is collapsing.
- Final AI: follow the vertical waypoint chain; time jumps through the rotating beams; try to cut corners.
- Pacing: a hidden "pack" system keeps bots within ~25 u of the leader on the course, implemented by adjusting their target speed by ±8%, never by teleporting. The human is never targeted by this system.
- All bots use the same physics and collision code as the player.

---

## 8. Meta-game & persistence

### Profile

```ts
interface Profile {
  version: 1;
  name: string;
  colorId: string;
  patternId: string;
  hatId: string;
  emoteId: string;
  crowns: number;
  kudos: number;
  wins: number;
  shows: number;
  qualifications: number;
  bestFinish: number | null;
  unlocks: string[];
  settings: Settings;
  daily: { date: string; bestFinish: number | null; completed: boolean };
}
```

- Stored in `localStorage` key `tumble-rush.profile.v1`.
- Missing/corrupt data resets to a safe default without crashing.
- No personal data leaves the browser.

### Economy

- Qualifying a round: **+25 kudos** (first qualification of the show +50 bonus).
- Winning: **+1 crown**, **+100 kudos**.
- Cosmetics cost kudos: colors 0–150, patterns 50–200, hats 100–400, emotes 50–150.
- Crown count is displayed on the menu and victory screen. No purchasable currency.

### Cosmetics

- **Colors (8):** Coral, Mango, Mint, Sky, Grape, Bubblegum, Cream, Midnight.
- **Patterns (6):** Solid, Stripes, Dots, Zigzag, Stars, Checker.
- **Hats (8):** None, Propeller, Tiny Crown, Antenna, Ducky, Cone, Halos, Wildflower.
- **Emotes (4):** Wave, Flex, Facepalm, Dance.
- Starter set: 4 colors, 2 patterns, 2 hats, 1 emote. Everything else unlockable.
- Patterns are generated as canvas textures and applied to the bean body; hats are procedural models; the customization screen shows the live 3D bean rotating.

### Cosmetics rendering requirements

- Each bean is a capsule/bean silhouette with a face, stubby arms, and feet.
- Pattern texture must wrap cleanly and stay readable at gameplay distance.
- Hats must not obscure the face and must be visible at 30+ u.
- Name tags above bots: billboarded sprites, toggleable, max 16 visible.

---

## 9. UX & screens

### Main menu

- Full-bleed 3D diorama: floating island, three beans idling, confetti, parallax clouds.
- Logo "TUMBLE RUSH" with a sticker-like subtitle "a bean-powered game show".
- Primary CTA: **Play Show**. Secondary: Practice, Customize, How to Play, Settings.
- Profile chip: name, crown count, kudos, best finish.
- Seed/date chip for the Daily Show.
- Sound toggle and fullscreen affordance in the corner.
- Keyboard: arrows navigate, Enter activates; visible focus rings.

### Customization

- Live 3D bean turntable on a podium with a spotlight.
- Tabs: Color / Pattern / Hat / Emote. Swatch grid with lock badges and prices.
- Preview updates instantly; "Equip" persists; locked items show "Earn 150 kudos".
- Randomize and Reset buttons. Back returns to the menu.

### Settings

- Music volume, SFX volume, quality (Auto/High/Low), reduced motion, camera sensitivity, invert Y, name tags, touch controls (Auto/On/Off), reset profile (confirm).
- Changes apply immediately; persisted.

### Match intro

- Full-screen round card: round number, name, one-line objective, qualifier count, bean count, arena illustration/3D backdrop.
- Animated "3 — 2 — 1 — TUMBLE!" countdown. Inputs are locked during the countdown; camera does a small establishing move.
- Skip countdown with Enter/Space? No: the countdown is part of the show; it can be shortened by a setting? Keep it short (2.4 s total).

### HUD

- Top center: round name, timer, phase.
- Top right: qualified / remaining count with a progress pill.
- Top left: pause button.
- Bottom left: controls hint (fades).
- Bottom center: ability cooldown pips (jump/dive/grab) on touch only.
- Center: event stamps ("QUALIFIED!", "ELIMINATED!", "SUDDEN DEATH").
- Course: progress bar with player and leader markers.
- Hexapop: "Tiles left" and tier indicator.
- Final: vertical progress meter and slime height.
- All HUD elements are DOM/CSS, with ARIA live announcements for qualification/elimination.

### Pause

- Freeze simulation and audio ducking.
- Resume, Restart Show (confirm), Settings, Quit to Menu.
- Esc closes.

### Results

- Round results table: placement, bean, status (qualified/eliminated), time/progress.
- Human row highlighted. Qualifiers celebrate; eliminated beans slump.
- "Next Round" auto-advances after 5 s, or click to continue.
- Match end: victory (crown, confetti, stats, "Play Again") or defeat (placement, "Try Again", "Main Menu").

### Error states

- WebGL2 unsupported: friendly card with browser advice.
- WebGL context lost: pause and offer reload.
- Corrupt profile: silently reset, show a toast.

---

## 10. Art direction

**Theme:** Sunrise Carnival. A cheerful game show at dawn, floating over a candy canyon.

**Palette**

| Token | Hex | Usage |
| --- | --- | --- |
| `--coral` | `#FF6B6B` | hazards, accents, logo |
| `--mango` | `#FFC145` | highlights, crowns, buttons |
| `--mint` | `#59D9B0` | qualifiers, positive UI |
| `--sky` | `#57C7FF` | sky, water, secondary |
| `--grape` | `#A78BFA` | shadows, distant props |
| `--cream` | `#FFF6E5` | UI cards, clouds |
| `--ink` | `#24324A` | text, outlines |
| `--slime` | `#FF4FA3` | slime, elimination |

**3D style**

- Toon shading with 3-band gradient map; cream rim light; soft contact shadows.
- Chunky bevels, rounded boxes, inflated proportions. No textures on environment geometry except generated stripes/checkers where useful.
- Outline pass only on characters and key props at high quality, via inverted hull.
- Sky: vertical gradient dome (peach horizon → cyan zenith) with layered cloud billboards.
- Atmosphere: floating islands, bunting lines, balloons, distant hot-air balloons, confetti.
- Lighting: warm directional key from the right, cool hemisphere fill, no baked textures.
- Post: subtle vignette and color grade via CSS overlay; no heavy bloom by default.

**UI style**

- Cream cards, 3 px ink outlines, 8 px hard offset shadows, 20–28 px radius.
- Buttons: coral/mango gradients, ink outlines, press-down translate, hover lift.
- Typography: Fredoka Variable (bundled). Headings 700–600, body 500.
- Sticker labels rotated −3° to +3°. Confetti accents.
- Motion: bouncy cubic-bezier (`cubic-bezier(.2,1.4,.4,1)`), 180–420 ms; respects reduced motion.

---

## 11. Audio

- **Music:** original procedural loop at 122 BPM. Layers: kick/snare/hihat, plucky bass, synth-brass arpeggio, crowd ambience. Menu version is mellow; round music adds percussion; final adds a lead. Implemented with Web Audio oscillators/noise and a scheduler. Must loop seamlessly.
- **SFX:** jump (boing), land (thud), dive (whoosh), hit (bonk), splat (slime), qualify (chime), eliminate (sad trombone), countdown (beeps), crown (fanfare), UI clicks.
- **Mix:** master gain, music bus, SFX bus, ducking on pause. Mute persists. Audio starts only after a user gesture.
- **Performance:** no more than ~12 simultaneous synth voices; cull distant bot SFX.

---

## 12. Technical architecture

### 12.1 Stack

- **Build:** Vite 7 + TypeScript 5.x (strict).
- **3D:** Three.js (latest stable at install time).
- **UI:** DOM + CSS, hand-written state machine; no React.
- **Tests:** Vitest (unit), Playwright (E2E/smoke/screenshots).
- **Font:** `@fontsource-variable/fredoka` bundled.
- **Lint/format:** optional but recommended (ESLint flat config + Prettier); `npm run check` must always pass.

### 12.2 Suggested source layout

```
src/
  main.ts                 boot, error boundary, app shell
  style.css               design tokens + all UI styles
  app/
    App.ts                 top-level screen router
    screens/              menu, customize, settings, intro, results, victory
    hud.ts                in-game HUD
    overlays.ts           pause, toast, stamp
  game/
    Game.ts               renderer, loop, resize, quality, lifecycle
    Match.ts              show/round orchestration
    Director.ts           qualification, tie-breaks, progression
    Rng.ts                seeded mulberry32
    input/Input.ts        keyboard, mouse, touch, gamepad
    physics/Physics.ts    fixed-step world, capsule vs OBB, platforms
    physics/Collider.ts   collider types, transforms, velocity
    player/Bean.ts        visual bean + controller + animation
    player/CameraRig.ts   follow/orbit/collision
    bots/BotBrain.ts      per-mode AI
    levels/Course.ts      Sunrise Scramble builder + hazards
    levels/Hexapop.ts     tile arena
    levels/CrownClimb.ts  final ascent + rising slime
    levels/common.ts      building blocks, props, decor
    fx/Particles.ts       confetti, dust, splats
    fx/Sky.ts             gradient dome, clouds, islands
    audio/Audio.ts        synth music + SFX
    profile.ts            persistence, cosmetics, unlocks
    cosmetics.ts          definitions + generated textures/hats
    util/math.ts
  test/                   unit tests
e2e/                      Playwright specs + screenshot script
docs/                     GRILL, SPEC, TICKETS, RETRO, screenshots
.github/workflows/        ci.yml, deploy.yml
```

### 12.3 Game loop

- `requestAnimationFrame`; clamp frame delta to 50 ms.
- Fixed physics step **1/60 s**, accumulator, max 4 steps/frame.
- Render after physics; interpolation is optional, not required at 60 fps.
- Pause freezes the accumulator and audio.
- Visibility change auto-pauses.
- Cleanup: dispose geometries/materials/textures and remove listeners on screen transitions/teardown.

### 12.4 Physics

- Beans: vertical capsule (radius 0.42, total height 1.5) approximated by two spheres at the capsule caps; collision response resolves the deepest contact first.
- World: static and kinematic OBB colliders plus cylinders for beams. OBB sphere test in local space; normal/depth transformed back.
- Collide-and-slide: iterate up to 4 contacts; project velocity onto the contact plane; friction applied on ground.
- Grounding: contact normal `y > 0.45` and downward relative velocity. Moving platform velocity is transferred on contact; standing beans inherit platform delta.
- Kinematic platforms expose `prevPosition/prevQuaternion` and a sampled surface velocity; rotating sweepers push beans tangentially.
- Bean-bean: capsule vs capsule approximated as two-sphere pairs; positional correction + impulse; shoves apply extra impulse. Bots and player are equal.
- Hazards: colliders carry `kind: 'solid' | 'hazard' | 'conveyor' | 'bounce' | 'kill' | 'finish' | 'tile'`; each has an impact multiplier and, where relevant, a surface velocity.
- Kill plane per mode; no rigid-body tumbling (the visual bean tilts, physics capsule stays upright).
- Determinism: all layout random numbers come from the seeded RNG; physics is deterministic given the same inputs and step count. Tests must not rely on wall-clock timing.

### 12.5 Rendering & quality

- `WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })`.
- `ACESFilmicToneMapping`, sRGB output, PCFSoft shadows.
- Default: shadows 1024, outline pass on characters, confetti 250, pixel ratio min(devicePixelRatio, 2).
- Auto quality: if average frame time > 22 ms for 3 s, step down (shadows → outlines → particles → pixel ratio 1). Low quality fixed.
- Static scenery merged into a few meshes where practical; repeated props instanced.
- Bloom is not required; a CSS vignette/grade is allowed. No external post-processing dependency.
- Canvas resize via ResizeObserver; renderer resize + camera aspect update; pause rendering when hidden.

### 12.6 UI architecture

- One root `<div id="app">`; screens are functions returning DOM nodes, mounted into a screen host.
- App state: `'boot' | 'menu' | 'customize' | 'settings' | 'howto' | 'match' | 'victory'`.
- Match state owned by `Match`, surfaced to HUD via a lightweight event emitter (`on('qualify' | 'eliminate' | 'roundEnd' | 'stamp', cb)`).
- HUD updates are diffed by text content; no DOM rebuild per frame.
- All interactive elements are real `<button>`/`<input>` with labels; focus is trapped in modals and restored on close.
- CSS variables for palette, spacing, radii; breakpoints at 900 px and 600 px.

### 12.7 Performance budgets

| Budget | Target |
| --- | --- |
| Frame rate | 60 fps target, ≥45 fps low quality |
| Draw calls | ≤250 typical |
| Visible triangles | ≤120k |
| Initial JS (gzip) | ≤1.2 MB incl. Three.js, excl. font |
| Time to interactive | ≤3 s warm, ≤6 s cold |
| Audio voices | ≤12 concurrent |
| DOM HUD nodes | ≤250 |
| Memory | No unbounded growth across rounds; dispose per-round scenes |

---

## 13. Testing & QA

### Unit (Vitest)

- RNG: same seed → same sequence; different seeds differ; range bounds.
- Physics: bean rests on a box; jump apex is within tolerance; wall slide does not tunnel; moving platform carries the bean; kill plane triggers.
- Director: correct qualifier count; tie-break order; zero-qualifier fallback; round progression; early finish lock.
- Profile: default creation, persistence round-trip, corrupt data reset, unlock math, daily reset.
- Cosmetics: every ID in the catalog resolves; generated texture is non-empty (canvas mocked).

### E2E (Playwright)

- Menu renders, has a Play Show button, no console errors.
- Start a show; countdown completes; canvas and HUD are visible; movement keys change player position (exposed debug hook `window.__tumble`).
- Mobile viewport (390×844) shows touch controls.
- Open settings, toggle mute, return to menu.
- Screenshot script captures: menu, course, hexapop, final, victory at 1440×810.
- `window.__tumble` debug API (dev/test only) exposes `state`, `seed`, `playerPos`, `forceRound(mode)`, `win()`, `setQuality()`.

### Manual QA checklist

- Chrome, Firefox, Safari; 1440×810, 1280×720, 390×844.
- No console errors or warnings from Three.js.
- Complete a show as winner and as eliminated spectator.
- Pause/resume, restart, quit, settings persistence, reload persistence.
- Touch controls on a real phone or emulated touch device.
- Audio starts after gesture, mute works, no clipping.
- Reduced motion disables shake/confetti density.
- FPS overlay/dev stats in dev mode only.
- GitHub Pages base path loads all assets (no 404s).

---

## 14. CI/CD & deployment

- `npm run check`: `tsc --noEmit && vitest run && vite build`.
- CI workflow on PRs/pushes: Node 22, `npm ci`, check, Playwright smoke (Chromium), upload screenshots artifact.
- Deploy workflow on `main`: build with `GITHUB_PAGES=true`, upload `dist`, deploy via `actions/deploy-pages`.
- `vite.config.ts` base: `/tumble-rush-game/` in CI, `/` locally.
- Pages source: GitHub Actions.
- Post-deploy verification: load the public URL in a real browser, confirm the menu, start a show, capture a screenshot for the README.

---

## 15. Accessibility

- All menus keyboard-operable; visible `:focus-visible` rings; modal focus trap and Esc.
- `aria-live` announcements for countdown, qualification, elimination, and victory.
- Reduced motion: disable camera shake, lower confetti density, shorten page transitions.
- Audio toggles independent for music/SFX; no audio-only information.
- Color is never the only signal: qualified/eliminated also use icons/text.
- Text contrast ≥ 4.5:1 on cream/ink; HUD text has an outline or backing.
- Touch targets ≥ 44 px.
- Pause available at all times during play; no forced fullscreen.

---

## 16. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Custom physics instability | Gameplay breaks | Fixed step, capsule-vs-OBB unit tests, clamp velocities, no tall stacks |
| Scope explosion | Nothing ships | Frozen non-goals, ticket order, low-quality fallbacks |
| AI looks dumb or unfair | Core fantasy fails | Same physics, waypoint grammar, skill variance, playtest tuning |
| Performance on integrated GPUs | Unplayable | Budgets, instancing/merging, auto quality, low mode |
| Mobile controls unusable | Secondary platform lost | Large touch targets, camera drag region, test at 390×844 |
| GitHub Pages base-path bugs | Blank deployment | Env-aware base, verify live URL, check 404s |
| Procedural audio is grating | Muted game | Volume defaults 60%, layered but simple loop, mute persisted |
| Evidence-free PR | Review friction | Scripted screenshots committed + attached to PR |

---

## 17. Non-goals (v1)

Real-time multiplayer, backend/accounts/cloud saves, level editor or UGC, squads/teams, monetization, global leaderboards, key remapping, consoles, localization, replay export, spectator tools beyond follow-cam, VR.

---

## 18. Definition of done

A release is done when all of the following are true:

- [ ] `npm run check` passes on a clean install.
- [ ] Playwright smoke + screenshots pass locally and in CI.
- [ ] A full show can be won and lost; all three modes are playable.
- [ ] Menu, customize, settings, pause, results, victory are implemented and stylish.
- [ ] Desktop and mobile controls both work.
- [ ] Profile, unlocks, and settings persist across reload.
- [ ] Audio and reduced-motion settings work.
- [ ] 60 fps target met on the development machine at 1080p/high.
- [ ] No console errors in a full show.
- [ ] Public GitHub Pages URL is live and verified.
- [ ] README has the live link, representative screenshot, controls, features, and commands.
- [ ] PR contains evidence (screenshots) and links the closed issues.
- [ ] Issues and branches are cleaned up; `main` is deployed.
