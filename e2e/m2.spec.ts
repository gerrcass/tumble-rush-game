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
