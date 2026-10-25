import { expect, test } from '@playwright/test';

async function startShow(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?seed=20260418');
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
}

test.describe('Show desktop', () => {
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

  test('PLAY SHOW opens the intro, countdown, gameplay and movement', async ({ page }) => {
    await startShow(page);
    await expect(page.locator('.round-intro')).toBeVisible();
    await expect(page.locator('.round-intro')).toContainText('SUNRISE SCRAMBLE');
    await expect(page.locator('.round-intro')).toContainText('TOP 8');
    await expect(page.locator('.round-intro')).toContainText('16');
    await expect(page.locator('#hud')).toBeHidden();

    await expect
      .poll(() => page.evaluate(() => window.__tumble?.show.phase), { timeout: 17_000 })
      .toBe('playing');
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hud')).toContainText('SUNRISE SCRAMBLE');
    await expect(page.locator('#hud')).toContainText('QUALIFIED');

    const start = await page.evaluate(() => window.__tumble?.playerPos);
    expect(start).toBeTruthy();
    if (!start) throw new Error('debug hook missing');

    await page.keyboard.down('KeyW');
    await expect
      .poll(async () => (await page.evaluate(() => window.__tumble?.playerPos.z ?? 0)) < start.z - 0.15, {
        intervals: [20, 20, 30],
        timeout: 3000,
      })
      .toBe(true);
    await page.keyboard.up('KeyW');
    const end = await page.evaluate(() => window.__tumble?.playerPos);
    expect(end?.z ?? start.z).toBeLessThan(start.z - 0.5);
  });

  test('jump leaves the ground and lands again', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.__tumble?.startMode('training'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.waitForTimeout(250);

    await page.keyboard.press('Space');
    let peak = 0;
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(50);
      const y = await page.evaluate(() => window.__tumble?.playerPos.y ?? 0);
      peak = Math.max(peak, y);
    }
    expect(peak).toBeGreaterThan(0.9);
    await page.waitForTimeout(800);
    const landed = await page.evaluate(() => window.__tumble?.playerPos.y ?? -99);
    expect(landed).toBeLessThan(0.3);
  });

  test('quality toggles without breaking the scene', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.__tumble?.startMode('course'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.evaluate(() => window.__tumble?.setQuality('low'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.quality)).toBe('low');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.quality)).toBe('high');
  });

  test('shows the contestant roster and spread start positions', async ({ page }) => {
    await startShow(page);
    const debug = await page.evaluate(() => ({
      count: window.__tumble?.contestants.count,
      names: window.__tumble?.contestants.names,
      positions: window.__tumble?.contestants.positions,
      player: window.__tumble?.contestants.player,
    }));
    expect(debug.count).toBe(16);
    expect(new Set(debug.names).size).toBe(16);
    expect(debug.player).toBe('YOU');
    const xs = new Set((debug.positions ?? []).map((position) => Math.round(position.x * 10)));
    expect(xs.size).toBeGreaterThan(6);
  });

  test('finishes a round, shows results, and advances', async ({ page }) => {
    await startShow(page);
    await page.evaluate(() => window.__tumble?.beginRound());
    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    await expect(page.locator('.results')).toContainText('ROUND RESULTS');
    await expect(page.locator('.results')).toContainText('QUALIFIED');
    await expect(page.locator('.results .is-player')).toBeVisible();
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await expect(page.locator('.round-intro')).toContainText('HEXAPOP');
  });

  test('an eliminated human spectates, can skip, and then loses', async ({ page }) => {
    await startShow(page);
    await page.evaluate(() => window.__tumble?.beginRound());
    await page.evaluate(() => window.__tumble?.teleport(0, -20, 10));
    await page.waitForTimeout(500);
    await expect(page.locator('.hud-spectate')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.spectating)).toBe(true);
    await page.getByRole('button', { name: 'SKIP TO RESULTS' }).click();
    await expect(page.locator('.results')).toBeVisible();
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end')).toContainText('ELIMINATED');
  });

  test('forces a final victory and offers replay/menu', async ({ page }) => {
    await startShow(page);
    await page.evaluate(() => {
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
      window.__tumble?.forcePlayerWin();
      window.__tumble?.nextRound();
    });
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end')).toContainText('CROWNED!');
    await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MAIN MENU' })).toBeVisible();
  });

  test('a full accelerated show completes without input', async ({ page }) => {
    test.setTimeout(90_000);
    await startShow(page);
    for (let slice = 0; slice < 8; slice += 1) {
      const phase = await page.evaluate(() => {
        window.__tumble?.simulate(45);
        return window.__tumble?.show.phase;
      });
      if (phase === 'victory' || phase === 'defeat') break;
    }
    const show = await page.evaluate(() => window.__tumble?.show);
    expect(['victory', 'defeat']).toContain(show?.phase);
    expect(show?.roundIndex).toBe(2);
    expect(show?.time).toBeLessThanOrEqual(120.5);
    const standings = await page.evaluate(() => window.__tumble?.contestants.standings);
    expect(standings?.length).toBeGreaterThan(0);
  });
});

