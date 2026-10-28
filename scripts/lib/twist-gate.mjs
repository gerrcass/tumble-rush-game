/**
 * Pure M4 twist-gate math.
 *
 * Plain ESM so `npm run verify:twists`, the Vitest contract test and the
 * negative control share one implementation. No browser, no wall clock, no
 * randomness: the real `Match` runs arrive from `show-harness.mjs`.
 */
export const TWIST_IDS = Object.freeze(['moon', 'slippery', 'rush']);

export const TWIST_TARGETS = Object.freeze({
  seeds: 12,
  totalRuns: 24,
  minPerTwist: 3,
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
  sugarRushSeconds: 38,
  sugarRushTolerance: 1,
  gravityTolerance: 0.01,
  frictionTolerance: 0.001,
});

/** Classic gravity is -26; moon multiplies it by 0.78. */
export const CLASSIC_GRAVITY = -26;

/**
 * The shipping multipliers and clocks. `twist.test.ts` compares this record
 * with `TWISTS` so the gate report cannot drift from the playable rules.
 */
export const TWIST_TUNING = Object.freeze({
  moon: Object.freeze({
    gravityScale: 0.78,
    jumpScale: 0.9,
    airControlScale: 1.15,
    airDragScale: 0.9,
    accelScale: 1,
    frictionScale: 1,
    hazardSpeedScale: 1,
    courseTimeLimit: 120,
    hexTimeLimit: 49.9,
    hexSugarRush: 45,
  }),
  slippery: Object.freeze({
    gravityScale: 1,
    jumpScale: 1,
    airControlScale: 1,
    airDragScale: 0.85,
    accelScale: 0.9,
    frictionScale: 0.55,
    hazardSpeedScale: 1,
    courseTimeLimit: 120,
    hexTimeLimit: 49.9,
    hexSugarRush: 45,
  }),
  rush: Object.freeze({
    gravityScale: 1,
    jumpScale: 1,
    airControlScale: 1,
    airDragScale: 1,
    accelScale: 1,
    frictionScale: 1,
    hazardSpeedScale: 1.1,
    courseTimeLimit: 105,
    hexTimeLimit: 42.9,
    hexSugarRush: 38,
  }),
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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function planTwist(run) {
  return run.plan?.twist ?? null;
}

/** Every run's plan twist must be one of the three valid ids. */
function invalidPlanTwists(runs) {
  return runs.filter((run) => !planTwist(run) || !TWIST_IDS.includes(planTwist(run).id));
}

/**
 * The physical applied probe. A plan label is never trusted: gravity, friction
 * and the live Sugar Rush clock are read from the installed world/level.
 */
function probeIssues(runs) {
  const issues = [];
  for (const run of runs) {
    const plan = planTwist(run);
    if (!plan || !TWIST_IDS.includes(plan.id)) continue;
    for (const mode of ['course', 'hexapop']) {
      const round = roundFor(run, mode);
      if (!round) continue;
      const probe = round.twist;
      const where = `${run.mode} seed=${run.seed} ${mode}`;
      if (!probe) {
        issues.push(`${where}: no live probe`);
        continue;
      }
      if (!probe.applied) issues.push(`${where}: probe reports applied=false`);
      if (probe.id !== plan.id) {
        issues.push(`${where}: probe id ${probe.id} ≠ plan ${plan.id}`);
      }
      if (probe.classic) issues.push(`${where}: qualifier reported classic`);
      if (plan.id === 'moon') {
        const expected = CLASSIC_GRAVITY * 0.78;
        if (Math.abs(probe.gravity - expected) > TWIST_TARGETS.gravityTolerance) {
          issues.push(`${where}: gravity ${probe.gravity} ≠ ${expected}`);
        }
      }
      if (plan.id === 'slippery') {
        if (Math.abs(probe.frictionScale - 0.55) > TWIST_TARGETS.frictionTolerance) {
          issues.push(`${where}: friction ${probe.frictionScale} ≠ 0.55`);
        }
      }
      if (plan.id === 'rush') {
        if (
          Math.abs(probe.sugarRushSeconds - TWIST_TARGETS.sugarRushSeconds) >
          TWIST_TARGETS.sugarRushTolerance
        ) {
          issues.push(
            `${where}: Sugar Rush clock ${probe.sugarRushSeconds} ≠ ${TWIST_TARGETS.sugarRushSeconds}`,
          );
        }
        if (mode === 'hexapop') {
          if (!round.sugarRushReached) issues.push(`${where}: Sugar Rush never reached`);
          if (
            round.sugarRushAt === null ||
            round.sugarRushAt === undefined ||
            Math.abs(round.sugarRushAt - TWIST_TARGETS.sugarRushSeconds) >
              TWIST_TARGETS.sugarRushTolerance
          ) {
            issues.push(`${where}: Sugar Rush stamped at ${round.sugarRushAt}, expected 38`);
          }
        }
      }
    }
    const crown = roundFor(run, 'crown-climb');
    if (crown) {
      const probe = crown.twist;
      const where = `${run.mode} seed=${run.seed} crown-climb`;
      if (!probe) {
        issues.push(`${where}: no live probe`);
      } else {
        if (!probe.applied) issues.push(`${where}: probe reports applied=false`);
        if (!probe.classic || probe.id !== 'classic') {
          issues.push(`${where}: Crown reported ${probe.id}, expected classic`);
        }
        if (Math.abs(probe.gravity - CLASSIC_GRAVITY) > TWIST_TARGETS.gravityTolerance) {
          issues.push(`${where}: gravity ${probe.gravity} ≠ ${CLASSIC_GRAVITY}`);
        }
        if (Math.abs(probe.frictionScale - 1) > TWIST_TARGETS.frictionTolerance) {
          issues.push(`${where}: friction ${probe.frictionScale} ≠ 1`);
        }
      }
    }
  }
  return issues;
}

/**
 * Relabel every live probe `applied: false`. The negative control must be
 * rejected by the same evaluator; a gate that accepts this deck is decorative.
 */
export function unapplyRuns(runs) {
  return runs.map((run) => ({
    ...run,
    rounds: run.rounds.map((round) => ({
      ...round,
      twist: round.twist ? { ...round.twist, applied: false } : round.twist,
    })),
  }));
}

export function evaluateTwists(idleRuns, casualRuns) {
  const allRuns = [...idleRuns, ...casualRuns];
  const plans = idleRuns.map(planTwist).filter(Boolean);
  const invalidPlans = invalidPlanTwists(idleRuns);
  const counts = Object.fromEntries(TWIST_IDS.map((id) => [id, 0]));
  for (const plan of plans) {
    if (plan && counts[plan.id] !== undefined) counts[plan.id] += 1;
  }
  const minPerTwist =
    idleRuns.length >= TWIST_TARGETS.seeds ? TWIST_TARGETS.minPerTwist : 1;
  const coverageOk = TWIST_IDS.every((id) => counts[id] >= minPerTwist);

  const courseRuns = allRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
  const hexRuns = allRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
  const crownRuns = allRuns.map((run) => roundFor(run, 'crown-climb')).filter(Boolean);
  const livingCrowns = crownRuns.filter((round) => round.livingWinner);
  const touchedCrowns = crownRuns.filter((round) => round.winnerTouchedCrown);
  const totals = allRuns.map((run) => run.totalSeconds);
  const totalMedian = median(totals);
  const idleQualified = idleRuns
    .map((run) => roundFor(run, 'course'))
    .filter((round) => round?.playerQualified).length;
  const casualQualified = casualRuns
    .map((run) => roundFor(run, 'course'))
    .filter((round) => round?.playerQualified).length;
  const casualTarget = Math.min(
    TWIST_TARGETS.casualMinQualified,
    Math.ceil(casualRuns.length * (TWIST_TARGETS.casualMinQualified / TWIST_TARGETS.seeds)),
  );
  const livingTarget = Math.ceil(
    (TWIST_TARGETS.livingWinnerMin / TWIST_TARGETS.totalRuns) * crownRuns.length,
  );

  const badCourse = courseRuns.filter(
    (round) =>
      round.seconds < TWIST_TARGETS.courseMinSeconds ||
      round.seconds > TWIST_TARGETS.courseMaxSeconds ||
      round.finishers < TWIST_TARGETS.courseMinFinishers,
  );
  const badHex = hexRuns.filter(
    (round) =>
      round.seconds < TWIST_TARGETS.hexMinSeconds ||
      round.seconds > TWIST_TARGETS.hexMaxSeconds ||
      !round.sugarRushReached,
  );
  const badCrownClock = livingCrowns.filter(
    (round) =>
      round.seconds < TWIST_TARGETS.crownMinSeconds ||
      round.seconds > TWIST_TARGETS.crownMaxSeconds,
  );
  const badTotal = totals.filter(
    (seconds) =>
      seconds < TWIST_TARGETS.showFloorSeconds || seconds > TWIST_TARGETS.showCeilingSeconds,
  );
  const issues = probeIssues(allRuns);

  const checks = [
    check(
      'twist-plan',
      'Every show plan carries one valid twist',
      invalidPlans.length === 0 ? `${plans.length} / ${plans.length}` : `${invalidPlans.length} invalid`,
      invalidPlans.length === 0,
      'moon | slippery | rush',
    ),
    check(
      'twist-coverage',
      `Each twist appears in ≥${minPerTwist} of ${idleRuns.length} seeds`,
      TWIST_IDS.map((id) => `${id} ${counts[id]}`).join(', '),
      coverageOk,
      `≥${minPerTwist} each`,
    ),
    check(
      'applied-probe',
      'Plan rules match live gravity/friction/Sugar Rush; Crown is classic',
      issues.length === 0 ? `${allRuns.length} runs` : `${issues.length} mismatch(es)`,
      issues.length === 0,
      'every run',
    ),
    check(
      'course-bands',
      'Every run: Course 45–90 s and 8+ finishers',
      badCourse.length === 0 ? `${courseRuns.length} / ${courseRuns.length}` : `${badCourse.length} bad`,
      badCourse.length === 0,
      '45–90 s, 8+',
    ),
    check(
      'hex-bands',
      'Every run: Hexapop 30–50 s with the Sugar Rush reached',
      badHex.length === 0 ? `${hexRuns.length} / ${hexRuns.length}` : `${badHex.length} bad`,
      badHex.length === 0,
      '30–50 s, 100%',
    ),
    check(
      'sugar-rush-clock',
      'RUSH HOUR Sugar Rush starts at 38 s (±1)',
      (() => {
        const rushHex = idleRuns
          .filter((run) => planTwist(run)?.id === 'rush')
          .map((run) => roundFor(run, 'hexapop'))
          .filter(Boolean);
        if (rushHex.length === 0) return 'no rush Hexapop run';
        return rushHex
          .map((round) => `${round.sugarRushAt ?? '—'} s`)
          .join(', ');
      })(),
      idleRuns
        .filter((run) => planTwist(run)?.id === 'rush')
        .map((run) => roundFor(run, 'hexapop'))
        .filter(Boolean)
        .every(
          (round) =>
            round.sugarRushReached &&
            round.sugarRushAt !== null &&
            Math.abs(round.sugarRushAt - TWIST_TARGETS.sugarRushSeconds) <=
              TWIST_TARGETS.sugarRushTolerance,
        ),
      '38 ± 1 s',
    ),
    check(
      'crown-bands',
      'Crown 45–80 s with a living physical touch',
      `${livingCrowns.length} living / ${touchedCrowns.length} touched of ${crownRuns.length}` +
        (badCrownClock.length ? `, ${badCrownClock.length} outside 45–80 s` : ''),
      badCrownClock.length === 0 && livingCrowns.length === crownRuns.length && touchedCrowns.length === crownRuns.length,
      'every run, physical',
    ),
    check(
      'show-bands',
      'Every show 150–360 s and median 180–300 s',
      `${Math.min(...totals)}–${Math.max(...totals)} s, median ${round2(totalMedian)} s`,
      badTotal.length === 0 &&
        totalMedian >= TWIST_TARGETS.showTargetMinSeconds &&
        totalMedian <= TWIST_TARGETS.showTargetMaxSeconds,
      '150–360 s / 180–300 s',
    ),
    check(
      'idle-human',
      'Idle human never qualifies',
      `${idleQualified} / ${idleRuns.length}`,
      idleQualified <= TWIST_TARGETS.idleMaxQualified,
      '0 / 12',
    ),
    check(
      'casual-human',
      `Scripted casual human qualifies at least ${casualTarget}/${casualRuns.length}`,
      `${casualQualified} / ${casualRuns.length}`,
      casualQualified >= casualTarget,
      `≥ ${casualTarget} / ${casualRuns.length}`,
    ),
    check(
      'living-winners',
      `Living crown winner at least ${livingTarget}/${crownRuns.length}`,
      `${livingCrowns.length} / ${crownRuns.length}`,
      livingCrowns.length >= livingTarget,
      `≥ ${livingTarget} / ${crownRuns.length}`,
    ),
  ];

  const failed = checks.filter((entry) => !entry.pass).map((entry) => entry.id);
  const byTwist = {};
  for (const id of TWIST_IDS) {
    const seeds = idleRuns.filter((run) => planTwist(run)?.id === id).map((run) => run.seed);
    const twistRuns = allRuns.filter((run) => planTwist(run)?.id === id);
    const twistCourse = twistRuns.map((run) => roundFor(run, 'course')).filter(Boolean);
    const twistHex = twistRuns.map((run) => roundFor(run, 'hexapop')).filter(Boolean);
    byTwist[id] = {
      seeds,
      runs: twistRuns.length,
      courseMedian: round2(median(twistCourse.map((round) => round.seconds))),
      courseMin: round2(Math.min(...twistCourse.map((round) => round.seconds))),
      courseMax: round2(Math.max(...twistCourse.map((round) => round.seconds))),
      hexMedian: round2(median(twistHex.map((round) => round.seconds))),
      hexMin: round2(Math.min(...twistHex.map((round) => round.seconds))),
      hexMax: round2(Math.max(...twistHex.map((round) => round.seconds))),
      finishersMin: Math.min(...twistCourse.map((round) => round.finishers)),
      sugarRushReached: twistHex.filter((round) => round.sugarRushReached).length,
      casualQualified: twistRuns
        .filter((run) => run.mode === 'casual')
        .map((run) => roundFor(run, 'course'))
        .filter((round) => round?.playerQualified).length,
    };
  }

  return {
    checks,
    pass: failed.length === 0,
    failed,
    issues,
    summary: {
      seeds: idleRuns.map((run) => run.seed),
      twistCounts: counts,
      idleQualified,
      casualQualified,
      casualTarget,
      livingWinners: livingCrowns.length,
      touchedWinners: touchedCrowns.length,
      livingTarget,
      totalMedian: round2(totalMedian),
      minTotal: Math.min(...totals),
      maxTotal: Math.max(...totals),
      courseMedian: round2(median(courseRuns.map((round) => round.seconds))),
      courseMin: Math.min(...courseRuns.map((round) => round.seconds)),
      courseMax: Math.max(...courseRuns.map((round) => round.seconds)),
      hexMedian: round2(median(hexRuns.map((round) => round.seconds))),
      hexMin: Math.min(...hexRuns.map((round) => round.seconds)),
      hexMax: Math.max(...hexRuns.map((round) => round.seconds)),
      crownMin: Math.min(...livingCrowns.map((round) => round.seconds)),
      crownMax: Math.max(...livingCrowns.map((round) => round.seconds)),
      byTwist,
    },
    rows: idleRuns.map((idleRun) => {
      const casualRun = casualRuns.find((run) => run.seed === idleRun.seed) ?? null;
      const pick = (mode) => {
        const run = mode === 'idle' ? idleRun : casualRun;
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
          sugarRushAt: hex?.sugarRushAt ?? null,
          crown: crown?.seconds ?? null,
          living: Boolean(crown?.livingWinner),
          touched: Boolean(crown?.winnerTouchedCrown),
        };
      };
      return {
        seed: idleRun.seed,
        twist: planTwist(idleRun)?.label ?? '—',
        short: planTwist(idleRun)?.short ?? '—',
        signature: idleRun.plan?.courseSignature ?? '—',
        arena: idleRun.plan?.arenaLabel ?? '—',
        idle: pick('idle'),
        casual: pick('casual'),
      };
    }),
  };
}

export function formatTwistReport(evaluation) {
  const lines = [];
  lines.push('Tumble Rush M4 — Twist Season gate');
  lines.push(
    `${evaluation.rows.length} seeds × idle + casual = ${evaluation.rows.length * 2} observed shows`,
  );
  lines.push('');
  lines.push(
    '| Seed | Twist | Course | Arena | Course s (finishers) | Sugar at | Hex s | Crown s | Total s | Idle Q | Casual Q |',
  );
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of evaluation.rows) {
    const idle = row.idle;
    const casual = row.casual;
    const course = idle?.course ?? casual?.course ?? null;
    const finishers = idle?.finishers ?? casual?.finishers ?? null;
    const hex = idle?.hex ?? casual?.hex ?? null;
    const sugar = idle?.sugarRushAt ?? casual?.sugarRushAt ?? null;
    const crown = idle?.crown ?? casual?.crown ?? null;
    const total = idle?.total ?? casual?.total ?? null;
    lines.push(
      `| ${row.seed} | ${row.short} | ${row.signature} | ${row.arena} | ${course ?? '—'} (${finishers ?? '—'}) | ${sugar ?? '—'} s | ${hex ?? '—'} | ${crown ?? '—'} | ${total ?? '—'} | ${idle?.playerQualified ? 'Q' : 'OUT'} | ${casual?.playerQualified ? 'Q' : 'OUT'} |`,
    );
  }
  lines.push('');
  lines.push('Per twist:');
  for (const id of TWIST_IDS) {
    const entry = evaluation.summary.byTwist[id];
    lines.push(
      `  ${id.padEnd(8)} seeds ${entry.seeds.length}/12  course ${entry.courseMin}–${entry.courseMax} s (median ${entry.courseMedian})  hex ${entry.hexMin}–${entry.hexMax} s (median ${entry.hexMedian})  finishers ≥${entry.finishersMin}  Sugar ${entry.sugarRushReached}  casual Q ${entry.casualQualified}`,
    );
  }
  lines.push('');
  lines.push('Checks:');
  for (const entry of evaluation.checks) {
    lines.push(
      `  [${entry.pass ? 'PASS' : 'FAIL'}] ${entry.label}: ${entry.value} (target ${entry.target})`,
    );
  }
  if (evaluation.issues.length > 0) {
    lines.push('');
    lines.push('Applied-probe issues:');
    for (const issue of evaluation.issues.slice(0, 40)) lines.push(`  ${issue}`);
  }
  lines.push('');
  lines.push(
    evaluation.pass ? 'RESULT: PASS' : `RESULT: FAIL (${evaluation.failed.join(', ')})`,
  );
  return lines.join('\n');
}
