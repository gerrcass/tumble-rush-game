import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

async function openShow(page: Page, seed = 20260418): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
}

async function simulateUntilResults(page: Page, maxSeconds = 100): Promise<void> {
  await page.evaluate((limit) => {
    const t = window.__tumble;
    if (!t) throw new Error('window.__tumble missing');
    for (let elapsed = 0; elapsed < limit; elapsed += 0.5) {
      if (t.show.phase === 'results') break;
      t.simulate(0.5);
    }
  }, maxSeconds);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('M2 Course pacing and fair qualification', () => {
  test('scripted casual path qualifies and the results row is visibly QUALIFIED', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => window.__tumble?.startCasualRun());
    await expect.poll(() => page.evaluate(() => window.__tumble?.autopilot)).toBe('casual');
    await simulateUntilResults(page, 110);

    await expect(page.locator('.results')).toBeVisible();
    const result = await page.evaluate(() => {
      const placements = window.__tumble?.roundPlacements ?? [];
      const player = placements.find((entry) => entry.isPlayer) ?? null;
      return {
        finishers: placements.filter((entry) => entry.finishTime !== null).length,
        qualified: placements.filter((entry) => entry.qualified).length,
        playerQualified: player?.qualified ?? null,
        playerStatus: player?.status ?? null,
        phase: window.__tumble?.show.phase ?? null,
        clock: window.__tumble?.show.time ?? 0,
      };
    });
    console.log(`M2_CASUAL_E2E ${JSON.stringify(result)}`);
    expect(result.phase).toBe('results');
    expect(result.clock).toBeGreaterThanOrEqual(45);
    expect(result.clock).toBeLessThanOrEqual(90);
    expect(result.finishers).toBeGreaterThanOrEqual(8);
    expect(result.playerQualified).toBe(true);
    expect(result.playerStatus).toBe('QUALIFIED');
    const playerRow = page.locator('.results__row.is-player');
    await expect(playerRow).toContainText('QUALIFIED');
    await expect(page.locator('.results__reward')).not.toContainText('NO KUDOS');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the extended Course shows the second lap and the final gate', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    // Let the TUMBLE! stamp finish its 2.1 s beat so it does not cover the
    // second-lap evidence frame.
    await page.waitForTimeout(2400);

    const course = await page.evaluate(() => window.__tumble?.course ?? null);
    expect(course).not.toBeNull();
    expect(course?.laps).toBe(2);
    expect(course?.finishZ).toBeCloseTo(-340, 4);
    expect(course?.finishY).toBeCloseTo(9.1, 4);
    expect(course?.waypointCount).toBe(55);

    // Lap 2's Whirlybird Alley (the same section grammar translated past
    // lap 1). A static platform keeps the evidence frame off the kill plane.
    await page.evaluate(() => {
      window.__tumble?.setQuality('high');
      window.__tumble?.teleport(0, 4.7, -242);
      window.__tumble?.simulate(0.2);
    });
    await page.waitForTimeout(2400);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-course-lap2.png') });

    // The final gate credits the human's finish. The Round keeps running until
    // eight racers finish, so the results table appears after the pack lands.
    await page.evaluate(() => {
      window.__tumble?.teleport(0, 9.3, -336);
      window.__tumble?.simulate(0.2);
    });
    await expect
      .poll(() => page.evaluate(() => window.__tumble?.contestants.statuses[0]?.status))
      .toBe('qualified');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-course-finish.png') });

    await simulateUntilResults(page, 110);
    await expect(page.locator('.results')).toBeVisible();
    await expect(page.locator('.results__row.is-player')).toContainText('QUALIFIED');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-course-results.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the idle human never qualifies and the results row is visibly ELIMINATED', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => window.__tumble?.beginRound());
    await simulateUntilResults(page, 110);

    await expect(page.locator('.results')).toBeVisible();
    const result = await page.evaluate(() => {
      const placements = window.__tumble?.roundPlacements ?? [];
      const player = placements.find((entry) => entry.isPlayer) ?? null;
      return {
        finishers: placements.filter((entry) => entry.finishTime !== null).length,
        playerQualified: player?.qualified ?? null,
        playerStatus: player?.status ?? null,
        clock: window.__tumble?.show.time ?? 0,
      };
    });
    console.log(`M2_IDLE_E2E ${JSON.stringify(result)}`);
    expect(result.clock).toBeGreaterThanOrEqual(45);
    expect(result.clock).toBeLessThanOrEqual(90);
    expect(result.finishers).toBeGreaterThanOrEqual(8);
    expect(result.playerQualified).toBe(false);
    expect(result.playerStatus).toBe('ELIMINATED');
    await expect(page.locator('.results__row.is-player')).toContainText('ELIMINATED');
    await expect(page.locator('.results__reward')).toContainText('NO KUDOS');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('M2 Phase B show feel', () => {
  test('spectate follows the living leader, hides other tags and stays clear of bodies', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(1);
      window.__tumble?.beginRound();
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.roundNumber)).toBe(2);

    // Drop the human off the perch so the Round starts spectating a bot leader.
    await page.evaluate(() => {
      window.__tumble?.simulate(0.4);
      window.__tumble?.teleport(0, -12, 0);
      window.__tumble?.simulate(0.8);
    });
    await expect(page.locator('.hud-spectate')).toBeVisible();

    const first = await page.evaluate(() => window.__tumble?.spectate ?? null);
    expect(first?.active).toBe(true);
    expect(first?.name).not.toBe('');
    expect(first?.leaderTagVisible).toBe(true);
    expect(first?.nonTargetTagsVisible).toBe(0);
    expect(first?.nearestBeanClearance ?? 0).toBeGreaterThan(0.6);
    expect(first?.slimeClearance ?? 0).toBeGreaterThan(0.2);
    expect(first?.leaderDistance ?? 0).toBeGreaterThan(6);
    expect(first?.leaderDistance ?? 0).toBeLessThan(24);

    await page.evaluate(() => window.__tumble?.simulate(3.2));
    await expect(page.getByRole('button', { name: 'SKIP TO RESULTS' })).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-spectate.png') });

    // Remove the followed leader: the same file step must retarget a living
    // leader, not resolve the Round or keep the dead tag. Bots can occasionally
    // be mid-fall when the check fires, so give the retarget a bounded second
    // elimination instead of asserting on one frame-sensitive sample.
    await page.evaluate(() => {
      const t = window.__tumble;
      if (!t) return;
      const first = t.spectate.name;
      for (let attempt = 0; attempt < 3 && t.spectate.name === first; attempt += 1) {
        t.eliminateContestant(t.spectate.name);
        t.simulate(1.8);
      }
    });
    const second = await page.evaluate(() => window.__tumble?.spectate ?? null);
    expect(second?.active).toBe(true);
    expect(second?.name).not.toBe(first?.name);
    expect(second?.name).not.toBe('');
    expect(second?.leaderTagVisible).toBe(true);
    expect(second?.nonTargetTagsVisible).toBe(0);
    expect(second?.nearestBeanClearance ?? 0).toBeGreaterThan(0.6);
    expect(second?.slimeClearance ?? 0).toBeGreaterThan(0.2);
    expect(second?.leaderDistance ?? 0).toBeGreaterThan(6);
    expect(second?.leaderDistance ?? 0).toBeLessThan(24);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-spectate-leader-change.png') });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a Crown total wipe shows a no-winner card and never crowns a dead bean', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
      window.__tumble?.simulate(0.6);
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.roundNumber)).toBe(3);
    // Eliminate every finalist, the real B-1 total-wipe shape. This is the real
    // Match state machine; the old code revived the top row and crowned it.
    await page.evaluate(() => {
      const t = window.__tumble;
      if (!t) return;
      for (const name of [...t.contestants.names]) t.eliminateContestant(name);
      for (let i = 0; i < 80 && t.state !== 'finished'; i += 1) t.simulate(0.5);
    });
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end .sticker')).toContainText('NO CROWN');
    await expect(page.locator('.show-end__title')).toContainText('CROWN MISSED');
    await expect(page.locator('.show-end__winner')).toContainText('Nobody touched the crown');
    await expect(page.locator('.show-end__winner')).not.toContainText('takes the crown');
    const result = await page.evaluate(() => {
      const t = window.__tumble;
      const placements = t?.roundPlacements ?? [];
      return {
        state: t?.state ?? null,
        winner: t?.winner ?? null,
        placements: placements.map((entry) => ({
          won: entry.won,
          qualified: entry.qualified,
          eliminated: entry.eliminated,
        })),
      };
    });
    expect(result.state).toBe('finished');
    expect(result.winner).toBeNull();
    expect(result.placements.length).toBeGreaterThan(0);
    expect(result.placements.every((entry) => !entry.won && !entry.qualified)).toBe(true);
    expect(result.placements.every((entry) => entry.eliminated)).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('captures the Hexapop floor, the 45 s Sugar Rush and the Crown ascent', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await openShow(page);
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(1);
      window.__tumble?.beginRound();
      window.__tumble?.simulate(15);
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.roundNumber)).toBe(2);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-hexapop.png') });

    // Watch the pack into the 45 s beat. The human is already out, so this is
    // the real spectate shot of the ring dropping.
    const rush = await page.evaluate(() => {
      const t = window.__tumble;
      if (!t) return null;
      for (let i = 0; i < 120; i += 1) {
        if (t.show.phase !== 'playing' || t.show.time >= 45.2) break;
        t.simulate(0.5);
      }
      return { phase: t.show.phase, time: t.show.time, tiles: t.tileCount };
    });
    expect(rush?.phase).toBe('playing');
    expect(rush?.time ?? 0).toBeGreaterThanOrEqual(45);
    expect(rush?.tiles ?? 999).toBeLessThan(223);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-hexapop-sugar-rush.png') });

    await page.evaluate(() => {
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
      window.__tumble?.simulate(22);
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.roundNumber)).toBe(3);
    await page.waitForTimeout(2300);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-crown.png') });

    // Play the final out: a bot must touch the crown and the ceremony must
    // name that bot, even though the human is a spectator.
    await page.evaluate(() => {
      const t = window.__tumble;
      if (!t) return;
      for (let i = 0; i < 60; i += 1) {
        if (t.state === 'finished') break;
        t.simulate(2);
      }
    });
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end__winner')).toContainText('takes the crown');
    const result = await page.evaluate(() => {
      const t = window.__tumble;
      const winner = t?.roundPlacements.find((entry) => entry.won) ?? null;
      return {
        state: t?.state ?? null,
        winner: t?.winner ?? null,
        round: t?.show.roundMode ?? null,
        physical: winner
          ? {
              finishTime: winner.finishTime,
              eliminated: winner.eliminated,
              height: winner.height,
              distanceToCrown: winner.distanceToCrown,
            }
          : null,
      };
    });
    expect(result.state).toBe('finished');
    expect(result.round).toBe('crown-climb');
    expect(result.winner).not.toBe(null);
    // H-1/M-4: the ceremony winner must satisfy the physical crown contact,
    // not just carry a finish flag. Crown centre is 49.0, band 2.45, bean
    // radius 0.42 and height 1.5.
    expect(result.physical?.finishTime).not.toBeNull();
    expect(result.physical?.eliminated).toBe(false);
    expect((result.physical?.height ?? 0) + 1.5).toBeGreaterThanOrEqual(49);
    expect(result.physical?.distanceToCrown ?? Infinity).toBeLessThanOrEqual(2.87);
    // L-4: the show-end card covers the dais. Hide only that DOM overlay for
    // the evidence frame; the ceremony camera/confetti are the real ones.
    await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.show-end');
      if (overlay) overlay.hidden = true;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('docs/evidence/m2-crown-ceremony.png') });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
