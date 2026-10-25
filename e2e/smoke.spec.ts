import { expect, test } from '@playwright/test';

test.describe('Training Deck desktop', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto('/');
  });

  test.afterEach(() => {
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('loads, starts the deck, and moves the bean with the keyboard', async ({ page }) => {
    await expect(page).toHaveTitle(/Tumble Rush/);
    await expect(page.getByRole('heading', { name: 'Tumble Rush' })).toBeVisible();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();

    await page.getByRole('button', { name: /play/i }).click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    const start = await page.evaluate(() => window.__tumble?.playerPos);
    expect(start).toBeTruthy();
    if (!start) throw new Error('debug hook missing');

    // Release as soon as the bean has clearly moved. Holding for a fixed
    // wall-clock time is flaky under software WebGL, where a single key hold can
    // span many render frames and the bean can slide off the start deck.
    await page.keyboard.down('KeyW');
    await expect
      .poll(async () => (await page.evaluate(() => window.__tumble?.playerPos.z ?? 0)) < start.z - 0.15, {
        intervals: [20, 20, 30],
        timeout: 3000,
      })
      .toBe(true);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(700);

    const end = await page.evaluate(() => window.__tumble?.playerPos);
    expect(end).toBeTruthy();
    if (!start || !end) throw new Error('debug hook missing');
    expect(end.z).toBeLessThan(start.z - 1);
    expect(end.z).toBeGreaterThan(6.55);
    expect(end.y).toBeGreaterThan(-1);

  });

  test('jump leaves the deck and lands again', async ({ page }) => {
    await page.getByRole('button', { name: /play/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.waitForTimeout(150);

    await page.keyboard.press('Space');
    let peak = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(50);
      const y = await page.evaluate(() => window.__tumble?.playerPos.y ?? 0);
      peak = Math.max(peak, y);
    }
    expect(peak).toBeGreaterThan(0.9);
    await page.waitForTimeout(700);
    const landed = await page.evaluate(() => window.__tumble?.playerPos.y ?? -99);
    expect(landed).toBeLessThan(0.2);
  });

  test('quality toggles without breaking the scene', async ({ page }) => {
    await page.getByRole('button', { name: /play/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.evaluate(() => window.__tumble?.setQuality('low'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.quality)).toBe('low');
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.quality)).toBe('high');
  });
});



test.describe('Phase 2 Rounds', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
  });

  test.afterEach(() => {
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('starts every Round from the temporary mode selector', async ({ page }) => {
    const modes = [
      ['course', 'SUNRISE SCRAMBLE'],
      ['hexapop', 'HEXAPOP'],
      ['crown-climb', 'CROWN CLIMB'],
    ] as const;

    for (const [mode, title] of modes) {
      await page.goto('/?seed=20260418');
      const selector = page.locator(`#mode-${mode}`);
      await expect(selector).toBeVisible();
      await selector.click();
      await expect(selector).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: /^play$/i }).click();

      await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
      await expect.poll(() => page.evaluate(() => window.__tumble?.currentMode)).toBe(mode);
      await expect.poll(() => page.evaluate(() => window.__tumble?.levelStatus.title)).toBe(title);
      const canvas = page.locator('canvas.game-canvas');
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(300);
      expect(box?.height ?? 0).toBeGreaterThan(200);
      await page.waitForTimeout(300);
    }
  });

  test('hexapop tile touch starts a collapse and slime eliminates', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.locator('#mode-hexapop').click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    await page.evaluate(() => window.__tumble?.teleport(3.5, 0.06, 1.2));
    await expect
      .poll(() => page.evaluate(() => window.__tumble?.tileCount ?? 999), { timeout: 5000 })
      .toBeLessThan(117);

    await page.evaluate(() => window.__tumble?.teleport(0, -9.4, 0));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toBeVisible();
    await expect(page.locator('#finish-overlay')).toContainText('ELIMINATED');
    await page.getByRole('button', { name: /restart round/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.__tumble?.currentMode)).toBe('hexapop');
  });

  test('course finish gate qualifies and shows the end overlay', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.locator('#mode-course').click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    await page.evaluate(() => window.__tumble?.teleport(0, 4.55, -155));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toContainText('QUALIFIED!');
    await expect(page.locator('#finish-overlay')).toContainText('SUNRISE SCRAMBLE');
  });

  test('crown touch wins Crown Climb', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.locator('#mode-crown-climb').click();
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    await page.evaluate(() => {
      const crown = window.__tumble?.crownPosition;
      if (crown) window.__tumble?.teleport(crown.x + 2, crown.y - 1.4, crown.z);
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toContainText('CROWNED!');
    expect(await page.evaluate(() => window.__tumble?.winner)).toBe('YOU');
  });
});

test.describe('Training Deck mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows touch controls and starts the same deck', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: /play/i }).click();
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#touch-joystick')).toBeVisible();
    await expect(page.locator('#touch-jump')).toBeVisible();
    await expect(page.locator('#touch-dive')).toBeVisible();
    await expect(page.locator('#touch-grab')).toBeVisible();

    const jumpBox = await page.locator('#touch-jump').boundingBox();
    expect(jumpBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(jumpBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.locator('#touch-joystick').dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 70,
      clientY: 776,
    });
    await page.waitForTimeout(120);
    await page.locator('#touch-joystick').dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 70,
      clientY: 776,
    });

    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
