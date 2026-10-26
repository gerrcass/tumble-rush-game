/**
 * Pure pacing math for the M2 full-show harness.
 *
 * Kept as plain ESM so the Node measurement scripts and the Vitest helper tests
 * share one implementation. No browser, no wall clock, no random seeds.
 */

/**
 * Crown Climb contact geometry. `CrownClimb.ts` exports the same numbers and
 * `pacing.test.ts` asserts they match, so the harness derives touch from the
 * winner's physical y/distance instead of trusting a flag set by the game.
 */
export const CROWN_PHYSICAL = Object.freeze({
  centerY: 49,
  bandRadius: 2.45,
  bandHeight: 1.15,
  beanRadius: 0.42,
  beanHeight: 1.5,
});

/** True only when the winner's capsule physically reaches the crown band. */
export function touchesCrown(winner) {
  if (!winner || winner.finishTime === null || winner.finishTime === undefined) return false;
  const headY = winner.height + CROWN_PHYSICAL.beanHeight;
  if (headY < CROWN_PHYSICAL.centerY) return false;
  if (winner.height > CROWN_PHYSICAL.centerY + CROWN_PHYSICAL.bandHeight / 2) return false;
  return (
    winner.distanceToCrown <= CROWN_PHYSICAL.bandRadius + CROWN_PHYSICAL.beanRadius
  );
}

export const PACING_BANDS = Object.freeze({
  courseMinSeconds: 45,
  courseMaxSeconds: 90,
  courseMinFinishers: 8,
  hexMinSeconds: 30,
  hexMaxSeconds: 50,
  crownMinSeconds: 45,
  crownMaxSeconds: 80,
  crownLivingWinnerRate: 0.95,
  casualQualifyRate: 0.7,
  showTargetMinSeconds: 180,
  showTargetMaxSeconds: 300,
  showFloorSeconds: 150,
  showCeilingSeconds: 360,
});

/** Deterministic 10-seed sweep: the baseline seed first, then a prime stride. */
export const SWEEP_STRIDE = 104729;

export function sweepSeeds(baseSeed, runs) {
  const count = Math.max(1, Math.min(50, Math.floor(runs) || 1));
  return Array.from({ length: count }, (_, index) => (baseSeed + index * SWEEP_STRIDE) >>> 0);
}

