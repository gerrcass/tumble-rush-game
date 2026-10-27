# Retrospective 4 — after M3, before M4

This is the post-M3, pre-M4 retrospective. It focuses on the **agent
environment** — how the M3 run spent its context, which mistakes a machine could
have caught, and what the next implementation session should do differently. The
M3 product record is [`RETRO-M3.md`](RETRO-M3.md); this file does not relitigate
the remix.

The primary source was the recorded M3 sessions in the local OpenCode database:
the implementation session (759,891 input / 116,464 output tokens, 351 assistant
turns, 365 minutes), the two independent review sessions, and the M3 CI runs.

## What worked

- **One pure plan, one gate.** `planShow(seed)` let the Course, Hexapop, Show
  Card and variety gate agree. The 12-seed sweep found real route/arena variety
  (12/12 signatures, 3/3 arenas) and kept every M2 band.
- **The independent two-axis review found real bugs.** The finish-checker strip
  and the D/F pusher-base double count were visible only in the built level, not
  in the plan tests. A fresh reviewer with the diff is still worth the cycle.
- **CI is parallel and honest.** The M3 PR run took **13m35s** wall clock:
  check 31s, pacing 2m31s, variety 3m01s, e2e shards 6m/8m/14m. A failure in one
  job no longer hides the rest.
- **Real-Match probes held the line.** The 24/24 living, physically-touching
  Crown winners and 0/12 idle qualifiers are measured, not claimed.

## What hurt

### 1. Every shell call paid for a redundant `cd` (tool economy)

**276 of 303** shell calls in the M3 implementation session began with
`cd /home/gerrcass/.t3/projects/tumble-rush-game && …`. The shell already runs in
the workspace; the prefix cost roughly 16k characters across the run and made
every command harder to read. The harness exposes a `workdir` argument for the
rare call that needs another directory.

**Environment change:** `AGENTS.md` now states: shell calls run at the repo root;
pass `workdir` instead of prefixing `cd`; use the file tools for file reads.

### 2. Long background runs were polled with `sleep` (tool economy)

The session contained **eight `sleep` calls** (20–120 s, about seven minutes
total) waiting for Playwright/evidence runs. The shell tool can run a command in
the background and notify on completion; polling burns turns and context.

**Environment change:** `AGENTS.md` now says to use `background: true` for
suites that outlast the turn, then continue with independent work. Do not
`sleep`-poll. `gh run watch` remains the CI equivalent.

### 3. The release checklist lost four merged remote branches (automated check)

`chore/retro-m3-hardening`, `docs/m3-remix-plan`, `feat/m3-remix`, and
`fix/m2-spectate-frame` were all squash-merged but still existed on `origin`.
The checklist said "remove branches" but nothing could fail on it.

**Environment change:** `npm run release:audit` is a read-only report of dirty
files, branch position, open PRs/issues, remote branches (marked merged or not),
and worktrees; `--strict` exits non-zero. The M3 branches were deleted in this
pass. The release workflow now runs the audit before hand-off, not after.

### 4. Documentation commands and links could rot silently (automated check)

The M3 review found `AGENTS.md` still describing `gate:release` without
`verify:variety`, and `IMPLEMENTATION-NOTES.md` claiming a different arena than
the build. The fixes were manual. `npm run check` had no documentation check, so
a stale `npm run` or a dead evidence link was invisible until a human read it.

**Environment change:** `scripts/check-docs.mjs` verifies every `npm run
<script>` in README/AGENTS/GLOSSARY/docs against `package.json`, every relative
Markdown link, and every `docs/evidence/...` path. It runs in `npm run lint` and
`npm run check` before typecheck.

### 5. The finish-checker bug had no level-level guard (automated check)

The hazard-drift test caught moving colliders, but the visual finish strip was
not a collider and had no assertion. The review found it by reading the code and
the screenshot. A marker-placement test would have caught it without a reviewer.

**Environment change:** `Course` exposes `finishGateZs` and `finishLineZs`, and
`courseRoutes.test.ts` asserts both sit in section E and within 1 u / 5 u of the
planned lap finish. A future double-counted cursor fails on the first seed.

### 6. Evidence and README drift (process)

`docs/readme-hero.png` was modified but uncommitted after the M3 release, and
the README's menu image therefore no longer matched `HEAD`. The M3 hero is now
committed. The next release must capture the hero from the live Pages build
after the deploy, not before it.

**Environment change:** `docs/RELEASE.md` and the delivery workflow point at the
post-deploy capture; the release audit reports a dirty tree.

## Applied in this pass

1. `AGENTS.md`: shell `workdir`, background suites, file tools, docs check,
   release audit, remote-branch cleanup.
2. `scripts/check-docs.mjs` + `npm run docs:check`, wired into `lint` and
   `check`.
3. `scripts/release-audit.mjs` + `npm run release:audit` and `--strict`.
4. `Course.finishGateZs` / `finishLineZs` + the finish-marker test.
5. The refreshed M3 README hero committed.
6. The four stale remote branches deleted.
7. The duplicate `docs/evidence/variety/...` reference in `METRICS.md` removed.

## What the next run should do

- Read `AGENTS.md`, `docs/m4/GRILL.md`, `docs/m4/SPEC.md`, `docs/m4/TICKETS.md`,
  and `docs/METRICS.md` in that order; the spec is the contract, the metrics are
  the baseline.
- Use `npm run check` as the inner loop; use `npm run gate:release` once, before
  the PR is marked ready, not after a red CI run.
- Use `npm run release:audit -- --strict` after the merge/deploy and before
  reporting completion.
- Keep the two-axis independent review and require a user-visible consequence
  plus a re-check command for every blocker.
- Record every accepted gap in `docs/METRICS.md` or the review file, never only
  in the session.
