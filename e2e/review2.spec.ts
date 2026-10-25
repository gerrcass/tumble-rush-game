import { expect, test, type Page } from '@playwright/test';

async function openShow(page: Page, seed: number): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.evaluate(() => window.__tumble?.beginRound());
  await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
}

test.describe('Review 2 — real pack and real spawn', () => {
  test('no-input Course pack reaches eight real finishers and never qualifies the idle human', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const seed of [20260418, 7]) {
      await openShow(page, seed);
      // Step in small chunks and stop as soon as Round 1 posts results, before
      // the five-second results timer advances to the show-end screen.
      await page.evaluate(() => {
        for (let i = 0; i < 130; i += 1) {
          if (window.__tumble?.show.phase === 'results') break;
          window.__tumble?.simulate(0.5);
        }
      });
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
        };
      });
      console.log(`REAL_PACK_E2E seed=${seed} ${JSON.stringify(result)}`);
      expect(result.finishers).toBeGreaterThanOrEqual(8);
      expect(result.qualified).toBe(8);
      expect(result.playerQualified).toBe(false);
      expect(result.playerStatus).toBe('ELIMINATED');
      expect(result.phase).toBe('results');
      // Qualification is the only kudos gate: an idle human earns none.
      await expect(page.locator('.results__reward')).toContainText('NO KUDOS');
    }
  });

  test('jumpToRound(1) puts the human on the centre perch and only drops them after the grace', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openShow(page, 20260418);
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(1);
      window.__tumble?.beginRound();
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.roundNumber)).toBe(2);

    await page.evaluate(() => window.__tumble?.simulate(2.5));
    const duringGrace = await page.evaluate(() => ({
      x: window.__tumble?.playerPos.x ?? 0,
      y: window.__tumble?.playerPos.y ?? 0,
      z: window.__tumble?.playerPos.z ?? 0,
      eliminated: window.__tumble?.eliminated ?? false,
      status: window.__tumble?.show.phase ?? null,
    }));
    expect(Math.abs(duringGrace.x)).toBeLessThan(0.05);
    expect(Math.abs(duringGrace.z)).toBeLessThan(0.05);
    expect(duringGrace.y).toBeGreaterThan(0.3);
    expect(duringGrace.eliminated).toBe(false);
    expect(duringGrace.status).toBe('playing');

    await page.evaluate(() => window.__tumble?.simulate(4.5));
    const afterGrace = await page.evaluate(() => ({
      y: window.__tumble?.playerPos.y ?? 0,
      eliminated: window.__tumble?.eliminated ?? false,
      placements: window.__tumble?.roundPlacements ?? [],
    }));
    expect(afterGrace.eliminated).toBe(true);
    const player = afterGrace.placements.find((entry) => entry.isPlayer);
    if (player) expect(player.qualified).toBe(false);
  });

  test('Skip to results reveals the banner immediately but the action after three seconds', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openShow(page, 20260418);
    await page.evaluate(() => {
      window.__tumble?.teleport(0, -20, 10);
      window.__tumble?.simulate(0.5);
      window.__tumble?.simulate(1.5);
    });
    await expect(page.locator('.hud-spectate')).toBeVisible();
    const skip = page.getByRole('button', { name: 'SKIP TO RESULTS' });
    await expect(skip).toBeHidden();

    await page.evaluate(() => window.__tumble?.simulate(2));
    await expect(skip).toBeVisible();
  });
});
