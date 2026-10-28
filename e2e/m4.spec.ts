import { expect, test } from '@playwright/test';
import { planShow } from '../src/game/levels/coursePlan';
import { dailySeed } from '../src/game/Rng';

const TWIST_SEEDS = [
  { id: 'moon', seed: 20469876 },
  { id: 'slippery', seed: 20260418 },
  { id: 'rush', seed: 20888792 },
] as const;

test.describe('M4 Twist Season UI', () => {
  test('names the twist in the intro, HUD and results for all three twists', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    for (const { id, seed } of TWIST_SEEDS) {
      const plan = planShow(seed);
      expect(plan.twist.id).toBe(id);
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();

      const intro = page.locator('.round-intro__show-card');
      await expect(intro.locator('.show-card__twist')).toContainText(`TWIST ${plan.twist.label}`);
      await expect(intro.locator('.show-card__rule')).toContainText(plan.twist.blurb);
      await expect(intro).toHaveAttribute('aria-label', new RegExp(plan.twist.label));

      await page.evaluate(() => window.__tumble?.beginRound());
      const chip = page.locator('.hud-twist');
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText(`TWIST ${plan.twist.short}`);
      await expect(chip).toHaveAttribute('aria-label', new RegExp(plan.twist.label));
      await expect(chip).toHaveAttribute('aria-label', new RegExp(plan.twist.blurb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      await page.evaluate(() => window.__tumble?.forcePlayerWin());
      await expect(page.locator('.results')).toBeVisible();
      const results = page.locator('.results__show-card');
      await expect(results.locator('.show-card__twist')).toContainText(`TWIST ${plan.twist.label}`);
      await expect(results.locator('.show-card__rule')).toContainText(plan.twist.blurb);
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('says FINAL · CLASSIC on the Crown intro, HUD and results', async ({ page }) => {
    const seed = 20888792;
    await page.goto(`/?seed=${seed}`);
    await expect(page.locator('#play-show')).toBeVisible();
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await page.evaluate(() => window.__tumble?.jumpToRound(2));
    const intro = page.locator('.round-intro__show-card');
    await expect(intro.locator('.show-card__twist')).toHaveText('FINAL · CLASSIC');
    await expect(intro.locator('.show-card__rule')).toContainText('fixed championship');

    await page.evaluate(() => window.__tumble?.beginRound());
    const chip = page.locator('.hud-twist');
    await expect(chip).toHaveText('FINAL · CLASSIC');
    await expect(chip).toHaveAttribute('aria-label', /Classic rules/i);

    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    // The results card repeats the show twist, not the Crown classic note.
    await expect(page.locator('.results__show-card .show-card__twist')).toContainText(
      'TWIST RUSH HOUR',
    );
  });

  test('probes the live rules for every round and keeps practice/training honest', async ({ page }) => {
    test.setTimeout(120_000);
    const probes: Record<string, unknown> = {};
    for (const { id, seed } of TWIST_SEEDS) {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();
      await page.evaluate(() => window.__tumble?.beginRound());
      probes[id] = await page.evaluate(() => window.__tumble?.twist);
    }
    expect(probes['moon']).toMatchObject({
      id: 'moon',
      applied: true,
      classic: false,
      gravity: -20.28,
      frictionScale: 1,
    });
    expect(probes['slippery']).toMatchObject({
      id: 'slippery',
      applied: true,
      classic: false,
      gravity: -26,
      frictionScale: 0.55,
    });
    expect(probes['rush']).toMatchObject({
      id: 'rush',
      applied: true,
      classic: false,
      gravity: -26,
      sugarRushSeconds: 38,
    });

    // The Crown resets gravity and rules to classic on the same seed.
    await page.goto('/?seed=20888792');
    await expect(page.locator('#play-show')).toBeVisible();
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
    });
    expect(await page.evaluate(() => window.__tumble?.twist)).toMatchObject({
      id: 'classic',
      applied: true,
      classic: true,
      gravity: -26,
      frictionScale: 1,
      sugarRushSeconds: 45,
    });

    // Practice on the Course uses the seeded twist; the Training Deck is classic.
    await page.goto('/?seed=20260418');
    await expect(page.locator('#play-show')).toBeVisible();
    await page.evaluate(() => window.__tumble?.startPractice('course'));
    expect(await page.evaluate(() => window.__tumble?.twist)).toMatchObject({
      id: 'slippery',
      applied: true,
      classic: false,
      frictionScale: 0.55,
    });
    await expect(page.locator('.hud-twist')).toHaveText('TWIST SLIP');
    await page.evaluate(() => window.__tumble?.startPractice('training'));
    expect(await page.evaluate(() => window.__tumble?.twist)).toMatchObject({
      id: 'classic',
      classic: true,
      gravity: -26,
      frictionScale: 1,
    });
  });

  test('names today\'s twist in the Daily chip', async ({ page }) => {
    const plan = planShow(dailySeed().seed);
    await page.goto('/');
    const chip = page.locator('.menu-section-head .chip--seed');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(plan.routeLabel);
    await expect(chip).toContainText(plan.arenaLabel);
    await expect(chip).toContainText(plan.twist.short);
    await expect(chip).toHaveAttribute('aria-label', new RegExp(plan.twist.short));
  });

  test('fits the twist card and chip at 390×844 without covering gameplay', async ({ browser }) => {
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
    await page.goto('/?seed=20888792');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();

    const intro = page.locator('.round-intro__show-card');
    await expect(intro).toBeVisible();
    const cardBox = await intro.boundingBox();
    const countdownBox = await page.locator('.round-intro__countdown').boundingBox();
    expect(cardBox).toBeTruthy();
    expect(countdownBox).toBeTruthy();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(countdownBox!.y + 1);
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(391);

    await page.evaluate(() => window.__tumble?.beginRound());
    const chipBox = await page.locator('.hud-twist').boundingBox();
    const clockBox = await page.locator('.hud-time').boundingBox();
    const qualifiedBox = await page.locator('.hud-slot--qualified').boundingBox();
    expect(chipBox).toBeTruthy();
    expect(clockBox).toBeTruthy();
    expect(qualifiedBox).toBeTruthy();
    for (const other of [clockBox!, qualifiedBox!]) {
      const overlaps =
        chipBox!.x < other.x + other.width &&
        chipBox!.x + chipBox!.width > other.x &&
        chipBox!.y < other.y + other.height &&
        chipBox!.y + chipBox!.height > other.y;
      expect(overlaps).toBe(false);
    }
    expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(391);
    expect(chipBox!.y + chipBox!.height).toBeLessThan(844);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);

    await page.screenshot({ path: 'docs/evidence/m4-mobile-hud.png' });
    expect(errors, errors.join('\n')).toEqual([]);
    await context.close();
  });
});
