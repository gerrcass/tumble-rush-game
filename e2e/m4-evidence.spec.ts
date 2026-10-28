import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { planShow } from '../src/game/levels/coursePlan';

const TWISTS = [
  { id: 'moon', seed: 20469876 },
  { id: 'slippery', seed: 20260418 },
  { id: 'rush', seed: 20888792 },
] as const;

test.describe('M4 evidence', () => {
  test('captures the twist cards, HUD chips, start signs and render samples', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    for (const { id, seed } of TWISTS) {
      const plan = planShow(seed);
      expect(plan.twist.id).toBe(id);

      // Round intro card: the full twist label and one-line rule.
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();
      await expect(page.locator('.round-intro__show-card')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.resolve(`docs/evidence/m4-twist-${id}-intro.png`) });

      // In-play HUD chip.
      await page.evaluate(() => window.__tumble?.beginRound());
      await page.evaluate(() => window.__tumble?.simulate(0.6));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.resolve(`docs/evidence/m4-twist-${id}-hud.png`) });

      // Start sign: frame the authored sign from the start deck.
      await page.evaluate(() => {
        window.__tumble?.teleport(2.5, 0.6, 18);
        window.__tumble?.simulate(0.4);
        window.__tumble?.setCamera(0, 0.06, 9.5);
        window.__tumble?.lookAt(5, 3.3, 13.2);
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.resolve(`docs/evidence/m4-twist-${id}-sign.png`) });

      // Hexapop start sign, beside the arena sign.
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.evaluate(() => window.__tumble?.startMode('hexapop'));
      await page.evaluate(() => {
        window.__tumble?.simulate(0.4);
        window.__tumble?.teleport(2, 0.6, 2);
        window.__tumble?.setCamera(0, 0.05, 9);
        window.__tumble?.lookAt(4.7, 3.1, -3.6);
      });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.resolve(`docs/evidence/m4-twist-${id}-hex-sign.png`),
      });
    }

    // Round 3 says FINAL · CLASSIC.
    await page.goto('/?seed=20888792');
    await expect(page.locator('#play-show')).toBeVisible();
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await page.evaluate(() => window.__tumble?.jumpToRound(2));
    await expect(page.locator('.round-intro__show-card')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve('docs/evidence/m4-final-classic.png') });

    // Mobile 390×844: the twist card must fit above the countdown.
    const context = await page.context().browser()!.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const mobile = await context.newPage();
    await mobile.goto('/?seed=20469876');
    await expect(mobile.locator('#play-show')).toBeVisible();
    await mobile.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(mobile.locator('.round-intro__show-card')).toBeVisible();
    await mobile.waitForTimeout(400);
    await mobile.screenshot({ path: path.resolve('docs/evidence/m4-mobile-twist.png') });
    await context.close();

    // Render-budget samples at the Course and Hexapop starts, all three twists.
    const samples: Array<Record<string, unknown>> = [];
    for (const { id, seed } of TWISTS) {
      for (const mode of ['course', 'hexapop'] as const) {
        await page.goto(`/?seed=${seed}`);
        await expect(page.locator('#play-show')).toBeVisible();
        await page.evaluate(() => window.__tumble?.setQuality('high'));
        await page.evaluate((nextMode) => window.__tumble?.startMode(nextMode), mode);
        await page.evaluate(() => window.__tumble?.simulate(0.5));
        const info = await page.evaluate(() => window.__tumble?.renderInfo);
        samples.push({
          mode,
          seed,
          twist: id,
          calls: info?.calls,
          triangles: info?.triangles,
          geometries: info?.geometries,
          textures: info?.textures,
        });
      }
    }
    for (const sample of samples) {
      expect(Number(sample.calls)).toBeLessThanOrEqual(320);
      expect(Number(sample.triangles)).toBeLessThanOrEqual(200_000);
    }
    writeFileSync(
      path.resolve('docs/evidence/m4-performance.json'),
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          viewport: '1440x810',
          quality: 'high',
          host: 'SwiftShader (software rasteriser; not a hardware FPS claim)',
          budget: { calls: 320, triangles: 200_000 },
          samples,
        },
        null,
        2,
      )}\n`,
    );

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
