import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Phase 3/4 evidence from the real build at exactly 1440×810. Screenshots use
 * only debug timing hooks; every pixel is the running game and DOM.
 */
test('captures the phase 4 front-end and refreshed show evidence', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?seed=20260418');
  await expect(page.locator('#play-show')).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-menu.png') });

  await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
  await expect(page.locator('.customize-screen')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-customize.png') });
  await page.getByRole('button', { name: '← BACK' }).click();
  await expect(page.locator('#play-show')).toBeVisible();

  await page.getByRole('button', { name: 'SETTINGS' }).click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-settings.png') });
  await page.getByRole('button', { name: '← BACK' }).click();

  await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
  await expect(page.locator('.howto-screen')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-howto.png') });
  await page.getByRole('button', { name: '← BACK' }).click();

  // Refreshed show evidence: the spawn/camera fix at the start deck.
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-intro.png') });

  await page.evaluate(() => window.__tumble?.beginRound());
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__tumble?.simulate(0.9));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-show-course.png') });

  // Spectate: eliminate the human, let the follow-cam choose a living leader.
  await page.evaluate(() => {
    window.__tumble?.teleport(0, -20, 4);
    window.__tumble?.simulate(1.5);
  });
  await expect(page.locator('.hud-spectate')).toBeVisible();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-spectate.png') });

  // Results table with the human row and the kudos reward line.
  await page.evaluate(() => window.__tumble?.forcePlayerWin());
  await expect(page.locator('.results')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-results.png') });

  // Victory crown ceremony with career stats.
  await page.evaluate(() => {
    window.__tumble?.jumpToRound(2);
    window.__tumble?.beginRound();
    window.__tumble?.forcePlayerWin();
    window.__tumble?.nextRound();
  });
  await expect(page.locator('.show-end')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-victory.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});
