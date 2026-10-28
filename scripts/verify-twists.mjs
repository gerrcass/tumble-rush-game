#!/usr/bin/env node
/**
 * M4 twist gate. Runs the same 12 seeds as the M3 variety gate through the real
 * `Match` with an idle and a scripted casual human, asserts twist coverage, the
 * physical applied probe, the classic Crown, every M2 pacing/fairness band, and
 * a negative control that relabels every probe `applied: false`.
 *
 * Usage:
 *   npm run verify:twists
 *   npm run verify:twists -- --json
 *   npm run verify:twists -- --out=docs/evidence/twists/m4-twists.json
 *   npm run verify:twists -- --negative   # print the rejected negative control
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { measureSweep } from './lib/show-harness.mjs';
import {
  TWIST_TUNING,
  evaluateTwists,
  formatTwistReport,
  unapplyRuns,
} from './lib/twist-gate.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const seed = Number(option('seed', '20260418'));
const runs = Math.max(1, Math.min(50, Number(option('runs', '12')) || 12));
const port = Number(option('port', '5177'));
const json = args.includes('--json');
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
      `[${completed}/${total}] ${run.mode} seed=${run.seed} twist=${run.plan.twist.label} ` +
        `total=${run.totalSeconds}s course=${course?.seconds ?? '—'}s finishers=${course?.finishers ?? '—'} ` +
        `player=${course?.playerStatus ?? '—'} hex=${hex?.seconds ?? '—'}s sugar=${hex?.sugarRushAt ?? '—'}s ` +
        `crown=${crown?.seconds ?? '—'}s class=${crown?.twist?.id ?? '—'} living=${crown?.livingWinner ?? '—'} ` +
        `touch=${crown?.winnerTouchedCrown ?? '—'}\n`,
    );
  },
});

const evaluation = evaluateTwists(idle, casual);
// The negative control is not optional: relabelled `applied:false` runs must be
// rejected by the very same checks the release gate uses.
const negative = evaluateTwists(unapplyRuns(idle), unapplyRuns(casual));
const negativeControl = {
  rejected: !negative.pass,
  failed: negative.failed,
  issues: negative.issues.slice(0, 5),
};
const pass = evaluation.pass && negativeControl.rejected;

const output = {
  command: 'verify:twists',
  generatedAt: new Date().toISOString(),
  seed,
  seeds,
  runs,
  tuning: TWIST_TUNING,
  idle,
  casual,
  ...evaluation,
  negativeControl,
  pass,
};
const report = formatTwistReport(evaluation);
if (json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(report);
}
console.log(
  `\nNegative control: ${negativeControl.rejected ? 'PASS' : 'FAIL'} — ` +
    `${negativeControl.rejected ? 'relabelled applied:false deck rejected by' : 'accepted by'} ` +
    `${negativeControl.failed.join(', ') || 'nothing'}`,
);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nJSON evidence: ${out}`);
}
if (!pass) process.exitCode = 1;
