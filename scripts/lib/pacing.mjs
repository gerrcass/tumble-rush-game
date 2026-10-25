/**
 * Pure pacing math for the M2 full-show harness.
 *
 * Kept as plain ESM so the Node measurement scripts and the Vitest helper tests
 * share one implementation. No browser, no wall clock, no random seeds.
 */

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
  const hexRuns = idleRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
  const crownRuns = idleRuns.map((run) => roundFor(run, 'crown-climb')).filter(Boolean);
  const casualCourseRuns = casualRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
  const livingCrown = crownRuns.filter((round) => round.livingWinner).length;
  const touchingCrown = crownRuns.filter((round) => round.winnerTouchedCrown).length;
  const sugarRush = hexRuns.filter((round) => round.sugarRushReached).length;

  return {
    runs: idleRuns.length,
    casualRuns: casualRuns.length,
    seeds: idleRuns.map((run) => run.seed),
    total: stats(idleRuns.map((run) => run.totalSeconds)),
    roundSeconds: stats(idleRuns.map((run) => run.roundSeconds)),
    course: {
      ...stats(courseRuns.map((round) => round.seconds)),
      finishers: stats(courseRuns.map((round) => round.finishers)),
      qualifiers: stats(courseRuns.map((round) => round.qualified)),
    },
    hexapop: {
      ...stats(hexRuns.map((round) => round.seconds)),
      sugarRushReached: sugarRush,
      sugarRushRate: hexRuns.length === 0 ? 0 : round2(sugarRush / hexRuns.length),
    },
    crown: {
      ...stats(crownRuns.map((round) => round.seconds)),
      livingWinners: livingCrown,
      livingWinnerRate: crownRuns.length === 0 ? 0 : round2(livingCrown / crownRuns.length),
      touchedCrown: touchingCrown,
      touchedCrownRate: crownRuns.length === 0 ? 0 : round2(touchingCrown / crownRuns.length),
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
      'Scripted casual path qualifies 7/10',
      `${summary.casualQualified} / ${summary.casualRuns} (${Math.round(summary.casualRate * 100)}%)`,
      summary.casualRate >= bands.casualQualifyRate,
      { target: '≥ 70%' },
    ),
  );
  checks.push(
    check(
      'hexapop-clock',
      'Hexapop clock 30–50 s',
      `${summary.hexapop.min}–${summary.hexapop.max} s (median ${summary.hexapop.median} s)`,
      summary.hexapop.median >= bands.hexMinSeconds && summary.hexapop.median <= bands.hexMaxSeconds,
      { target: '30–50 s', pending, detail: 'M2-003 owns the Hexapop tuning' },
    ),
  );
  checks.push(
    check(
      'hexapop-sugar-rush',
      'Sugar Rush reached at 45 s',
      `${summary.hexapop.sugarRushReached} / ${summary.runs} (${Math.round(summary.hexapop.sugarRushRate * 100)}%)`,
      summary.hexapop.sugarRushRate >= 0.7,
      { target: '≥ 70% of seeds', pending, detail: 'M2-003 owns the Hexapop tuning' },
    ),
  );
  checks.push(
    check(
      'crown-clock',
      'Crown clock 45–80 s',
      `${summary.crown.min}–${summary.crown.max} s (median ${summary.crown.median} s)`,
      summary.crown.median >= bands.crownMinSeconds && summary.crown.median <= bands.crownMaxSeconds,
      { target: '45–80 s', pending, detail: 'M2-004 owns the Crown tuning' },
    ),
  );
  checks.push(
    check(
      'crown-living-winner',
      'Living crown winner ≥95%',
      `${summary.crown.livingWinners} / ${summary.runs} (${Math.round(summary.crown.livingWinnerRate * 100)}%)`,
      summary.crown.livingWinnerRate >= bands.crownLivingWinnerRate,
      { target: '≥ 95%', pending, detail: 'M2-004 owns the Crown tuning' },
    ),
  );
  checks.push(
    check(
      'crown-touches-crown',
      'Crown winner physically touched the crown',
      `${summary.crown.touchedCrown} / ${summary.runs} (${Math.round(summary.crown.touchedCrownRate * 100)}%)`,
      summary.crown.touchedCrownRate >= bands.crownLivingWinnerRate,
      { target: '≥ 95%', pending, detail: 'no timeout fallback in the winning run' },
    ),
  );
  checks.push(
    check(
      'show-total-target',
      'Median show 3–5 min',
      `${summary.total.median} s (median)`,
      summary.total.median >= bands.showTargetMinSeconds &&
        summary.total.median <= bands.showTargetMaxSeconds,
      { target: '180–300 s', pending, detail: 'depends on M2-003/004 Round clocks' },
    ),
  );
  checks.push(
    check(
      'show-total-bounds',
      'No show <2.5 or >6 min',
      `${summary.total.min}–${summary.total.max} s`,
      summary.total.min >= bands.showFloorSeconds && summary.total.max <= bands.showCeilingSeconds,
      { target: '150–360 s', pending, detail: 'depends on M2-003/004 Round clocks' },
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
  lines.push('Per-round medians (idle, observed full show):');
  lines.push(
    `  Course   ${String(summary.course.median).padStart(6)} s  finishers ${summary.course.finishers.median}  qualifiers ${summary.course.qualifiers.median}`,
  );
  lines.push(
    `  Hexapop  ${String(summary.hexapop.median).padStart(6)} s  Sugar Rush ${Math.round(summary.hexapop.sugarRushRate * 100)}%`,
  );
  lines.push(
    `  Crown    ${String(summary.crown.median).padStart(6)} s  living winner ${Math.round(summary.crown.livingWinnerRate * 100)}%  touched ${Math.round(summary.crown.touchedCrownRate * 100)}%`,
  );
  lines.push(
    `  Total    ${String(summary.total.median).padStart(6)} s (round clocks ${summary.roundSeconds.median} s, incl. intros/results)`,
  );
  lines.push('');
  lines.push('Checks:');
  for (const entry of evaluation.checks) {
    const mark = entry.pending ? 'PENDING' : entry.pass ? 'PASS' : 'FAIL';
    lines.push(`  [${mark.padEnd(7)}] ${entry.label}: ${entry.value} (target ${entry.target})`);
  }
  lines.push('');
  lines.push(
    evaluation.pass
      ? `RESULT: PASS (${evaluation.pending.length} pending Phase B)`
      : `RESULT: FAIL (${evaluation.failed.join(', ')})`,
  );
  return lines.join('\n');
}
