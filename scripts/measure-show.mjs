#!/usr/bin/env node
/**
 * Measure the real show pacing, not the wall-clock cost of the test.
 *
 * Starts a private Vite dev server (unless TUMBLE_URL is set), drives the real
 * Match with no player input, and reports per-round duration plus qualification
 * and winner data. This is the baseline gate for the M2 pacing work.
 *
 * Usage:
 *   npm run measure:show
 *   npm run measure:show -- --seed=20260418 --runs=3
 *   TUMBLE_URL=http://127.0.0.1:5173 npm run measure:show   # an existing dev server
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const seed = Number(option('seed', '20260418'));
const runs = Math.max(1, Math.min(10, Number(option('runs', '1')) || 1));
const port = Number(option('port', '5174'));
const externalUrl = process.env.TUMBLE_URL;
const url = externalUrl || `http://127.0.0.1:${port}`;

async function waitForServer(target, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function measureRound(page, roundIndex) {
  await page.goto(`${url}/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /PLAY SHOW/i }).waitFor({ timeout: 30_000 });
  return page.evaluate((index) => {
    const t = window.__tumble;
    if (!t) throw new Error('window.__tumble is only available in the dev build');
    t.startShow('show');
    if (index > 0) t.jumpToRound(index);
    t.beginRound();
    let guard = 0;
    while (t.show.phase === 'playing' && guard < 180) {
      t.simulate(0.5);
      guard += 0.5;
    }
    const placements = t.roundPlacements;
    return {
      round: index + 1,
      title: t.show.roundTitle,
      phase: t.show.phase,
      seconds: Number(t.show.time.toFixed(2)),
      qualified: placements.filter((entry) => entry.status === 'QUALIFIED').length,
      eliminated: placements.filter((entry) => entry.status === 'ELIMINATED').length,
      player: placements.find((entry) => entry.isPlayer)?.status ?? 'NOT_IN_ROUND',
      winner: t.show.winner,
      livingWinner: placements.find((entry) => entry.won)?.eliminated === false,
      finishers: placements.filter((entry) => entry.finishTime !== null).length,
    };
  }, roundIndex);
}

const server = externalUrl
  ? null
  : spawn(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { stdio: 'ignore', detached: false },
    );

let browser;
try {
  if (!externalUrl) await waitForServer(url);
  browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const rounds = [];
  for (let run = 0; run < runs; run += 1) {
    for (let index = 0; index < 3; index += 1) {
      rounds.push({ run: run + 1, ...(await measureRound(page, index)) });
    }
  }
  const showSeconds = new Map();
  for (const round of rounds) {
    showSeconds.set(round.run, (showSeconds.get(round.run) ?? 0) + round.seconds);
  }
  const averageShowSeconds =
    [...showSeconds.values()].reduce((sum, seconds) => sum + seconds, 0) / runs;
  const output = {
    seed,
    url,
    runs,
    rounds,
    averageShowSeconds: Number(averageShowSeconds.toFixed(2)),
    note: 'Rounds are measured independently with no player input; total is the sum of the three Round clocks, excluding intro/results overlays.',
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await sleep(250);
    server.kill('SIGKILL');
  }
}
