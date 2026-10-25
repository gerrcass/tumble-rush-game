# Retrospective — Tumble Rush v1

This is a session retrospective focused on improving the **agent environment** for the next run, not a product changelog. It follows the `retro` skill: read the session, then propose environment changes in the order that would have prevented the most expensive failures.

## What the session did

- Ran a self-answered grill-with-docs session (product frame → game design → engineering), then wrote a spec, 12 tickets, ADRs, a glossary, and an agent brief.
- Implemented in five fresh DeepSeek V4.1 Flash (Max) sessions: foundation/physics/bean, three rounds, show/bots/director, profile/cosmetics/front-end, audio/polish.
- Ran two independent code-review rounds. Round 1 found 2 blockers and 8 high/medium issues; round 2 found 2 blockers in the fixes; round 3 hardening fixed the real-pack and Hexapop-spawn paths.
- Finished with 95 unit tests, 43 Playwright checks, a 243-draw-call / 117k-triangle budget, and a GitHub Pages deployment.

## Highest-value environment improvements

### 1. Add a real-show verification command (automation)
The most expensive failure was **tests passing while the actual 16-bean show was broken**. The isolated `courseRun` test gave each bot brain only itself; the real Match had 5–7 finishers and an idle human qualifying. A single `npm run verify:show` that drives the real Match (16 contestants, no input, seed 20260418 + one other seed), prints finishers/qualifications, and exits non-zero on underfill would have caught this before the first review. Add the same for the real Hexapop spawn path.

**Proposed check:** `scripts/verify-show.mjs` → `npm run verify:show`; run it in CI after unit tests. Assertions: 8+ finishers, idle human ELIMINATED, no eliminated row QUALIFIED, Hexapop player starts on the centre perch and survives the grace.

### 2. Make the SwiftShader limitation explicit in the agent brief (information access)
The phase-4B agent spent time chasing 2–5 fps in a container with no `/dev/dri`. FPS was never a usable signal. The `AGENTS.md` now states this and points at `renderInfo` draw calls/triangles. Keep that note in future worktrees; it saves a full tuning loop.

### 3. Add a `docs/REVIEW-*.md` template and a review gate (navigation + standards)
The reviews were the highest-leverage part of the session, but the findings were free-form. A short template (severity, file:line, user-visible consequence, minimal fix, verification) made the hardening prompts precise. Store the template at `docs/REVIEW-TEMPLATE.md` and require a review file before merging a feature branch. The reviewer should be told to use real-Match probes and to state an explicit release verdict.

### 4. Add a pre-push check and a small `check:release` script (automated checks)
`npm run check` is the green gate, but the e2e suite is 12+ minutes and was often run late. A `check:release` that runs `npm run check` plus the focused review specs (`e2e/review1.spec.ts`, `e2e/review2.spec.ts`) would give a 3–4 minute release gate. A pre-push hook or a `make release-check` alias would make it the default.

### 5. Keep the timebox/steer loop (tool economy)
The subagent runs were productive but tended to over-polish screenshots and camera framing. The parent's timebox steer ("commit in 15 minutes, phase 4B owns the rest") was the right intervention. Encode that as a standard: every implementation delegation gets a **hard timebox + a "ship the working version and list the gap" instruction**, and the parent reviews at the timebox rather than waiting for a perfect report.

### 6. Put evidence capture in one script (navigation)
Evidence specs were rewritten several times (`screenshots.spec.ts`, `review1.spec.ts`, `review2.spec.ts`, temporary `.tmp` scripts). One `npm run evidence` that captures the canonical menu/customize/settings/course/hexapop/crown/victory/mobile frames would reduce drift and keep `docs/evidence/` consistent. The PR can attach those files directly.

### 7. Use a single integration branch and avoid commit-splitting theater (coding standards)
The phase-2 agent tried to split one large change into per-ticket commits by moving files to `.stash/` and temporarily reverting the level factory. That created a non-green intermediate state and wasted time. The parent had to stop it. For a tightly coupled game, one coherent green commit per phase is better than a fake ticket-by-ticket history; record that in `AGENTS.md`.

## What worked

- The self-answered grill produced decisions that held up: three rounds, static hosting, procedural assets, custom physics, one integration branch.
- The domain glossary and ADRs kept names stable (`Tumbler`, `Show`, `Round`, `Qualify`, `Kudos`, `Look`).
- The independent review rounds found real blockers that the test suite missed; the second review was worth the time.
- The show evidence (menu, course, Hexapop, victory, mobile) is strong and reusable in the README.

## Concrete next actions

1. Add `scripts/verify-show.mjs` and `npm run verify:show`; run it in CI.
2. Add `docs/REVIEW-TEMPLATE.md` and a review gate before merge.
3. Add `check:release` (unit + focused review specs) and a pre-push hook.
4. Add `npm run evidence` with the canonical capture list.
5. Keep the SwiftShader note in `AGENTS.md`.
6. Keep the timebox/steer loop for implementation subagents.
