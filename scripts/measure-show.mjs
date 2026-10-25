#!/usr/bin/env node
/**
 * Measure the real full show, not the wall-clock cost of the test.
 *
 * Starts a private Vite dev server (unless TUMBLE_URL is set), drives the real
 * Match through all three Rounds, and reports per-Round clocks, finishers,
 * qualifiers, player status, living-winner state and the total show clock.
 * `--mode=both` (the default) also runs the debug-only scripted casual path.
 *
 * Usage:
 *   npm run measure:show
 *   npm run measure:show -- --runs=10
 *   npm run measure:show -- --seed=7 --runs=3 --mode=casual
 *   TUMBLE_URL=http://127.0.0.1:5173 npm run measure:show   # an existing dev server
 */
import { writeFileSync } from 'node:fs';
import { measureSweep } from './lib/show-harness.mjs';
import { evaluatePacing, summarize } from './lib/pacing.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const seed = Number(option('seed', '20260418'));
const runs = Math.max(1, Math.min(50, Number(option('runs', '1')) || 1));
const port = Number(option('port', '5174'));
const modeOption = option('mode', 'both');
const modes =
  modeOption === 'idle' ? ['idle'] : modeOption === 'casual' ? ['casual'] : ['idle', 'casual'];
const out = option('out', '');
const baseUrl = process.env.TUMBLE_URL;

let completed = 0;
const total = runs * modes.length;
const { seeds, idle, casual } = await measureSweep({
  seed,
  runs,
  port,
  modes,
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

// A single-mode measurement leaves the other sweep empty; the checks then say
// what was not run instead of silently reusing one mode as the other.
const summary = summarize(idle, casual);
const evaluation = evaluatePacing(summary, { phase: 'a' });
const output = {
  command: 'measure:show',
  generatedAt: new Date().toISOString(),
  seed,
  seeds,
  runs,
  modes,
  url: baseUrl ?? `http://127.0.0.1:${port}`,
  idle: idle.map((run) => ({
    seed: run.seed,
    totalSeconds: run.totalSeconds,
    roundSeconds: run.roundSeconds,
    rounds: run.rounds.map(({ placements: _placements, ...round }) => round),
  })),
  casual: casual.map((run) => ({
    seed: run.seed,
    totalSeconds: run.totalSeconds,
    roundSeconds: run.roundSeconds,
    rounds: run.rounds.map(({ placements: _placements, ...round }) => round),
  })),
  summary,
  checks: evaluation.checks,
  pass: evaluation.pass,
  note:
    'Full observed shows: all three Rounds run through the real Match. Total includes intro/countdown/results clock. Phase A treats Hexapop/Crown/show-total bands as pending.',
};

const text = JSON.stringify(output, null, 2);
if (out) {
  writeFileSync(out, `${text}\n`);
  process.stderr.write(`wrote ${out}\n`);
} else {
  console.log(text);
}
