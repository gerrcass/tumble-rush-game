import { expect, test } from '@playwright/test';

test.describe('Phase 4B audio, show polish and mobile', () => {
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

  test('audio waits for a gesture, then music, SFX and the voice cap go live', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await expect(page.locator('#play-show')).toBeVisible();
    expect(await page.evaluate(() => window.__tumble?.audio.started)).toBe(false);

    // The menu sound chip is a real gesture and toggles the live mute.
    await page.locator('#menu-sound').click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.started)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.muted)).toBe(true);
    await page.locator('#menu-sound').click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.muted)).toBe(false);

    // Opening Settings is a real pointer gesture.
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.started)).toBe(true);
    await expect(page.locator('.settings-audio-badge')).toContainText('AUDIO LIVE');

    const state = await page.evaluate(() => window.__tumble?.audio);
    expect(state?.musicVolume).toBeCloseTo(0.6, 2);
    expect(state?.sfxVolume).toBeCloseTo(0.7, 2);
    expect(state?.muted).toBe(false);
    expect(state?.voiceCount ?? 99).toBeLessThanOrEqual(12);

    // Hammer the test SFX hook; the engine must refuse voice 13.
    const played = await page.evaluate(() => {
      let accepted = 0;
      for (let i = 0; i < 30; i += 1) {
        if (window.__tumble?.playSfx('jump')) accepted += 1;
      }
      return { accepted, voices: window.__tumble?.audio.voiceCount ?? 0 };
    });
    expect(played.accepted).toBeLessThanOrEqual(12);
    expect(played.voices).toBeLessThanOrEqual(12);
  });

  test('music and SFX sliders apply live and persist across reload', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();

    await page.locator('#setting-music').evaluate((element, value) => {
      (element as HTMLInputElement).value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, 25);
    await page.locator('#setting-sfx').evaluate((element, value) => {
      (element as HTMLInputElement).value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, 40);
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.musicVolume)).toBe(0.25);
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.sfxVolume)).toBe(0.4);
    await expect(page.locator('#setting-music')).toHaveValue('25');
    await expect(page.locator('#setting-sfx')).toHaveValue('40');

    await page.getByRole('button', { name: 'MUTE ALL SOUND' }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.muted)).toBe(true);
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('tumble-rush.profile.v1');
      return raw
        ? (JSON.parse(raw) as { settings: { musicVolume: number; sfxVolume: number; muted: boolean } })
        : null;
    });
    expect(stored?.settings.musicVolume).toBe(0.25);
    expect(stored?.settings.sfxVolume).toBe(0.4);
    expect(stored?.settings.muted).toBe(true);

    await page.reload();
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('#setting-music')).toHaveValue('25');
    await expect(page.locator('#setting-sfx')).toHaveValue('40');
    await expect(page.getByRole('button', { name: 'SOUND MUTED' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.muted)).toBe(true);

    await page.getByRole('button', { name: 'SOUND MUTED' }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.muted)).toBe(false);
  });

  test('spectate camera compacts the HUD, hides tags and skip reaches results', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => {
      window.__tumble?.teleport(0, -20, 4);
      window.__tumble?.simulate(1.5);
    });
    await expect(page.locator('.hud-spectate')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.show.spectating)).toBe(true);
    await expect(page.locator('#hud')).toHaveClass(/hud--compact/);
    const camera = await page.evaluate(() => window.__tumble?.cameraPos);
    expect(camera?.y ?? -99).toBeGreaterThan(-13);
    await page.getByRole('button', { name: 'SKIP TO RESULTS' }).click();
    await expect(page.locator('.results')).toBeVisible();
  });

  test('a full show still reaches the crown ceremony and victory card', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');

    for (let round = 0; round < 3; round += 1) {
      await page.evaluate(() => window.__tumble?.forcePlayerWin());
      await expect(page.locator('.results')).toBeVisible();
      await page.evaluate(() => window.__tumble?.nextRound());
      if (round < 2) {
        await expect(page.locator('.round-intro')).toBeVisible();
        await page.evaluate(() => window.__tumble?.beginRound());
        await expect.poll(() => page.evaluate(() => window.__tumble?.state)).toBe('playing');
      }
    }
    await expect(page.locator('#show-ceremony')).toBeVisible();
    await expect(page.locator('#show-ceremony')).toContainText('takes the crown');
    await expect(page.locator('.show-end')).toBeVisible();
    await expect(page.locator('.show-end')).toContainText('CROWNED!');
  });

  test('pause ducks the mix and resume restores it', async ({ page }) => {
    await page.goto('/?seed=20260418');
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro')).toBeVisible();
    await page.evaluate(() => window.__tumble?.beginRound());
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(true);
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect.poll(() => page.evaluate(() => window.__tumble?.audio.paused)).toBe(false);
  });
});

test.describe('Phase 4B mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('menu, settings and customize fit without clipping', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?seed=20260418');
    await expect(page.locator('#play-show')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();
    const settingsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(settingsOverflow).toBeLessThanOrEqual(1);
    const back = await page.getByRole('button', { name: '← BACK' }).boundingBox();
    expect(back?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(back?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.settings-audio-badge')).toBeVisible();
    await page.getByRole('button', { name: '← BACK' }).click();

    await page.getByRole('button', { name: 'CUSTOMIZE' }).click();
    await expect(page.locator('.customize-screen')).toBeVisible();
    const customizeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(customizeOverflow).toBeLessThanOrEqual(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Phase 4B final tuning', () => {
  test('a bot can reach or nearly reach the crown in Crown Climb', async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?seed=20260418');
    await page.waitForTimeout(600);
    const outcome = await page.evaluate(() => {
      window.__tumble?.startShow();
      window.__tumble?.jumpToRound(2);
      window.__tumble?.beginRound();
      for (let i = 0; i < 90; i += 1) {
        window.__tumble?.simulate(1);
        if (window.__tumble?.show.phase !== 'playing') break;
      }
      const placements = window.__tumble?.roundPlacements ?? [];
      const bots = window.__tumble?.contestants.statuses.filter((entry) => entry.name !== 'Pip') ?? [];
      return {
        phase: window.__tumble?.show.phase,
        placements: placements.map((entry) => ({
          name: entry.name,
          won: entry.won,
          height: entry.height,
          finishTime: entry.finishTime,
          player: entry.isPlayer,
        })),
        botsAlive: bots.filter((entry) => !entry.eliminated).length,
        bestBotHeight: Math.max(
          0,
          ...(window.__tumble?.contestants.positions
            .filter((entry) => entry.name !== 'Pip')
            .map((entry) => entry.y) ?? []),
        ),
      };
    });
    expect(outcome.phase).not.toBe('playing');
    const champion = outcome.placements[0];
    expect(champion).toBeTruthy();
    // Either a bot touched the crown (finishTime) or the final produced a
    // living high fallback. Both are accepted; all-finalists-fall is not.
    const botChampion = !champion.player && (champion.finishTime !== null || champion.height > 20);
    expect(botChampion || outcome.bestBotHeight > 20).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
