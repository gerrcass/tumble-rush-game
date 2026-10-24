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

  // Ride the conveyor for a beat so the bean turns toward the camera, then move
  // onto the bounce pad for the hero framing.
  await page.evaluate(() => window.__tumble?.teleport(0, 0.08, -21.5));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__tumble?.teleport(0, 0.08, -26.5));
  await page.waitForTimeout(2400);

  // Tilt up and pan slightly so the finish gate, sky and sun frame the bean.
  await page.mouse.move(720, 420);
  await page.mouse.down();
  await page.mouse.move(790, 350, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  await page.screenshot({ path: path.resolve('docs/evidence/phase1-training.png') });
  expect(errors, errors.join('\n')).toEqual([]);
});
