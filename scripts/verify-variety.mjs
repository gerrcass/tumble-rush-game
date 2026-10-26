#!/usr/bin/env node
/**
 * M3 variety gate. Runs 12 seeds × idle + scripted casual through the real
 * Match, asserts route/arena variety and every M2 pacing/fairness band, and
 * emits JSON plus a readable table.
 *
 * Usage:
 *   npm run verify:variety
 *   npm run verify:variety -- --runs=3 --json
 *   npm run verify:variety -- --out=docs/evidence/variety/m3-variety.json
 *   npm run verify:variety -- --negative   # prove the gate rejects a broken deck
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { measureSweep } from './lib/show-harness.mjs';
import { evaluateVariety, formatVarietyReport } from './lib/variety.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const seed = Number(option('seed', '20260418'));
const runs = Math.max(1, Math.min(50, Number(option('runs', '12')) || 12));
const port = Number(option('port', '5176'));
const json = args.includes('--json');
const negative = args.includes('--negative');
const out = option('out', '');
const baseUrl = process.env.TUMBLE_URL;

let completed = 0;
const total = runs * 2;
const { seeds, idle, casual } = await measureSweep({
  seed,
  runs,
  port,
  modes: ['idle', 'casual'],
  baseUrl,
  onRun: (run) => {
    completed += 1;
    const course = run.rounds.find((round) => round.mode === 'course');
    const hex = run.rounds.find((round) => round.mode === 'hexapop');
    const crown = run.rounds.find((round) => round.mode === 'crown-climb');
    process.stderr.write(
      `[${completed}/${total}] ${run.mode} seed=${run.seed} ${run.plan.courseSignature}/${run.plan.arenaLabel} ` +
        `total=${run.totalSeconds}s course=${course?.seconds ?? '—'}s finishers=${course?.finishers ?? '—'} ` +
        `player=${course?.playerStatus ?? '—'} hex=${hex?.seconds ?? '—'}s ` +
        `crown=${crown?.seconds ?? '—'}s living=${crown?.livingWinner ?? '—'} ` +
        `touch=${crown?.winnerTouchedCrown ?? '—'}\n`,
    );
  },
});

const evaluation = evaluateVariety(idle, casual);

let negativeControl = null;
if (negative) {
  // Deliberately collapse every show to the same route and arena. The gate
  // must reject this deck; if it does not, the variety checks are decorative.
  const brokenIdle = idle.map((run) => ({
    ...run,
    plan: {
      ...run.plan,
      courseSignature: 'B-C-D/B-C-D',
      lapRoutes: [['B', 'C', 'D'], ['B', 'C', 'D']],
      routeLabel: 'B-C-D / B-C-D',
      arena: 'rings',
      arenaLabel: 'RINGS',
      signature: 'B-C-D/B-C-D · RINGS',
      label: 'COURSE B-C-D / B-C-D · ARENA RINGS',
    },
  }));
  const broken = evaluateVariety(brokenIdle, casual);
  negativeControl = {
    pass: !broken.pass,
    failed: broken.failed,
    distinctCourseSignatures: broken.summary.distinctCourseSignatures,
    arenaPlans: broken.summary.arenaPlans,
  };
}

const output = {
  command: 'verify:variety',
  generatedAt: new Date().toISOString(),
  seed,
  seeds,
  runs,
  idle,
  casual,
  ...evaluation,
  negativeControl,
};
const report = formatVarietyReport(evaluation);
if (json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(report);
}
if (negativeControl) {
  console.log(
    `\nNegative control: ${negativeControl.pass ? 'PASS' : 'FAIL'} — collapsed deck rejected by ${negativeControl.failed.join(', ') || 'nothing'}`,
  );
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nJSON evidence: ${out}`);
}
if (!evaluation.pass || (negativeControl && !negativeControl.pass)) process.exitCode = 1;
