# Grill-with-docs — Tumble Rush

> Session owner: implementation agent. The human asked for a **challenging objective** and delegated every decision in this grilling session ("move forward, choose what you would recommend"). Questions are answered with the recommended option, and each answer is recorded as a decision. No question is left open.

## Method

This is a three-round design-tree interview. Round 1 settles the product frame; Round 2 settles the game; Round 3 settles engineering and quality. Each round only asks questions whose prerequisites are already settled. Facts about the target game were gathered before the interview, never asked of the human.

## Reference research

The goal is an **original** browser game that captures the feel of *Fall Guys* without copying its assets, names, or UI.

Sources reviewed:

- [Fall Guys — Wikipedia](https://en.wikipedia.org/wiki/Fall_Guys) — genre definition (platformer battle royale), 32-player shows, bean characters, jump/dive/grab/piggyback verbs, round types (Course, Survival, Points, Team, Final), "50-50 chaos and skill" design pillar, "different every time" level pillar.
- [Fall Guys on Steam](https://store.steampowered.com/app/1097150/Fall_Guys/) — official screenshots. Three were downloaded and reviewed for art direction: glossy pastel obstacle courses floating in a candy sky, oversized toy-like props, strong rim light, soft shadows, saturated pinks/cyans/yellows, chunky rounded geometry.
- [Steam screenshot 1 — spinning hammers / pink platforms](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1097150/ss_6b957574e0e60159e692d926ae7104dc54c207c7.1920x1080.jpg)
- [Steam screenshot 2 — rainbow ramp and crowd](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1097150/ss_9e380dcadcaa9d0cd6c34b0a508f2624030b135b.1920x1080.jpg)
- [Steam screenshot 3 — floating course and swinging pendulums](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1097150/ss_b695ced32eeef3059970c195b222460990d55401.1920x1080.jpg)
- Video references: [PlayFrame — Fall Guys obstacle course royale](https://www.youtube.com/watch?v=Tt2-_0DoA3o), [KeashonGotGame — insane obstacle course](https://www.youtube.com/watch?v=52UXPpmva1E), [Neon Run Club — Fall Guys race workout](https://www.youtube.com/watch?v=C8ayNWUqG-E).

Observed mechanics worth translating:

1. Readable chaos: many bodies, oversized hazards, and clear sightlines. The comedy comes from physical comedy, not from hidden rules.
2. Three-word explanations: "reach the finish", "don't fall", "grab the crown".
3. Ragdoll-ish failure: being knocked over is funny, so the character controller must exaggerate impacts instead of hiding them.
4. Every run looks different: obstacle parameters and layouts should be seeded, not static.
5. Short sessions: a whole show should fit in a coffee break.

Original direction chosen for this project: **Tumble Rush — a sunrise-carnival obstacle show**. Candy-pastel floating islands, jelly-bean "Tumblers", inflatable props, brass-band-meets-synth audio. Nothing is copied from Fall Guys except the genre grammar.

---

## Round 1 — Product frame

### ❓ Q1 — What exactly are we building, and what quality bar makes it "challenging"?

A tech demo is not challenging. A jam prototype is not either. The objective should force a complete product: a game someone can play for twenty minutes, understand without instructions, and want to replay.

**➡️ Recommended (selected):** A complete single-player 3D browser battle royale. 16 beans (1 human + 15 AI), three rounds, three genuinely different round types, a full front-end, cosmetics/progression, sound, mobile touch controls, automated tests, CI/CD, and a public GitHub Pages deployment. The bar is "small-studio jam release", not "engine prototype". A match must be playable end to end without developer tools.

**Decision:** D1. Quality bar = shippable jam release with live deployment and evidence.

### ❓ Q2 — Real multiplayer or bots?

Real-time multiplayer demands servers, matchmaking, tick sync, anti-cheat, and a backend budget. It buys nothing for the core fantasy when a full lobby of expressive bots can deliver the same show.

**➡️ Recommended (selected):** Single-player vs. 15 bots. Static hosting only. No accounts, no network APIs at runtime. Bots must feel like contestants, not target dummies: varied names, colors, hats, skill, mistakes, and reactions.

**Decision:** D2. Offline single-player, local profile, static hosting.

### ❓ Q3 — How close should the Fall Guys reference be?

Cloning protected characters, level layouts, logos, or music would be both legally risky and creatively weak. The reference should be mechanical and tonal.

**➡️ Recommended (selected):** Original IP, original names, procedural geometry and textures, original synthesized music. Cite the genre inspirations in the README. No Fall Guys assets, logos, character designs, level recreations, or trademarked terms in the product.

**Decision:** D3. Inspired-by, not a copy. All runtime assets generated by the project.

### ❓ Q4 — Which platforms and inputs are first-class?

The browser target is broad. Phones are where a lot of casual play happens, but a 3D platformer with mouse-look is desktop-first.

**➡️ Recommended (selected):** Desktop Chrome/Firefox/Safari first (keyboard + mouse, gamepad optional), responsive mobile touch controls as a supported second class. No installation. WebGL2 required; a clear unsupported-browser message otherwise.

**Decision:** D4. Desktop-first, mobile playable, WebGL2.

### ❓ Q5 — How long is one show?

Too short and the three-round structure is pointless; too long and replay suffers.

**➡️ Recommended (selected):** 6–9 minutes for a full show: Round 1 ~100 s, Round 2 ~75 s, Round 3 ~90 s, plus intros and results. Quick restart. A "Daily Show" seeded by the date gives replay value without live services.

**Decision:** D5. 6–9 minute shows, instant replay, daily seed.

### ❓ Q6 — How much meta-progression?

A progression system that is only a number is forgettable. A deep economy is out of scope.

**➡️ Recommended (selected):** Local profile with name, colors, patterns, hats, crowns, wins, qualifications, best finish, and unlocks. Winning earns a crown; qualifying earns kudos; kudos unlock cosmetics. Persist in `localStorage` with a versioned schema and a safe migration/reset path. No purchases, no timers, no dark patterns.

**Decision:** D6. Local meta-game with cosmetic unlocks.

### ❓ Q7 — What is the single most important feeling to protect?

Every trade-off needs a tiebreaker. For this genre the answer is not "realism" or "difficulty".

**➡️ Recommended (selected):** **"I can't believe that just happened — again!"** Physical comedy, near-misses, and reversals. The game should be funny to lose, and the next run should start in one click.

**Decision:** D7. Comedy-first tiebreaker. When in doubt, choose the funnier, more readable outcome.

---

## Round 2 — Game design

### ❓ Q8 — Which three rounds?

The show needs three distinct verbs. Three obstacle races would be repetitive; three survival modes would have no finish-line high.

**➡️ Recommended (selected):**

1. **Sunrise Scramble** — Course. 16 → 8 qualifiers. A linear, seeded obstacle course with sweepers, pendulums, moving platforms, conveyors, and a finish gate.
2. **Hexapop** — Survival. 8 → 4. Three stacked honeycomb tiers; tiles collapse shortly after being stepped on; slime below.
3. **Crown Climb** — Final. 4 → 1. A vertical ascent through rotating beams and gaps while candy slime rises. First to the crown wins.

**Decision:** D8. Course → Survival → Final, with shrinking lobbies.

### ❓ Q9 — What is the player's move set?

Adding sprint, wall-run, or double-jump dilutes the clumsy fantasy. The move set should be small, expressive, and full of failure states.

**➡️ Recommended (selected):** Run, jump (with coyote time and jump buffer), dive (commits the body forward, can knock other beans), grab/push (short-range shove with a hold), and an emote. No sprint, no double jump. Camera orbit with mouse/right stick; zoom with wheel. Soft auto-follow while running.

**Decision:** D9. Run / jump / dive / grab / emote. Clumsy, committed movement.

### ❓ Q10 — What happens when the player falls or is eliminated?

Respawn checkpoints would protect the player but remove the stakes that make the finish line mean something.

**➡️ Recommended (selected):** Falling below the course or into slime eliminates. The player becomes a spectator with a follow-cam and can watch the round resolve. Round results are shown immediately after. A **Practice** mode offers the course with instant respawns and no elimination, so players can learn without lowering the stakes of a real show.

**Decision:** D10. Elimination is real; Practice mode is the safety net.

### ❓ Q11 — How do bots stay fair and fun?

Perfect bots feel unfair; stupid bots feel empty. Rubber-banding that is visible feels cheap.

**➡️ Recommended (selected):** Each bot gets a skill (0.45–0.95), reaction time, and mistake chance. Bots navigate authored waypoints, jump at hazard triggers, and use the same physics as the player. A subtle "show director" keeps the pack within a readable distance of the leader on the course, but never teleports bots or grants speed the player cannot match. Bots can be eliminated, can shove, and can win.

**Decision:** D11. Same-physics bots with skill variance and transparent, bounded pacing.

### ❓ Q12 — How is the course kept fresh?

A handcrafted course is better on run one and stale by run five. Pure randomness is unreadable.

**➡️ Recommended (selected):** Handcrafted section grammar, seeded parameter variation. The course always uses the same readable sequence of five zones, but hazard timings, lane widths, platform offsets, and prop colors vary by seed. Daily Show uses the date as seed; Quick Show uses a random seed; a seed is displayed in the results.

**Decision:** D12. Authored grammar, seeded variation.

### ❓ Q13 — How does Hexapop end deterministically?

A survival mode can stall if bots camp safely.

**➡️ Recommended (selected):** Tiles become progressively more fragile; after 45 s, a "sugar rush" wave auto-collapses the outer rings inward. The round ends when four beans remain, or when the timer expires; if the timer expires, survivors are ranked by remaining tiles/height and the top four advance. Similar tie-breaking rules exist for every mode so the show always completes.

**Decision:** D13. Explicit tie-breakers and a guaranteed round end.

### ❓ Q14 — What does customization include, and how is it earned?

Cosmetics are the reward loop, but the first session should already feel personal.

**➡️ Recommended (selected):** 8 colors, 6 patterns, 8 hats, 4 emotes. A starter set is free; the rest unlock with kudos earned by qualifying. Crowns track wins and are shown on the profile. The customization screen renders the live 3D bean, not a flat icon.

**Decision:** D14. 8 colors / 6 patterns / 8 hats / 4 emotes, earned through play.

### ❓ Q15 — Which UX screens are required?

A 3D game with a weak front-end feels like a demo. Every state needs a designed screen.

**➡️ Recommended (selected):** Boot/loading, main menu, customization, settings, how-to-play, match intro, countdown, HUD, pause, round results, elimination/spectate, match victory, error/unsupported browser. Menu is keyboard-navigable and works at mobile widths. Total time from load to play ≤ 3 seconds on a warm cache.

**Decision:** D15. Full state flow, designed rather than default HTML.

### ❓ Q16 — What is the art and audio direction?

The reference is candy-bright, but we need a distinct identity and a style that can be built procedurally.

**➡️ Recommended (selected):** "Sunrise Carnival" — peach-to-cyan sky, coral/mango/mint/grape palette, giant inflatable props, bunting, clouds, floating islands. Toon-shaded geometry with soft outlines and chunky silhouettes. UI like a cheerful game-show package: cream cards, ink outlines, tilted stickers, Fredoka type. Music: original 122 BPM synth-brass loop with layered intensity; SFX synthesized with Web Audio. All assets generated at runtime or built from source geometry.

**Decision:** D16. Sunrise Carnival art direction; procedural toon assets; synthesized soundtrack.

### ❓ Q17 — What makes the game feel alive outside the core loop?

Small moments create the "show" feeling: crowds, confetti, announcements, reactions.

**➡️ Recommended (selected):** Bean reactions (celebration, dejection, wobble), confetti bursts, crowd silhouettes in the stands, floating balloons, finish-line fanfare, elimination splat, crown ceremony, a commentator-style text ticker ("MINTY MAYHEM takes the lead!"), and a photo-finish results table. All flavor systems must be cheap and skippable.

**Decision:** D17. Show-biz garnish is in scope, budgeted and non-blocking.

### ❓ Q18 — Which difficulty and accessibility options are in v1?

Accessibility cannot be retrofitted after the HUD and camera exist.

**➡️ Recommended (selected):** Three difficulty presets (Chill / Show / Champion) scaling bot skill and hazard speed; separate music/SFX volume; reduced motion (camera shake, confetti density); high-contrast name tags; invert camera Y; camera sensitivity; touch control scale; pause always available. Remappable keys are out of scope in v1, but all actions have visible key hints.

**Decision:** D18. Three difficulty presets and a real options screen.

---

## Round 3 — Engineering and delivery

### ❓ Q19 — What stack?

A custom engine maximizes control but burns time. A heavyweight engine adds bundle and tooling risk. The game is stylized and small-scale.

**➡️ Recommended (selected):** Vite + TypeScript + Three.js. DOM/CSS for UI (no React) to keep the bundle and state machine simple. Custom fixed-step character physics tuned for a capsule vs. oriented boxes, not a general rigid-body engine. Vitest for unit tests, Playwright for smoke/E2E and screenshots. No runtime network calls.

**Decision:** D19. Vite + TypeScript + Three.js, custom physics, DOM UI.

### ❓ Q20 — How do assets stay license-clean and deployable?

External GLTFs, fonts, and music add loading, licensing, and path problems on GitHub Pages.

**➡️ Recommended (selected):** Generate all 3D geometry, textures, particles, and audio in code. Bundle one open-license variable font (`@fontsource-variable/fredoka`) through npm. No CDN dependencies at runtime. Build output is fully self-contained under the Pages base path.

**Decision:** D20. Procedural assets + bundled font; zero runtime network.

### ❓ Q21 — What are the performance budgets?

A beautiful game that stutters is not shippable.

**➡️ Recommended (selected):** 60 fps target on a 2021 integrated GPU at 1080p; ≥45 fps floor on low quality. ≤2.5 s to interactive on warm cache; JS+WASM initial payload ≤1.2 MB gzipped excluding the font subset; draw calls ≤250; ≤120k visible triangles; shadow map 1024; adaptive pixel ratio; low-quality mode disables shadows, outlines, and heavy particles. Use instancing/merging for repeated props.

**Decision:** D21. 60 fps target, explicit budgets, low-quality fallback.

### ❓ Q22 — How is "done" proven?

Screenshots and vibes are not evidence. The delivery needs automated and human-verifiable gates.

**➡️ Recommended (selected):** Unit tests for deterministic RNG, physics landing/jump/slide, round director qualification/ties, and profile persistence. Playwright smoke tests: menu loads with no console errors, a full match can be started and reaches gameplay, mobile viewport renders touch controls. A scripted screenshot run captures menu, course, Hexapop, final, and victory for the PR and README. `npm run check` runs typecheck + tests + build. CI runs on every PR; deploy runs on main.

**Decision:** D22. Automated gates + captured visual evidence for every PR.

### ❓ Q23 — How is the work sliced and reviewed?

One giant commit is unreviewable; ten micro-PRs create merge overhead. The delivery should show a coherent build-up.

**➡️ Recommended (selected):** One feature branch and one PR into `main`, with commits mapped to tickets. Each ticket has acceptance criteria and evidence in the PR description. Independent review rounds use fresh subagent sessions with DeepSeek V4.1 Flash (Max) as required. Issues are opened for the ticket set and closed by the merged PR; no dangling issues.

**Decision:** D23. Single feature branch/PR, commit-per-ticket, issue-backed evidence, independent review.

### ❓ Q24 — How is it deployed and documented?

The game must be playable by a stranger without cloning.

**➡️ Recommended (selected):** GitHub Actions deploys `dist/` to GitHub Pages on `main`. Vite base path is environment-aware. README contains a live link, a representative in-game screenshot, controls, feature list, architecture notes, and local commands. Deployment is verified by loading the public URL and capturing a screenshot from it.

**Decision:** D24. GitHub Pages deployment, verified live, screenshot in README.

### ❓ Q25 — What is explicitly out of scope?

Naming non-goals prevents late scope creep.

**➡️ Recommended (selected):** Real-time multiplayer, accounts/cloud saves, level editor, teams/squads, monetization, leaderboards beyond local/daily best, key remapping, console/TV support, localization beyond English, replay export, user-generated content.

**Decision:** D25. Non-goals frozen for v1.

### ❓ Q26 — What is the final objective statement?

**➡️ Selected statement:**

> Build **Tumble Rush**, a complete single-player 3D battle-royale party game for the browser. A stranger opens a public GitHub Pages link, understands it in seconds, and plays a 6–9 minute show of 16 beans across three distinct rounds: a seeded obstacle race, a collapsing-tile survival round, and a rising-slime final climb. The game must look like a small studio's jam release, run at 60 fps on integrated graphics, support desktop and touch, persist a profile with unlockable cosmetics, synthesize its own soundtrack, pass automated checks, and ship with visual evidence, a verified live deployment, and a README that sells it.

**Decision:** D26. Objective locked.

---

## Shared-understanding checkpoint

The design tree is exhausted. Every branch has a decision, every decision has an owner, and no prerequisite is guessed. The human delegated the choices; this document is the record they would have produced. Implementation proceeds against `docs/SPEC.md` and `docs/TICKETS.md`.
