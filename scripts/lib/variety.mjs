/**
 * Pure variety math for the M3 12-seed gate.
 *
 * Plain ESM so the Node gate and the Vitest negative test share one
 * implementation. No browser, no wall clock, no randomness.
 */

export const VARIETY_TARGETS = Object.freeze({
  seeds: 12,
  distinctCourseSignatures: 8,
  arenaPlans: 3,
  newSectionShows: 4,
  courseMinSeconds: 45,
  courseMaxSeconds: 90,
  courseMinFinishers: 8,
  hexMinSeconds: 30,
  hexMaxSeconds: 50,
  crownMinSeconds: 45,
  crownMaxSeconds: 80,
  showFloorSeconds: 150,
  showCeilingSeconds: 360,
  showTargetMinSeconds: 180,
  showTargetMaxSeconds: 300,
  idleMaxQualified: 0,
  casualMinQualified: 8,
  livingWinnerMin: 23,
  totalRuns: 24,
});

function roundFor(run, mode) {
  return run.rounds?.find((round) => round.mode === mode) ?? null;
}

function check(id, label, value, pass, target) {
  return { id, label, value, pass: Boolean(pass), target };
}

function median(values) {
  const clean = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 === 1
    ? clean[middle]
    : (clean[middle - 1] + clean[middle]) / 2;
}

function sectionShows(plans, sectionId) {
  return plans.filter((plan) => {
    if (Array.isArray(plan.lapRoutes)) {
      return plan.lapRoutes.some((lap) => lap.includes(sectionId));
    }
    return String(plan.courseSignature ?? '')
      .split('/')
      .some((lap) => lap.split('-').includes(sectionId));
  }).length;
}

/** The 12-seed card table: one row per seed, both modes. */
export function varietyRows(idleRuns, casualRuns) {
  const bySeed = new Map();
  for (const run of idleRuns) {
    bySeed.set(run.seed, {
      seed: run.seed,
      signature: run.plan?.courseSignature ?? '—',
      arena: run.plan?.arenaLabel ?? '—',
      showLabel: run.plan?.label ?? '—',
      idle: run,
      casual: null,
    });
  }
  for (const run of casualRuns) {
    const row = bySeed.get(run.seed) ?? {
      seed: run.seed,
      signature: run.plan?.courseSignature ?? '—',
      arena: run.plan?.arenaLabel ?? '—',
      showLabel: run.plan?.label ?? '—',
      idle: null,
      casual: null,
    };
    row.casual = run;
    row.signature = row.signature === '—' ? (run.plan?.courseSignature ?? '—') : row.signature;
    row.arena = row.arena === '—' ? (run.plan?.arenaLabel ?? '—') : row.arena;
    row.showLabel = row.showLabel === '—' ? (run.plan?.label ?? '—') : row.showLabel;
    bySeed.set(run.seed, row);
  }
  return [...bySeed.values()].sort((a, b) => a.seed - b.seed);
}

function rowCells(row, mode) {
  const run = row[mode];
  if (!run) return null;
  const course = roundFor(run, 'course');
  const hex = roundFor(run, 'hexapop');
  const crown = roundFor(run, 'crown-climb');
  return {
    mode,
    total: run.totalSeconds,
    course: course?.seconds ?? null,
    finishers: course?.finishers ?? null,
    playerQualified: Boolean(course?.playerQualified),
    hex: hex?.seconds ?? null,
    sugarRush: Boolean(hex?.sugarRushReached),
    crown: crown?.seconds ?? null,
    living: Boolean(crown?.livingWinner),
    touched: Boolean(crown?.winnerTouchedCrown),
  };
}

