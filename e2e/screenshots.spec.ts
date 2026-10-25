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
  // Pin the evidence build to high quality so automatic step-down (which is
  // correct on a genuinely slow device) cannot change the captured art.
  await page.evaluate(() => window.__tumble?.setQuality('high'));
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
  // Audio is already live from the gesture that opened this screen. Show the
  // mix at human settings, then capture the live-audio evidence.
  await page.locator('#setting-music').evaluate((element, value) => {
    (element as HTMLInputElement).value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, 45);
  await page.locator('#setting-sfx').evaluate((element, value) => {
    (element as HTMLInputElement).value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, 65);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-audio.png') });
  await expect(page.locator('.settings-audio-badge')).toContainText('AUDIO LIVE');
  await page.getByRole('button', { name: '← BACK' }).click();

  await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
  await expect(page.locator('.howto-screen')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-howto.png') });
  await page.getByRole('button', { name: '← BACK' }).click();

  // Refreshed show evidence: the spawn/camera fix at the start deck.
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await page.evaluate(() => window.__tumble?.setQuality('high'));
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-intro.png') });

  await page.evaluate(() => window.__tumble?.beginRound());
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__tumble?.simulate(1.2));
  // Let the TUMBLE! stamp finish its 2.1 s beat so the course/finish sign is
  // readable in the evidence frame.
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-show-course.png') });

  // Spectate: run the pack out a little so the follow-cam frames a real leader
  // mid-course, then eliminate the human and let the camera settle.
  await page.evaluate(() => window.__tumble?.simulate(15));
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

  // Victory crown ceremony with career stats. The in-world ceremony gets a
  // 1.9 s beat (camera orbit, crown fanfare, confetti) before the card.
  await page.evaluate(() => {
    window.__tumble?.jumpToRound(2);
    window.__tumble?.beginRound();
    const crown = window.__tumble?.crownPosition;
    if (crown) window.__tumble?.teleport(crown.x + 1.8, crown.y - 1.2, crown.z);
    window.__tumble?.forcePlayerWin();
    window.__tumble?.nextRound();
  });
  await expect(page.locator('#show-ceremony')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-ceremony.png') });
  await expect(page.locator('.show-end')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve('docs/evidence/phase3-victory.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('captures the 390x844 phone layout', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=20260418');
  await expect(page.locator('#play-show')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve('docs/evidence/phase4-mobile.png') });
  expect(errors, errors.join('\n')).toEqual([]);
  await context.close();
});
