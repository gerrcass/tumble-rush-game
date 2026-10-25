/**
 * Drive the real `Match`/`Game` through complete shows for the M2 pacing gate.
 *
 * Every observed show runs all three Rounds through the production state
 * machine, physics and controllers. `idle` leaves the human without input;
 * `casual` installs the debug-only scripted player brain. No wall-clock sleeps
 * decide pacing: the page advances the fixed 1/60 s loop and reports its own
 * simulated clock.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { sweepSeeds } from './pacing.mjs';

const FIXED_STEP = 1 / 60;
const MAX_SHOW_SECONDS = 600;

export function pacingUrl(port, baseUrl) {
  return baseUrl ?? `http://127.0.0.1:${port}`;
}

export async function waitForServer(target, timeoutMs = 30_000) {
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

export function startDevServer(port) {
  return spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: 'ignore', detached: false },
  );
}

export async function stopDevServer(server) {
  if (!server) return;
  server.kill('SIGTERM');
  await sleep(250);
  server.kill('SIGKILL');
}

/** Run one complete observed show. Returns per-Round rows and both clocks. */
export async function measureShow(page, url, seed, mode) {
  await page.goto(`${url}/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /PLAY SHOW/i }).waitFor({ timeout: 30_000 });
  return page.evaluate(
    ({ showMode, maxSeconds }) => {
      const t = window.__tumble;
      if (!t) throw new Error('window.__tumble is only available in the dev build');
      if (showMode === 'casual') t.startCasualRun('show');
      else t.startObservedShow('show');

      const rounds = [];
      let elapsed = 0;
      let stalled = 0;
      let playerDown = null;
      const capture = () => {
        const show = t.show;
        if (show.phase !== 'results') return;
        if (rounds.some((round) => round.roundIndex === show.roundIndex)) return;
        const placements = t.roundPlacements;
        const player = placements.find((entry) => entry.isPlayer) ?? null;
        const winner = placements.find((entry) => entry.won) ?? null;
        rounds.push({
          roundIndex: show.roundIndex,
          round: show.roundNumber,
          title: show.roundTitle,
          mode: show.roundMode,
          seconds: Number(show.time.toFixed(2)),
          finishers: placements.filter((entry) => entry.finishTime !== null).length,
          qualified: placements.filter((entry) => entry.qualified).length,
          eliminated: placements.filter((entry) => !entry.qualified).length,
          playerStatus: player?.status ?? 'NOT_IN_ROUND',
          playerQualified: Boolean(player?.qualified),
          livingWinner: Boolean(winner && !winner.eliminated),
          winnerTouchedCrown: Boolean(winner && winner.finishTime !== null),
          sugarRushReached: show.roundMode === 'hexapop' ? show.time >= 45 : null,
          winner: winner?.name ?? null,
          placements: placements.map((entry) => ({
            id: entry.id,
            name: entry.name,
            isPlayer: entry.isPlayer,
            status: entry.status,
            finishTime: entry.finishTime,
            progress: entry.progress,
            won: entry.won,
          })),
        });
      };

      while (t.state !== 'finished' && elapsed < maxSeconds) {
        const result = t.simulate(0.5);
        elapsed += result.steps * (1 / 60);
        if (!playerDown && t.eliminated) {
          playerDown = {
            time: Number(elapsed.toFixed(2)),
            progress: Number((t.levelStatus.progress ?? 0).toFixed(3)),
            x: Number(t.playerPos.x.toFixed(1)),
            y: Number(t.playerPos.y.toFixed(1)),
            z: Number(t.playerPos.z.toFixed(1)),
            round: t.show.roundNumber,
          };
        }
        capture();
        if (result.steps === 0) {
          stalled += 1;
          if (stalled > 240) throw new Error('show stalled before finishing');
        } else {
          stalled = 0;
        }
      }
      capture();
      if (t.state !== 'finished') throw new Error(`show did not finish in ${maxSeconds}s`);
      return {
        rounds,
        totalSeconds: Number(elapsed.toFixed(2)),
        roundSeconds: Number(
          rounds.reduce((sum, round) => sum + round.seconds, 0).toFixed(2),
        ),
        finalWinner: t.winner,
        finalState: t.state,
        playerDown,
      };
    },
    { showMode: mode, maxSeconds: MAX_SHOW_SECONDS },
  );
}

/**
 * Run a seeded sweep for the requested modes. Returns raw runs; callers use
 * the pure summary/check functions from `pacing.mjs`.
 */
export async function measureSweep({
  seed,
  runs,
  port = 5174,
  modes = ['idle', 'casual'],
  baseUrl,
  onRun,
}) {
  const url = pacingUrl(port, baseUrl);
  const seeds = sweepSeeds(seed, runs);
  const server = baseUrl ? null : startDevServer(port);
  let browser;
  const idle = [];
  const casual = [];
  try {
    if (!baseUrl) await waitForServer(url);
    browser = await chromium.launch({
      args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const runSeed of seeds) {
      for (const mode of modes) {
        const run = { seed: runSeed, mode, ...(await measureShow(page, url, runSeed, mode)) };
        if (mode === 'idle') idle.push(run);
        else casual.push(run);
        onRun?.(run);
      }
    }
    return { seeds, idle, casual };
  } finally {
    if (browser) await browser.close();
    await stopDevServer(server);
  }
}

export { FIXED_STEP };