export function evaluateVariety(idleRuns, casualRuns) {
  const allRuns = [...idleRuns, ...casualRuns];
  const plans = idleRuns.map((run) => run.plan).filter(Boolean);
  const signatures = new Set(plans.map((plan) => plan.courseSignature));
  const arenas = new Set(plans.map((plan) => plan.arena));
  const fShows = sectionShows(plans, 'F');
  const gShows = sectionShows(plans, 'G');
  const courseRuns = allRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
  const hexRuns = allRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
  const crownRuns = allRuns.map((run) => roundFor(run, 'crown-climb')).filter(Boolean);
  const living = crownRuns.filter((round) => round.livingWinner);
  const touched = crownRuns.filter((round) => round.winnerTouchedCrown);
  const totals = allRuns.map((run) => run.totalSeconds);
  const idleQualified = idleRuns
    .map((run) => roundFor(run, 'course'))
    .filter((round) => round?.playerQualified).length;
  const casualQualified = casualRuns
    .map((run) => roundFor(run, 'course'))
    .filter((round) => round?.playerQualified).length;

  const badCourse = courseRuns.filter(
    (round) =>
      round.seconds < VARIETY_TARGETS.courseMinSeconds ||
      round.seconds > VARIETY_TARGETS.courseMaxSeconds ||
      round.finishers < VARIETY_TARGETS.courseMinFinishers,
  );
  const badHex = hexRuns.filter(
    (round) =>
      round.seconds < VARIETY_TARGETS.hexMinSeconds ||
      round.seconds > VARIETY_TARGETS.hexMaxSeconds ||
      !round.sugarRushReached,
  );
  const badCrownClock = living.filter(
    (round) =>
      round.seconds < VARIETY_TARGETS.crownMinSeconds ||
      round.seconds > VARIETY_TARGETS.crownMaxSeconds,
  );
  const noWinner = crownRuns.length - living.length;
  const badTotal = totals.filter(
    (seconds) =>
      seconds < VARIETY_TARGETS.showFloorSeconds || seconds > VARIETY_TARGETS.showCeilingSeconds,
  );
  const totalMedian = median(totals);

  const checks = [
    check(
      'distinct-routes',
      'At least 8 distinct Course signatures across 12 seeds',
      `${signatures.size} / 12`,
      signatures.size >= VARIETY_TARGETS.distinctCourseSignatures,
      '≥ 8',
    ),
    check(
      'arena-variety',
      'All three Hexapop arena plans appear',
      `${arenas.size} / 3`,
      arenas.size >= VARIETY_TARGETS.arenaPlans,
      '3 / 3',
    ),
    check(
      'new-section-f',
      'Tumbler Tangle (F) appears in at least 4 shows',
      `${fShows} / 12`,
      fShows >= VARIETY_TARGETS.newSectionShows,
      '≥ 4',
    ),
    check(
      'new-section-g',
      'Bounce Bazaar (G) appears in at least 4 shows',
      `${gShows} / 12`,
      gShows >= VARIETY_TARGETS.newSectionShows,
      '≥ 4',
    ),
    check(
      'course-bands',
      'Every run: Course 45–90 s and 8+ finishers',
      badCourse.length === 0
        ? `${courseRuns.length} / ${courseRuns.length} runs`
        : `${badCourse.length} bad run(s)`,
      badCourse.length === 0,
      '45–90 s, 8+',
    ),
    check(
      'hex-bands',
      'Every run: Hexapop 30–50 s with Sugar Rush reached',
      badHex.length === 0 ? `${hexRuns.length} / ${hexRuns.length} runs` : `${badHex.length} bad run(s)`,
      badHex.length === 0,
      '30–50 s, 100%',
    ),
    check(
      'crown-bands',
      'Crown 45–80 s with a living physical touch; ≥23/24',
      `${living.length} living / ${touched.length} touched of ${crownRuns.length}` +
        (badCrownClock.length ? `, ${badCrownClock.length} outside 45–80 s` : ''),
      noWinner <= 1 && badCrownClock.length === 0 && touched.length >= 23,
      '≤1 no-winner, 23/24',
    ),
    check(
      'show-bands',
      'Every show 150–360 s and median 180–300 s',
      `${Math.min(...totals)}–${Math.max(...totals)} s, median ${totalMedian} s`,
      badTotal.length === 0 &&
        totalMedian >= VARIETY_TARGETS.showTargetMinSeconds &&
        totalMedian <= VARIETY_TARGETS.showTargetMaxSeconds,
      '150–360 s / 180–300 s',
    ),
    check(
      'idle-human',
      'Idle human never qualifies',
      `${idleQualified} / ${idleRuns.length}`,
      idleQualified <= VARIETY_TARGETS.idleMaxQualified,
      '0 / 12',
    ),
    check(
      'casual-human',
      'Scripted casual human qualifies at least 8/12',
      `${casualQualified} / ${casualRuns.length}`,
      casualQualified >= VARIETY_TARGETS.casualMinQualified,
      '≥ 8 / 12',
    ),
  ];

  const failed = checks.filter((entry) => !entry.pass).map((entry) => entry.id);
  return {
    checks,
    pass: failed.length === 0,
    failed,
    plans: plans.map((plan) => ({
      seed: plan.seed,
      courseSignature: plan.courseSignature,
      routeLabel: plan.routeLabel,
      arena: plan.arena,
      arenaLabel: plan.arenaLabel,
      signature: plan.signature,
    })),
    rows: varietyRows(idleRuns, casualRuns).map((row) => ({
      seed: row.seed,
      signature: row.signature,
      arena: row.arena,
      idle: rowCells(row, 'idle'),
      casual: rowCells(row, 'casual'),
    })),
    summary: {
      distinctCourseSignatures: signatures.size,
      arenaPlans: [...arenas].sort(),
      fShows,
      gShows,
      idleQualified,
      casualQualified,
      livingWinners: living.length,
      touchedWinners: touched.length,
      noWinnerRuns: noWinner,
      totalMedian,
      minTotal: Math.min(...totals),
      maxTotal: Math.max(...totals),
    },
  };
}

export function formatVarietyReport(evaluation) {
  const lines = [];
  lines.push('Tumble Rush M3 — Remix Season variety gate');
  lines.push(
    `${evaluation.rows.length} seeds × idle + casual = ${evaluation.rows.length * 2} observed shows`,
  );
  lines.push('');
  lines.push('| Seed | Course | Arena | Course s (finish) | Hex s | Crown s | Total s | Idle Q | Casual Q |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of evaluation.rows) {
    const idle = row.idle;
    const casual = row.casual;
    const course = idle?.course ?? casual?.course ?? null;
    const finishers = idle?.finishers ?? casual?.finishers ?? null;
    const hex = idle?.hex ?? casual?.hex ?? null;
    const crown = idle?.crown ?? casual?.crown ?? null;
    const total = idle?.total ?? casual?.total ?? null;
    lines.push(
      `| ${row.seed} | ${row.signature} | ${row.arena} | ${course ?? '—'} (${finishers ?? '—'}) | ${hex ?? '—'} | ${crown ?? '—'} | ${total ?? '—'} | ${idle?.playerQualified ? 'Q' : 'OUT'} | ${casual?.playerQualified ? 'Q' : 'OUT'} |`,
    );
  }
  lines.push('');
  lines.push('Checks:');
  for (const entry of evaluation.checks) {
    lines.push(
      `  [${entry.pass ? 'PASS' : 'FAIL'}] ${entry.label}: ${entry.value} (target ${entry.target})`,
    );
  }
  lines.push('');
  lines.push(
    evaluation.pass
      ? 'RESULT: PASS'
      : `RESULT: FAIL (${evaluation.failed.join(', ')})`,
  );
  return lines.join('\n');
}
