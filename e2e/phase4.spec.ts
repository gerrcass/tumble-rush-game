import { expect, test } from '@playwright/test';

test.describe('Phase 4 front-end, profile and economy', () => {
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

  test('menu, customize, equip, name edit and reload persistence', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?seed=20260418');
    await expect(page.locator('#menu-profile')).toContainText('Pip');
    await expect(page.locator('#menu-profile')).toContainText('100');
    await expect(page.locator('#play-show')).toBeVisible();

    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await expect(page.locator('.customize-screen')).toBeVisible();
    await expect(page.locator('.customize-screen')).toContainText('LIVE PREVIEW');
    await expect(page.locator('.bean-preview canvas')).toBeVisible();

    // Spend 60 kudos on Grape, then equip two free starter items.
    await page.locator('[data-cosmetic="color:grape"]').click();
    await expect(page.locator('[data-cosmetic="color:grape"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.screen-wallet__value')).toHaveText('40');

    await page.getByRole('tab', { name: 'PATTERN' }).click();
    await page.locator('[data-cosmetic="pattern:solid"]').click();
    await page.getByRole('tab', { name: 'HAT' }).click();
    await page.locator('[data-cosmetic="hat:none"]').click();
    await page.getByRole('tab', { name: 'EMOTE' }).click();
    await page.locator('[data-cosmetic="emote:dance"]').click();
    // Dance costs 150 and cannot be afforded after Grape; it must not equip.
    await expect(page.locator('[data-cosmetic="emote:dance"]')).toHaveAttribute('aria-pressed', 'false');

    const name = page.locator('.name-edit__input');
    await name.fill('Nova');
    await name.press('Tab');
    await page.getByRole('button', { name: '← BACK' }).click();
    await expect(page.locator('#menu-profile')).toContainText('Nova');
    await expect(page.locator('#menu-profile')).toContainText('40');

    await page.reload();
    await expect(page.locator('#menu-profile')).toContainText('Nova');
    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await expect(page.locator('[data-cosmetic="color:grape"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'PATTERN' }).click();
    await expect(page.locator('[data-cosmetic="pattern:solid"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'HAT' }).click();
    await expect(page.locator('[data-cosmetic="hat:none"]')).toHaveAttribute('aria-pressed', 'true');

    const snapshot = await page.evaluate(() => {
      const raw = localStorage.getItem('tumble-rush.profile.v1');
      return raw ? (JSON.parse(raw) as { name: string; kudos: number; look: { colorId: string } }) : null;
    });
    expect(snapshot?.name).toBe('Nova');
    expect(snapshot?.kudos).toBe(40);
    expect(snapshot?.look.colorId).toBe('grape');
  });

  test('settings apply immediately and persist across reload', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();
    await page.locator('[data-quality="low"]').click();
    await expect(page.locator('[data-quality="low"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'MUTE ALL SOUND' }).click();
    await expect(page.getByRole('button', { name: 'SOUND MUTED' })).toBeVisible();
    await page.getByRole('button', { name: 'REDUCED MOTION' }).click();
    await expect(page.getByRole('button', { name: 'REDUCED MOTION ON' })).toBeVisible();
    await page.locator('[data-touch="off"]').click();
    await expect(page.locator('[data-touch="off"]')).toHaveAttribute('aria-pressed', 'true');

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('tumble-rush.profile.v1');
      return raw
        ? (JSON.parse(raw) as {
            settings: { quality: string; muted: boolean; reducedMotion: boolean; touchControls: string };
          })
        : null;
    });
    expect(stored?.settings.quality).toBe('low');
    expect(stored?.settings.muted).toBe(true);
    expect(stored?.settings.reducedMotion).toBe(true);
    expect(stored?.settings.touchControls).toBe('off');

    await page.getByRole('button', { name: '← BACK' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('[data-quality="low"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'SOUND MUTED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'REDUCED MOTION ON' })).toBeVisible();
    await expect(page.locator('[data-touch="off"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('how to play explains the controls, Rounds and crown economy', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
    await expect(page.locator('.howto-screen')).toBeVisible();
    await expect(page.locator('.howto-screen')).toContainText('SUNRISE SCRAMBLE');
    await expect(page.locator('.howto-screen')).toContainText('HEXAPOP');
    await expect(page.locator('.howto-screen')).toContainText('CROWN CLIMB');
    await expect(page.locator('.howto-screen')).toContainText('+50');
    await expect(page.locator('.howto-screen')).toContainText('CONTROLS');
    await page.getByRole('button', { name: 'GOT IT — BACK TO MENU' }).click();
    await expect(page.locator('#play-show')).toBeVisible();
  });

  test('round results pay kudos and the final victory awards a crown', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    await expect(page.locator('.results__reward')).toContainText('+75 KUDOS');
    await expect(page.locator('.results__reward')).toContainText('FIRST QUALIFY +50');
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());

    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results__reward')).toContainText('+25 KUDOS');
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());

    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results__reward')).toContainText('+125 KUDOS');
    await expect(page.locator('.results__reward')).toContainText('+1 CROWN');
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end')).toContainText('CROWNED!');
    await expect(page.locator('.show-end')).toContainText('NEW #1');
    await expect(page.locator('.show-end')).toContainText('KUDOS EARNED');
    await expect(page.locator('.show-end')).toContainText('+225');

    await page.getByRole('button', { name: 'MAIN MENU' }).click();
    await expect(page.locator('#menu-profile')).toContainText('1');
    await expect(page.locator('#menu-profile')).toContainText('325');
    const profile = await page.evaluate(() => {
      const raw = localStorage.getItem('tumble-rush.profile.v1');
      return raw
        ? (JSON.parse(raw) as { crowns: number; kudos: number; wins: number; shows: number; bestFinish: number })
        : null;
    });
    expect(profile?.crowns).toBe(1);
    expect(profile?.kudos).toBe(325);
    expect(profile?.wins).toBe(1);
    expect(profile?.shows).toBe(1);
    expect(profile?.bestFinish).toBe(1);
  });

  test('settings from pause returns to pause and resumes the show', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();
    await page.getByRole('button', { name: '← BACK' }).click();
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#hud')).toBeVisible();
  });
});

test.describe('Phase 4 mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('menu and customize fit a phone without horizontal scroll', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?seed=20260418');
    await expect(page.locator('#play-show')).toBeVisible();
    const playBox = await page.locator('#play-show').boundingBox();
    expect(playBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await expect(page.locator('.customize-screen')).toBeVisible();
    const customOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(customOverflow).toBeLessThanOrEqual(1);
    const back = await page.getByRole('button', { name: '← BACK' }).boundingBox();
    expect(back?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(back?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
