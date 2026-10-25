# Release checklist

Use this before merging any feature branch into `main`. It is deliberately short; the detailed acceptance criteria live in the spec and tickets.

## Pre-flight

- [ ] Branch is based on the current `main` and the working tree is clean.
- [ ] `npm run check` passes (typecheck + unit tests + production build).
- [ ] `npm run verify:show` passes (real 16-bean Course + real Hexapop spawn).
- [ ] `npm run test:e2e` passes (full show, mobile, review, evidence).
- [ ] `npm run measure:show` recorded and compared with [`docs/METRICS.md`](METRICS.md); the change has a stated pacing effect.
- [ ] `npm run verify:pacing` passes (or its Phase A pass plus documented Phase B gaps); Hexapop/Crown/show-total are not claimed until M2-003/004.
- [ ] `npm run evidence` refreshed the canonical screenshots.
- [ ] No console errors, no failed network requests, no dead controls.
- [ ] The PR body uses the `pr` skill template and includes the live URL, test plan, and before/after evidence.
- [ ] Screenshots/video attached with `gh pr create --attach` (or `gh pr comment --attach`).
- [ ] The PR links every ticket it closes with `Closes #N`.

## Review

- [ ] An independent review session ran against the branch; findings are in `docs/REVIEW-*.md`.
- [ ] Every BLOCKER/HIGH finding is fixed and re-verified, or explicitly accepted with a reason.
- [ ] The reviewer's verdict is **ready to merge** (or the remaining gaps are documented and accepted).

## Merge and deploy

- [ ] CI is green on the PR.
- [ ] PR merged into `main`; branch deleted.
- [ ] GitHub Pages deploy workflow is green.
- [ ] Public URL returns 200 and the menu loads without console/request errors.
- [ ] README hero/screenshot updated if the UI changed; live link still works.
- [ ] All milestone issues closed; milestone closed.
- [ ] No open issues or PRs without a documented reason.
- [ ] No stale local/remote branches or worktrees.

## Post-release

- [ ] `docs/RETRO-*.md` updated with what the next run should change.
- [ ] `AGENTS.md`/docs updated if the environment or workflow changed.
- [ ] `main` is clean and synced with `origin/main`.
