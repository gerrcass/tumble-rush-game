# Metrics and pacing baseline

This file is the measurement record for the show. It exists so a tuning change can be compared against a real baseline instead of a feeling.

## How to measure

```bash
npm run measure:show                         # seed 20260418, one run
npm run measure:show -- --seed=7 --runs=3    # repeat a seed
```

The script starts a private Vite dev server (or uses `TUMBLE_URL` for an existing dev server), drives the real `Match` with **no player input**, and reports each Round's in-game clock, finishers, qualifiers, player status, and whether the winner was alive. It excludes intro/results overlay time and measures each Round independently, so it is a stable pacing signal.

## v1 baseline — 2026-10-25, commit `5e61ac2`

| Round | Duration | Qualifiers | Finishers | Player (idle) | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| Sunrise Scramble | 26.03 s | 8 | 8 | ELIMINATED | 8th bot finishes at 26 s; a casual human has no realistic qualification window |
| Hexapop | 6.15 s | 4 | — | ELIMINATED | Round resolves long before the 45 s Sugar Rush |
| Crown Climb | 36.48 s | 1 | 1 | ELIMINATED | Living winner on this seed; fallback still exists on weaker seeds |
| **Total gameplay** | **68.66 s** | | | | ~1.1 minutes; not the 4–6 minute show target |

Additional v1 numbers:

- Draw calls / triangles at the 1440×810 high Course start: **243 / 117,160** (budget 250 / 120k).
- Hardware FPS: **not validated** on the dev host. It is SwiftShader-only (no `/dev/dri`); recorded high/low FPS is not a hardware signal.
- `npm run verify:show`: real 16-bean Course + real Hexapop spawn gate passes.

## M2 targets

| Signal | v1 baseline | M2 target |
| --- | ---: | ---: |
| Course Round clock | 26 s | 80–120 s |
| Hexapop Round clock | 6 s | 30–50 s |
| Crown Climb Round clock | 36 s | 45–80 s |
| Total gameplay | 69 s | 3–4 min (4–6 min with overlays) |
| Course real finishers | 8 | 8+ |
| Idle human qualification | never | never |
| Living crown winner | seed-dependent | ≥95% of seeds |
| Hardware FPS | unverified | ≥55 fps at 1080p high on a real GPU |

## Measurement caveats

- The baseline is a **no-input** run. A human who plays the Course will take longer than the bots; the target is that the human's run is still meaningful and the show does not end before they can participate.
- The total is the sum of the three Round clocks. Intro cards, countdowns, and results add roughly 25–35 seconds of wall-clock show time.
- FPS is only meaningful on hardware WebGL. Use `window.__tumble.renderInfo` for draw calls/triangles in this environment; validate FPS manually on a real GPU and record it here.
