# Retrospective 3 — after M2, before the next milestone

This is the post-M2, pre-milestone retrospective. It focuses on the **agent
environment**: how quickly a run gets a trustworthy answer, how a mistake is
caught, and which prose rules should become mechanical checks. The M2 design
retro is [`RETRO-M2.md`](RETRO-M2.md); this file does not relitigate pacing.

## What worked

- **Measurement before tuning.** The 10-seed full-show harness made pacing a
  property with a number, not a feeling. The same harness is the strongest seam
  for the next milestone.
- **The review round found real product bugs.** `docs/REVIEW-M2.md` caught the
  dead-bean crown and the dais-proximity “touch”, not just style issues. A fresh
  reviewer with the diff is worth the cycle.
- **`npm run check` is a real gate.** It runs invariants, typecheck, 119 unit
  tests (including the 10-seed real-Match pacing test) and a production build.
  A clean checkout is green in under a minute.
- **Deterministic time is now the norm.** `simulate(seconds)` advances fixed
  steps; the Hexapop collapse test went from a 12 s wall-clock wait to a
  deterministic 3–4 s check. This is the pattern to reuse.

## What hurt

### 1. Feedback was serialized behind the slowest suite
The last successful M2 CI run was **19 minutes**: 36 s for the check/build,
2 min for the pacing gate, and **16 minutes for the 49 Playwright checks**.
A failure in the last test meant waiting for the whole suite again, and a
one-character test fix cost a full rerun.

**Environment change:** CI is now three parallel jobs. `check` and `pacing` run
independently, and Playwright runs as a **3-way shard matrix**. A shard failure
no longer hides the other results, and the wall clock for a green run should be
roughly the slowest shard instead of the sum of every spec.

### 2. The repository's invariants lived only in prose
`AGENTS.md` says “never call `Math.random()` in level, bot, or cosmetic
generation”, “no runtime network requests”, and “no console noise”. None of
those had a check. A violation would be found by a reviewer or, worse, in
production.

**Environment change:** `scripts/check-invariants.mjs` now scans the runtime
source and fails with a file and line for:
- `Math.random()` in non-test code (use the seeded `Rng`);
- `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `sendBeacon`;
- runtime `http(s)://` literals (assets must be procedural or bundled);
- `console.log/debug/info` left in shipped code;
- third-party `<script>`/`<link>` tags in `index.html`.

It is part of `npm run check` and `npm run lint`, so it runs before the slower
suites.

### 3. The release checklist was longer than the command
`docs/RELEASE.md` listed check, `verify:show`, the 10-seed pacing gate, the full
Playwright suite and evidence. The package scripts exposed those separately, so
an agent had to remember the sequence and could stop after `check`.

**Environment change:** `npm run gate:release` is the one command that means
“ready to merge”: invariants/typecheck/unit/build, `verify:show`, the Phase B
pacing gate and the full Playwright suite. `check:release` remains the focused
review-spec gate for a quicker loop.

### 4. Evidence attachment was a ritual, not a command
The PR template says screenshots, but the exact upload path was implicit. `gh`
in this environment supports `--attach` on both `pr create` and `pr comment`.

**Environment change:** `docs/RELEASE.md` now shows copyable commands:
`gh pr create --attach ...` and `gh pr comment --attach ...`. The PR body can
reference the local path; `gh` rewrites it to the uploaded asset. Up to 50 files
per command, with `#alt text` after the path.

### 5. Reviews were written, but not scoped
`docs/REVIEW-M2.md` mixed blockers with nits, and the fix pass had to map each
finding back to a ticket. The review template is good; the missing piece is a
rule for the reviewer to state a **user-visible consequence** and a
**verification** for every blocker, and to separate accepted gaps from fixes.

**Environment change:** keep using [`REVIEW-TEMPLATE.md`](REVIEW-TEMPLATE.md);
the next review must give each blocker a consequence and a re-check command,
and the fix pass must list where each finding landed. The release checklist
already asks for a verdict, not a score.

### 6. Test counts and public claims drift
The README claims “119 Vitest unit tests, 49 Playwright checks”; the current
run reports 119 and the last CI run reports 49. That is true today, but the
claim rots on the next test. Public claims should come from a command or be
phrased as capabilities, not fixed counts.

**Environment change:** for the next README update, prefer “unit and Playwright
suites” over counts. If a count stays, it must match `npm run test` and the CI
log in the same release.

## Actions applied in this pass

1. Split CI into `check`, `pacing`, and a 3-shard `e2e` matrix; each job uploads
   only its own evidence, with a 15/20/30-minute timeout.
2. Added `scripts/check-invariants.mjs` and wired it into `check` and `lint`.
3. Added `npm run gate:release` and linked it from `AGENTS.md` and
   `docs/RELEASE.md`.
4. Documented `gh pr create/comment --attach` with examples.
5. Kept `simulate()` as the only way to advance show time in tests; no new
   wall-clock pacing assertions.
6. Updated `AGENTS.md` to point at the current milestone once the next spec
   exists, and to use the sharded CI names when reading a run.

## What the next run should do

- Run `npm run gate:release` before opening the PR, not after a red CI run.
- Use a focused spec (`npx playwright test e2e/smoke.spec.ts -g "..."`) while
  iterating, then one full gate before hand-off.
- Treat `npm run verify:pacing` as the source of truth for pacing and the new
  variety gate (once it exists) as the source of truth for layout variety.
- Keep the independent review round; write `docs/REVIEW-M3.md` with a verdict.
- Record every accepted gap in `docs/METRICS.md` or the review file, never only
  in the session.
