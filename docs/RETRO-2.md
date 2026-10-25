# Retrospective 2 — preparing for M2

This is a second, pre-milestone retrospective. It focuses on the **agent environment** and the measurement gaps exposed by v1, then records the changes made before starting M2.

## What v1 taught us

- The game shipped, but the show is **69 seconds of gameplay**, not the 4–6 minute arc the design wanted. We only discovered this late because there was no repeatable pacing measurement.
- The test suite was green while the real show had qualification and spawn blockers. `verify:show` fixed that class of failure; keep it as a gate.
- The release path (PR evidence, CI, merge, deploy, live verification, cleanup) was run once and worked, but the checklist lived in the session, not the repo.
- The label taxonomy was undocumented. `docs/LABELS.md` now records it.
- The dev host has no GPU. SwiftShader FPS is not a signal; the agent brief now says so, but the manual hardware protocol still needs a home.
- The local npm cache is read-only in this environment. A workspace-local cache is the workaround; make it a script so the next agent does not rediscover it.

## Improvements applied before M2

1. **`npm run measure:show`** — a real-Match pacing harness that reports per-Round clocks, finishers, qualifiers, player status, and living-winner state. Baseline recorded in [`docs/METRICS.md`](METRICS.md).
2. **`docs/METRICS.md`** — the v1 baseline and M2 targets. Every pacing change compares against this file.
3. **`docs/RELEASE.md`** — the pre-flight, review, merge/deploy, and cleanup checklist.
4. **`npm run ci:local`** — clean install with a workspace-local npm cache, then `npm run check`; avoids the read-only home cache.
5. **`npm run evidence`** — one canonical screenshot capture command instead of ad-hoc specs.
6. **Label policy** — [`docs/LABELS.md`](LABELS.md) documents the taxonomy, rules, and v1 history.
7. **Agent brief** — `AGENTS.md` now points at the metrics, release, and label docs and lists the new commands.

## What to change in the next run

- Run `npm run measure:show` **before** touching bot speed or level geometry. Record the baseline in the M2 spec.
- Treat the show duration as a first-class acceptance criterion, not a post-hoc observation.
- Keep the review gate: one independent review session per PR, with a written verdict.
- Timebox implementation sessions and ask for a working slice plus known gaps, rather than perfect polish.
- Keep the real-Match probes; isolated unit setups are useful, but they do not prove the show.

## M2 hypothesis

The show is too short because the bot pack is tuned to finish the Course as fast as possible and the Round ends at the 8th finisher. M2 should slow and humanize the pack, extend the Round clocks where needed, and make Hexapop/Crown Climb last long enough to breathe — without making the game trivial or breaking the 8+ finisher gate. The measurement harness is the tiebreaker.