test.describe('Phase 2 mechanics in debug rounds', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto('/?seed=20260418');
  });

  test.afterEach(() => {
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('starts every Round through the debug hook', async ({ page }) => {
    const modes = [
      ['course', 'SUNRISE SCRAMBLE'],
      ['hexapop', 'HEXAPOP'],
      ['crown-climb', 'CROWN CLIMB'],
      ['training', 'TRAINING DECK'],
    ] as const;
    for (const [mode, title] of modes) {
      await page.evaluate((candidate) => window.__tumble?.startMode(candidate), mode);
      await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
      await expect.poll(() => page.evaluate(() => window.__tumble?.currentMode)).toBe(mode);
      await expect.poll(() => page.evaluate(() => window.__tumble?.levelStatus.title)).toBe(title);
      const canvas = page.locator('canvas.game-canvas');
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(300);
      expect(box?.height ?? 0).toBeGreaterThan(200);
    }
  });

  test('hexapop tile touch starts a collapse and slime eliminates', async ({ page }) => {
    await page.evaluate(() => window.__tumble?.startMode('hexapop'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.evaluate(() => window.__tumble?.teleport(3.5, 0.06, 1.2));
    await expect
      .poll(() => page.evaluate(() => window.__tumble?.tileCount ?? 999), { timeout: 5000 })
      .toBeLessThan(117);
    await page.evaluate(() => window.__tumble?.teleport(0, -9.4, 0));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toContainText('ELIMINATED');
  });

  test('course finish gate qualifies and shows the end overlay', async ({ page }) => {
    await page.evaluate(() => window.__tumble?.startMode('course'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.evaluate(() => window.__tumble?.teleport(0, 4.55, -155));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toContainText('QUALIFIED!');
  });

  test('crown touch wins Crown Climb', async ({ page }) => {
    await page.evaluate(() => window.__tumble?.startMode('crown-climb'));
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
    await page.evaluate(() => {
      const crown = window.__tumble?.crownPosition;
      if (crown) window.__tumble?.teleport(crown.x + 2, crown.y - 1.4, crown.z);
    });
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('finished');
    await expect(page.locator('#finish-overlay')).toContainText('CROWNED!');
  });
});

test.describe('Show mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('renders the show intro and touch controls', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#touch-joystick')).toBeVisible();
    await expect(page.locator('#touch-jump')).toBeVisible();
    await expect(page.locator('#touch-dive')).toBeVisible();
    await expect(page.locator('#touch-grab')).toBeVisible();

    const jumpBox = await page.locator('#touch-jump').boundingBox();
    expect(jumpBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(jumpBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const hudBox = await page.locator('#hud .hud-bar').boundingBox();
    expect(hudBox?.width ?? 0).toBeLessThanOrEqual(390);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
