# Issue tracker labels

This repository uses GitHub labels as a lightweight index over the canonical plan in [`docs/TICKETS.md`](TICKETS.md) and [`docs/SPEC.md`](SPEC.md). Labels help filter and route work; they do not replace the ticket's acceptance criteria, its `Blocked by` edges, or the milestone.

This document is the policy of record. If a new label is needed, add it here first.

## Label families

### Kind — exactly one per issue

| Label | Meaning |
| --- | --- |
| `spec` | A product/technical specification. The parent issue for a milestone; it owns the problem statement, user stories, decisions, and testing strategy. |
| `ticket` | A unit of implementation work derived from a spec. Carries scope, acceptance criteria, and blocking edges. |
| `bug` | Something that is broken against the spec or a documented behavior. |
| `documentation` | A docs-only change or a docs gap. |
| `enhancement` | A new capability that is not required to close the current milestone. |
| `question` | A decision or clarification is needed; not agent-grabbable until answered. |
| `accessibility` | A barrier affecting people with disabilities. Can coexist with `bug` or `ticket`. |

`spec` and `ticket` are mutually exclusive. A spec becomes tickets; it does not become implementation work itself.

### Priority — exactly one per ticket

| Label | Meaning |
| --- | --- |
| `p0` | Must ship for the current milestone. A missing `p0` is a release blocker. |
| `p1` | Should ship for the current milestone; can slip to the next milestone with a written reason. |
| `p2` | Later. Not used in the v1 milestone; reserved for post-release work. |

Priority is about the milestone, not about how interesting the work is. A `p0` with a soft dependency still needs a `Blocked by` edge.

### Area — one or more per ticket

| Label | Meaning |
| --- | --- |
| `infra` | Build, CI, deployment, repository plumbing. |
| `engine` | Physics, collision, renderer, camera, input, deterministic RNG. |
| `gameplay` | Player controller, bots, match/show director, qualification, spectating. |
| `content` | Levels, rounds, hazards, props, level grammar. |
| `ux` | Screens, HUD, menus, audio UX, accessibility, responsive layout. |
| `meta` | Profile, progression, economy, cosmetics, persistence. |
| `qa` | Tests, evidence, performance measurement, release verification. |

Area labels describe where the work lives, not who owns it. A ticket can carry more than one area when it cuts across layers (for example, the bean/controller ticket is `engine` + `gameplay`).

### Readiness — optional, meaningful

| Label | Meaning |
| --- | --- |
| `ready-for-agent` | The ticket is refined enough for an implementer agent to start without a human decision: scope, acceptance criteria, and blocking edges are present, and there is no unresolved design question. |
| `help wanted` | A human or outside contributor could pick this up; not necessarily agent-ready. |
| `good first issue` | Small, low-context, safe for a new contributor. |

`ready-for-agent` is a routing signal, **not** a substitute for dependency edges. A ticket with `ready-for-agent` but an open blocker is still blocked. Remove the label when a human decision is required, when the acceptance criteria are still being negotiated, or when the issue is waiting on another ticket. Re-add it only after the ticket is refined again.

### GitHub defaults

`duplicate`, `invalid`, and `wontfix` are used for triage only. They close an issue without implying delivery. `documentation` and `enhancement` are used as kind labels; `bug` and `accessibility` can coexist with a ticket.

## Rules

1. **One kind.** Every issue is either `spec` or `ticket` (or a triage-only kind such as `bug`/`documentation`/`question`). Do not stack `spec` and `ticket`.
2. **One priority per ticket.** `p0`, `p1`, or `p2`. A spec has no priority; its tickets do.
3. **At least one area per ticket.** Use the smallest set that describes the change.
4. **The milestone is the release train.** The current train is `Tumble Rush v1`; a ticket belongs to exactly one milestone. Post-release work gets a new milestone, not a relabeled v1 ticket.
5. **`Blocked by` is authoritative.** Labels are for filtering; the native sub-issue/blocking edges (or the `## Blocked by` section) decide the frontier.
6. **`ready-for-agent` means "no human decision needed."** It does not mean "small" or "important." An agent can grab it, read the spec/ticket, and implement without asking a question.
7. **No dangling work.** A ticket is closed by the PR that implements it, using `Closes #N`, or by a written `wontfix`/`duplicate` decision. The milestone closes only when every ticket is closed and the release evidence exists.
8. **New labels are documented here first.** Prefer an existing label over inventing a synonym.

## How this taxonomy was conceived and how it evolved

The labels were introduced in the initial spec/ticket setup, not designed up front as a formal taxonomy:

- The **kind** labels (`spec`, `ticket`) came from the decision to publish the spec as a parent issue and the 12 tracer tickets as sub-issues.
- The **priority** labels (`p0`, `p1`) came from the milestone plan: everything required to ship v1 versus everything that could slip.
- The **area** labels (`infra`, `engine`, `gameplay`, `content`, `ux`, `meta`, `qa`) were a one-off mapping from the ticket sections. They were useful for filtering but were never written down.
- `ready-for-agent` came from the ticket-writing workflow: tickets are written to be agent-grabbable, with acceptance criteria and blocking edges.
- The milestone and sub-issue relationships came from the decision to make the spec the parent and the tickets its children.

There was no label governance document during v1. The labels on issues #1–#13 are the historical record of that ad-hoc mapping. This file is the retrospective fix: it explains what the labels meant, which rules actually held, and which were implicit. The v1 label set is now frozen; new labels for future milestones should be added here before they are used.

## Examples from v1

| Issue | Labels | Why |
| --- | --- | --- |
| #13 | `spec`, `ready-for-agent` | The spec is the parent issue; it is ready to break into tickets. |
| #1 | `ticket`, `p0`, `infra`, `ready-for-agent` | Foundation, must ship, infrastructure, no open decisions. |
| #4 | `ticket`, `p0`, `gameplay`, `content`, `ready-for-agent` | A Course round is both level content and gameplay. |
| #7 | `ticket`, `p0`, `gameplay`, `ready-for-agent` | Bots and the show director are gameplay, not content. |
| #10 | `ticket`, `p1`, `ux`, `ready-for-agent` | Audio/polish could slip if the core show was at risk. |

Useful queries:

```bash
gh issue list --state all --label p0
gh issue list --state all --label gameplay --label content
gh issue list --state all --label ready-for-agent --milestone "Tumble Rush v1"
```

## What the labels are not

- They are not a substitute for the spec. Read [`docs/SPEC.md`](SPEC.md) before implementing.
- They are not a project plan. The ticket bodies and `Blocked by` edges are the plan.
- They are not a quality signal. `p0` does not mean "well-tested"; the PR evidence and [`docs/REVIEW-TEMPLATE.md`](REVIEW-TEMPLATE.md) do that.
- They are not permanent. A label that stops meaning something should be removed or documented as deprecated, not left to rot.
