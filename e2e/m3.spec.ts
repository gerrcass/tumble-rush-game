import { expect, test } from '@playwright/test';
import { planShow } from '../src/game/levels/coursePlan';
import { dailySeed } from '../src/game/Rng';

const SEED = 20260418;

test.describe('M3 Show Card', () => {
  test('names the route and arena in the intro and the results card', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(`/?seed=${SEED}`);
    await expect(page.locator('#play-show')).toBeVisible();
    const plan = await page.evaluate(() => window.__tumble?.plan);
    expect(plan?.courseSignature).toBe(planShow(SEED).courseSignature);
    expect(plan?.arenaLabel).toBe(planShow(SEED).arenaLabel);

    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    const intro = page.locator('.round-intro__show-card');
    await expect(intro).toBeVisible();
    await expect(intro.locator('.show-card__course')).toContainText(
      `COURSE ${plan!.routeLabel}`,
    );
    await expect(intro.locator('.show-card__arena')).toContainText(`ARENA ${plan!.arenaLabel}`);
    await expect(intro).toHaveAttribute('role', 'group');
    await expect(intro).toHaveAttribute('aria-label', new RegExp(plan!.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    await page.evaluate(() => window.__tumble?.beginRound());
    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    const results = page.locator('.results__show-card');
    await expect(results).toBeVisible();
    await expect(results).toContainText(`COURSE ${plan!.routeLabel}`);
    await expect(results).toContainText(`ARENA ${plan!.arenaLabel}`);

    // The show-end card repeats the same identity after the fixed Crown finale.
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
      const crown = window.__tumble?.crownPosition;
      if (crown) window.__tumble?.teleport(crown.x + 1.8, crown.y - 1.2, crown.z);
      window.__tumble?.forcePlayerWin();
      window.__tumble?.nextRound();
    });
    await expect(page.locator('.show-end')).toBeVisible();
    const endCard = page.locator('.show-end__show-card');
    await expect(endCard).toBeVisible();
    await expect(endCard).toContainText(`COURSE ${plan!.routeLabel}`);
    await expect(endCard).toContainText(`ARENA ${plan!.arenaLabel}`);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('menu Daily chip names today\'s route and arena', async ({ page }) => {
    const daily = dailySeed();
    const plan = planShow(daily.seed);
    await page.goto('/');
    const chip = page.locator('.menu-section-head .chip--seed');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(plan.routeLabel);
    await expect(chip).toContainText(plan.arenaLabel);
    await expect(chip).toHaveAttribute('aria-label', new RegExp(plan.arenaLabel));
  });

  test('two seeds reach gameplay with different route signatures', async ({ page }) => {
    const signatures: string[] = [];
    for (const seed of [20260418, 20365147]) {
      await page.goto(`/?seed=${seed}`);
      const plan = await page.evaluate(() => window.__tumble?.plan);
      expect(plan).toBeTruthy();
      signatures.push(plan!.courseSignature);
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();
      await expect(page.locator('.round-intro__show-card')).toContainText(
        plan!.arenaLabel,
      );
      await page.evaluate(() => window.__tumble?.beginRound());
      await expect(page.locator('#hud')).toBeVisible();
      await expect(page.locator('#hud')).toContainText('SUNRISE SCRAMBLE');
    }
    expect(new Set(signatures).size).toBe(2);
  });

  test('the card fits 390×844 without covering the countdown', async ({ browser }) => {
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
    await page.goto(`/?seed=${SEED}`);
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    const intro = page.locator('.round-intro__show-card');
    await expect(intro).toBeVisible();
    const card = await intro.boundingBox();
    const countdown = await page.locator('.round-intro__countdown').boundingBox();
    expect(card).toBeTruthy();
    expect(countdown).toBeTruthy();
    expect(card!.y + card!.height).toBeLessThanOrEqual(countdown!.y + 1);
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(390 + 1);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
    await page.screenshot({ path: 'docs/evidence/m3-show-card-mobile.png' });
    expect(errors, errors.join('\n')).toEqual([]);
    await context.close();
  });
});
