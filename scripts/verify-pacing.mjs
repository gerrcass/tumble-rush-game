#!/usr/bin/env node
/**
 * M2 pacing gate. Runs the 10-seed full-show sweep (idle + scripted casual) and
 * exits non-zero when a Phase A band is missed. Hexapop/Crown/show-total are
 * still measured and printed as PENDING until M2-003/004 land; `--phase=b`
 * makes every band hard.
 *
 * Usage:
 *   npm run verify:pacing
 *   npm run verify:pacing -- --runs=3
 *   npm run verify:pacing -- --phase=b --json --out=docs/evidence/pacing.json
 */
import { writeFileSync } from 'node:fs';
import { measureSweep } from './lib/show-harness.mjs';
import { evaluatePacing, formatReport, summarize } from './lib/pacing.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const seed = Number(option('seed', '20260418'));
const runs = Math.max(1, Math.min(50, Number(option('runs', '10')) || 10));
const port = Number(option('port', '5175'));
const phase = option('phase', 'a').toLowerCase() === 'b' ? 'b' : 'a';
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
    process.stderr.write(
      `[${completed}/${total}] ${run.mode} seed=${run.seed} total=${run.totalSeconds}s ` +
        `course=${course?.seconds ?? '—'}s finishers=${course?.finishers ?? '—'} ` +
        `player=${course?.playerStatus ?? '—'}\n`,
    );
  },
});

const summary = summarize(idle, casual);
const evaluation = evaluatePacing(summary, { phase });
const output = {
  command: 'verify:pacing',
  generatedAt: new Date().toISOString(),
  seed,
  seeds,
  runs,
  phase,
  idle,
  casual,
  summary,
  checks: evaluation.checks,
  pass: evaluation.pass,
  failed: evaluation.failed,
  pending: evaluation.pending,
};

const report = formatReport(summary, evaluation);
if (json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(report);
}
if (out) {
  writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nJSON evidence: ${out}`);
}
if (!evaluation.pass) process.exitCode = 1;