export function median(values) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function stats(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return { count: 0, median: 0, min: 0, max: 0 };
  return {
    count: clean.length,
    median: round2(median(clean)),
    min: round2(Math.min(...clean)),
    max: round2(Math.max(...clean)),
  };
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

function roundFor(run, mode) {
  return run.rounds.find((round) => round.mode === mode) ?? null;
}

/**
 * Summarize the idle (no-input) sweep plus the scripted casual sweep. The idle
 * runs own the Course pacing/finisher gate; the casual runs own the human
 * qualification rate. Every show is observed so all three Rounds report even
 * when the idle human is out after the Course.
 */
export function summarize(idleRuns, casualRuns) {
  const courseRuns = idleRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
  const idleHex = idleRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
  const idleCrown = idleRuns.map((run) => roundFor(run, 'crown-climb')).filter(Boolean);
  const casualCourseRuns = casualRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
  const casualHex = casualRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
  const casualCrown = casualRuns.map((run) => roundFor(run, 'crown-climb')).filter(Boolean);
  // H-2: Crown, Hexapop and the show total are summarized over the combined
  // idle + casual set, not idle only. The casual Crown failure was previously
  // measured but never gated or reported.
  const hexRuns = [...idleHex, ...casualHex];
  const crownRuns = [...idleCrown, ...casualCrown];
  const allRuns = [...idleRuns, ...casualRuns];
  const livingCrownRuns = crownRuns.filter((round) => round.livingWinner);
  const livingCrown = livingCrownRuns.length;
  const touchingCrown = crownRuns.filter((round) => round.winnerTouchedCrown).length;
  const sugarRush = hexRuns.filter((round) => round.sugarRushReached).length;
  const crownOutliers = [
    ...idleRuns.map((run) => ({ run, round: roundFor(run, 'crown-climb') })),
    ...casualRuns.map((run) => ({ run, round: roundFor(run, 'crown-climb') })),
  ]
    .filter(({ round }) => round && !round.livingWinner)
    .map(({ run, round }) => ({
      seed: run.seed,
      mode: run.mode,
      seconds: round.seconds,
      winner: round.winner,
      winnerTouchedCrown: round.winnerTouchedCrown,
      winnerHeight: round.winnerHeight ?? null,
      winnerDistanceToCrown: round.winnerDistanceToCrown ?? null,
    }));

  return {
    runs: idleRuns.length,
    casualRuns: casualRuns.length,
    combinedRuns: allRuns.length,
    seeds: idleRuns.map((run) => run.seed),
    total: {
      ...stats(allRuns.map((run) => run.totalSeconds)),
      idle: stats(idleRuns.map((run) => run.totalSeconds)),
      casual: stats(casualRuns.map((run) => run.totalSeconds)),
    },
    roundSeconds: stats(allRuns.map((run) => run.roundSeconds)),
    course: {
      ...stats(courseRuns.map((round) => round.seconds)),
      finishers: stats(courseRuns.map((round) => round.finishers)),
      qualifiers: stats(courseRuns.map((round) => round.qualified)),
    },
    hexapop: {
      ...stats(hexRuns.map((round) => round.seconds)),
      idle: stats(idleHex.map((round) => round.seconds)),
      casual: stats(casualHex.map((round) => round.seconds)),
      sugarRushReached: sugarRush,
      sugarRushRate: hexRuns.length === 0 ? 0 : round2(sugarRush / hexRuns.length),
    },
    crown: {
      ...stats(crownRuns.map((round) => round.seconds)),
      idle: stats(idleCrown.map((round) => round.seconds)),
      casual: stats(casualCrown.map((round) => round.seconds)),
      living: stats(livingCrownRuns.map((round) => round.seconds)),
      livingWinners: livingCrown,
      livingWinnerRate: crownRuns.length === 0 ? 0 : round2(livingCrown / crownRuns.length),
      touchedCrown: touchingCrown,
      touchedCrownRate: crownRuns.length === 0 ? 0 : round2(touchingCrown / crownRuns.length),
      noWinnerRuns: crownRuns.length - livingCrown,
      outliers: crownOutliers,
    },
    idleQualified: courseRuns.filter((round) => round.playerQualified).length,
    casualQualified: casualCourseRuns.filter((round) => round.playerQualified).length,
    casualRate:
      casualCourseRuns.length === 0
        ? 0
        : round2(casualCourseRuns.filter((round) => round.playerQualified).length / casualCourseRuns.length),
  };
}

function check(id, label, value, pass, options = {}) {
  return {
    id,
    label,
    value,
    pass: Boolean(pass),
    pending: Boolean(options.pending),
    target: options.target ?? '',
    detail: options.detail ?? '',
  };
}

/**
 * The M2 gate. Phase A treats Hexapop/Crown/Show-total as PENDING because
 * M2-003/004 own those bands; `phase: 'b'` makes every band hard.
 */
export function evaluatePacing(summary, { phase = 'a' } = {}) {
  const bands = PACING_BANDS;
  const pending = phase !== 'b';
  const course = summary.course;
  const hexapop = summary.hexapop;
  const crown = summary.crown;
  const total = summary.total;
  const crownRuns = crown.count;
  const checkDetail = pending ? 'M2-003/004 own these Round tunings' : '';
  const checks = [];

  checks.push(
    check(
      'course-clock',
      'Course clock 45–90 s (median + every seed)',
      `${course.min}–${course.max} s (median ${course.median} s)`,
      course.median >= bands.courseMinSeconds &&
        course.median <= bands.courseMaxSeconds &&
        course.min >= bands.courseMinSeconds &&
        course.max <= bands.courseMaxSeconds,
      { target: '45–90 s' },
    ),
  );
  checks.push(
    check(
      'course-finishers',
      'Course 8+ real finishers',
      `${course.finishers.min}–${course.finishers.max} (median ${course.finishers.median})`,
      course.finishers.min >= bands.courseMinFinishers,
      { target: '8+ finishers every seed' },
    ),
  );
  checks.push(
    check(
      'idle-never-qualifies',
      'Idle human never qualifies',
      `${summary.idleQualified} / ${summary.runs} runs qualified`,
      summary.idleQualified === 0,
      { target: '0' },
    ),
  );
  checks.push(
    check(
      'casual-qualifies',
      'Scripted casual path meets the 70% qualification target',
      `${summary.casualQualified} / ${summary.casualRuns} (${Math.round(summary.casualRate * 100)}%)`,
      summary.casualRate >= bands.casualQualifyRate,
      { target: '≥ 70%' },
    ),
  );
  checks.push(
    check(
      'hexapop-clock',
      'Hexapop clock 30–50 s (idle + casual, every seed)',
      `${hexapop.min}–${hexapop.max} s (median ${hexapop.median} s)`,
      hexapop.median >= bands.hexMinSeconds &&
        hexapop.median <= bands.hexMaxSeconds &&
        hexapop.min >= bands.hexMinSeconds &&
        hexapop.max <= bands.hexMaxSeconds,
      { target: '30–50 s', pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'hexapop-sugar-rush',
      'Sugar Rush reached at 45 s',
      `${hexapop.sugarRushReached} / ${hexapop.count} (${Math.round(hexapop.sugarRushRate * 100)}%)`,
      hexapop.sugarRushRate >= 0.7,
      { target: '≥ 70% of seeds', pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'crown-clock',
      'Crown clock 45–80 s (living-winner runs, every seed)',
      crown.livingWinners === 0
        ? 'no living Crown winners'
        : `${crown.living.min}–${crown.living.max} s (median ${crown.living.median} s, ${crown.livingWinners} runs)`,
      crown.livingWinners > 0 &&
        crown.living.min >= bands.crownMinSeconds &&
        crown.living.max <= bands.crownMaxSeconds,
      { target: '45–80 s', pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'crown-living-winner',
      `Living crown winner ≥95% (idle + casual, ${crownRuns} runs)`,
      `${crown.livingWinners} / ${crownRuns} (${Math.round(crown.livingWinnerRate * 100)}%)`,
      crown.livingWinnerRate >= bands.crownLivingWinnerRate,
      { target: `≥ ${Math.ceil(crownRuns * bands.crownLivingWinnerRate)} / ${crownRuns}`, pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'crown-no-hidden-outlier',
      'At most one no-winner Crown run, and it is reported',
      `${crown.noWinnerRuns} no-winner run(s)`,
      crown.noWinnerRuns <= 1,
      {
        target: '≤ 1, listed in docs/METRICS.md',
        pending,
        detail: crown.outliers.length
          ? crown.outliers
              .map((run) => `${run.mode} seed ${run.seed}${run.winner ? ` (${run.winner})` : ''}`)
              .join(', ')
          : checkDetail,
      },
    ),
  );
  checks.push(
    check(
      'crown-touches-crown',
      'Crown winner physically touched the crown (y + horizontal radius)',
      `${crown.touchedCrown} / ${crownRuns} (${Math.round(crown.touchedCrownRate * 100)}%)`,
      crown.touchedCrownRate >= bands.crownLivingWinnerRate,
      { target: '≥ 95% (physical contact, not finish flag)', pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'show-total-target',
      'Median show 3–5 min (idle + casual)',
      `${total.median} s (median)`,
      total.median >= bands.showTargetMinSeconds &&
        total.median <= bands.showTargetMaxSeconds,
      { target: '180–300 s', pending, detail: checkDetail },
    ),
  );
  checks.push(
    check(
      'show-total-bounds',
      'No show <2.5 or >6 min (idle + casual, every seed)',
      `${total.min}–${total.max} s`,
      total.min >= bands.showFloorSeconds && total.max <= bands.showCeilingSeconds,
      { target: '150–360 s', pending, detail: checkDetail },
    ),
  );

  const failed = checks.filter((entry) => !entry.pending && !entry.pass);
  return {
    phase,
    checks,
    pass: failed.length === 0,
    failed: failed.map((entry) => entry.id),
    pending: checks.filter((entry) => entry.pending).map((entry) => entry.id),
  };
}

/** Human-readable report for `verify:pacing`. */
export function formatReport(summary, evaluation) {
  const lines = [];
  lines.push('Tumble Rush M2 pacing sweep');
  lines.push(
    `seeds: ${summary.seeds.join(', ')}  |  idle runs: ${summary.runs}  |  casual runs: ${summary.casualRuns}`,
  );
  lines.push('');
  lines.push('Per-round clocks (idle + casual, observed full show):');
  lines.push(
    `  Course   ${String(summary.course.median).padStart(6)} s  finishers ${summary.course.finishers.median}  qualifiers ${summary.course.qualifiers.median}`,
  );
  lines.push(
    `  Hexapop  ${String(summary.hexapop.median).padStart(6)} s  idle ${summary.hexapop.idle.median} s / casual ${summary.hexapop.casual.median} s  Sugar Rush ${Math.round(summary.hexapop.sugarRushRate * 100)}%`,
  );
  lines.push(
    `  Crown    ${String(summary.crown.median).padStart(6)} s  idle ${summary.crown.idle.median} s / casual ${summary.crown.casual.median} s  living ${summary.crown.livingWinners}/${summary.crown.count}  touched ${summary.crown.touchedCrown}/${summary.crown.count}`,
  );
  lines.push(
    `  Total    ${String(summary.total.median).padStart(6)} s  idle ${summary.total.idle.median} s / casual ${summary.total.casual.median} s (incl. intros/results)`,
  );
  lines.push('');
  lines.push('Crown clock, per living-winner run:');
  lines.push(
    `  ${summary.crown.living.count} runs  ${summary.crown.living.min}–${summary.crown.living.max} s  median ${summary.crown.living.median} s`,
  );
  if (summary.crown.outliers.length > 0) {
    lines.push('');
    lines.push('Crown no-winner outliers (reported, never hidden):');
    for (const run of summary.crown.outliers) {
      lines.push(
        `  ${run.mode} seed=${run.seed} clock=${run.seconds}s winner=${run.winner ?? 'none'} touched=${run.winnerTouchedCrown} y=${run.winnerHeight ?? '—'} d=${run.winnerDistanceToCrown ?? '—'}`,
      );
    }
  }
  lines.push('');
  lines.push('Checks:');
  for (const entry of evaluation.checks) {
    const mark = entry.pending ? 'PENDING' : entry.pass ? 'PASS' : 'FAIL';
    lines.push(`  [${mark.padEnd(7)}] ${entry.label}: ${entry.value} (target ${entry.target})`);
    if (!entry.pass && entry.detail && !entry.pending) lines.push(`            ${entry.detail}`);
  }
  lines.push('');
  lines.push(
    evaluation.pass
      ? `RESULT: PASS (${evaluation.pending.length} pending Phase B)`
      : `RESULT: FAIL (${evaluation.failed.join(', ')})`,
  );
  return lines.join('\n');
}
