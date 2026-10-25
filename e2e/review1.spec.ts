import { expect, test, type Page } from '@playwright/test';

async function openShow(page: Page): Promise<void> {
  await page.goto('/?seed=20260418');
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.evaluate(() => window.__tumble?.beginRound());
  await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
}

test.describe('Review 1 — pause restart, audio and results', () => {
  test('desktop restart leaves pause, plays a fresh intro/results and unducks audio', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openShow(page);
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(true);

    await page.getByRole('button', { name: 'RESTART SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(false);
    await expect(page.locator('#pause-overlay')).toBeHidden();

    await page.evaluate(() => window.__tumble?.beginRound());
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    // Fresh per-show economy: the first-qualification bonus must be back.
    await expect(page.locator('.results__reward')).toContainText('+75 KUDOS');
    await expect(page.locator('.results__reward')).toContainText('FIRST QUALIFY +50');
  });

  test('practice restart from pause returns to play without a dead overlay', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PRACTICE' }).click();
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'RESTART PRACTICE' }).click();
    await expect(page.locator('#pause-overlay')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(false);
  });

  test.describe('390x844 restart', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('pause restart works from the touch HUD', async ({ page }) => {
      await openShow(page);
      await page.locator('.hud-pause').click();
      await expect(page.locator('#pause-overlay')).toBeVisible();
      await page.getByRole('button', { name: 'RESTART SHOW' }).click();
      await expect(page.locator('.round-intro')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
      await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(false);
      await page.evaluate(() => window.__tumble?.beginRound());
      await expect(page.locator('#hud')).toBeVisible();
    });
  });
});

test.describe('Review 1 — keyboard ownership', () => {
  test('Space activates the focused Play button', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.locator('#play-show').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.round-intro')).toBeVisible();
  });

  test('Space types in the name input and ArrowLeft steps a slider', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    const input = page.locator('.name-edit__input');
    await input.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Space');
    await expect(input).toHaveValue('Pip ');
    await page.getByRole('button', { name: '← BACK' }).click();

    await page.getByRole('button', { name: 'SETTINGS' }).click();
    // The screen intentionally focuses its Back button on the next frame;
    // let that settle before moving focus to the slider.
    await page.waitForTimeout(150);
    const slider = page.locator('#setting-music');
    await slider.focus();
    await expect(slider).toBeFocused();
    const before = Number(await slider.inputValue());
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue(String(before - 1));
  });

  test('Space still jumps while the canvas owns gameplay', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.evaluate(() => window.__tumble?.startMode('training'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.waitForTimeout(250);
    await page.locator('canvas.game-canvas').click({ position: { x: 400, y: 300 } });
    await page.keyboard.press('Space');
    let peak = 0;
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(50);
      const y = await page.evaluate(() => window.__tumble?.playerPos.y ?? 0);
      peak = Math.max(peak, y);
    }
    expect(peak).toBeGreaterThan(0.9);
  });
});

test.describe('Review 1 — copy, seeds, focus and leaks', () => {
  test('a Round 1 defeat says the pack moves on, not that a bot takes the crown', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openShow(page);
    await page.evaluate(() => {
      window.__tumble?.teleport(0, -20, 10);
      window.__tumble?.simulate(1.5);
      window.__tumble?.skipSpectate();
    });
    await expect(page.locator('.results')).toBeVisible();
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end')).toContainText('leads the pack');
    await expect(page.locator('.show-end')).not.toContainText('takes the crown');
  });

  test('each Quick Show gets a fresh seed, while ?seed= stays deterministic', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    const first = await page.evaluate(() => window.__tumble?.seed);
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
    await expect(page.locator('#play-show')).toBeVisible();
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    const second = await page.evaluate(() => window.__tumble?.seed);
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);

    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await page.evaluate(() => window.__tumble?.beginRound());
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    expect(await page.evaluate(() => window.__tumble?.seed)).toBe(20260418);
  });

  test('equipping a cosmetic keeps keyboard focus on the same swatch', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await page.getByRole('tab', { name: 'HAT' }).click();
    const propeller = page.locator('[data-cosmetic="hat:propeller"]');
    await propeller.focus();
    await page.keyboard.press('Enter');
    await expect(propeller).toBeFocused();
    await expect(propeller).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('tab', { name: 'COLOR' }).click();
    const grape = page.locator('[data-cosmetic="color:grape"]');
    await grape.focus();
    await page.keyboard.press('Enter');
    await expect(grape).toBeFocused();
    await expect(grape).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.screen-wallet__value')).toHaveText('40');
  });

  test('geometry count stays flat across three Shows and repeated Customize changes', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/?seed=20260418');
    // Unlock the whole hat catalogue so the Customize pass exercises every
    // cached template, then reload into a normal profile.
    await page.evaluate(() => {
      const hats = ['none', 'propeller', 'cone', 'antenna', 'crown', 'ducky', 'halo', 'flower'];
      localStorage.setItem(
        'tumble-rush.profile.v1',
        JSON.stringify({
          version: 1,
          name: 'Pip',
          kudos: 5000,
          unlocks: hats.map((hat) => `hat:${hat}`),
        }),
      );
    });
    await page.reload();
    await expect(page.locator('#play-show')).toBeVisible();

    const counts: number[] = [];
    for (let show = 0; show < 3; show += 1) {
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();
      await expect(page.locator('.round-intro')).toBeVisible();
      await page.evaluate(() => window.__tumble?.beginRound());
      await expect(page.locator('#hud')).toBeVisible();
      await page.waitForTimeout(500);
      counts.push((await page.evaluate(() => window.__tumble?.renderInfo.geometries)) ?? 0);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
      await expect(page.locator('#play-show')).toBeVisible();
    }
    expect(counts[1]).toBeLessThanOrEqual(counts[0]! + 2);
    expect(counts[2]).toBeLessThanOrEqual(counts[1]! + 2);

    const before = (await page.evaluate(() => window.__tumble?.renderInfo.geometries)) ?? 0;
    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await page.getByRole('tab', { name: 'HAT' }).click();
    for (const hat of ['crown', 'ducky', 'halo', 'flower', 'propeller', 'cone', 'antenna', 'none']) {
      await page.locator(`[data-cosmetic="hat:${hat}"]`).click();
      await page.waitForTimeout(80);
    }
    await page.getByRole('button', { name: '← BACK' }).click();
    await page.waitForTimeout(300);
    const after = (await page.evaluate(() => window.__tumble?.renderInfo.geometries)) ?? 0;
    expect(after).toBeLessThanOrEqual(before + 2);
  });

  test('Course start stays inside the draw-call and triangle budgets', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => {
      window.__tumble?.beginRound();
      window.__tumble?.setQuality('high');
    });
    await expect(page.locator('#hud')).toBeVisible();
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => window.__tumble?.renderInfo);
    console.log(`COURSE_RENDER_INFO ${JSON.stringify(info)}`);
    expect(info).toBeTruthy();
    expect(info?.calls).toBeLessThanOrEqual(250);
    expect(info?.triangles).toBeLessThanOrEqual(120_000);
  });
});
