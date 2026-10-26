# AGENTS.md — Tumble Rush

Tumble Rush is a complete single-player 3D battle-royale party game for the browser. Use [`GLOSSARY.md`](GLOSSARY.md) for domain language. The current milestone is **M3 — Remix Season**; read [`docs/m3/SPEC.md`](docs/m3/SPEC.md), [`docs/m3/TICKETS.md`](docs/m3/TICKETS.md), and [`docs/METRICS.md`](docs/METRICS.md). Current code seams are mapped in [`docs/m3/IMPLEMENTATION-NOTES.md`](docs/m3/IMPLEMENTATION-NOTES.md). The v1 product spec remains [`docs/SPEC.md`](docs/SPEC.md) for architecture and UX invariants. The M2 pacing record is [`docs/RETRO-M2.md`](docs/RETRO-M2.md) and [`docs/METRICS.md`](docs/METRICS.md). The decisions behind the design are in [`docs/GRILL.md`](docs/GRILL.md), [`docs/m2/GRILL.md`](docs/m2/GRILL.md), [`docs/m3/GRILL.md`](docs/m3/GRILL.md), and [`docs/adr/`](docs/adr/). The issue-label policy is in [`docs/LABELS.md`](docs/LABELS.md).

## First run

```bash
npm ci
npm run dev          # http://localhost:5173
npm run check        # invariants + typecheck + unit tests + production build
npm run lint         # invariants + typecheck
npm run gate:release # check + verify:show + 10-seed pacing + 12-seed variety + full Playwright
npm run verify:show  # real 16-bean Course + real Hexapop spawn
npm run measure:show # pacing baseline; see docs/METRICS.md
npm run verify:pacing # historical 10-seed pacing gate
npm run verify:variety # 12-seed route/arena + M2 band gate
npm run test:e2e     # Playwright smoke + screenshots (set TUMBLE_E2E_PORT if 5173 is occupied)
npm run evidence     # canonical screenshot set
npm run ci:local     # clean install with workspace-local npm cache + check
```

Node 22. Use the committed lockfile. GitHub CLI is authenticated; the repo is `gerrcass/tumble-rush-game`. The release checklist is [`docs/RELEASE.md`](docs/RELEASE.md); pacing baselines and targets are [`docs/METRICS.md`](docs/METRICS.md). The agent-environment retro is [`docs/RETRO-M3.md`](docs/RETRO-M3.md).

## Architecture

- `src/app/` — screen router, menus, HUD, overlays. DOM/CSS only; no framework.
- `src/game/` — render loop, match/director, physics, beans, bots, levels, FX, audio, profile.
- `src/test/` — Vitest unit tests. `e2e/` — Playwright specs and screenshot script.
- `docs/` — spec, tickets, grill, retro, `evidence/` screenshots.
- `.github/workflows/` — `ci.yml` (parallel check, pacing, variety, and 3-shard e2e) and `deploy.yml` (GitHub Pages).

`Game` owns the renderer, clock, and quality settings. `Match` owns the show state machine and talks to the HUD through events. Levels build geometry and colliders; they never own game state. The physics world is the only place that mutates bean positions during a step.

## Invariants

- **Fixed step.** Physics advances at 1/60 s with an accumulator; never scale collision resolution by render delta.
- **Seeded.** Every layout decision comes from `Rng` using the show seed. The daily seed is `YYYY-MM-DD`. Never call `Math.random()` in level, bot, or cosmetic generation.
- **Relocatable sections.** Course sections start and end height-neutral, own their checkpoint and waypoints, and are composed by the route planner. A section never owns the route or the finish gate.
- **Measured variety.** A Course route or Hexapop arena change must pass the M3 variety gate; no variant is exempt from the pacing bands.
- **Same rules for everyone.** Bots use the same controller and physics as the player. Pacing adjusts target speed only; never teleport or grant free jumps.
- **Procedural assets.** Geometry, textures, particles, and audio are generated in code. One bundled font (`@fontsource-variable/fredoka`) is allowed. No runtime network requests, CDN links, copied game assets, or trademarked names.
- **Static host.** The build must work under `/tumble-rush-game/`. Resolve asset URLs through Vite; never hard-code `/`.
- **Dispose.** On round/screen teardown, dispose geometries, materials, textures, render targets, and listeners. Long sessions must not leak.
- **Green build.** `npm run check` passes before every commit. No new `any` in public APIs, no console errors, no dead buttons.
- **Comedy first.** When a physics or animation choice is ambiguous, pick the readable, funny outcome that the player can understand and recover from.

## UX contract

- Every screen is keyboard-reachable, has a visible focus state, and has a way back.
- Any gameplay state can be paused with Esc. Pause freezes physics and ducks audio.
- Touch controls are 44 px minimum and never cover the HUD's critical values.
- Settings apply immediately and persist. Audio only starts after a user gesture.
- Elimination is fast and legible; a spectator can skip to results.

## Testing and evidence

- Unit tests cover physics rest/jump/slide/platform/kill-plane, RNG determinism, director ties/qualifiers, and profile migration.
- Playwright must prove: menu renders with no console errors, a show starts and reaches gameplay, mobile touch controls exist, settings toggle persists.
- `window.__tumble` is the test hook. Keep it available in dev/test builds; do not ship a debug overlay enabled in production.
- Each PR needs visual evidence captured from the real build: menu, both Course route beats, all three Hexapop arenas, final, victory, and the Show Card. Store them in `docs/evidence/` and attach them to the PR with `gh --attach`.
- Performance gate: ≥55 fps at 1080p high on real hardware; low quality must preserve playability. **This host is SwiftShader-only (no `/dev/dri`), so FPS is not a hardware signal.** Use `window.__tumble.renderInfo` draw calls/triangles and report the hardware-FPS gap instead of optimizing for software FPS.
- Release gate: `npm run gate:release` runs invariants/typecheck/unit/build, `verify:show`, the 10-seed pacing gate, the 12-seed variety gate, and the full Playwright suite. `npm run check:release` is the focused review loop. M3 adds the 12-seed variety gate; it runs in CI and is authoritative for route/arena variety.
- Real-Match probes beat isolated unit setups for show bugs. `docs/REVIEW-*.md` records the independent review rounds; add a new review file when a round finds blockers.
- Use `window.__tumble.simulate(seconds)` for deterministic test time. Wall-clock waits fail on SwiftShader (the fixed loop advances ~0.15× real time at 3 fps).

## Delivery workflow

1. Work on `feat/m3-remix`, one commit (or a small coherent series) per ticket in [`docs/m3/TICKETS.md`](docs/m3/TICKETS.md).
2. Keep the ticket list in `docs/m3/TICKETS.md` updated only when scope genuinely changes.
3. Run `npm run check` and the focused Playwright spec while iterating; run `npm run gate:release` before pushing the release commit.
4. Open one PR into `main` with the live URL, test plan, and attached screenshots. Use the `pr` skill for the body; link and close every ticket issue with `Closes #N`.
5. After merge, wait for the Pages deploy, load the public URL, capture the README screenshot from it, and close the milestone.
6. Remove branches/worktrees and leave no open PR or issue without a documented reason.

Live target: <https://gerrcass.github.io/tumble-rush-game/>. The canonical deployment is GitHub Pages from `main` through Actions.
