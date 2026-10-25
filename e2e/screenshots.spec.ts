import { expect, test } from '@playwright/test';
import path from 'node:path';

/**
 * Captures the phase-one hero image from the real build at exactly 1440x810.
 * The teleport is a debug-hook action (dev build only); the frame itself is the
 * actual rendered game, not a mockup.
 */
test('captures the Training Deck hero shot', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: /play/i }).click();
  await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
  await page.waitForTimeout(500);

  await page.evaluate(() => window.__tumble?.teleport(0, 0.08, -21.5));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__tumble?.teleport(0, 0.08, -26.5));
  await page.waitForTimeout(2400);

  await page.mouse.move(720, 420);
  await page.mouse.down();
  await page.mouse.move(790, 350, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  await page.screenshot({ path: path.resolve('docs/evidence/phase1-training.png') });
  expect(errors, errors.join('\n')).toEqual([]);
});

/**
 * Phase-two evidence. Each frame is rendered by the actual game at 1440x810
 * and framed through the documented debug camera/teleport hooks. A fixed seed
 * keeps the set reproducible.
 */
test('captures the phase-two Round evidence set', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?seed=20260418');

  // Sunrise Scramble: start angle with the whole course ahead.
  await page.locator('#mode-course').click();
  await page.getByRole('button', { name: /^play$/i }).click();
  await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__tumble?.teleport(0, 0.05, 1.5));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__tumble?.setCamera(0.02, 0.24, 7.5);
    window.__tumble?.lookAt(0, 2, -30);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve('docs/evidence/phase2-course.png') });

  // Finish Gate: raised deck, checker line and gate crown.
  await page.evaluate(() => window.__tumble?.teleport(0, 3.46, -149.6));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__tumble?.setCamera(0, 0.15, 10);
    window.__tumble?.lookAt(0, 7.6, -155);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve('docs/evidence/phase2-finish.png') });

  // Hexapop: collapse a few tiles, then frame all three tiers over the slime.
  await page.evaluate(() => window.__tumble?.startMode('hexapop'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__tumble?.teleport(3.5, 0.06, 1.2));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__tumble?.teleport(-2.3, 0.06, -2.2));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__tumble?.teleport(4.1, 0.06, -3.2));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__tumble?.teleport(0, 0.43, 0));
  await page.waitForTimeout(300);
  await expect
    .poll(() => page.evaluate(() => window.__tumble?.tileCount ?? 999))
    .toBeLessThan(117);
  await page.evaluate(() => {
    window.__tumble?.setCamera(1.05, 0.42, 18);
    window.__tumble?.lookAt(0, -2.6, 0);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve('docs/evidence/phase2-hexapop.png') });

  // Crown Climb: mid-ascent with the spiral, slime below and crown above.
  await page.evaluate(() => window.__tumble?.startMode('crown-climb'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const waypoint = window.__tumble?.waypoints[24];
    if (waypoint) window.__tumble?.teleport(waypoint.x, waypoint.y + 0.05, waypoint.z);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__tumble?.setCamera(-2.54, 0.06, 44);
    window.__tumble?.lookAt(4, 22, 0);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve('docs/evidence/phase2-crown-climb.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});
