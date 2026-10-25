import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Phase-three evidence from the real build at exactly 1440×810. Debug hooks only
 * frame the show; every pixel is the running game, not a mockup.
 */
test('captures the phase-three Show evidence set', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?seed=20260418');
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.waitForTimeout(700);

  // 1. Round intro card.
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-intro.png') });

  // 2. Sunrise Scramble gameplay: start the Round, let the pack move, then
  // frame the player among the bots on the first sweeper platform.
  await page.evaluate(() => window.__tumble?.beginRound());
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__tumble?.simulate(4.5));
  await page.evaluate(() => {
    window.__tumble?.teleport(0.2, 0.08, -2);
    window.__tumble?.setCamera(-0.04, 0.22, 8.2);
    window.__tumble?.lookAt(0, 1.6, -42);
  });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-show-course.png') });

  // 3. Spectate: eliminate the human and show the follow-cam banner + skip.
  await page.evaluate(() => {
    window.__tumble?.beginRound();
    window.__tumble?.simulate(2);
    window.__tumble?.teleport(0, -20, 4);
    window.__tumble?.simulate(1.2);
    window.__tumble?.clearLookAt();
    window.__tumble?.setCamera(0.5, 0.2, 8.5);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-spectate.png') });

  // 4. Results table with the human row highlighted at the top.
  await page.evaluate(() => {
    window.__tumble?.forcePlayerWin();
  });
  await expect(page.locator('.results')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-results.png') });

  // 5. Victory crown ceremony.
  await page.evaluate(() => {
    window.__tumble?.jumpToRound(2);
    window.__tumble?.beginRound();
    window.__tumble?.forcePlayerWin();
    window.__tumble?.nextRound();
  });
  await expect(page.locator('.show-end')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-victory.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});
